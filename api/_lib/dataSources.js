// api/_lib/dataSources.js — Unified data fetching from all external APIs

const AV_BASE = 'https://www.alphavantage.co/query';
const FH_BASE = 'https://finnhub.io/api/v1';
const CG_BASE = 'https://api.coingecko.com/api/v3';
const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';
const BINANCE_BASE = 'https://fapi.binance.com/fapi/v1';

// ── Alpha Vantage ─────────────────────────────
async function fetchAV(params) {
  const url = `${AV_BASE}?${new URLSearchParams({ ...params, apikey: process.env.ALPHA_VANTAGE_KEY })}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data['Error Message']) throw new Error(data['Error Message']);
  if (data['Note'] || data['Information']) throw new Error('AV rate limit');
  return data;
}

async function avQuote(symbol) {
  const data = await fetchAV({ function: 'GLOBAL_QUOTE', symbol });
  const q = data?.['Global Quote'];
  if (!q?.['05. price']) return null;
  return {
    price: parseFloat(q['05. price']), change: parseFloat(q['09. change']),
    changePct: q['10. change percent'], open: parseFloat(q['02. open']),
    high: parseFloat(q['03. high']), low: parseFloat(q['04. low']),
    volume: parseInt(q['06. volume']), prevClose: parseFloat(q['08. previous close']),
  };
}

async function avDaily(symbol) {
  const data = await fetchAV({ function: 'TIME_SERIES_DAILY', symbol, outputsize: 'compact' });
  const ts = data?.['Time Series (Daily)'];
  if (!ts) return [];
  return Object.entries(ts).slice(0, 100).reverse().map(([date, v]) => ({
    date, close: parseFloat(v['4. close']), volume: parseInt(v['5. volume']),
    high: parseFloat(v['2. high']), low: parseFloat(v['3. low']), open: parseFloat(v['1. open']),
  }));
}

async function avFxDaily(fromCcy, toCcy) {
  const data = await fetchAV({ function: 'FX_DAILY', from_symbol: fromCcy, to_symbol: toCcy, outputsize: 'compact' });
  const ts = data?.['Time Series FX (Daily)'];
  if (!ts) return [];
  return Object.entries(ts).slice(0, 100).reverse().map(([date, v]) => ({
    date, close: parseFloat(v['4. close']), high: parseFloat(v['2. high']),
    low: parseFloat(v['3. low']), open: parseFloat(v['1. open']),
  }));
}

// ── Finnhub ───────────────────────────────────
async function fetchFH(endpoint, params = {}) {
  if (!process.env.FINNHUB_API_KEY) return null;
  const url = `${FH_BASE}${endpoint}?${new URLSearchParams({ ...params, token: process.env.FINNHUB_API_KEY })}`;
  const res = await fetch(url);
  return res.json();
}

async function fhQuote(symbol) {
  const data = await fetchFH('/quote', { symbol });
  if (!data || !data.c) return null;
  return {
    price: data.c,       // current price
    change: data.d,      // change
    changePct: data.dp ? data.dp.toFixed(2) + '%' : '0%',
    open: data.o,
    high: data.h,
    low: data.l,
    prevClose: data.pc,
    timestamp: data.t,
  };
}

async function fhNews(symbol, daysBack = 7) {
  return fetchFH('/company-news', {
    symbol,
    from: new Date(Date.now() - daysBack * 86400000).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0],
  });
}

async function fhEarnings(symbol) { return fetchFH('/stock/earnings', { symbol, limit: 4 }); }
async function fhRecommendation(symbol) { return fetchFH('/stock/recommendation', { symbol }); }

// ── CoinGecko ─────────────────────────────────
async function cgPrice(coinId) {
  const url = `${CG_BASE}/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true`;
  const res = await fetch(url);
  return res.json();
}

async function cgOHLC(coinId, days = 30) {
  const url = `${CG_BASE}/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.map(([ts, o, h, l, c]) => ({ date: new Date(ts).toISOString().split('T')[0], open: o, high: h, low: l, close: c }));
}

// ── Binance Futures ───────────────────────────
async function binanceFundingRate(symbol) {
  const url = `${BINANCE_BASE}/fundingRate?symbol=${symbol}&limit=10`;
  const res = await fetch(url);
  return res.json();
}

async function binanceOpenInterest(symbol) {
  const url = `${BINANCE_BASE}/openInterest?symbol=${symbol}`;
  const res = await fetch(url);
  return res.json();
}

async function binanceLiquidations(symbol) {
  const url = `${BINANCE_BASE}/allForceOrders?symbol=${symbol}&limit=50`;
  try { const res = await fetch(url); return res.json(); } catch { return []; }
}

// ── FRED ──────────────────────────────────────
async function fredSeries(seriesId, limit = 30) {
  if (!process.env.FRED_API_KEY) return [];
  const url = `${FRED_BASE}?series_id=${seriesId}&api_key=${process.env.FRED_API_KEY}&file_type=json&sort_order=desc&limit=${limit}`;
  const res = await fetch(url);
  const data = await res.json();
  return data?.observations || [];
}

module.exports = {
  avQuote, avDaily, avFxDaily, fetchAV,
  fhQuote, fhNews, fhEarnings, fhRecommendation, fetchFH,
  cgPrice, cgOHLC,
  binanceFundingRate, binanceOpenInterest, binanceLiquidations,
  fredSeries,
};
