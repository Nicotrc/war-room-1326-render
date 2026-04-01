// api/cron-scout.js — Weekly cron trigger for scouting (Monday 15:30 CET)
const { corsHeaders } = require('./_lib/utils');

module.exports = async function handler(req, res) {
  Object.keys(corsHeaders()).forEach(k => res.setHeader(k, corsHeaders()[k]));

  // Verify this is a cron call or authorized request
  const authHeader = req.headers['authorization'];
  const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;
  const isVercelCron = req.headers['x-vercel-cron'] === '1';

  if (!isCron && !isVercelCron && req.method !== 'GET') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Trigger the scouting endpoint internally
    const baseUrl = `https://${req.headers.host}`;
    const response = await fetch(`${baseUrl}/api/scouting`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sectors: ['biotech', 'ai', 'defense', 'energy'] }),
    });

    // TODO: Store results in Vercel KV/Blob for later retrieval
    // TODO: Send notification via webhook (Telegram/Discord/email)

    res.status(200).json({
      success: true,
      message: 'Weekly scouting triggered',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
