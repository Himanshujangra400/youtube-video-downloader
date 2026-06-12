const clipList = document.getElementById('clipList');
const clipTemplate = document.getElementById('clipTemplate');
const clipCount = document.getElementById('clipCount');
const outputFolderInput = document.getElementById('outputFolder');
const selectFolderBtn = document.getElementById('selectFolderBtn');
const addClipBtn = document.getElementById('addClipBtn');
const downloadAllBtn = document.getElementById('downloadAllBtn');

const clips = new Map();
let selectedFolder = '';

const removeProgressListener = window.electronAPI.onProgress((payload) => {
  console.log('yt-dlp progress event:', payload);

  const card = clips.get(payload.clipId);
  if (!card) return;

  if (payload.status === 'Downloading') {
    setStatus(card, 'Downloading', payload);
    return;
  }

  if (payload.status === 'Done') {
    setStatus(card, 'Done', payload);
    card.querySelector('.download-btn').disabled = false;
    return;
  }

  if (payload.status === 'Error') {
    setStatus(card, 'Error', payload);
    card.querySelector('.download-btn').disabled = false;
  }
});

window.addEventListener('beforeunload', () => {
  if (typeof removeProgressListener === 'function') {
    removeProgressListener();
  }
});

function pad(n) {
  return String(n).padStart(2, '0');
}

