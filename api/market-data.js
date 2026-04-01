// api/market-data.js — Proxy for Alpha Vantage + Finnhub (keys server-side)
const { jsonResponse, errorResponse, corsHeaders } = require('./_lib/utils');

const AV_BASE = 'https://www.alphavantage.co/query';
const FH_BASE = 'https://finnhub.io/api/v1';

async function fetchAV(params) {
  const url = `${AV_BASE}?${new URLSearchParams({ ...params, apikey: process.env.ALPHA_VANTAGE_KEY })}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data['Error Message']) throw new Error(data['Error Message']);
  if (data['Note'] || data['Information']) throw new Error('Alpha Vantage rate limit. Riprova tra 1 minuto.');
  return data;
}

async function fetchFH(endpoint, params = {}) {
  if (!process.env.FINNHUB_API_KEY) return null;
  const url = `${FH_BASE}${endpoint}?${new URLSearchParams({ ...params, token: process.env.FINNHUB_API_KEY })}`;
  const res = await fetch(url);
  return res.json();
}

module.exports = async function handler(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders());
    return res.end();
  }

  const { type, symbol } = req.query;
  if (!symbol) return res.status(400).json({ error: 'Missing symbol parameter' });

  try {
    let data;
    switch (type) {
      case 'quote':
        // Finnhub real-time first, fallback to AV
        if (process.env.FINNHUB_API_KEY) {
          const fhData = await fetchFH('/quote', { symbol });
          if (fhData && fhData.c && fhData.c > 0) {
            data = { source: 'finnhub', price: fhData.c, change: fhData.d, changePct: (fhData.dp || 0).toFixed(2) + '%', open: fhData.o, high: fhData.h, low: fhData.l, prevClose: fhData.pc, timestamp: fhData.t };
            break;
          }
        }
        data = await fetchAV({ function: 'GLOBAL_QUOTE', symbol });
        break;
      case 'overview':
        data = await fetchAV({ function: 'OVERVIEW', symbol });
        break;
      case 'daily':
        data = await fetchAV({ function: 'TIME_SERIES_DAILY', symbol, outputsize: 'compact' });
        break;
      case 'news':
        data = await fetchFH('/company-news', {
          symbol,
          from: new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0],
          to: new Date().toISOString().split('T')[0],
        });
        break;
      case 'earnings':
        data = await fetchFH('/stock/earnings', { symbol, limit: 4 });
        break;
      case 'recommendation':
        data = await fetchFH('/stock/recommendation', { symbol });
        break;
      default:
        return res.status(400).json({ error: 'Invalid type. Use: quote, overview, daily, news, earnings, recommendation' });
    }
    Object.keys(corsHeaders()).forEach(k => res.setHeader(k, corsHeaders()[k]));
    res.status(200).json(data);
  } catch (err) {
    Object.keys(corsHeaders()).forEach(k => res.setHeader(k, corsHeaders()[k]));
    res.status(500).json({ error: err.message });
  }
};
