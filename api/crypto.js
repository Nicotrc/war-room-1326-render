// api/crypto.js — Crypto analysis pipeline (Hobby-plan compatible)
const { cgPrice, cgOHLC, binanceFundingRate, binanceOpenInterest } = require('./_lib/dataSources');
const { fullAnalysis } = require('./_lib/technicals');
const { monteCarlo } = require('./_lib/models');
const { callGPT } = require('./_lib/llm');
const { corsHeaders } = require('./_lib/utils');

const COIN_MAP = {
  BTC: { cg: 'bitcoin', bn: 'BTCUSDT' },
  ETH: { cg: 'ethereum', bn: 'ETHUSDT' },
  SOL: { cg: 'solana', bn: 'SOLUSDT' },
  ADA: { cg: 'cardano', bn: 'ADAUSDT' },
  AVAX: { cg: 'avalanche-2', bn: 'AVAXUSDT' },
  DOGE: { cg: 'dogecoin', bn: 'DOGEUSDT' },
  LINK: { cg: 'chainlink', bn: 'LINKUSDT' },
  XRP: { cg: 'ripple', bn: 'XRPUSDT' },
};

module.exports = async function handler(req, res) {
  Object.keys(corsHeaders()).forEach(k => res.setHeader(k, corsHeaders()[k]));
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const body = req.method === 'POST' ? (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) : req.query;
    const symbol = (body?.symbol || 'BTC').toUpperCase();
    const phase = body?.phase || 'data';
    const coin = COIN_MAP[symbol] || { cg: symbol.toLowerCase(), bn: symbol + 'USDT' };

    if (phase === 'data') {
      // Just fetch market data (fast)
      const [priceData, ohlcData, fundingData, oiData] = await Promise.allSettled([
        cgPrice(coin.cg),
        cgOHLC(coin.cg, 60),
        binanceFundingRate(coin.bn).catch(() => []),
        binanceOpenInterest(coin.bn).catch(() => null),
      ]);

      const price = priceData.status === 'fulfilled' ? priceData.value?.[coin.cg] : null;
      const ohlc = ohlcData.status === 'fulfilled' ? ohlcData.value : [];
      const funding = fundingData.status === 'fulfilled' ? fundingData.value : [];
      const oi = oiData.status === 'fulfilled' ? oiData.value : null;

      let technicals = null, mc = null;
      if (ohlc.length >= 20) {
        const daily = ohlc.map(d => ({ ...d, volume: 0 }));
        technicals = fullAnalysis(daily);
        mc = monteCarlo(daily.map(d => d.close), 5000, 30);
      }

      return res.status(200).json({
        symbol, price: price?.usd || 0,
        change_24h: price?.usd_24h_change?.toFixed(2) || '0',
        market_cap: price?.usd_market_cap ? (price.usd_market_cap / 1e9).toFixed(2) + 'B' : 'N/A',
        volume_24h: price?.usd_24h_vol ? (price.usd_24h_vol / 1e9).toFixed(2) + 'B' : 'N/A',
        funding_rate: funding?.[0]?.fundingRate ? (parseFloat(funding[0].fundingRate) * 100).toFixed(4) + '%' : 'N/A',
        open_interest: oi?.openInterest ? parseFloat(oi.openInterest).toLocaleString() : 'N/A',
        technicals, monte_carlo: mc,
      });
    }

    if (phase === 'analyze') {
      const context = body?.context || '';
      if (!process.env.OPENAI_API_KEY) return res.status(400).json({ error: 'OPENAI_API_KEY non configurata' });
      const analysis = await callGPT(
        'Sei un esperto analista crypto. Rispondi in JSON con: executive_summary, catalysts (array), risks (array), vote (BUY/HOLD/SELL), conviction (0-100), reasoning. Lingua: italiano.',
        context
      );
      return res.status(200).json({ agent: 'ALPHA', ...analysis });
    }

    return res.status(400).json({ error: 'Invalid phase' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
