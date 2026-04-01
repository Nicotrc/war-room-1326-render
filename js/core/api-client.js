// js/core/api-client.js — Fetch wrapper + SSE consumer

const API_BASE = '/api';

export async function fetchJSON(endpoint, params = {}) {
  const url = `${API_BASE}/${endpoint}?${new URLSearchParams(params)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function postJSON(endpoint, body) {
  const res = await fetch(`${API_BASE}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// SSE consumer — returns an EventSource-like interface with callbacks
export function connectSSE(endpoint, body, callbacks = {}) {
  // We use fetch + ReadableStream since POST SSE isn't supported by native EventSource
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(`${API_BASE}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep incomplete line

        let currentEvent = null;
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ') && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6));
              if (callbacks[currentEvent]) callbacks[currentEvent](data);
              if (callbacks.onAny) callbacks.onAny(currentEvent, data);
            } catch (e) {
              // skip malformed JSON
            }
            currentEvent = null;
          }
        }
      }
      if (callbacks.onClose) callbacks.onClose();
    } catch (err) {
      if (err.name !== 'AbortError' && callbacks.onError) {
        callbacks.onError(err);
      }
    }
  })();

  return { abort: () => controller.abort() };
}

// Market data shortcuts (through proxy)
export async function fetchQuote(symbol) {
  const data = await fetchJSON('market-data', { type: 'quote', symbol });
  const q = data?.['Global Quote'];
  if (!q || !q['05. price']) throw new Error(`No data for ${symbol}`);
  return {
    price: parseFloat(q['05. price']),
    change: parseFloat(q['09. change']),
    changePct: q['10. change percent'],
    open: parseFloat(q['02. open']),
    high: parseFloat(q['03. high']),
    low: parseFloat(q['04. low']),
    volume: parseInt(q['06. volume']),
    prevClose: parseFloat(q['08. previous close']),
  };
}

export async function fetchOverview(symbol) {
  return fetchJSON('market-data', { type: 'overview', symbol });
}

export async function fetchDaily(symbol) {
  const data = await fetchJSON('market-data', { type: 'daily', symbol });
  const ts = data?.['Time Series (Daily)'];
  if (!ts) return [];
  return Object.entries(ts).slice(0, 60).reverse().map(([date, v]) => ({
    date, close: parseFloat(v['4. close']), volume: parseInt(v['5. volume']),
    high: parseFloat(v['2. high']), low: parseFloat(v['3. low']),
  }));
}
