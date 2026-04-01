// js/core/scoring.js — Composite scoring engine (0-100)

export function computeCompositeScore({ technical = 50, fundamental = 50, catalysts = 50, sentiment = 50 }) {
  return Math.round(technical * 0.3 + fundamental * 0.3 + catalysts * 0.2 + sentiment * 0.2);
}

export function scoreLabel(score) {
  if (score >= 80) return { label: 'FORTE', class: 'score-strong' };
  if (score >= 60) return { label: 'POSITIVO', class: 'score-positive' };
  if (score >= 40) return { label: 'NEUTRO', class: 'score-neutral' };
  if (score >= 20) return { label: 'DEBOLE', class: 'score-weak' };
  return { label: 'NEGATIVO', class: 'score-negative' };
}

export function renderScoreGauge(container, score, size = 80) {
  const { label, class: cls } = scoreLabel(score);
  const circumference = 2 * Math.PI * 35;
  const offset = circumference - (score / 100) * circumference;

  container.innerHTML = `
    <div class="score-gauge ${cls}">
      <svg width="${size}" height="${size}" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r="35" fill="none" stroke="var(--bg4)" stroke-width="6"/>
        <circle cx="40" cy="40" r="35" fill="none" stroke="currentColor" stroke-width="6"
          stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
          stroke-linecap="round" transform="rotate(-90 40 40)"
          style="transition: stroke-dashoffset 1s ease"/>
      </svg>
      <div class="score-value">${score}</div>
      <div class="score-label">${label}</div>
    </div>
  `;
}

export function renderScoreBreakdown(container, breakdown) {
  const items = [
    { key: 'technical', label: 'Tecnica', weight: '30%' },
    { key: 'fundamental', label: 'Fondamentale', weight: '30%' },
    { key: 'catalysts', label: 'Catalizzatori', weight: '20%' },
    { key: 'sentiment', label: 'Sentiment', weight: '20%' },
  ];
  container.innerHTML = items.map(({ key, label, weight }) => {
    const val = breakdown[key] || 0;
    return `
      <div class="score-bar-item">
        <div class="score-bar-label">${label} <span class="score-bar-weight">(${weight})</span></div>
        <div class="score-bar-track">
          <div class="score-bar-fill" style="width:${val}%;background:${val > 60 ? 'var(--green)' : val > 40 ? 'var(--yellow)' : 'var(--red)'}"></div>
        </div>
        <div class="score-bar-val">${val}</div>
      </div>
    `;
  }).join('');
}
