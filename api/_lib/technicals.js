// api/_lib/technicals.js — Technical indicator calculations

function ema(data, period) {
  const k = 2 / (period + 1);
  const result = [data[0]];
  for (let i = 1; i < data.length; i++) {
    result.push(data[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

function sma(data, period) {
  const result = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    const slice = data.slice(i - period + 1, i + 1);
    result.push(slice.reduce((s, v) => s + v, 0) / period);
  }
  return result;
}

function rsi(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  const result = [];
  for (let i = 0; i < period; i++) result.push(null);
  result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
    result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  }
  return result;
}

function macd(closes, fast = 12, slow = 26, signal = 9) {
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const macdLine = emaFast.map((v, i) => v - emaSlow[i]);
  const signalLine = ema(macdLine.slice(slow - 1), signal);
  const histogram = [];
  for (let i = 0; i < signalLine.length; i++) {
    histogram.push(macdLine[slow - 1 + i] - signalLine[i]);
  }
  return {
    macd: macdLine[macdLine.length - 1],
    signal: signalLine[signalLine.length - 1],
    histogram: histogram[histogram.length - 1],
  };
}

function atr(highs, lows, closes, period = 14) {
  const tr = [];
  for (let i = 0; i < highs.length; i++) {
    if (i === 0) { tr.push(highs[i] - lows[i]); continue; }
    tr.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    ));
  }
  return sma(tr, period).filter(v => v !== null).pop() || 0;
}

function bollingerBands(closes, period = 20, stdDev = 2) {
  const mid = sma(closes, period);
  const lastMid = mid.filter(v => v !== null).pop();
  if (!lastMid) return null;
  const slice = closes.slice(-period);
  const variance = slice.reduce((s, v) => s + Math.pow(v - lastMid, 2), 0) / period;
  const sd = Math.sqrt(variance);
  return { upper: lastMid + sd * stdDev, middle: lastMid, lower: lastMid - sd * stdDev, bandwidth: (sd * stdDev * 2) / lastMid };
}

function vwap(highs, lows, closes, volumes) {
  let cumTPV = 0, cumVol = 0;
  for (let i = 0; i < closes.length; i++) {
    const tp = (highs[i] + lows[i] + closes[i]) / 3;
    cumTPV += tp * volumes[i];
    cumVol += volumes[i];
  }
  return cumVol > 0 ? cumTPV / cumVol : closes[closes.length - 1];
}

function supportResistance(highs, lows, closes) {
  // Simple pivot point method
  const h = highs[highs.length - 1];
  const l = lows[lows.length - 1];
  const c = closes[closes.length - 1];
  const pivot = (h + l + c) / 3;
  return {
    r2: pivot + (h - l),
    r1: 2 * pivot - l,
    pivot,
    s1: 2 * pivot - h,
    s2: pivot - (h - l),
  };
}

function detectBreakout(closes, period = 20) {
  if (closes.length < period) return null;
  const recent = closes.slice(-period);
  const high = Math.max(...recent.slice(0, -1));
  const low = Math.min(...recent.slice(0, -1));
  const current = closes[closes.length - 1];
  if (current > high) return { type: 'BREAKOUT_UP', level: high };
  if (current < low) return { type: 'BREAKOUT_DOWN', level: low };
  return null;
}

function fullAnalysis(daily) {
  const closes = daily.map(d => d.close);
  const highs = daily.map(d => d.high || d.close);
  const lows = daily.map(d => d.low || d.close);
  const volumes = daily.map(d => d.volume || 0);

  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const ema200 = closes.length >= 200 ? ema(closes, 200) : null;
  const rsiValues = rsi(closes);
  const macdResult = macd(closes);
  const atrValue = atr(highs, lows, closes);
  const bb = bollingerBands(closes);
  const vwapValue = vwap(highs, lows, closes, volumes);
  const sr = supportResistance(highs, lows, closes);
  const breakout = detectBreakout(closes);

  return {
    ema: { ema20: ema20[ema20.length - 1], ema50: ema50[ema50.length - 1], ema200: ema200?.[ema200.length - 1] },
    rsi: rsiValues ? rsiValues[rsiValues.length - 1] : null,
    macd: macdResult,
    atr: atrValue,
    bollinger: bb,
    vwap: vwapValue,
    support_resistance: sr,
    breakout,
    price: closes[closes.length - 1],
    trend: ema20[ema20.length - 1] > ema50[ema50.length - 1] ? 'BULLISH' : 'BEARISH',
  };
}

module.exports = { ema, sma, rsi, macd, atr, bollingerBands, vwap, supportResistance, detectBreakout, fullAnalysis };
