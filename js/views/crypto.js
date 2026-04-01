// js/views/crypto.js — Crypto bot view (sequential calls)
import { $, addSystemMsg, addChatMsg, showTyping, removeTyping } from '../core/ui.js';
import { postJSON } from '../core/api-client.js';

export function init() {
  const btn = $('#cryptoAnalyzeBtn');
  if (btn) btn.addEventListener('click', run);
  const input = $('#cryptoInput');
  if (input) input.addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
}

export function destroy() {}

async function run() {
  const symbol = $('#cryptoInput')?.value.trim().toUpperCase();
  if (!symbol) return;
  const feed = $('#cryptoFeed');
  feed.innerHTML = '';
  addSystemMsg(feed, `Recupero dati per <strong>${symbol}</strong>...`);

  try {
    // Phase 1: data
    const data = await postJSON('crypto', { symbol, phase: 'data' });
    const card = $('#cryptoCard');
    if (card) {
      card.style.display = 'block';
      card.innerHTML = `
        <div class="stock-ticker">${data.symbol}</div>
        <div class="stock-price">$${data.price?.toLocaleString() || '—'}</div>
        <div class="stock-meta">
          Funding: ${data.funding_rate || '—'} | OI: ${data.open_interest || '—'}<br>
          24h Vol: $${data.volume_24h || '—'} | MCap: $${data.market_cap || '—'}<br>
          ${data.technicals ? `RSI: ${data.technicals.rsi?.toFixed(1) || '—'} | Trend: ${data.technicals.trend || '—'}` : ''}
        </div>
      `;
    }

    addSystemMsg(feed, `✅ Prezzo: $${data.price?.toLocaleString()}, Change 24h: ${data.change_24h}%`);

    if (data.technicals) {
      addSystemMsg(feed, `📊 RSI: ${data.technicals.rsi?.toFixed(1)} | Trend: ${data.technicals.trend} | ATR: ${data.technicals.atr?.toFixed(2)}`);
    }
    if (data.monte_carlo) {
      addSystemMsg(feed, `🎲 Monte Carlo 30gg: P(+15%): ${data.monte_carlo.prob_up_15}% | P(-20%): ${data.monte_carlo.prob_down_20}% | Mediana: $${data.monte_carlo.median_price}`);
    }

    // Phase 2: LLM analysis
    showTyping(feed, 'ALPHA');
    addSystemMsg(feed, '🤖 ALPHA in analisi...');

    const context = `Analizza ${symbol} crypto. Prezzo: $${data.price}, Change 24h: ${data.change_24h}%, Funding Rate: ${data.funding_rate}, Open Interest: ${data.open_interest}, MCap: $${data.market_cap}, Vol 24h: $${data.volume_24h}${data.technicals ? `, RSI: ${data.technicals.rsi?.toFixed(1)}, Trend: ${data.technicals.trend}` : ''}${data.monte_carlo ? `, Monte Carlo P(+15%): ${data.monte_carlo.prob_up_15}%` : ''}.`;

    try {
      const analysis = await postJSON('crypto', { symbol, phase: 'analyze', context });
      removeTyping('ALPHA');
      addChatMsg(feed, 'ALPHA', `**${analysis.executive_summary || ''}**`);
      if (analysis.catalysts?.length) addChatMsg(feed, 'ALPHA', `**Catalizzatori:** ${analysis.catalysts.join(' | ')}`);
      if (analysis.risks?.length) addChatMsg(feed, 'ALPHA', `**Rischi:** ${analysis.risks.join(' | ')}`);
      addChatMsg(feed, 'ALPHA', `**Voto: ${analysis.vote}** — Conviction: **${analysis.conviction}/100**\n${analysis.reasoning || ''}`);
      addSystemMsg(feed, `Verdetto: <strong>${analysis.vote}</strong> — Score: ${analysis.conviction}/100`);
    } catch (err) {
      removeTyping('ALPHA');
      addSystemMsg(feed, `⚠️ LLM non disponibile: ${err.message}`);
    }

    addSystemMsg(feed, 'Analisi completata.');
  } catch (err) {
    addSystemMsg(feed, `❌ Errore: ${err.message}`);
  }
}
