// api/chat-vision.js — GPT-4o Vision for chart screenshot analysis
const { corsHeaders } = require('./_lib/utils');

const VISION_PROMPT = `Sei un esperto analista tecnico. Analizza lo screenshot del grafico fornito.

Identifica:
1. Pattern grafici (triangoli, flag, double top/bottom, head & shoulders, wedge, channel)
2. Livelli chiave di supporto e resistenza
3. Trend dominante
4. Bias direzionale con probabilità

Rispondi SEMPRE in JSON valido con questo schema:
{
  "patterns": ["string — pattern identificati"],
  "key_levels": {
    "support": [number — livelli di supporto],
    "resistance": [number — livelli di resistenza]
  },
  "bias": "BULLISH | BEARISH | NEUTRAL",
  "probability_scenarios": {
    "breakout_up": number (0-100),
    "rejection": number (0-100),
    "breakdown": number (0-100)
  },
  "trend": "string — descrizione del trend",
  "analysis_text": "string — analisi dettagliata in italiano"
}`;

module.exports = async function handler(req, res) {
  Object.keys(corsHeaders()).forEach(k => res.setHeader(k, corsHeaders()[k]));
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OPENAI_API_KEY non configurata' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { image, message, history = [] } = body;

    const OpenAI = require('openai');
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const messages = [{ role: 'system', content: VISION_PROMPT }];

    // Add history for follow-up
    for (const h of history.slice(-4)) {
      messages.push(h);
    }

    // Build user message
    const userContent = [];
    if (image) {
      userContent.push({
        type: 'image_url',
        image_url: { url: image, detail: 'high' },
      });
      userContent.push({ type: 'text', text: 'Analizza questo grafico. Identifica pattern, livelli chiave, bias e probabilità.' });
    }
    if (message) {
      userContent.push({ type: 'text', text: message });
    }
    if (userContent.length === 0) {
      return res.status(400).json({ error: 'Fornisci un\'immagine o un messaggio' });
    }

    messages.push({ role: 'user', content: userContent });

    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      messages,
      max_tokens: 2000,
    });

    const result = JSON.parse(response.choices[0].message.content);
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
