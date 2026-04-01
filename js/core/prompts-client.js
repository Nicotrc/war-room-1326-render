// js/core/prompts-client.js — Build market context string for LLM agents (client-side)

export function buildMarketContext(ticker, data) {
  const { quote, overview, daily, news, earnings } = data;
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
    ctx += `Profit Margin: ${overview.ProfitMargin} | ROE: ${overview.ReturnOnEquityTTM}\n`;
    ctx += `Revenue Growth YoY: ${overview.QuarterlyRevenueGrowthYOY}\n`;
    ctx += `Analyst Target: $${overview.AnalystTargetPrice}\n`;
    if (overview.Description) ctx += `Descrizione: ${overview.Description.substring(0, 500)}...\n`;
  } else {
    ctx += `Non trovato nei documenti caricati\n`;
  }

  ctx += `\n=== DATI STORICI ULTIMI 60 GIORNI ===\n`;
  if (daily && daily.length > 0) {
    const closes = daily.map(d => d.close);
    const last20 = closes.slice(-20);
    const sma20 = last20.reduce((s, v) => s + v, 0) / last20.length;
    ctx += `SMA 20: $${sma20.toFixed(2)}\n`;
    ctx += `Min 60gg: $${Math.min(...closes).toFixed(2)} | Max 60gg: $${Math.max(...closes).toFixed(2)}\n`;
    ctx += `Ultimi 5 close: ${closes.slice(-5).map(c => '$' + c.toFixed(2)).join(', ')}\n`;
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
    const volumes = daily.map(d => d.volume);
    const avgVol = volumes.slice(-20).reduce((s, v) => s + v, 0) / Math.min(20, volumes.length);
    ctx += `Volume medio 20gg: ${Math.round(avgVol).toLocaleString()}\n`;
  }

  if (news && Array.isArray(news) && news.length > 0) {
    ctx += `\n=== NEWS ULTIME 7 GIORNI (Fonte: Finnhub) ===\n`;
    news.slice(0, 8).forEach(n => {
      ctx += `- [${new Date(n.datetime * 1000).toLocaleDateString('it-IT')}] ${n.headline} (${n.source})\n`;
    });
  }

  return ctx;
}
