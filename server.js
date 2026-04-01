// server.js — Express server for Render (no timeout limits)
const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static(path.join(__dirname), {
  extensions: ['html'],
  index: 'index.html',
}));

// Helper: adapt Vercel-style handler to Express
function adapt(handlerPath) {
  const handler = require(handlerPath);
  return async (req, res) => {
    try {
      // Merge query + body for compatibility
      if (!req.body) req.body = {};
      if (req.method === 'GET') req.body = req.query;
      await handler(req, res);
    } catch (err) {
      console.error(`Error in ${handlerPath}:`, err);
      if (!res.headersSent) res.status(500).json({ error: err.message });
    }
  };
}

// API Routes
app.all('/api/warroom', adapt('./api/warroom'));
app.all('/api/market-data', adapt('./api/market-data'));
app.all('/api/scouting', adapt('./api/scouting'));
app.all('/api/crypto', adapt('./api/crypto'));
app.all('/api/forex', adapt('./api/forex'));
app.all('/api/commodities', adapt('./api/commodities'));
app.all('/api/chat-vision', adapt('./api/chat-vision'));
app.all('/api/cron-scout', adapt('./api/cron-scout'));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`AI War Room running on port ${PORT}`);
  console.log(`Finnhub: ${process.env.FINNHUB_API_KEY ? 'OK' : 'MISSING'}`);
  console.log(`Alpha Vantage: ${process.env.ALPHA_VANTAGE_KEY ? 'OK' : 'MISSING'}`);
  console.log(`OpenAI: ${process.env.OPENAI_API_KEY ? 'OK' : 'MISSING'}`);
  console.log(`Anthropic: ${process.env.ANTHROPIC_API_KEY ? 'OK' : 'MISSING'}`);
  console.log(`Gemini: ${process.env.GEMINI_API_KEY ? 'OK' : 'MISSING'}`);
});
