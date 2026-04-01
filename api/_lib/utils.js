// api/_lib/utils.js — Shared utilities for serverless functions

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  });
}

function errorResponse(message, status = 500) {
  return jsonResponse({ error: message }, status);
}

function sseHeaders() {
  return {
    ...corsHeaders(),
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  };
}

function sseEvent(writer, event, data) {
  const encoder = new TextEncoder();
  writer.write(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
}

// Simple in-memory rate limiter (per-invocation, resets on cold start)
const rateLimitMap = new Map();
function rateLimit(key, maxPerMinute = 4) {
  const now = Date.now();
  const window = 60000;
  if (!rateLimitMap.has(key)) rateLimitMap.set(key, []);
  const timestamps = rateLimitMap.get(key).filter(t => now - t < window);
  if (timestamps.length >= maxPerMinute) {
    return false;
  }
  timestamps.push(now);
  rateLimitMap.set(key, timestamps);
  return true;
}

module.exports = { corsHeaders, jsonResponse, errorResponse, sseHeaders, sseEvent, rateLimit };
