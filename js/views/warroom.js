// js/views/warroom.js — War Room (4-phase: data → details → 3 agents → verdict)
import { $, addSystemMsg, addChatMsg, showTyping, removeTyping, resetMsgCount, sleep, getAgentMeta, formatMarketCap, setHealthStatus } from '../core/ui.js';
import { postJSON } from '../core/api-client.js';
import { drawPriceChart } from '../core/chart-renderer.js';
import { renderScoreGauge, renderScoreBreakdown } from '../core/scoring.js';
import { saveDecision, renderDecisionHistory } from '../core/storage.js';

let isRunning = false;

export function init() {
  const btn = $('#analyzeBtn');
  const input = $('#tickerInput');
  if (btn) btn.addEventListener('click', () => startAnalysis());
  if (input) input.addEventListener('keydown', e => { if (e.key === 'Enter') startAnalysis(); });
  renderDecisionHistory($('#decisionHistory'));
}
export function destroy() {}

async function startAnalysis() {
  const ticker = $('#tickerInput')?.value.trim().toUpperCase();
  if (!ticker || isRunning) return;
  isRunning = true;
  const btn = $('#analyzeBtn');
  btn.disabled = true; btn.textContent = 'IN CORSO...';

  const feed = $('#chatFeed');
  feed.innerHTML = '';
  resetMsgCount();
  $('#decisionLog').innerHTML = '<div class="log-empty">In attesa...</div>';
  $('#verdictBox').style.display = 'none';
  $('#stockCard').style.display = 'none';
  $('#scoreSection').innerHTML = '';
  const tx = $('#transactionResult'); if (tx) tx.style.display = 'none';

  addSystemMsg(feed, `📡 Connessione alla War Room per <strong>${ticker}</strong>...`);

  try {
    // ═══ 1. FAST DATA (Finnhub) ═══
    let data;
    try {
      data = await postJSON('warroom', { ticker, phase: 'data' });
    } catch (err) {
      addSystemMsg(feed, `❌ ${err.message}`);
      finish(); return;
    }

    renderStockCard(data);
    addSystemMsg(feed, `✅ <strong>$${data.quote.price.toFixed(2)}</strong> (${data.quote.source})`);

    // ═══ 2. DETAILS (AV — background, non-blocking) ═══
    addSystemMsg(feed, '📊 Recupero dati storici e fondamentali...');
    let details = {};
    try {
      details = await postJSON('warroom', { ticker, phase: 'details' });
      if (details.overview) {
        updateStockMeta(data, details.overview);
      }
      if (details.daily?.length > 1) {
        drawPriceChart($('#miniChart'), details.daily, { showSMA: true });
        addSystemMsg(feed, `📈 Grafico caricato (${details.daily.length} giorni)`);
      }
      if (details.news?.length) {
        addSystemMsg(feed, `📰 ${details.news.length} notizie recenti trovate`);
      }
    } catch {
      addSystemMsg(feed, '⚠️ Dati storici non disponibili (rate limit AV)');
    }

    // Build context for LLMs
    const context = buildContext(ticker, data, details);

    // ═══ 3. THREE AGENTS (sequential, each <10s) ═══
    addSystemMsg(feed, '🤖 Avvio 3 agenti AI — GPT-4o, Claude 3.5, Gemini 1.5...');
    const agentNames = ['ALPHA', 'SENTINEL', 'PRISM'];
    const agentResults = [];

    for (const name of agentNames) {
      const meta = getAgentMeta(name);
      showTyping(feed, name);

      try {
        const result = await postJSON('warroom', { ticker, phase: 'agent', agent: name, context });

        removeTyping(name);

        if (result.skipped || result.error) {
          setHealthStatus(name === 'ALPHA' ? 'gpt' : name === 'SENTINEL' ? 'claude' : 'gemini', false);
          addSystemMsg(feed, `⚠️ ${name}: ${result.error}`);
          continue;
        }

        agentResults.push(result);
        setHealthStatus(name === 'ALPHA' ? 'gpt' : name === 'SENTINEL' ? 'claude' : 'gemini', true);

        // Display
        addChatMsg(feed, name, `**Executive Summary:**\n${result.executive_summary || 'N/A'}`);
        if (result.catalysts?.length) addChatMsg(feed, name, `**Catalizzatori:** ${result.catalysts.join(' | ')}`);
        if (result.risks?.length) addChatMsg(feed, name, `**Rischi:** ${result.risks.join(' | ')}`);
        if (result.scenarios) {
          const st = ['bull','base','bear'].map(k => { const s = result.scenarios[k]; return s ? `${k.toUpperCase()}: ${s.probability}%, ${s.target_pct > 0 ? '+' : ''}${s.target_pct}%` : ''; }).filter(Boolean).join(' | ');
          if (st) addChatMsg(feed, name, `**Scenari:** ${st}`);
        }
        addChatMsg(feed, name, `**Voto: ${result.vote}** — Conviction: **${result.conviction}/100**\n${result.reasoning || ''}`);
        addToLog(name, result.vote, result.conviction);

      } catch (err) {
        removeTyping(name);
        addSystemMsg(feed, `⚠️ ${name} timeout/errore: ${err.message}`);
      }
    }

    // ═══ 4. VERDICT ═══
    if (agentResults.length > 0) {
      addSystemMsg(feed, `⚖️ Consolidamento (${agentResults.length}/3 agenti)...`);
      try {
        const verdict = await postJSON('warroom', { ticker, phase: 'verdict', agents: agentResults });
        renderVerdict(verdict, ticker);
      } catch (err) {
        addSystemMsg(feed, `❌ Verdetto: ${err.message}`);
      }
    } else {
      addSystemMsg(feed, '❌ Nessun agente ha risposto. Verifica le API keys.');
    }

    addSystemMsg(feed, `🏁 Sessione completata — ${new Date().toLocaleTimeString('it-IT')}`);
  } catch (err) {
    addSystemMsg(feed, `❌ ${err.message}`);
  }
  finish();
}

