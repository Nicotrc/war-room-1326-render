// api/warroom.js — War Room orchestrator (Hobby-plan: Finnhub-first, <10s per phase)
const { callGPT, callClaude, callGemini } = require('./_lib/llm');
const { gptPrompt, claudePrompt, geminiPrompt, buildMarketContext } = require('./_lib/prompts');
const { corsHeaders } = require('./_lib/utils');

const FH = 'https://finnhub.io/api/v1';
const AV = 'https://www.alphavantage.co/query';

async function fh(endpoint, params) {
  if (!process.env.FINNHUB_API_KEY) return null;
  const url = `${FH}${endpoint}?${new URLSearchParams({ ...params, token: process.env.FINNHUB_API_KEY })}`;
  const r = await fetch(url); return r.json();
}

async function av(params) {
  const url = `${AV}?${new URLSearchParams({ ...params, apikey: process.env.ALPHA_VANTAGE_KEY })}`;
  const r = await fetch(url); const d = await r.json();
  if (d['Note'] || d['Information'] || d['Error Message']) return null;
  return d;
}

module.exports = async function handler(req, res) {
  Object.keys(corsHeaders()).forEach(k => res.setHeader(k, corsHeaders()[k]));
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    const body = req.method === 'POST' ? (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) : req.query;
    const ticker = (body?.ticker || '').toUpperCase();
    const phase = body?.phase || 'data';
    if (!ticker) return res.status(400).json({ error: 'Missing ticker' });

    // ═══ DATA: Finnhub quote only — fast (<2s) ═══
    if (phase === 'data') {
      let quote = null;
      // Finnhub (real-time, fast)
      const fhData = await fh('/quote', { symbol: ticker });
      if (fhData?.c > 0) {
        quote = { price: fhData.c, change: fhData.d || 0, changePct: (fhData.dp || 0).toFixed(2) + '%', open: fhData.o, high: fhData.h, low: fhData.l, prevClose: fhData.pc, source: 'Finnhub (real-time)' };
      }
      // Fallback AV
      if (!quote && process.env.ALPHA_VANTAGE_KEY) {
        const avData = await av({ function: 'GLOBAL_QUOTE', symbol: ticker });
        const q = avData?.['Global Quote'];
        if (q?.['05. price']) {
          quote = { price: +q['05. price'], change: +q['09. change'], changePct: q['10. change percent'], open: +q['02. open'], high: +q['03. high'], low: +q['04. low'], prevClose: +q['08. previous close'], source: 'Alpha Vantage' };
        }
      }
      if (!quote) return res.status(404).json({ error: `Nessun dato per ${ticker}` });

      // Finnhub company profile (fast)
      let profile = null;
      try { profile = await fh('/stock/profile2', { symbol: ticker }); } catch {}

      return res.status(200).json({
        ticker, quote,
        overview: profile ? { Name: profile.name, Sector: profile.finnhubIndustry, MarketCapitalization: profile.marketCapitalization * 1e6, Logo: profile.logo, WebURL: profile.weburl } : null,
      });
    }

    // ═══ DETAILS: AV overview + daily (separate call, can be slower) ═══
    if (phase === 'details') {
      const results = {};
      try {
        const ovData = await av({ function: 'OVERVIEW', symbol: ticker });
        if (ovData?.Symbol) results.overview = ovData;
      } catch {}
      try {
        const dData = await av({ function: 'TIME_SERIES_DAILY', symbol: ticker, outputsize: 'compact' });
        const ts = dData?.['Time Series (Daily)'];
        if (ts) results.daily = Object.entries(ts).slice(0, 60).reverse().map(([date, v]) => ({ date, close: +v['4. close'], volume: +v['5. volume'], high: +v['2. high'], low: +v['3. low'] }));
      } catch {}
      // Finnhub news
      try {
        const news = await fh('/company-news', { symbol: ticker, from: new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0], to: new Date().toISOString().split('T')[0] });
        if (Array.isArray(news)) results.news = news.slice(0, 8);
      } catch {}
      return res.status(200).json(results);
    }

    // ═══ AGENT: single LLM call (<10s) ═══
    if (phase === 'agent') {
      const agent = (body?.agent || '').toUpperCase();
      const context = body?.context || '';
      const map = {
        ALPHA: { key: 'OPENAI_API_KEY', prompt: gptPrompt, fn: callGPT, model: 'GPT-4o' },
        SENTINEL: { key: 'ANTHROPIC_API_KEY', prompt: claudePrompt, fn: callClaude, model: 'Claude 3.5' },
        PRISM: { key: 'GEMINI_API_KEY', prompt: geminiPrompt, fn: callGemini, model: 'Gemini 1.5' },
      };
      const cfg = map[agent];
      if (!cfg) return res.status(400).json({ error: `Agente: ${agent}` });
      if (!process.env[cfg.key]) return res.status(200).json({ error: `${cfg.key} non configurata`, agent, skipped: true });
      const result = await cfg.fn(cfg.prompt, context);
      return res.status(200).json({ agent, model: cfg.model, ...result });
    }

    // ═══ VERDICT ═══
    if (phase === 'verdict') {
      const agents = body?.agents || [];
      if (!agents.length) return res.status(400).json({ error: 'Nessun risultato' });
      const votes = agents.map(a => a.vote).filter(Boolean);
      const convictions = agents.map(a => a.conviction || 50);
      const bc = votes.filter(v => v === 'BUY').length, sc = votes.filter(v => v === 'SELL').length, hc = votes.filter(v => v === 'HOLD').length;
      let vote = 'HOLD';
      if (bc > sc && bc > hc) vote = 'BUY'; else if (sc > bc && sc > hc) vote = 'SELL';
      const avg = Math.round(convictions.reduce((s, c) => s + c, 0) / convictions.length);
      const ts = agents.find(a => a.agent === 'PRISM')?.conviction || avg;
      const fs = agents.find(a => a.agent === 'SENTINEL')?.conviction || avg;
      const cs = Math.min(100, agents.flatMap(a => a.catalysts || []).length * 15 + 30);
      const ss = vote === 'BUY' ? 75 : vote === 'SELL' ? 25 : 50;
      return res.status(200).json({
        vote, conviction: avg, composite_score: Math.round(ts * .3 + fs * .3 + cs * .2 + ss * .2),
        score_breakdown: { technical: ts, fundamental: fs, catalysts: cs, sentiment: ss },
        votes: { buy: bc, sell: sc, hold: hc }, agents_count: agents.length,
      });
    }

    return res.status(400).json({ error: 'Invalid phase' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};