function formatTime(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${pad(minutes)}:${pad(secs)}`;
}

function parseTime(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const parts = text.split(':').map((part) => part.trim());
  if (parts.some((part) => part === '' || Number.isNaN(Number(part)))) return null;
  if (parts.length === 1) return Number(parts[0]);
  if (parts.length === 2) return Number(parts[0]) * 60 + Number(parts[1]);
  if (parts.length === 3) return Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
  return null;
}

function sanitizeLabel(label) {
  return String(label || '')
    .trim()
    .replace(/[<>:"/\\|?*]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function makeId() {
  return `clip_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

async function fetchVideoDuration(url) {
  try {
    const result = await window.electronAPI.getVideoDuration(url);
    return result;
  } catch {
    return null;
  }
}

function updateCounter() {
  clipCount.textContent = String(clipList.children.length);
}

function setStatus(card, status, extra = {}) {
  const badge = card.querySelector('.status-badge');
  badge.className = `status-badge status-${status.toLowerCase()}`;
  badge.textContent = status;

  const progressText = card.querySelector('.progress-text');
  const progressStats = card.querySelector('.progress-stats');
  const progressFill = card.querySelector('.progress-fill');
  const progressOverlay = card.querySelector('.progress-overlay');
  const openFolderBtn = card.querySelector('.open-folder-btn');
  const errorText = card.querySelector('.error-text');

  if (status === 'Waiting') {
    progressText.textContent = 'Ready to download';
    progressStats.textContent = '0% · 0.0MiB/s · ETA --:--';
    progressFill.style.width = '0%';
    progressOverlay.textContent = '0%';
    openFolderBtn.classList.add('hidden');
    card.querySelector('.cancel-btn').classList.add('hidden');
    if (errorText) errorText.textContent = '';
  }

  if (status === 'Downloading') {
    const percent = Number.isFinite(extra.percent) ? extra.percent : 0;
    const speed = extra.speed || '0.0MiB/s';
    const eta = extra.eta || '--:--';
    progressText.textContent = extra.message || 'Downloading clip';
    progressStats.textContent = `${percent.toFixed(1)}% · ${speed} · ETA ${eta}`;
    progressFill.style.width = `${Math.min(100, Math.max(0, percent))}%`;
    progressOverlay.textContent = `${percent.toFixed(1)}%`;
    openFolderBtn.classList.add('hidden');
    card.querySelector('.cancel-btn').classList.remove('hidden');
    if (errorText) errorText.textContent = '';
  }

  if (status === 'Done') {
    progressText.textContent = 'Download completed';
    progressStats.textContent = '100% · complete';
    progressFill.style.width = '100%';
    progressOverlay.textContent = '100%';
    openFolderBtn.classList.remove('hidden');
    card.querySelector('.cancel-btn').classList.add('hidden');
    if (errorText) errorText.textContent = '';
  }

  if (status === 'Error') {
    progressText.textContent = extra.error || 'Download failed';
    progressStats.textContent = 'Error';
    progressFill.style.width = '0%';
    progressOverlay.textContent = 'Error';
    openFolderBtn.classList.add('hidden');
    card.querySelector('.cancel-btn').classList.add('hidden');
    if (errorText) errorText.textContent = extra.error || 'Download failed';
  }
}

function syncRange(card) {
  const startSlider = card.querySelector('.range-start');
  const endSlider = card.querySelector('.range-end');
  const fill = card.querySelector('.timeline-fill');
  const startInput = card.querySelector('.start-input');
  const endInput = card.querySelector('.end-input');

  let start = Number(startSlider.value);
  let end = Number(endSlider.value);

  if (start >= end) {
    if (document.activeElement === startSlider) {
      start = Math.max(0, end - 1);
    } else {
      end = Math.min(Number(endSlider.max), start + 1);
    }
  }

  startSlider.value = String(start);
  endSlider.value = String(end);
  startInput.value = formatTime(start);
  endInput.value = formatTime(end);
  card.dataset.startTime = formatTime(start);
  card.dataset.endTime = formatTime(end);

  const max = Number(startSlider.max);
  fill.style.setProperty('--range-left', `${(start / max) * 100}%`);
  fill.style.setProperty('--range-right', `${(end / max) * 100}%`);
}

function applyTypedTime(card, kind) {
  const input = card.querySelector(`.${kind}-input`);
  const slider = card.querySelector(`.range-${kind === 'start' ? 'start' : 'end'}`);
  const otherSlider = card.querySelector(`.range-${kind === 'start' ? 'end' : 'start'}`);
  const raw = input.value.trim();

  if (!raw) {
    card.dataset[`${kind}Time`] = '';
    return;
  }

  const parsed = parseTime(input.value);

  if (parsed === null) {
    input.value = formatTime(slider.value);
    return;
  }

  const clamped = kind === 'start'
    ? Math.max(0, Math.min(parsed, Number(otherSlider.value) - 1))
    : Math.min(Number(slider.max), Math.max(parsed, Number(otherSlider.value) + 1));

  slider.value = String(clamped);
  card.dataset[`${kind}Time`] = formatTime(clamped);
  syncRange(card);
}

function getClipData(card) {
  const useRange = Boolean(card.querySelector('.use-range-toggle')?.checked);
  return {
    id: card.dataset.id,
    url: card.querySelector('.url-input').value.trim(),
    label: sanitizeLabel(card.querySelector('.label-input').value),
    startTime: useRange ? String(card.dataset.startTime || '').trim() : '',
    endTime: useRange ? String(card.dataset.endTime || '').trim() : '',
    quality: card.querySelector('.quality-select').value,
    outputFolder: selectedFolder,
  };
}

function resolveQuality(quality) {
  return {
    best: 'bestvideo+bestaudio/best',
    '1080p': 'bestvideo[height<=1080]+bestaudio/best',
    '720p': 'bestvideo[height<=720]+bestaudio/best',
    '480p': 'bestvideo[height<=480]+bestaudio/best',
    audio: 'bestaudio/best',
  }[quality] || 'bestvideo+bestaudio/best';
}

function updateDownloadButtonState(card) {
  const btn = card.querySelector('.download-btn');
  const data = getClipData(card);
  btn.disabled = !data.url || !selectedFolder;
}

function wireCard(card) {
  const id = makeId();
  card.dataset.id = id;
  card.dataset.startTime = '00:00';
  card.dataset.endTime = '05:00';
  clips.set(id, card);

  const number = card.querySelector('.clip-number');
  const urlInput = card.querySelector('.url-input');
  const labelInput = card.querySelector('.label-input');
  const qualitySelect = card.querySelector('.quality-select');
  const startInput = card.querySelector('.start-input');
  const endInput = card.querySelector('.end-input');
  const startSlider = card.querySelector('.range-start');
  const endSlider = card.querySelector('.range-end');
  const deleteBtn = card.querySelector('.delete-btn');
  const downloadBtn = card.querySelector('.download-btn');
  const openFolderBtn = card.querySelector('.open-folder-btn');
  const clipActions = card.querySelector('.clip-actions');
  const progressArea = card.querySelector('.progress-area');

  const rangeToggleField = document.createElement('div');
  rangeToggleField.className = 'field range-toggle-field';
  rangeToggleField.innerHTML = `
    <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
      <input class="use-range-toggle" type="checkbox" />
      <span>Use time range</span>
    </label>
  `;
  card.querySelector('.clip-grid').appendChild(rangeToggleField);

  const errorText = document.createElement('div');
  errorText.className = 'error-text';
  errorText.style.marginTop = '8px';
  errorText.style.color = '#FF4444';
  errorText.style.fontSize = '12px';
  errorText.style.minHeight = '16px';
  errorText.style.display = 'block';
  progressArea.appendChild(errorText);

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-danger cancel-btn';
  cancelBtn.type = 'button';
  cancelBtn.textContent = 'Cancel';
  clipActions.insertBefore(cancelBtn, openFolderBtn);

  number.textContent = String(clipList.children.length + 1);
  setStatus(card, 'Waiting');
  card.querySelector('.use-range-toggle').checked = false;

  startSlider.addEventListener('input', () => syncRange(card));
  endSlider.addEventListener('input', () => syncRange(card));
  startInput.addEventListener('change', () => applyTypedTime(card, 'start'));
  endInput.addEventListener('change', () => applyTypedTime(card, 'end'));

  let durationTimer = null;

  const triggerDurationFetch = () => {
    clearTimeout(durationTimer);
    durationTimer = setTimeout(async () => {
      const url = urlInput.value.trim();
      if (!url || (!url.includes('youtube') && !url.includes('youtu.be'))) return;

      const endInput = card.querySelector('.end-input');
      endInput.value = 'loading...';

      const duration = await fetchVideoDuration(url);

      if (duration && duration > 0) {
        const max = Math.ceil(duration);
        card.querySelector('.range-start').max = String(max);
        card.querySelector('.range-end').max = String(max);
        card.querySelector('.range-start').value = '0';
        card.querySelector('.range-end').value = String(max);
        card.dataset.startTime = '00:00';
        card.dataset.endTime = formatTime(max);
        syncRange(card);
      } else {
        const fallback = 600;
        card.querySelector('.range-start').max = String(fallback);
        card.querySelector('.range-end').max = String(fallback);
        card.querySelector('.range-end').value = String(fallback);
        card.dataset.endTime = formatTime(fallback);
        syncRange(card);
      }
      updateDownloadButtonState(card);
    }, 800);
  };

  urlInput.addEventListener('paste', () => {
    setTimeout(triggerDurationFetch, 100);
  });
  urlInput.addEventListener('input', triggerDurationFetch);

  [urlInput, labelInput, qualitySelect].forEach((el) => {
    el.addEventListener('input', () => updateDownloadButtonState(card));
    el.addEventListener('change', () => updateDownloadButtonState(card));
  });

  deleteBtn.addEventListener('click', () => removeCard(card));
  downloadBtn.addEventListener('click', () => startDownload(card));
  cancelBtn.addEventListener('click', async () => {
    const clipId = card.dataset.id;
    await window.electronAPI.cancelDownload(clipId);
    setStatus(card, 'Waiting');
    card.querySelector('.download-btn').disabled = false;
    card.querySelector('.cancel-btn').classList.add('hidden');
  });
  openFolderBtn.addEventListener('click', async () => {
    if (selectedFolder) await window.electronAPI.openFolder(selectedFolder);
  });

  syncRange(card);
  updateDownloadButtonState(card);
  updateCounter();
}

function removeCard(card) {
  card.classList.add('removing');
  setTimeout(() => {
    clips.delete(card.dataset.id);
    card.remove();
    renumberCards();
    updateCounter();
  }, 200);
}

function renumberCards() {
  [...clipList.children].forEach((card, index) => {
    card.querySelector('.clip-number').textContent = String(index + 1);
  });
}

async function startDownload(card) {
  const downloadBtn = card.querySelector('.download-btn');
  downloadBtn.disabled = true;

  const data = getClipData(card);
  card.dataset.id = data.id;

  if (!data.url) {
    setStatus(card, 'Error', { error: 'URL required' });
    downloadBtn.disabled = false;
    return;
  }
  if (!selectedFolder) {
    setStatus(card, 'Error', { error: 'Select an output folder first' });
    downloadBtn.disabled = false;
    return;
  }

  setStatus(card, 'Downloading', { percent: 0, speed: '0.0MiB/s', eta: '--:--', message: 'Starting download...' });
  try {
    const result = await window.electronAPI.downloadClip({
      ...data,
      quality: data.quality,
      qualityFormat: resolveQuality(data.quality),
    });

    if (result?.clipId && result.clipId !== card.dataset.id) {
      clips.delete(card.dataset.id);
      card.dataset.id = result.clipId;
      clips.set(result.clipId, card);
    }

    if (result && result.ok === false) {
      setStatus(card, 'Error', { error: 'Failed to start download' });
      downloadBtn.disabled = false;
    }
  } catch (error) {
    setStatus(card, 'Error', { error: error?.message || 'Failed to start download' });
    downloadBtn.disabled = false;
  }
}

async function downloadAll() {
  const cards = [...clipList.children];
  await Promise.all(cards.map((card) => startDownload(card)));
}

async function selectFolder() {
  const folder = await window.electronAPI.selectFolder();
  if (folder) {
    selectedFolder = folder;
    outputFolderInput.value = folder;
    [...clipList.children].forEach((card) => updateDownloadButtonState(card));
  }
}

function createCard() {
  const card = clipTemplate.content.firstElementChild.cloneNode(true);
  wireCard(card);
  return card;
}

selectFolderBtn.addEventListener('click', selectFolder);
addClipBtn.addEventListener('click', () => {
  const card = createCard();
  clipList.appendChild(card);
  updateCounter();
  updateDownloadButtonState(card);
});
downloadAllBtn.addEventListener('click', downloadAll);

outputFolderInput.addEventListener('change', () => {
  selectedFolder = outputFolderInput.value.trim();
  [...clipList.children].forEach((card) => updateDownloadButtonState(card));
});

// Seed with one clip row.
clipList.appendChild(createCard());
updateCounter();
