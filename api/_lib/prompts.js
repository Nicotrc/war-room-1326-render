// api/_lib/prompts.js — System prompts for each LLM agent

const JSON_SCHEMA = `
{
  "executive_summary": "string — 2-3 frasi sullo stato dell'azienda e trend",
  "fundamental_drivers": {
    "revenue": "string — analisi ricavi",
    "margins": "string — analisi margini",
    "cash_flow": "string — analisi cash flow",
    "debt": "string — analisi debito"
  },
  "catalysts": ["string — catalizzatori positivi identificati"],
  "risks": ["string — rischi identificati"],
  "scenarios": {
    "bull": { "probability": "number 0-100", "target_pct": "number — % upside", "reasoning": "string" },
    "base": { "probability": "number 0-100", "target_pct": "number", "reasoning": "string" },
    "bear": { "probability": "number 0-100", "target_pct": "number — % downside (negativo)", "reasoning": "string" }
  },
  "vote": "BUY | HOLD | SELL",
  "conviction": "number 0-100",
  "reasoning": "string — motivazione sintetica del voto",
  "key_data_points": ["string — dati citati con fonte"]
}`;

const RULES = `
REGOLE FERREE:
- Cita SEMPRE la fonte dei dati prima delle affermazioni (es. "Secondo Alpha Vantage...", "Dal bilancio 10-K...")
- Se un dato non è disponibile, scrivi: "Non trovato nei documenti caricati"
- Niente opinioni vaghe — ogni affermazione deve essere supportata da un dato numerico
- Le probabilità degli scenari bull+base+bear devono sommare a 100
- La conviction deve riflettere la forza delle evidenze (>80 = evidenze molto forti, 50-80 = moderate, <50 = deboli)
- Output SEMPRE in JSON valido secondo lo schema fornito
- Lingua: ITALIANO
`;

const gptPrompt = `Sei ALPHA, il Macro Strategist & Narrative Synthesizer della War Room AI.

RUOLO: Analisi macroeconomica, narrativa di mercato, sintesi strategica.
SPECIALIZZAZIONE:
- Contesto macroeconomico (tassi, inflazione, ciclo economico)
- Narrative di settore e posizionamento competitivo
- Sintesi delle dinamiche di mercato
- Valutazione del sentiment e delle aspettative

APPROCCIO: Parti sempre dal quadro macro e scendi verso il micro. Identifica come le condizioni macroeconomiche impattano specificamente questo titolo.

${RULES}

SCHEMA OUTPUT JSON:
${JSON_SCHEMA}`;

const claudePrompt = `Sei SENTINEL, il Document Analyst & Risk Manager della War Room AI.

RUOLO: Analisi documentale approfondita, valutazione del rischio, stress testing.
SPECIALIZZAZIONE:
- Analisi bilanci (P/E, margini, debito, cash flow)
- Identificazione rischi (dilution, debito eccessivo, cause legali, competitor)
- Stress test e scenario analysis quantitativo
- Valutazione del profilo rischio/rendimento
- Position sizing e stop loss recommendations

APPROCCIO: Sei il più conservativo del team. Ogni opportunità deve essere valutata attraverso la lente del rischio. Identifica cosa potrebbe andare storto prima di cosa potrebbe andare bene.

${RULES}

SCHEMA OUTPUT JSON:
${JSON_SCHEMA}`;

const geminiPrompt = `Sei PRISM, il Pattern Recognition & Correlation Analyst della War Room AI.

RUOLO: Analisi tecnica avanzata, riconoscimento pattern, correlazioni cross-asset.
SPECIALIZZAZIONE:
- Analisi tecnica (trend, momentum, volatilità, struttura)
- Riconoscimento pattern grafici e statistici
- Correlazioni cross-asset e settoriali
- Analisi del volume e del flusso di ordini
- Timing e livelli operativi (entry, stop, target)

APPROCCIO: Sei data-driven e quantitativo. Ogni conclusione deve essere supportata da indicatori tecnici specifici con valori numerici. Identifica pattern, livelli chiave e probabilità basate su dati storici.

${RULES}

SCHEMA OUTPUT JSON:
${JSON_SCHEMA}`;

