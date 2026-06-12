const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, spawnSync } = require('child_process');
const { randomUUID } = require('crypto');

const activeDownloads = new Map();

function resolveBinary(name) {
  const exePath = app.isPackaged
    ? path.join(process.resourcesPath, `${name}.exe`)
    : path.join(__dirname, `${name}.exe`);
  if (fs.existsSync(exePath)) return exePath;
  return name;
}

function isCommandAvailable(cmd) {
  try {
    const check = process.platform === 'win32' ? 'where' : 'which';
    const res = spawnSync(check, [cmd], { encoding: 'utf8' });
    return res && res.status === 0 && res.stdout && res.stdout.trim().length > 0;
  } catch (e) {
    return false;
  }
}

// Cache detection once to avoid per-download blocking checks
const ARIA_AVAILABLE = fs.existsSync(path.join(__dirname, 'aria2c.exe')) || fs.existsSync(path.join(__dirname, 'aria2c')) || isCommandAvailable('aria2c');
const FFMPEG_DIR = fs.existsSync(path.join(__dirname, 'ffmpeg.exe')) ? __dirname : null;

function formatTime(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function sanitizeLabel(label) {
  return String(label || '')
    .trim()
    .replace(/[<>:"/\\|?*]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseProgressLine(line) {
  const result = {};
  const pct = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%/i);
  const speed = line.match(/(?:at|speed)\s+([0-9.]+(?:KiB|MiB|GiB|KB|MB|GB)\/s)/i);
  const eta = line.match(/ETA\s+([0-9:]+|Unknown)/i);

  if (pct) result.percent = Number(pct[1]);
  if (speed) result.speed = speed[1];
  if (eta) result.eta = eta[1];

  if (/\[download\]/i.test(line) || /\[ExtractAudio\]/i.test(line) || /\[info\]/i.test(line)) {
    result.message = line.trim();
  }

  return Object.keys(result).length ? result : null;
}

function buildYtDlpArgs(clipData) {
  const ytDlp = resolveBinary('yt-dlp');
  const ffmpegPath = resolveBinary('ffmpeg');
  const start = String(clipData.startTime || '').trim();
  const end = String(clipData.endTime || '').trim();
  const hasRange = start && end && start !== end;

  const qualityMap = {
    best: 'bestvideo+bestaudio/best',
    '1080p': 'bestvideo[height<=1080]+bestaudio/best',
    '720p':  'bestvideo[height<=720]+bestaudio/best',
    '480p':  'bestvideo[height<=480]+bestaudio/best',
    audio:   'bestaudio/best',
  };

  const quality = clipData.quality || 'best';
  const format = qualityMap[quality] || qualityMap.best;
  // Build args in the requested order
  const args = [];
  // 1. -f FORMAT
  args.push('-f', format);
  // 2. --merge-output-format mp4
  args.push('--merge-output-format', 'mp4');
  // 3. --newline
  args.push('--newline');
  // 4. --no-playlist
  args.push('--no-playlist');
  // 5. --no-check-certificates
  args.push('--no-check-certificates');
  // 6. --socket-timeout 10
  args.push('--socket-timeout', '10');
  // 7. --ffmpeg-location PATH (only when ffmpeg is a real path)
  try {
    if (fs.existsSync(ffmpegPath)) {
      args.push('--ffmpeg-location', path.dirname(ffmpegPath));
    }
  } catch {
    // ignore and do not pass ffmpeg-location
  }

  // 8. Download only the requested clip section when a time range is requested
  if (hasRange) {
    args.push('--download-sections', `*${start}-${end}`);
  }

  // 9. --extract-audio --audio-format mp3 (only if audio)
  if (quality === 'audio') {
    args.push('--extract-audio', '--audio-format', 'mp3');
  }

  // 10. --restrict-filenames
  args.push('--restrict-filenames');

  // 11. --force-overwrites
  args.push('--force-overwrites');

  // 12. -o OUTPUT_TEMPLATE
  const folder = clipData.outputFolder ? path.resolve(clipData.outputFolder) : __dirname;
  const labelRaw = String(clipData.label || '').trim();
  const label = sanitizeLabel(labelRaw);
  const outputBase = label ? label : '%(title).100B';
  // Include the yt-dlp id to prevent filename collisions when downloading multiple items
  // Add clipData.id (unique per download request) so same video can be downloaded multiple times
  // Add _clip suffix when time range is used so clipped and full downloads don't collide
  const uniqueIdSuffix = clipData.id ? clipData.id.slice(-8) : '';
  const clipSuffix = hasRange ? '_clip' : '';
  const outputTemplate = `${outputBase}_[%(id)s]_${uniqueIdSuffix}${clipSuffix}.%(ext)s`;
  args.push('--paths', folder);
  args.push('-o', outputTemplate);

  // 13. URL (always last)
  args.push(clipData.url);

  return { ytDlp, args, cwd: folder };
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1680,
    height: 1020,
    minWidth: 1360,
    minHeight: 880,
    backgroundColor: '#0a0a0a',
    title: 'USA Car Vault — Clip Downloader',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  for (const proc of activeDownloads.values()) {
    try {
      proc.kill();
    } catch {
      // ignore
    }
  }
  activeDownloads.clear();
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
    title: 'Select output folder',
  });

  if (result.canceled || !result.filePaths.length) {
    return null;
  }

  return result.filePaths[0];
});

