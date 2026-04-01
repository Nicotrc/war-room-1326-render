// js/views/scouting.js — Scouting: penny stocks $1-5, top 5 with expandable reports
import { $ } from '../core/ui.js';
import { postJSON } from '../core/api-client.js';

let isRunning = false;

export function init() {
  const btn = $('#scoutBtn');
  if (btn) btn.addEventListener('click', runScouting);
}
export function destroy() {}

async function runScouting() {
  if (isRunning) return;
  isRunning = true;
  const btn = $('#scoutBtn');
  btn.disabled = true; btn.textContent = 'SCANNING...';
  const feed = $('#scoutResults');
  feed.innerHTML = '<div class="loading-msg">Pre-filtro titoli $1-5 via Finnhub...</div>';

  try {
    // Step 1: Get pre-filtered candidates (price $1-5 via Finnhub — fast)
    const { candidates } = await postJSON('scouting', { scan: true });

    if (!candidates?.length) {
      feed.innerHTML = '<div class="chat-empty">Nessun titolo nel range $1-5 trovato. Riprova piu tardi.</div>';
      finish(btn); return;
    }

    feed.innerHTML = `<div class="loading-msg">Trovati ${candidates.length} titoli nel range $1-5. Analisi approfondita...</div>`;

    // Step 2: Analyze each candidate (sequential, with AV rate limit delay)
    const results = [];
    const toAnalyze = candidates.slice(0, 8); // Max 8 to stay in rate limits

    for (let i = 0; i < toAnalyze.length; i++) {
      const { ticker, sector } = toAnalyze[i];
      const loadingEl = feed.querySelector('.loading-msg');
      if (loadingEl) loadingEl.textContent = `Analisi ${ticker} ($${toAnalyze[i].price.toFixed(2)}) — ${sector} [${i + 1}/${toAnalyze.length}]`;

      try {
        const data = await postJSON('scouting', { ticker });
        if (!data.error && data.score) results.push({ ...data, sector });
        // Rate limit delay (AV: 5 calls/min)
        if (i < toAnalyze.length - 1) await new Promise(r => setTimeout(r, 15000));
      } catch {}
    }

    // Sort by score, show top 5
    results.sort((a, b) => b.score - a.score);
    const top = results.slice(0, 5);
    feed.innerHTML = '';

    if (top.length === 0) {
      feed.innerHTML = '<div class="chat-empty">Analisi completata ma nessun candidato qualificato. Rate limit AV — riprova tra 1 min.</div>';
      finish(btn); return;
    }

    top.forEach((data, idx) => renderCard(feed, data, idx));

    const summary = document.createElement('div');
    summary.className = 'chat-system';
    summary.innerHTML = `Screening completato: <strong>Top ${top.length}</strong> su ${results.length} analizzati (range $1-5)`;
    feed.appendChild(summary);

  } catch (err) {
    feed.innerHTML = `<div class="api-status error">Errore: ${err.message}</div>`;
  }
  finish(btn);
}

function finish(btn) {
  isRunning = false;
  if (btn) { btn.disabled = false; btn.textContent = 'AVVIA SCREENING'; }
}

