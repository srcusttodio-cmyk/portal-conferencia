/* ══════════════════════════════════════════════════════
   AUTOSAVE
══════════════════════════════════════════════════════ */
function scheduleAutosave(immediate) {
  clearTimeout(autosaveTimer);
  showAutosaveBadge('saving');
  if(immediate) { doAutosave(); return; }
  autosaveTimer = setTimeout(doAutosave, 1800);
}

function doAutosave() {
  if(!rows.length) return;
  const key = todayKey();
  localStorage.setItem(AS_KEY, JSON.stringify({date:key, rows, saved:new Date().toISOString()}));
  showAutosaveBadge('saved');
  animateAutosaveBar();
  // also save to Firebase (cloud sync)
  if(window.fbSaveToday) window.fbSaveToday(rows);
}

function restoreAutosave() {
  try {
    const raw = localStorage.getItem(AS_KEY);
    if(!raw) return;
    const rec = JSON.parse(raw);
    if(!rec.rows || !rec.rows.length) return;
    const saved = new Date(rec.saved);
    const diff  = (Date.now() - saved.getTime()) / 36e5; // hours
    if(diff > 24) return; // older than 24h, skip
    rows = rec.rows;
    document.getElementById('importSection').style.display = 'none';
    document.getElementById('dashboard').style.display     = 'block';
    renderDashboard();
    const timeStr = saved.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    toast(`♻️ Dados restaurados do autossave (${timeStr})`,'t-amber');
  } catch {}
}

function showAutosaveBadge(state) {
  const badge  = document.getElementById('autosaveBadge');
  const dot    = document.getElementById('asDot');
  const text   = document.getElementById('asText');
  badge.className = `show ${state}`;
  if(state==='saving') {
    dot.classList.add('pulse');
    text.textContent = 'Salvando...';
  } else {
    dot.classList.remove('pulse');
    const t = new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    text.textContent = `Salvo às ${t}`;
    setTimeout(() => { badge.classList.remove('show'); }, 3500);
  }
}

function animateAutosaveBar() {
  const bar = document.getElementById('autosaveProgress');
  bar.style.transition = 'none';
  bar.style.width = '0%';
  bar.style.opacity = '1';
  requestAnimationFrame(() => {
    bar.style.transition = 'width 0.6s ease';
    bar.style.width = '100%';
    setTimeout(() => {
      bar.style.transition = 'opacity 0.5s';
      bar.style.opacity = '0';
      setTimeout(() => { bar.style.width='0%'; bar.style.opacity='1'; }, 600);
    }, 800);
  });
}

function todayKey() {
  return new Date().toISOString().slice(0,10);
}

