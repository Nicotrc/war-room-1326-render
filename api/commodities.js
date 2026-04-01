// api/commodities.js — Commodities analysis (direct tickers, no ETF proxy)
const { avDaily, avQuote, fetchAV } = require('./_lib/dataSources');
const { fredSeries } = require('./_lib/dataSources');
const { fullAnalysis } = require('./_lib/technicals');
const { monteCarlo } = require('./_lib/models');
const { callGPT } = require('./_lib/llm');
const { corsHeaders } = require('./_lib/utils');

// Use Alpha Vantage commodity functions
const COMMODITY_FUNCTIONS = {
  WTI: { fn: 'WTI', name: 'Crude Oil WTI' },
  OIL: { fn: 'WTI', name: 'Crude Oil WTI' },
  BRENT: { fn: 'BRENT', name: 'Crude Oil Brent' },
  GAS: { fn: 'NATURAL_GAS', name: 'Natural Gas' },
  NATGAS: { fn: 'NATURAL_GAS', name: 'Natural Gas' },
  COPPER: { fn: 'COPPER', name: 'Copper' },
  WHEAT: { fn: 'WHEAT', name: 'Wheat' },
  CORN: { fn: 'CORN', name: 'Corn' },
  GOLD: { ticker: 'GLD', name: 'Gold (GLD ETF)' },
  SILVER: { ticker: 'SLV', name: 'Silver (SLV ETF)' },
};

module.exports = async function handler(req, res) {
  Object.keys(corsHeaders()).forEach(k => res.setHeader(k, corsHeaders()[k]));
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const body = req.method === 'POST' ? (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) : req.query;
    const commodity = (body?.commodity || 'WTI').toUpperCase();
    const phase = body?.phase || 'data';
    const config = COMMODITY_FUNCTIONS[commodity];

    if (!config) return res.status(400).json({ error: `Commodity sconosciuta: ${commodity}. Supportate: ${Object.keys(COMMODITY_FUNCTIONS).join(', ')}` });

    if (phase === 'data') {
      let daily = [];
      let price = null;

      if (config.fn) {
        // Use AV commodity endpoint
        try {
          const data = await fetchAV({ function: config.fn, interval: 'daily' });
          const key = Object.keys(data).find(k => k !== 'Meta Data' && k.includes('data'));
          if (key && Array.isArray(data[key])) {
            daily = data[key].slice(0, 60).reverse().map(d => ({
              date: d.date, close: parseFloat(d.value), high: parseFloat(d.value),
              low: parseFloat(d.value), volume: 0,
            }));
            if (daily.length > 0) price = daily[daily.length - 1].close;
          }
        } catch {}
      } else if (config.ticker) {
        // Use stock ticker (ETF proxy)
        try {
          const [q, d] = await Promise.allSettled([avQuote(config.ticker), avDaily(config.ticker)]);
          if (q.status === 'fulfilled' && q.value) price = q.value.price;
          if (d.status === 'fulfilled') daily = d.value;
        } catch {}
      }

      if (!price && daily.length === 0) {
        return res.status(200).json({ commodity, name: config.name, error: 'Dati non disponibili' });
      }

      let technicals = null, mc = null;
      if (daily.length >= 20) {
        technicals = fullAnalysis(daily);
        mc = monteCarlo(daily.map(d => d.close), 5000, 30);
      }

      const closes = daily.map(d => d.close);
      const recentTrend = closes.length >= 5 ? (closes[closes.length - 1] / closes[closes.length - 5] - 1) * 100 : 0;

      return res.status(200).json({
        commodity, name: config.name, price,
        curve_shape: recentTrend > 1 ? 'BACKWARDATION' : recentTrend < -1 ? 'CONTANGO' : 'FLAT',
        demand_trend: recentTrend > 0 ? 'GROWING' : 'CONTRACTING',
        technicals, monte_carlo: mc,
      });
    }

    if (phase === 'analyze') {
      const context = body?.context || '';
      if (!process.env.OPENAI_API_KEY) return res.status(400).json({ error: 'OPENAI_API_KEY non configurata' });
      const analysis = await callGPT(
        'Sei un esperto analista di materie prime. Rispondi in JSON con: executive_summary, catalysts (array), risks (array), vote (BUY/HOLD/SELL), conviction (0-100), reasoning. Lingua: italiano.',
        context
      );
      return res.status(200).json({ agent: 'ALPHA', ...analysis });
    }

    return res.status(400).json({ error: 'Invalid phase' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
