// js/core/storage.js — Decision history persistence

const STORAGE_KEY = 'warroom_decisions';
const MAX_DECISIONS = 50;

export function getDecisions() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch { return []; }
}

export function saveDecision(decision) {
  const decisions = getDecisions();
  decisions.unshift({
    ...decision,
    timestamp: new Date().toISOString(),
    id: Date.now().toString(36),
  });
  if (decisions.length > MAX_DECISIONS) decisions.length = MAX_DECISIONS;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(decisions));
  return decisions;
}

export function clearDecisions() {
  localStorage.removeItem(STORAGE_KEY);
}

export function renderDecisionHistory(container) {
  const decisions = getDecisions();
  if (decisions.length === 0) {
    container.innerHTML = '<div class="log-empty">Nessuna decisione salvata.</div>';
    return;
  }
  container.innerHTML = decisions.slice(0, 20).map(d => {
    const voteClass = (d.vote || '').toLowerCase();
    const date = new Date(d.timestamp).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    return `
      <div class="history-entry ${voteClass}">
        <div class="history-ticker">${d.ticker}</div>
        <div class="history-vote ${voteClass}">${d.vote}</div>
        <div class="history-score">${d.composite_score || '—'}</div>
        <div class="history-date">${date}</div>
      </div>
    `;
  }).join('');
}
