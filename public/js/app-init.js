/* ══════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════ */
window.addEventListener('DOMContentLoaded', () => {
  updateDatePill();
  loadOccTypes();
  restoreAutosave();
  Chart.defaults.color = '#8a94b0';
  Chart.defaults.font.family = "Arial, Helvetica, system-ui, sans-serif";

  // show sync badge on load
  const syncBadge = document.getElementById('syncBadge');
  if(syncBadge) { syncBadge.classList.add('show'); }

  // verificar pendentes do dia anterior após 1.5s (Firebase já conectou)
  setTimeout(checkPendingYesterday, 1500);
});

function updateDatePill() {
  const d = new Date();
  document.getElementById('datePill').textContent =
    d.toLocaleDateString('pt-BR', {weekday:'short', day:'2-digit', month:'short', year:'numeric'});
}