ipcMain.handle('open-folder', async (_event, folderPath) => {
  if (!folderPath) return false;
  await shell.openPath(folderPath);
  return true;
});

ipcMain.handle('get-video-duration', async (_event, url) => {
  return new Promise((resolve) => {
    try {
      const match = url.match(
        /(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
      );
      if (!match) return resolve(null);
      const videoId = match[1];

      const https = require('https');
      const apiUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;

      // Attempt fast yt-dlp duration first with short timeout, fallback to noembed if needed
      const ytDlp = resolveBinary('yt-dlp');
      const args = [
        '--no-playlist',
        '--skip-download',
        '--print', '%(duration)s',
        '--no-warnings',
        '--no-check-certificates',
        '--socket-timeout', '5',
        url
      ];

      const child = spawn(ytDlp, args, {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let output = '';
      child.stdout.on('data', (chunk) => { output += chunk.toString(); });

      const timer = setTimeout(() => {
        try { child.kill('SIGKILL'); } catch {}
        // fallback to noembed
        try {
          https.get(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`, (res) => {
            let buf = '';
            res.on('data', (c) => buf += c.toString());
            res.on('end', () => {
              try {
                const j = JSON.parse(buf);
                // noembed doesn't provide duration; return null
                return resolve(null);
              } catch {
                return resolve(null);
              }
            });
          }).on('error', () => resolve(null));
        } catch {
          return resolve(null);
        }
      }, 6000);

      child.on('close', () => {
        clearTimeout(timer);
        const seconds = parseFloat(output.trim());
        resolve(isFinite(seconds) && seconds > 0 ? seconds : null);
      });

      child.on('error', () => {
        clearTimeout(timer);
        resolve(null);
      });
    } catch {
      resolve(null);
    }
  });
});

ipcMain.handle('cancel-download', async (_event, clipId) => {
  const child = activeDownloads.get(clipId);
  if (!child) return false;

  try {
    // Windows needs taskkill to reliably terminate child and its children
    if (process.platform === 'win32') {
      const { execSync } = require('child_process');
      try {
        execSync(`taskkill /pid ${child.pid} /T /F`, { windowsHide: true });
      } catch {
        try { child.kill('SIGKILL'); } catch {}
      }
    } else {
      try { child.kill('SIGKILL'); } catch {}
    }
  } catch {
    // ignore
  }

  activeDownloads.delete(clipId);
  return true;
});

ipcMain.handle('download-clip', async (event, clipData) => {
  const clipId = clipData.id;
  const webContents = event.sender;

  if (!clipData || !clipData.url) {
    webContents.send('download-progress', {
      clipId,
      status: 'Error',
      error: 'Missing URL',
    });
    return { clipId, ok: false };
  }

  if (activeDownloads.has(clipId)) {
    try {
      activeDownloads.get(clipId).kill();
    } catch {
      // ignore
    }
    activeDownloads.delete(clipId);
  }

  const { ytDlp, args, cwd } = buildYtDlpArgs(clipData);

  try {
    if (!fs.existsSync(cwd)) {
      fs.mkdirSync(cwd, { recursive: true });
    }
  } catch (error) {
    webContents.send('download-progress', {
      clipId,
      status: 'Error',
      error: error.message || 'Failed to create output folder',
    });
    return { clipId, ok: false };
  }

  let child;
  try {
    child = spawn(ytDlp, args, {
      cwd,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.__cancelled = false;
  } catch (error) {
    webContents.send('download-progress', {
      clipId,
      status: 'Error',
      error: error.message || 'Failed to start yt-dlp',
    });
    return { clipId, ok: false };
  }

  activeDownloads.set(clipId, child);

  webContents.send('download-progress', {
    clipId,
    status: 'Downloading',
    percent: 0,
    speed: '',
    eta: '',
    message: 'Starting download...',
  });

  let buffer = '';
  let errorBuffer = '';
  const handleOutput = (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r\n|\r|\n/);
    buffer = lines.pop() || '';

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      const parsed = parseProgressLine(line);
      if (parsed) {
        webContents.send('download-progress', {
          clipId,
          status: 'Downloading',
          ...parsed,
        });
      }
    }
  };

  const handleError = (chunk) => {
    errorBuffer += chunk.toString();
  };

  child.stdout.on('data', handleOutput);
  child.stderr.on('data', (chunk) => {
    handleError(chunk);
    handleOutput(chunk);
  });

  child.on('error', (error) => {
    activeDownloads.delete(clipId);
    webContents.send('download-progress', {
      clipId,
      status: 'Error',
      error: error.message || 'Failed to start yt-dlp',
    });
  });

  child.on('close', (code) => {
    if (!activeDownloads.has(clipId)) {
      // already removed (cancelled), do nothing
      return;
    }
    activeDownloads.delete(clipId);
    if (code === 0) {
      webContents.send('download-progress', {
        clipId,
        status: 'Done',
        percent: 100,
        speed: '',
        eta: '00:00',
        message: 'Download completed',
      });
    } else {
      const errorMsg = errorBuffer.trim() || `yt-dlp exited with code ${code}`;
      webContents.send('download-progress', {
        clipId,
        status: 'Error',
        error: errorMsg,
      });
    }
  });

  return { clipId, ok: true, command: [ytDlp, ...args].join(' ') };
});
