const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, spawnSync } = require('child_process');
const { randomUUID } = require('crypto');

const activeDownloads = new Map();

function resolveBinary(name) {
  const localExe = path.join(__dirname, `${name}.exe`);
  if (fs.existsSync(localExe)) {
    return localExe;
  }
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
  const start = String(clipData.startTime || '').trim();
  const end = String(clipData.endTime || '').trim();
  const hasTimeRange = Boolean(start && end);

  const qualityMap = {
    // Prefer progressive MP4 when available to avoid DASH fragmentation + merging delays
    best: 'best[ext=mp4]/best',
    '1080p': 'best[height<=1080][ext=mp4]/best[height<=1080]/best',
    '720p': 'best[height<=720][ext=mp4]/best[height<=720]/best',
    '480p': 'best[height<=480][ext=mp4]/best[height<=480]/best',
    audio: 'bestaudio/best',
  };

  const quality = clipData.quality || 'best';
  const format = hasTimeRange
    ? 'best[height<=720][ext=mp4]/best[ext=mp4]/best[height<=720]/best'
    : (qualityMap[quality] || qualityMap.best);
  const prefersProgressive = quality !== 'audio';

  // Build args in the requested order
  const args = [];
  // 1. -f FORMAT
  args.push('-f', format);
  // 2-3. Merge/remux only when needed; progressive MP4 can skip this overhead
  if (!prefersProgressive) {
    args.push('--merge-output-format', 'mp4');
    args.push('--remux-video', 'mp4');
  }
  // 4. --newline
  args.push('--newline');
  // 5. --no-playlist
  args.push('--no-playlist');
  // 6. --continue and --no-skip-unavailable (allow re-downloads)
  args.push('--continue');
  args.push('--no-skip-unavailable');
  // 7. --restrict-filenames
  args.push('--restrict-filenames');

  if (hasTimeRange) {
    // Make clip downloads start faster by using a simpler extractor path.
    args.push('--force-ipv4');
    args.push('--extractor-args', 'youtube:player_client=android');
  }

  // Keep time-range downloads lean; aggressive fragment tuning helps full videos more than clipped ranges.
  // 8. --concurrent-fragments (full-video path only)
  // 9. --buffer-size (full-video path only)
  // 10. --http-chunk-size (full-video path only)

  // 11. --ffmpeg-location (if local ffmpeg exists)
  if (FFMPEG_DIR) {
    args.push('--ffmpeg-location', FFMPEG_DIR);
  }

  // If aria2c was detected at startup, use it only for full-video downloads.
  if (ARIA_AVAILABLE && !clipData.startTime && !clipData.endTime) {
    args.push('--external-downloader', resolveBinary('aria2c'));
    // -x 16 connections, -s 16 streams, -k 1M piece size
    args.push('--external-downloader-args', '-x 16 -s 16 -k 1M');
  }

  // 12. --download-sections if time range provided
  // Skip --force-keyframes-at-cuts because it can trigger extra processing and slow start time.
  if (hasTimeRange) {
    args.push('--download-sections', `*${start}-${end}`);
  } else {
    // Full-video path: allow more aggressive network tuning
    args.push('--concurrent-fragments', '10');
    args.push('--buffer-size', '64K');
    args.push('--http-chunk-size', '16M');
    args.push('--fragment-retries', '5');
    args.push('--socket-timeout', '15');
  }

  // 14. --extract-audio --audio-format mp3 (only if quality === 'audio')
  if (quality === 'audio') {
    args.push('--extract-audio', '--audio-format', 'mp3');
  }

  // 15. -o OUTPUT_TEMPLATE
  const folder = clipData.outputFolder ? path.resolve(clipData.outputFolder) : __dirname;
  const labelRaw = String(clipData.label || '').trim();
  const label = sanitizeLabel(labelRaw);
  const outputBase = label ? label : '%(title).100B';
  // Include the yt-dlp id to prevent filename collisions when downloading multiple items
  // Add clipData.id (unique per download request) so same video can be downloaded multiple times
  // Add _clip suffix when time range is used so clipped and full downloads don't collide
  const uniqueIdSuffix = clipData.id ? clipData.id.slice(-8) : '';
  const clipSuffix = hasTimeRange ? '_clip' : '';
  const outputTemplate = `${outputBase}_[%(id)s]_${uniqueIdSuffix}${clipSuffix}.%(ext)s`;
  args.push('--paths', folder);
  args.push('-o', outputTemplate);

  // 16. URL (always last)
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

ipcMain.handle('cancel-download', async (_event, clipId) => {
  const proc = activeDownloads.get(clipId);
  if (!proc) {
    return { ok: false, clipId };
  }

  try {
    proc.__cancelled = true;
    proc.kill();
  } catch {
    // ignore
  }

  activeDownloads.delete(clipId);
  return { ok: true, clipId };
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
    activeDownloads.delete(clipId);
    if (child.__cancelled) {
      webContents.send('download-progress', {
        clipId,
        status: 'Error',
        error: 'Cancelled by user',
      });
    } else if (code === 0) {
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