function finish() {
  isRunning = false;
  const btn = $('#analyzeBtn');
  if (btn) { btn.disabled = false; btn.textContent = 'ANALIZZA'; }
}

function buildContext(ticker, data, details) {
  let ctx = `TITOLO: ${ticker}\nPrezzo: $${data.quote.price} (${data.quote.source})\nVariazione: ${data.quote.change >= 0 ? '+' : ''}${data.quote.change} (${data.quote.changePct})\nOpen: $${data.quote.open} | High: $${data.quote.high} | Low: $${data.quote.low} | Prev: $${data.quote.prevClose}\n`;
  if (data.overview?.Name) ctx += `\nAzienda: ${data.overview.Name} | Settore: ${data.overview.Sector || 'N/A'}\n`;
  const ov = details?.overview;
  if (ov?.Symbol) {
    ctx += `\n=== FONDAMENTALI ===\nP/E: ${ov.PERatio} | Forward P/E: ${ov.ForwardPE} | EPS: $${ov.EPS}\nMarket Cap: $${ov.MarketCapitalization} | Beta: ${ov.Beta}\nDiv Yield: ${ov.DividendYield} | Profit Margin: ${ov.ProfitMargin}\n52W: $${ov['52WeekLow']} - $${ov['52WeekHigh']} | Target: $${ov.AnalystTargetPrice}\n`;
    if (ov.Description) ctx += `Descrizione: ${ov.Description.substring(0, 400)}\n`;
  }
  if (details?.daily?.length) {
    const c = details.daily.map(d => d.close);
    const sma20 = c.slice(-20).reduce((s, v) => s + v, 0) / 20;
    ctx += `\n=== TECNICI ===\nSMA20: $${sma20.toFixed(2)} | Ultimi: ${c.slice(-5).map(v => '$' + v.toFixed(2)).join(', ')}\n`;
    if (c.length >= 15) {
      let g = 0, l = 0;
      for (let i = c.length - 14; i < c.length; i++) { const d = c[i] - c[i-1]; if (d > 0) g += d; else l -= d; }
      ctx += `RSI(14): ${(100 - 100 / (1 + (l === 0 ? 100 : g / l))).toFixed(1)}\n`;
    }
  }
  if (details?.news?.length) {
    ctx += `\n=== NEWS ===\n`;
    details.news.slice(0, 5).forEach(n => { ctx += `- ${n.headline} (${n.source})\n`; });
  }
  return ctx;
}

