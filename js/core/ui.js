// js/core/ui.js — Shared DOM helpers

export function $(sel) { return document.querySelector(sel); }
export function $$(sel) { return document.querySelectorAll(sel); }

const AGENTS_META = {
  ALPHA:    { emoji: '🧠', color: '#3b82f6', role: 'Macro Strategist (GPT-4o)' },
  SENTINEL: { emoji: '🛡️', color: '#f59e0b', role: 'Risk Manager (Claude 3.5)' },
  PRISM:    { emoji: '📐', color: '#a78bfa', role: 'Pattern Analyst (Gemini 1.5)' },
  EXECUTOR: { emoji: '⚡', color: '#10b981', role: 'Trade Executor' },
  SYSTEM:   { emoji: '🔔', color: '#64748b', role: 'System' },
};

export function getAgentMeta(name) {
  return AGENTS_META[name] || { emoji: '🤖', color: '#94a3b8', role: name };
}

let msgCount = 0;

export function resetMsgCount() { msgCount = 0; updateMsgCounter(); }
function updateMsgCounter() {
  const el = $('#msgCount');
  if (el) el.textContent = `${msgCount} messaggi`;
}

export function addSystemMsg(feed, text) {
  const div = document.createElement('div');
  div.className = 'chat-system';
  div.innerHTML = text;
  feed.appendChild(div);
  feed.scrollTop = feed.scrollHeight;
}

export function addChatMsg(feed, agentName, text) {
  const meta = getAgentMeta(agentName);
  msgCount++;
  updateMsgCounter();
  const div = document.createElement('div');
  div.className = 'chat-msg';
  const time = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  div.innerHTML = `
    <div class="avatar" style="background:${meta.color}22;color:${meta.color}">${meta.emoji}</div>
    <div class="chat-body">
      <div class="chat-meta">
        <span class="chat-author" style="color:${meta.color}">${agentName}</span>
        <span class="chat-time">${time}</span>
      </div>
      <div class="chat-text">${formatText(text)}</div>
    </div>
  `;
  feed.appendChild(div);
  feed.scrollTop = feed.scrollHeight;
}

export function showTyping(feed, agentName) {
  const meta = getAgentMeta(agentName);
  const div = document.createElement('div');
  div.className = 'chat-msg';
  div.id = 'typing-' + agentName;
  div.innerHTML = `
    <div class="avatar" style="background:${meta.color}22;color:${meta.color}">${meta.emoji}</div>
    <div class="chat-body">
      <div class="chat-meta"><span class="chat-author" style="color:${meta.color}">${agentName}</span></div>
      <div class="typing-indicator"><span></span><span></span><span></span></div>
    </div>
  `;
  feed.appendChild(div);
  feed.scrollTop = feed.scrollHeight;
}

export function removeTyping(agentName) {
  const el = document.getElementById('typing-' + agentName);
  if (el) el.remove();
}

export function formatText(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

export function formatMarketCap(val) {
  if (!val) return 'N/A';
  const n = parseFloat(val);
  if (isNaN(n)) return val;
  if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(0) + 'M';
  return n.toLocaleString();
}

export function setHealthStatus(provider, ok) {
  const el = document.getElementById(`health-${provider}`);
  if (el) {
    el.className = 'health-dot ' + (ok ? 'ok' : 'fail');
    el.title = provider + ': ' + (ok ? 'Online' : 'Offline');
  }
}

export function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
