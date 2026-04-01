// api/scouting.js — Penny stock scouting ($1-5 range)
const { fullAnalysis } = require('./_lib/technicals');
const { monteCarlo, momentumScore, tradeSetup, expectedValue } = require('./_lib/models');
const { corsHeaders } = require('./_lib/utils');

const FH = 'https://finnhub.io/api/v1';
const AV = 'https://www.alphavantage.co/query';

// Penny stock watchlist ($1-5 range) — biotech, AI, energy, defense small caps
const WATCHLIST = {
  biotech: ['IBRX', 'TNXP', 'SAVA', 'HGEN', 'APRE', 'CTXR', 'BIOR', 'DARE'],
  ai: ['BBAI', 'SOUN', 'GFAI', 'AITX', 'IDAI'],
  energy: ['FCEL', 'PLUG', 'TELL', 'SMR', 'NKLA', 'CLSK'],
  defense: ['KTOS', 'RKLB', 'ASTS', 'MNTS'],
};

async function fhQuote(symbol) {
  if (!process.env.FINNHUB_API_KEY) return null;
  const url = `${FH}/quote?symbol=${symbol}&token=${process.env.FINNHUB_API_KEY}`;
  const r = await fetch(url); const d = await r.json();
  return d?.c > 0 ? { price: d.c, change: d.d || 0, changePct: (d.dp || 0).toFixed(2) + '%', high: d.h, low: d.l, open: d.o, prevClose: d.pc } : null;
}

async function avDaily(symbol) {
  if (!process.env.ALPHA_VANTAGE_KEY) return [];
  const url = `${AV}?function=TIME_SERIES_DAILY&symbol=${symbol}&outputsize=compact&apikey=${process.env.ALPHA_VANTAGE_KEY}`;
  const r = await fetch(url); const d = await r.json();
  const ts = d?.['Time Series (Daily)'];
  if (!ts) return [];
  return Object.entries(ts).slice(0, 60).reverse().map(([date, v]) => ({
    date, close: +v['4. close'], volume: +v['5. volume'], high: +v['2. high'], low: +v['3. low'],
  }));
}

module.exports = async function handler(req, res) {
  Object.keys(corsHeaders()).forEach(k => res.setHeader(k, corsHeaders()[k]));
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const body = req.method === 'POST' ? (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) : req.query;
    const ticker = body?.ticker;

    // Single ticker analysis
    if (ticker) {
      const quote = await fhQuote(ticker);
      if (!quote) return res.status(200).json({ ticker, error: 'No data' });

      // Filter: must be $1-5
      if (quote.price < 0.5 || quote.price > 6) {
        return res.status(200).json({ ticker, error: 'Fuori range $1-5', price: quote.price });
      }

      const daily = await avDaily(ticker);
      if (daily.length < 15) {
        // Use Finnhub data only — create minimal technicals
        return res.status(200).json({
          ticker, price: quote.price, change_pct: quote.changePct,
          volatility: Math.abs(quote.change / quote.price * 100).toFixed(2),
          setup: quote.change > 0 ? 'Momentum Long' : 'Momentum Short',
          trade_type: 'Momentum', entry: quote.price,
          stop: +(quote.price * 0.92).toFixed(2), target1: +(quote.price * 1.08).toFixed(2),
          target2: +(quote.price * 1.16).toFixed(2), rr: 1.0, score: 50, ev: 0,
          prob_up15: 30, prob_down20: 20, rsi: null, trend: quote.change > 0 ? 'BULLISH' : 'BEARISH',
          momentum_score: 50, monte_carlo: null, partial: true,
        });
      }

      const tech = fullAnalysis(daily);
      const closes = daily.map(d => d.close);
      const volumes = daily.map(d => d.volume);
      const mc = monteCarlo(closes, 5000, 30);
      const momScore = momentumScore(closes, volumes);
      const setup = tradeSetup(quote.price, tech.atr, tech, mc);
      const volatility = (tech.atr / quote.price) * 100;
      const avgVol = volumes.slice(-20).reduce((s, v) => s + v, 0) / 20;
      const volSpike = avgVol > 0 ? (volumes[volumes.length - 1] / avgVol) * 100 : 0;

      const techScore = tech.rsi > 50 && tech.trend === 'BULLISH' ? 70 : tech.rsi < 40 ? 30 : 50;
      const ev = mc ? expectedValue([
        { probability: mc.prob_up_15, return_pct: 15 },
        { probability: 100 - mc.prob_up_15 - mc.prob_down_20, return_pct: mc.expected_return },
        { probability: mc.prob_down_20, return_pct: -20 },
      ]) : 0;
      const score = Math.round(techScore * 0.3 + momScore * 0.3 + Math.min(100, Math.max(0, ev * 5 + 50)) * 0.4);

      return res.status(200).json({
        ticker, price: quote.price, change_pct: quote.changePct,
        volatility: +volatility.toFixed(2), volume_spike: +volSpike.toFixed(0),
        setup: setup.direction === 'LONG' ? 'Momentum Long' : 'Momentum Short',
        trade_type: tech.breakout ? 'Breakout' : 'Momentum',
        entry: setup.entry, stop: setup.stop_loss, target1: setup.target_1, target2: setup.target_2,
        rr: setup.risk_reward, score, ev: +ev.toFixed(2),
        prob_up15: mc?.prob_up_15 || 0, prob_down20: mc?.prob_down_20 || 0,
        rsi: tech.rsi ? +tech.rsi.toFixed(1) : null, trend: tech.trend,
        momentum_score: momScore, monte_carlo: mc,
      });
    }

    // List mode with price pre-filter via Finnhub
    if (body?.scan) {
      const allTickers = Object.entries(WATCHLIST).flatMap(([sector, tickers]) => tickers.map(t => ({ ticker: t, sector })));
      const filtered = [];

      for (const { ticker: t, sector } of allTickers) {
        try {
          const q = await fhQuote(t);
          if (q && q.price >= 1 && q.price <= 5) {
            filtered.push({ ticker: t, sector, price: q.price, change: q.changePct });
          }
        } catch {}
      }

      return res.status(200).json({ candidates: filtered });
    }

    // Default: return watchlist
    return res.status(200).json({ watchlist: WATCHLIST });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
