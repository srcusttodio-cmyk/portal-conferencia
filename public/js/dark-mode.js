/* ══════════════════════════════════════════════════════
   MÓDULO 08 — DARK MODE
══════════════════════════════════════════════════════ */
const DM_KEY = 'conf_dark_mode_v1';

function initDarkMode() {
  if(localStorage.getItem(DM_KEY) === 'on') {
    document.body.classList.add('dark-mode');
    document.getElementById('darkModeIcon').textContent = '☀️';
    document.getElementById('darkModeLabel').textContent = 'Light Mode';
  }
}

function toggleDarkMode() {
  const isDark = document.body.classList.toggle('dark-mode');
  localStorage.setItem(DM_KEY, isDark ? 'on' : 'off');
  document.getElementById('darkModeIcon').textContent = isDark ? '☀️' : '🌙';
  document.getElementById('darkModeLabel').textContent = isDark ? 'Light Mode' : 'Dark Mode';
}