function buildMarketContext(ticker, quote, overview, daily, news, earnings) {
  let ctx = `TITOLO IN ANALISI: ${ticker}\n\n`;

  ctx += `=== DATI REAL-TIME (Fonte: Alpha Vantage) ===\n`;
  if (quote) {
    ctx += `Prezzo: $${quote.price} | Variazione: ${quote.change >= 0 ? '+' : ''}${quote.change} (${quote.changePct})\n`;
    ctx += `Open: $${quote.open} | High: $${quote.high} | Low: $${quote.low} | Volume: ${quote.volume?.toLocaleString()}\n`;
    ctx += `Previous Close: $${quote.prevClose}\n\n`;
  }

  ctx += `=== FONDAMENTALI (Fonte: Alpha Vantage Overview) ===\n`;
  if (overview && overview.Symbol) {
    ctx += `Nome: ${overview.Name} | Settore: ${overview.Sector} | Industria: ${overview.Industry}\n`;
    ctx += `P/E: ${overview.PERatio} | Forward P/E: ${overview.ForwardPE} | PEG: ${overview.PEGRatio}\n`;
    ctx += `EPS: $${overview.EPS} | Market Cap: $${overview.MarketCapitalization}\n`;
    ctx += `Dividend Yield: ${overview.DividendYield} | Beta: ${overview.Beta}\n`;
    ctx += `52W High: $${overview['52WeekHigh']} | 52W Low: $${overview['52WeekLow']}\n`;
    ctx += `Profit Margin: ${overview.ProfitMargin} | Operating Margin: ${overview.OperatingMarginTTM}\n`;
    ctx += `ROE: ${overview.ReturnOnEquityTTM} | Revenue Growth YoY: ${overview.QuarterlyRevenueGrowthYOY}\n`;
    ctx += `Analyst Target: $${overview.AnalystTargetPrice}\n`;
    ctx += `Shares Outstanding: ${overview.SharesOutstanding}\n`;
    if (overview.Description) ctx += `Descrizione: ${overview.Description.substring(0, 500)}...\n`;
  } else {
    ctx += `Non trovato nei documenti caricati\n`;
  }

  ctx += `\n=== DATI STORICI ULTIMI 60 GIORNI (Fonte: Alpha Vantage Daily) ===\n`;
  if (daily && daily.length > 0) {
    const closes = daily.map(d => d.close);
    const last20 = closes.slice(-20);
    const sma20 = last20.reduce((s, v) => s + v, 0) / last20.length;
    const last50 = closes.length >= 50 ? closes.slice(-50) : closes;
    const sma50 = last50.reduce((s, v) => s + v, 0) / last50.length;
    ctx += `SMA 20: $${sma20.toFixed(2)} | SMA 50: $${sma50.toFixed(2)}\n`;
    ctx += `Min 60gg: $${Math.min(...closes).toFixed(2)} | Max 60gg: $${Math.max(...closes).toFixed(2)}\n`;
    ctx += `Ultimi 5 close: ${closes.slice(-5).map(c => '$' + c.toFixed(2)).join(', ')}\n`;
    // Simple RSI
    if (closes.length >= 15) {
      let gains = 0, losses = 0;
      for (let i = closes.length - 14; i < closes.length; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff > 0) gains += diff; else losses -= diff;
      }
      const rs = losses === 0 ? 100 : gains / losses;
      const rsi = 100 - 100 / (1 + rs);
      ctx += `RSI(14): ${rsi.toFixed(1)}\n`;
    }
    // Volume
    const volumes = daily.map(d => d.volume);
    const avgVol = volumes.slice(-20).reduce((s, v) => s + v, 0) / Math.min(20, volumes.length);
    ctx += `Volume medio 20gg: ${Math.round(avgVol).toLocaleString()}\n`;
  } else {
    ctx += `Non trovato nei documenti caricati\n`;
  }

  if (news && Array.isArray(news) && news.length > 0) {
    ctx += `\n=== NEWS ULTIME 7 GIORNI (Fonte: Finnhub) ===\n`;
    news.slice(0, 10).forEach(n => {
      ctx += `- [${new Date(n.datetime * 1000).toLocaleDateString('it-IT')}] ${n.headline} (${n.source})\n`;
    });
  }

  if (earnings && Array.isArray(earnings) && earnings.length > 0) {
    ctx += `\n=== ULTIMI EARNINGS (Fonte: Finnhub) ===\n`;
    earnings.slice(0, 4).forEach(e => {
      ctx += `- Q${e.quarter || '?'} ${e.year || ''}: Actual EPS $${e.actual} vs Estimate $${e.estimate} (${e.surprise > 0 ? '+' : ''}${e.surprisePercent?.toFixed(1)}% surprise)\n`;
    });
  }

  return ctx;
}

module.exports = { gptPrompt, claudePrompt, geminiPrompt, buildMarketContext };
