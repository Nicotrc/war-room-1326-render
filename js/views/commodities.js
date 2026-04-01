// js/views/commodities.js — Commodities bot view (sequential calls)
import { $, addSystemMsg, addChatMsg, showTyping, removeTyping } from '../core/ui.js';
import { postJSON } from '../core/api-client.js';

export function init() {
  const btn = $('#commAnalyzeBtn');
  if (btn) btn.addEventListener('click', run);
  const input = $('#commInput');
  if (input) input.addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
}

export function destroy() {}

async function run() {
  const commodity = $('#commInput')?.value.trim().toUpperCase();
  if (!commodity) return;
  const feed = $('#commFeed');
  feed.innerHTML = '';
  addSystemMsg(feed, `Analisi commodity per <strong>${commodity}</strong>...`);

  try {
    const data = await postJSON('commodities', { commodity, phase: 'data' });

    if (data.error) {
      addSystemMsg(feed, `❌ ${data.error}`);
      return;
    }

    const card = $('#commCard');
    if (card) {
      card.style.display = 'block';
      card.innerHTML = `
        <div class="stock-ticker">${data.commodity}</div>
        <div class="stock-name">${data.name}</div>
        <div class="stock-price">$${data.price?.toFixed(2) || '—'}</div>
        <div class="stock-meta">
          Curva: ${data.curve_shape || '—'} | Domanda: ${data.demand_trend || '—'}<br>
          ${data.technicals ? `RSI: ${data.technicals.rsi?.toFixed(1) || '—'} | Trend: ${data.technicals.trend || '—'}` : ''}
        </div>
      `;
    }

    addSystemMsg(feed, `✅ Prezzo: $${data.price?.toFixed(2)}, Curva: ${data.curve_shape}, Domanda: ${data.demand_trend}`);

    if (data.monte_carlo) {
      addSystemMsg(feed, `🎲 Monte Carlo 30gg: P(+15%): ${data.monte_carlo.prob_up_15}% | P(-20%): ${data.monte_carlo.prob_down_20}%`);
    }

    // LLM analysis
    showTyping(feed, 'ALPHA');
    const context = `Analizza ${commodity} (${data.name}). Prezzo: $${data.price}, Curva futures: ${data.curve_shape}, Domanda: ${data.demand_trend}${data.technicals ? `, RSI: ${data.technicals.rsi?.toFixed(1)}, Trend: ${data.technicals.trend}` : ''}.`;

    try {
      const analysis = await postJSON('commodities', { commodity, phase: 'analyze', context });
      removeTyping('ALPHA');
      addChatMsg(feed, 'ALPHA', `**${analysis.executive_summary || ''}**`);
      if (analysis.catalysts?.length) addChatMsg(feed, 'ALPHA', `**Catalizzatori:** ${analysis.catalysts.join(' | ')}`);
      if (analysis.risks?.length) addChatMsg(feed, 'ALPHA', `**Rischi:** ${analysis.risks.join(' | ')}`);
      addChatMsg(feed, 'ALPHA', `**Voto: ${analysis.vote}** — Conviction: **${analysis.conviction}/100**\n${analysis.reasoning || ''}`);
      addSystemMsg(feed, `Verdetto: <strong>${analysis.vote}</strong> — Score: ${analysis.conviction}/100`);
    } catch (err) {
      removeTyping('ALPHA');
      addSystemMsg(feed, `⚠️ LLM: ${err.message}`);
    }

    addSystemMsg(feed, 'Analisi completata.');
  } catch (err) {
    addSystemMsg(feed, `❌ Errore: ${err.message}`);
  }
}
