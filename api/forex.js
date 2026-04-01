// api/forex.js — Forex analysis (Hobby-plan compatible, split phases)
const { avFxDaily } = require('./_lib/dataSources');
const { fredSeries } = require('./_lib/dataSources');
const { fullAnalysis, ema } = require('./_lib/technicals');
const { monteCarlo } = require('./_lib/models');
const { callGPT } = require('./_lib/llm');
const { corsHeaders } = require('./_lib/utils');

module.exports = async function handler(req, res) {
  Object.keys(corsHeaders()).forEach(k => res.setHeader(k, corsHeaders()[k]));
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const body = req.method === 'POST' ? (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) : req.query;
    const pair = (body?.pair || 'EURUSD').toUpperCase();
    const phase = body?.phase || 'data';
    const from = pair.substring(0, 3);
    const to = pair.substring(3, 6) || 'USD';

    if (phase === 'data') {
      const daily = await avFxDaily(from, to);

      if (!daily || daily.length < 5) {
        return res.status(200).json({ pair: `${from}/${to}`, error: `Dati insufficienti per ${pair}` });
      }

      const closes = daily.map(d => d.close);
      const rate = closes[closes.length - 1];
      const period = Math.min(200, closes.length);
      const emaValues = ema(closes, period);
      const emaLast = emaValues[emaValues.length - 1];
      const stdDev = Math.sqrt(closes.slice(-period).reduce((s, c) => s + Math.pow(c - emaLast, 2), 0) / period);
      const zscore = stdDev > 0 ? (rate - emaLast) / stdDev : 0;

      const tech = fullAnalysis(daily.map(d => ({ ...d, volume: 0 })));
      const mc = monteCarlo(closes, 5000, 30);

      let dxy = 'N/A';
      try {
        const dxyData = await fredSeries('DTWEXBGS', 5);
        if (dxyData?.[0]?.value) dxy = dxyData[0].value;
      } catch {}

      return res.status(200).json({
        pair: `${from}/${to}`, rate, dxy, zscore: +zscore.toFixed(3),
        ema_200: +emaLast.toFixed(5),
        mean_reversion: Math.abs(zscore) > 2 ? 'EXTREME' : Math.abs(zscore) > 1 ? 'ELEVATED' : 'NORMAL',
        technicals: tech, monte_carlo: mc,
      });
    }

    if (phase === 'analyze') {
      const context = body?.context || '';
      if (!process.env.OPENAI_API_KEY) return res.status(400).json({ error: 'OPENAI_API_KEY non configurata' });
      const analysis = await callGPT(
        'Sei un esperto analista forex. Rispondi in JSON con: executive_summary, catalysts (array), risks (array), vote (BUY/HOLD/SELL), conviction (0-100), reasoning. Lingua: italiano.',
        context
      );
      return res.status(200).json({ agent: 'ALPHA', ...analysis });
    }

    return res.status(400).json({ error: 'Invalid phase' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
