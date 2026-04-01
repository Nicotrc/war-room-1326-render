// api/_lib/models.js — Predictive models: Monte Carlo, EV, Momentum Score, Event Impact

function monteCarlo(closes, simulations = 10000, horizon = 30) {
  if (closes.length < 20) return null;

  // Calculate daily returns
  const returns = [];
  for (let i = 1; i < closes.length; i++) {
    returns.push(Math.log(closes[i] / closes[i - 1]));
  }
  const mu = returns.reduce((s, r) => s + r, 0) / returns.length;
  const sigma = Math.sqrt(returns.reduce((s, r) => s + Math.pow(r - mu, 2), 0) / (returns.length - 1));

  const currentPrice = closes[closes.length - 1];
  const finalPrices = [];

  for (let sim = 0; sim < simulations; sim++) {
    let price = currentPrice;
    for (let day = 0; day < horizon; day++) {
      // Geometric Brownian Motion
      const z = gaussianRandom();
      price *= Math.exp((mu - 0.5 * sigma * sigma) + sigma * z);
    }
    finalPrices.push(price);
  }

  finalPrices.sort((a, b) => a - b);
  const pUp15 = finalPrices.filter(p => p >= currentPrice * 1.15).length / simulations * 100;
  const pUp25 = finalPrices.filter(p => p >= currentPrice * 1.25).length / simulations * 100;
  const pDown20 = finalPrices.filter(p => p <= currentPrice * 0.80).length / simulations * 100;
  const median = finalPrices[Math.floor(simulations / 2)];
  const p5 = finalPrices[Math.floor(simulations * 0.05)];
  const p95 = finalPrices[Math.floor(simulations * 0.95)];

  return {
    current_price: currentPrice,
    horizon_days: horizon,
    simulations,
    prob_up_15: +pUp15.toFixed(1),
    prob_up_25: +pUp25.toFixed(1),
    prob_down_20: +pDown20.toFixed(1),
    median_price: +median.toFixed(2),
    percentile_5: +p5.toFixed(2),
    percentile_95: +p95.toFixed(2),
    expected_return: +(((median / currentPrice) - 1) * 100).toFixed(2),
  };
}

function expectedValue(scenarios) {
  // scenarios: [{ probability: 0.4, return_pct: 15 }, { probability: 0.35, return_pct: 2 }, { probability: 0.25, return_pct: -12 }]
  return scenarios.reduce((ev, s) => ev + (s.probability / 100) * s.return_pct, 0);
}

function momentumScore(closes, volumes, shortFloat = 0) {
  if (closes.length < 20) return 50;

  // Trend component (40%)
  const returns5 = (closes[closes.length - 1] / closes[closes.length - 6] - 1) * 100;
  const returns20 = (closes[closes.length - 1] / closes[closes.length - 21] - 1) * 100;
  const trendScore = Math.max(0, Math.min(100, 50 + returns5 * 3 + returns20));

  // Volume component (30%)
  const recentVol = volumes.slice(-5).reduce((s, v) => s + v, 0) / 5;
  const avgVol = volumes.slice(-20).reduce((s, v) => s + v, 0) / 20;
  const volRatio = avgVol > 0 ? recentVol / avgVol : 1;
  const volScore = Math.max(0, Math.min(100, volRatio * 50));

  // Short interest component (30%)
  const shortScore = shortFloat > 20 ? 80 : shortFloat > 10 ? 60 : 40;

  return Math.round(trendScore * 0.4 + volScore * 0.3 + shortScore * 0.3);
}

function eventImpactScore(events) {
  // events: [{ type: 'FDA', days_until: 5 }, { type: 'EARNINGS', days_until: 12 }]
  const weights = {
    FDA: 90, EARNINGS: 70, PARTNERSHIP: 60, LEGAL: 55, OFFERING: 50, NEWS: 30, LISTING: 65, HALVING: 75,
  };
  if (!events || events.length === 0) return 20;
  const scores = events.map(e => {
    const base = weights[e.type?.toUpperCase()] || 30;
    const decay = Math.max(0.3, 1 - (e.days_until || 30) / 60); // closer = higher impact
    return base * decay;
  });
  return Math.min(100, Math.round(scores.reduce((s, v) => s + v, 0) / scores.length));
}

function tradeSetup(price, atr, technicals, montCarloResult) {
  const isLong = technicals.trend === 'BULLISH';
  const entry = price;
  const stopLoss = isLong ? entry - atr * 2 : entry + atr * 2;
  const target1 = isLong ? entry + Math.abs(entry - stopLoss) : entry - Math.abs(entry - stopLoss);
  const target2 = isLong ? entry + Math.abs(entry - stopLoss) * 2 : entry - Math.abs(entry - stopLoss) * 2;
  const rr = Math.abs(target1 - entry) / Math.abs(entry - stopLoss);

  return {
    direction: isLong ? 'LONG' : 'SHORT',
    entry: +entry.toFixed(2),
    stop_loss: +stopLoss.toFixed(2),
    target_1: +target1.toFixed(2),
    target_2: +target2.toFixed(2),
    risk_reward: +rr.toFixed(2),
    risk_pct: +((Math.abs(entry - stopLoss) / entry) * 100).toFixed(2),
  };
}

// Box-Muller transform for normal distribution
function gaussianRandom() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

module.exports = { monteCarlo, expectedValue, momentumScore, eventImpactScore, tradeSetup, gaussianRandom };
