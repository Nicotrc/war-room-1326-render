// api/_lib/llm.js — Unified wrapper for GPT-4o, Claude 3.5, Gemini 1.5 Pro

async function callGPT(systemPrompt, userPrompt) {
  const OpenAI = require('openai');
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt + '\n\nRispondi SEMPRE in JSON valido.' },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.7,
    max_tokens: 4000,
  });
  return JSON.parse(response.choices[0].message.content);
}

async function callClaude(systemPrompt, userPrompt) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    system: systemPrompt + '\n\nRispondi SEMPRE in JSON valido, senza testo aggiuntivo fuori dal JSON.',
    messages: [{ role: 'user', content: userPrompt }],
  });
  const text = response.content[0].text;
  // Extract JSON from potential markdown code blocks
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
  return JSON.parse(jsonMatch[1].trim());
}

async function callGemini(systemPrompt, userPrompt) {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-pro',
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.7,
      maxOutputTokens: 4000,
    },
  });
  const result = await model.generateContent([
    { text: systemPrompt },
    { text: userPrompt },
  ]);
  return JSON.parse(result.response.text());
}

async function callAllAgents(prompts, marketContext) {
  const results = await Promise.allSettled([
    process.env.OPENAI_API_KEY
      ? callGPT(prompts.gpt, marketContext).then(r => ({ agent: 'ALPHA', model: 'GPT-4o', ...r }))
      : Promise.reject(new Error('OPENAI_API_KEY not set')),
    process.env.ANTHROPIC_API_KEY
      ? callClaude(prompts.claude, marketContext).then(r => ({ agent: 'SENTINEL', model: 'Claude 3.5', ...r }))
      : Promise.reject(new Error('ANTHROPIC_API_KEY not set')),
    process.env.GEMINI_API_KEY
      ? callGemini(prompts.gemini, marketContext).then(r => ({ agent: 'PRISM', model: 'Gemini 1.5', ...r }))
      : Promise.reject(new Error('GEMINI_API_KEY not set')),
  ]);

  const agents = [];
  const errors = [];
  results.forEach((r, i) => {
    const names = ['ALPHA', 'SENTINEL', 'PRISM'];
    if (r.status === 'fulfilled') agents.push(r.value);
    else errors.push({ agent: names[i], error: r.reason.message });
  });

  return { agents, errors, degraded: errors.length > 0 };
}

module.exports = { callGPT, callClaude, callGemini, callAllAgents };
