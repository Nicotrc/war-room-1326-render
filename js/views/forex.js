// js/views/forex.js — Forex bot view (sequential calls)
import { $, addSystemMsg, addChatMsg, showTyping, removeTyping } from '../core/ui.js';
import { postJSON } from '../core/api-client.js';

export function init() {
  const btn = $('#forexAnalyzeBtn');
  if (btn) btn.addEventListener('click', run);
  const input = $('#forexInput');
  if (input) input.addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
}

export function destroy() {}

async function run() {
  const pair = $('#forexInput')?.value.trim().toUpperCase();
  if (!pair) return;
  const feed = $('#forexFeed');
  feed.innerHTML = '';
  addSystemMsg(feed, `Analisi forex per <strong>${pair}</strong>...`);

  try {
    const data = await postJSON('forex', { pair, phase: 'data' });

    if (data.error) {
      addSystemMsg(feed, `❌ ${data.error}`);
      return;
    }

    const card = $('#forexCard');
    if (card) {
      card.style.display = 'block';
      card.innerHTML = `
        <div class="stock-ticker">${data.pair}</div>
        <div class="stock-price">${data.rate?.toFixed(5) || '—'}</div>
        <div class="stock-meta">
          DXY: ${data.dxy || '—'} | Z-Score: ${data.zscore?.toFixed(2) || '—'}<br>
          Mean Reversion: ${data.mean_reversion || '—'}<br>
          ${data.technicals ? `RSI: ${data.technicals.rsi?.toFixed(1) || '—'} | Trend: ${data.technicals.trend || '—'}` : ''}
        </div>
      `;
    }

    addSystemMsg(feed, `✅ Rate: ${data.rate?.toFixed(5)}, Z-Score: ${data.zscore?.toFixed(3)}, Mean Reversion: ${data.mean_reversion}`);

    // LLM
    showTyping(feed, 'ALPHA');
    const context = `Analizza ${pair}. Rate: ${data.rate}, Z-Score: ${data.zscore?.toFixed(3)}, DXY: ${data.dxy}, Mean Reversion: ${data.mean_reversion}${data.technicals ? `, RSI: ${data.technicals.rsi?.toFixed(1)}, Trend: ${data.technicals.trend}` : ''}.`;

    try {
      const analysis = await postJSON('forex', { pair, phase: 'analyze', context });
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
