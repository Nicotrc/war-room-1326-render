// js/app.js — SPA Router + Init
import { $ } from './core/ui.js';

const VIEWS = {
  warroom:     () => import('./views/warroom.js'),
  scouting:    () => import('./views/scouting.js'),
  crypto:      () => import('./views/crypto.js'),
  forex:       () => import('./views/forex.js'),
  chat:        () => import('./views/chat.js'),
};

let currentView = null;
let currentViewModule = null;

// Clock
function updateClock() {
  const el = $('#clock');
  if (el) el.textContent = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
setInterval(updateClock, 1000);
updateClock();

// Router
async function navigate(viewName) {
  if (currentViewModule?.destroy) currentViewModule.destroy();

  // Update tab active state
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.view === viewName);
  });

  // Hide all views, show target
  document.querySelectorAll('.view-panel').forEach(p => p.style.display = 'none');
  const viewEl = document.getElementById('view-' + viewName);
  if (viewEl) viewEl.style.display = '';

  // Load and init view module
  const loader = VIEWS[viewName];
  if (loader) {
    try {
      currentViewModule = await loader();
      currentViewModule.init();
      currentView = viewName;
    } catch (err) {
      console.error(`Failed to load view ${viewName}:`, err);
    }
  }
}

// Init
document.addEventListener('DOMContentLoaded', () => {
  // Tab navigation
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const view = tab.dataset.view;
      window.location.hash = view;
    });
  });

  // Hash change
  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.slice(1) || 'warroom';
    navigate(hash);
  });

  // Initial route
  const hash = window.location.hash.slice(1) || 'warroom';
  navigate(hash);
});
