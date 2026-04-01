// js/core/chart-renderer.js — Canvas chart with indicator overlays

export function drawPriceChart(canvas, dailyData, options = {}) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 2;
  const rect = canvas.getBoundingClientRect();
  const w = canvas.width = rect.width * dpr;
  const h = canvas.height = (options.height || 160) * dpr;
  ctx.scale(dpr, dpr);
  const W = rect.width;
  const H = options.height || 160;
  ctx.clearRect(0, 0, W, H);

  if (!dailyData || dailyData.length < 2) return;

  const closes = dailyData.map(d => d.close);
  const bullish = closes[closes.length - 1] >= closes[0];
  const min = Math.min(...closes) * 0.998;
  const max = Math.max(...closes) * 1.002;
  const xStep = W / (closes.length - 1);
  const yScale = v => H - ((v - min) / (max - min)) * H * 0.85 - H * 0.05;

  // Gradient fill
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  const baseRGB = bullish ? '16,185,129' : '239,68,68';
  grad.addColorStop(0, `rgba(${baseRGB},0.15)`);
  grad.addColorStop(1, `rgba(${baseRGB},0)`);

  ctx.beginPath();
  ctx.moveTo(0, yScale(closes[0]));
  closes.forEach((v, i) => ctx.lineTo(i * xStep, yScale(v)));
  ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // SMA overlays
  if (options.showSMA && closes.length >= 20) {
    drawSMA(ctx, closes, 20, xStep, yScale, '#3b82f6', 1);
    if (closes.length >= 50) drawSMA(ctx, closes, 50, xStep, yScale, '#f59e0b', 1);
  }

  // Main price line
  ctx.beginPath();
  ctx.moveTo(0, yScale(closes[0]));
  closes.forEach((v, i) => ctx.lineTo(i * xStep, yScale(v)));
  ctx.strokeStyle = bullish ? '#10b981' : '#ef4444';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Current price dot
  const last = closes.length - 1;
  ctx.beginPath();
  ctx.arc(last * xStep, yScale(closes[last]), 4, 0, Math.PI * 2);
  ctx.fillStyle = bullish ? '#10b981' : '#ef4444';
  ctx.fill();

  // Price labels
  ctx.font = '10px "JetBrains Mono", monospace';
  ctx.fillStyle = '#64748b';
  ctx.textAlign = 'right';
  ctx.fillText('$' + max.toFixed(2), W - 4, 14);
  ctx.fillText('$' + min.toFixed(2), W - 4, H - 4);
}

function drawSMA(ctx, closes, period, xStep, yScale, color, width) {
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash([4, 4]);
  let started = false;
  for (let i = period - 1; i < closes.length; i++) {
    const slice = closes.slice(i - period + 1, i + 1);
    const avg = slice.reduce((s, v) => s + v, 0) / period;
    if (!started) { ctx.moveTo(i * xStep, yScale(avg)); started = true; }
    else ctx.lineTo(i * xStep, yScale(avg));
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

export function drawVolumeChart(canvas, dailyData) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 2;
  const rect = canvas.getBoundingClientRect();
  const w = canvas.width = rect.width * dpr;
  const h = canvas.height = 60 * dpr;
  ctx.scale(dpr, dpr);
  const W = rect.width;
  const H = 60;
  ctx.clearRect(0, 0, W, H);

  if (!dailyData || dailyData.length < 2) return;

  const volumes = dailyData.map(d => d.volume);
  const maxVol = Math.max(...volumes);
  const barW = W / volumes.length * 0.7;
  const gap = W / volumes.length * 0.3;

  volumes.forEach((v, i) => {
    const barH = (v / maxVol) * H * 0.9;
    const x = i * (barW + gap);
    const bullish = i > 0 ? dailyData[i].close >= dailyData[i - 1].close : true;
    ctx.fillStyle = bullish ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)';
    ctx.fillRect(x, H - barH, barW, barH);
  });
}