function renderCard(feed, data, idx) {
  const card = document.createElement('div');
  card.className = 'scout-card';
  const id = `scout-${idx}`;
  const vc = data.trend === 'BULLISH' ? 'buy' : data.trend === 'BEARISH' ? 'sell' : 'hold';

  card.innerHTML = `
    <div class="scout-header" data-toggle="${id}">
      <div class="scout-rank">#${idx + 1}</div>
      <div class="scout-ticker-row">
        <span class="scout-ticker">${data.ticker}</span>
        <span class="scout-sector">${data.sector}</span>
        <span class="scout-trend ${vc}">${data.trend || 'N/A'}</span>
      </div>
      <div class="scout-price-row">
        <span>$${data.price?.toFixed(2)}</span>
        <span class="stock-change ${parseFloat(data.change_pct) >= 0 ? 'up' : 'down'}">${data.change_pct}</span>
      </div>
      <div class="scout-quick">Score: <strong>${data.score}/100</strong> | EV: ${data.ev?.toFixed(2)}% | R/R: ${data.rr?.toFixed(1)}</div>
      <div class="scout-expand-hint">▼ Clicca per report completo</div>
    </div>
    <div class="scout-detail" id="${id}" style="display:none">
      <div class="scout-detail-section"><h4>Setup Operativo</h4>
        <div class="scout-detail-grid">
          <div><span class="label">Tipo</span><span class="val">${data.setup} — ${data.trade_type}</span></div>
          <div><span class="label">Entry</span><span class="val">$${data.entry?.toFixed(2)}</span></div>
          <div><span class="label">Stop Loss</span><span class="val red">$${data.stop?.toFixed(2)}</span></div>
          <div><span class="label">Target 1</span><span class="val green">$${data.target1?.toFixed(2)}</span></div>
          <div><span class="label">Target 2</span><span class="val green">$${data.target2?.toFixed(2)}</span></div>
          <div><span class="label">Risk/Reward</span><span class="val">${data.rr?.toFixed(2)}</span></div>
        </div>
      </div>
      <div class="scout-detail-section"><h4>Tecnica</h4>
        <div class="scout-detail-grid">
          <div><span class="label">RSI(14)</span><span class="val">${data.rsi || '—'}</span></div>
          <div><span class="label">Trend</span><span class="val ${vc}">${data.trend}</span></div>
          <div><span class="label">Volatilita</span><span class="val">${data.volatility}%</span></div>
          <div><span class="label">Vol Spike</span><span class="val">${data.volume_spike || '—'}%</span></div>
          <div><span class="label">Momentum</span><span class="val">${data.momentum_score}/100</span></div>
        </div>
      </div>
      ${data.monte_carlo ? `<div class="scout-detail-section"><h4>Monte Carlo (30gg, 5K sim)</h4>
        <div class="scout-detail-grid">
          <div><span class="label">P(+15%)</span><span class="val green">${data.prob_up15?.toFixed(1)}%</span></div>
          <div><span class="label">P(-20%)</span><span class="val red">${data.prob_down20?.toFixed(1)}%</span></div>
          <div><span class="label">Mediana</span><span class="val">$${data.monte_carlo.median_price}</span></div>
          <div><span class="label">5th Pctl</span><span class="val red">$${data.monte_carlo.percentile_5}</span></div>
          <div><span class="label">95th Pctl</span><span class="val green">$${data.monte_carlo.percentile_95}</span></div>
          <div><span class="label">Expected Ret</span><span class="val">${data.monte_carlo.expected_return}%</span></div>
        </div>
      </div>` : ''}
      <div class="scout-detail-section"><h4>Expected Value</h4>
        <div class="scout-ev ${data.ev > 0 ? 'positive' : 'negative'}">EV = ${data.ev?.toFixed(2)}% ${data.ev > 0 ? '(favorevole)' : '(sfavorevole)'}</div>
      </div>
      <div class="scout-detail-section"><h4>Consiglio Transazionale</h4>
        <div class="scout-advice ${vc}">${getAdvice(data)}</div>
      </div>
      ${data.partial ? '<div style="font-size:.6rem;color:var(--yellow);margin-top:.5rem">⚠ Dati parziali (rate limit AV) — analisi basata su Finnhub</div>' : ''}
    </div>`;

  card.querySelector('.scout-header').addEventListener('click', () => {
    const d = document.getElementById(id);
    d.style.display = d.style.display === 'none' ? 'block' : 'none';
    card.classList.toggle('expanded');
  });
  feed.appendChild(card);
}

function getAdvice(d) {
  if (d.score >= 70 && d.ev > 2) return `<strong>BUY</strong> — Score ${d.score}/100, EV +${d.ev?.toFixed(2)}%. Entry $${d.entry?.toFixed(2)}, stop $${d.stop?.toFixed(2)}. Max 3% portafoglio.`;
  if (d.score >= 50 && d.ev > 0) return `<strong>WATCH</strong> — Score ${d.score}/100. Attendere conferma breakout. EV marginale.`;
  if (d.score < 40 || d.ev < -2) return `<strong>AVOID</strong> — Score ${d.score}/100, EV ${d.ev?.toFixed(2)}%. Rischio troppo alto.`;
  return `<strong>HOLD</strong> — Segnali misti. Score ${d.score}/100, EV ${d.ev?.toFixed(2)}%.`;
}
