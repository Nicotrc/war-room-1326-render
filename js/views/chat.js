// js/views/chat.js — Live predictive chat with pin & expand for charts
import { $, addSystemMsg, addChatMsg } from '../core/ui.js';

let chatHistory = [];
let pinnedCharts = [];

export function init() {
  const dropZone = $('#chartDropZone');
  const fileInput = $('#chartFileInput');
  const sendBtn = $('#chatSendBtn');
  const textInput = $('#chatTextInput');

  if (dropZone) {
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) processImage(file);
    });
    dropZone.addEventListener('click', () => fileInput?.click());
  }

  if (fileInput) fileInput.addEventListener('change', e => { if (e.target.files[0]) processImage(e.target.files[0]); });
  if (sendBtn) sendBtn.addEventListener('click', sendFollowUp);
  if (textInput) textInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendFollowUp(); });

  renderPinnedCharts();
}

export function destroy() {}

async function processImage(file) {
  const feed = $('#chatFeed2');
  addSystemMsg(feed, 'Elaborazione immagine...');

  const base64 = await compressImage(file, 2048);

  // Show preview with pin button
  const previewId = 'chart-' + Date.now();
  const preview = document.createElement('div');
  preview.className = 'chart-preview';
  preview.innerHTML = `
    <img src="${base64}" alt="Chart" id="${previewId}-img" />
    <div class="chart-actions">
      <button class="chart-pin-btn" data-id="${previewId}" title="Fissa grafico">Pin</button>
      <button class="chart-expand-btn" data-id="${previewId}" title="Espandi">Espandi</button>
    </div>
  `;
  feed.appendChild(preview);

  // Pin handler
  preview.querySelector('.chart-pin-btn').addEventListener('click', () => {
    pinnedCharts.push({ id: previewId, src: base64, timestamp: new Date().toLocaleTimeString('it-IT') });
    savePinnedCharts();
    renderPinnedCharts();
    preview.querySelector('.chart-pin-btn').textContent = 'Fissato';
    preview.querySelector('.chart-pin-btn').disabled = true;
  });

  // Expand handler
  preview.querySelector('.chart-expand-btn').addEventListener('click', () => {
    showLightbox(base64);
  });

  addSystemMsg(feed, 'Invio a GPT-4o Vision per analisi...');

  try {
    const res = await fetch('/api/chat-vision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64, history: chatHistory.slice(-4) }),
    });
    const data = await res.json();
    if (data.error) { addSystemMsg(feed, `Errore: ${data.error}`); return; }
    chatHistory.push({ role: 'assistant', content: JSON.stringify(data) });
    displayAnalysis(feed, data);
  } catch (err) {
    addSystemMsg(feed, `Errore: ${err.message}`);
  }
}

function displayAnalysis(feed, data) {
  if (data.patterns?.length) addChatMsg(feed, 'PRISM', `**Pattern identificati:** ${data.patterns.join(', ')}`);
  if (data.key_levels) {
    const levels = [];
    if (data.key_levels.support?.length) levels.push(`Supporto: ${data.key_levels.support.map(l => '$' + l).join(', ')}`);
    if (data.key_levels.resistance?.length) levels.push(`Resistenza: ${data.key_levels.resistance.map(l => '$' + l).join(', ')}`);
    if (levels.length) addChatMsg(feed, 'PRISM', `**Livelli chiave:** ${levels.join(' | ')}`);
  }
  if (data.bias) addChatMsg(feed, 'PRISM', `**Bias:** ${data.bias}`);
  if (data.probability_scenarios) {
    const entries = Object.entries(data.probability_scenarios).map(([k, v]) => `${k}: ${v}%`);
    addChatMsg(feed, 'PRISM', `**Scenari:** ${entries.join(' | ')}`);
  }
  if (data.analysis_text) addChatMsg(feed, 'ALPHA', data.analysis_text);
}

async function sendFollowUp() {
  const input = $('#chatTextInput');
  const text = input?.value.trim();
  if (!text) return;
  input.value = '';
  const feed = $('#chatFeed2');
  addChatMsg(feed, 'SYSTEM', text);
  chatHistory.push({ role: 'user', content: text });

  try {
    const res = await fetch('/api/chat-vision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, history: chatHistory.slice(-6) }),
    });
    const data = await res.json();
    chatHistory.push({ role: 'assistant', content: JSON.stringify(data) });
    if (data.analysis_text) addChatMsg(feed, 'ALPHA', data.analysis_text);
    else displayAnalysis(feed, data);
  } catch (err) {
    addSystemMsg(feed, `Errore: ${err.message}`);
  }
}

// ── Pinned Charts ──────────────────────────────
function savePinnedCharts() {
  try {
    // Store only last 10 to avoid localStorage limits
    const toStore = pinnedCharts.slice(-10).map(c => ({ id: c.id, src: c.src.substring(0, 50000), timestamp: c.timestamp }));
    localStorage.setItem('pinned_charts', JSON.stringify(toStore));
  } catch {}
}

function loadPinnedCharts() {
  try {
    pinnedCharts = JSON.parse(localStorage.getItem('pinned_charts') || '[]');
  } catch { pinnedCharts = []; }
}

function renderPinnedCharts() {
  loadPinnedCharts();
  const container = document.getElementById('pinnedCharts');
  if (!container) return;
  if (pinnedCharts.length === 0) {
    container.innerHTML = '<div class="pinned-empty">Nessun grafico fissato. Usa il pulsante "Pin" per salvare.</div>';
    return;
  }
  container.innerHTML = pinnedCharts.map(c => `
    <div class="pinned-chart" data-id="${c.id}">
      <img src="${c.src}" alt="Pinned chart" />
      <div class="pinned-meta">
        <span>${c.timestamp}</span>
        <button class="pinned-expand" data-src="${c.src}">Espandi</button>
        <button class="pinned-remove" data-id="${c.id}">X</button>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.pinned-expand').forEach(btn => {
    btn.addEventListener('click', () => showLightbox(btn.dataset.src));
  });
  container.querySelectorAll('.pinned-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      pinnedCharts = pinnedCharts.filter(c => c.id !== btn.dataset.id);
      savePinnedCharts();
      renderPinnedCharts();
    });
  });
}

// ── Lightbox ───────────────────────────────────
function showLightbox(src) {
  const overlay = document.createElement('div');
  overlay.className = 'lightbox-overlay';
  overlay.innerHTML = `
    <div class="lightbox-content">
      <img src="${src}" alt="Expanded chart" />
      <button class="lightbox-close">Chiudi</button>
    </div>
  `;
  overlay.addEventListener('click', e => { if (e.target === overlay || e.target.classList.contains('lightbox-close')) overlay.remove(); });
  document.body.appendChild(overlay);
}

function compressImage(file, maxSize) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      if (width > maxSize || height > maxSize) {
        const ratio = Math.min(maxSize / width, maxSize / height);
        width *= ratio; height *= ratio;
      }
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.src = URL.createObjectURL(file);
  });
}