function renderStockCard(data) {
  $('#stockCard').style.display = 'block';
  $('#stockTicker').textContent = data.ticker;
  $('#stockName').textContent = data.overview?.Name || data.ticker;
  $('#stockPrice').textContent = '$' + data.quote.price.toFixed(2);
  const ch = $('#stockChange');
  ch.textContent = `${data.quote.change >= 0 ? '+' : ''}${data.quote.change.toFixed(2)} (${data.quote.changePct})`;
  ch.className = 'stock-change ' + (data.quote.change >= 0 ? 'up' : 'down');
  $('#stockMeta').innerHTML = `${data.overview?.Sector || 'N/A'}<br>${data.quote.source}`;
}

function updateStockMeta(data, ov) {
  const pe = ov.PERatio || 'N/A';
  const mcap = formatMarketCap(ov.MarketCapitalization);
  const beta = ov.Beta || 'N/A';
  $('#stockMeta').innerHTML = `P/E: ${pe} | MCap: $${mcap} | Beta: ${beta}<br>${ov.Sector || 'N/A'} | ${data.quote.source}`;
}

function addToLog(agent, vote, conviction) {
  const log = $('#decisionLog');
  if (log.querySelector('.log-empty')) log.innerHTML = '';
  const meta = getAgentMeta(agent);
  const div = document.createElement('div');
  div.className = 'log-entry ' + (vote || 'hold').toLowerCase();
  div.innerHTML = `<strong style="color:${meta.color}">${agent}</strong>: ${vote} (${conviction}/100)`;
  log.appendChild(div);
}

function renderVerdict(v, ticker) {
  $('#verdictBox').style.display = 'block';
  const map = { BUY: 'COMPRA (BUY)', SELL: 'VENDI (SELL)', HOLD: 'MANTIENI (HOLD)' };
  const va = $('#verdictAction');
  va.textContent = map[v.vote] || v.vote;
  va.className = 'verdict-action ' + (v.vote || 'hold').toLowerCase();
  $('#verdictConf').textContent = `Conviction: ${v.conviction}/100 | Score: ${v.composite_score}/100 | Voti: ${v.votes.buy}B/${v.votes.sell}S/${v.votes.hold}H`;
  const ss = $('#scoreSection');
  if (ss && v.score_breakdown) {
    renderScoreGauge(ss, v.composite_score);
    const bd = document.createElement('div'); bd.className = 'score-breakdown'; ss.appendChild(bd);
    renderScoreBreakdown(bd, v.score_breakdown);
  }
  const eb = $('#executeBtn'); eb.style.display = 'block';
  eb.onclick = () => {
    eb.style.display = 'none';
    const id = 'WR-' + Date.now().toString(36).toUpperCase();
    const action = v.vote === 'BUY' ? 'ACQUISTO' : v.vote === 'SELL' ? 'VENDITA' : 'HOLD';
    const tx = $('#transactionResult'); tx.style.display = 'block';
    $('#txDetails').innerHTML = `Ordine: <strong>${id}</strong><br>Azione: <strong>${action}</strong><br>Ticker: <strong>${ticker}</strong><br>Score: <strong>${v.composite_score}/100</strong><br>Stato: <strong style="color:#10b981">ESEGUITO ✓</strong>`;
    addSystemMsg($('#chatFeed'), `✅ ${id} — ${action} ${ticker}`);
  };
  saveDecision({ ticker, vote: v.vote, conviction: v.conviction, composite_score: v.composite_score });
  renderDecisionHistory($('#decisionHistory'));
}
