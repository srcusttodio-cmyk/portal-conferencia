/* ══════════════════════════════════════════════════════
   PENDENTES DO DIA ANTERIOR (retorno tardio)
══════════════════════════════════════════════════════ */
let _pendingDayKey = null;

async function checkPendingYesterday() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const key = yesterday.toISOString().slice(0,10);

  // busca no Firestore primeiro, depois localStorage
  let rec = null;
  if(window.fbLoadHistory) {
    const hist = await window.fbLoadHistory();
    if(hist && hist[key]) rec = hist[key];
  }
  if(!rec) {
    const local = loadDB();
    if(local[key]) rec = local[key];
  }
  if(!rec || !rec.rows) return;

  // motoristas que não prestaram conta ainda
  const pendentes = rec.rows.filter(r =>
    r.statusPrestacao !== 'Retornou' && r.status !== 'Retornou'
  );
  if(!pendentes.length) return;

  _pendingDayKey = key;
  const list = document.getElementById('pendingList');
  const d = new Date(key+'T12:00:00');
  const dateFmt = d.toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'2-digit'});

  list.innerHTML = pendentes.slice(0,6).map(r => `
    <div class="pending-item">
      <span class="pending-item-name">🚚 ${escHtml(r.nome)}</span>
      <span class="pending-item-date">${dateFmt}</span>
    </div>`).join('') +
    (pendentes.length > 6 ? `<div style="font-size:12px;color:var(--text3);text-align:center;padding:4px">...e mais ${pendentes.length-6} motoristas</div>` : '');

  document.getElementById('pendingAlert').classList.add('open');
}

function closePendingAlert() {
  document.getElementById('pendingAlert').classList.remove('open');
}

function openPendingDay() {
  closePendingAlert();
  if(!_pendingDayKey) return;
  // carrega o dia anterior para edição (modo histórico editável)
  const local = loadDB();
  let rec = local[_pendingDayKey];
  if(!rec) { toast('Registro não encontrado localmente.','t-amber'); return; }

  rows = rec.rows.map(r => ({
    ...r,
    // normalizar campo de status (desktop usa "status", Firestore usa "statusPrestacao")
    status: r.statusPrestacao || r.status || ''
  }));

  document.getElementById('importSection').style.display = 'none';
  document.getElementById('dashboard').style.display     = 'block';

  const d = new Date(_pendingDayKey+'T12:00:00');
  document.getElementById('datePill').textContent =
    d.toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'short',year:'numeric'}) +
    ' ⏰ editando';

  renderDashboard();
  showPage('today');
  toast(`📋 Conferência de ${d.toLocaleDateString('pt-BR')} carregada para edição.`,'t-amber');
}

/* ══════════════════════════════════════════════════════
   SAVE DAY — atualiza campo statusPrestacao para Firestore
══════════════════════════════════════════════════════ */
function saveDay() {
  if(!rows.length) { toast('Nenhum dado para salvar.','t-red'); return; }
  // Se estiver editando uma data histórica, redirecionar para saveHistEdit
  if(_editingHistKey && _editingHistKey !== todayKey()) {
    saveHistEdit(_editingHistKey);
    return;
  }
  const key = todayKey();
  // normalizar: garantir statusPrestacao para compatibilidade com PWA mobile
  const rowsNorm = rows.map(r => ({
    ...r,
    statusPrestacao: r.statusPrestacao || r.status || ''
  }));
  // local
  const dbLocal = loadDB();
  dbLocal[key]  = {date:key, rows:rowsNorm, saved:new Date().toISOString()};
  saveDB(dbLocal);
  // cloud
  if(window.fbSaveToday) window.fbSaveToday(rowsNorm);
  toast('✅ Conferência salva!','t-green');
}

function loadDB()   { try { return JSON.parse(localStorage.getItem(DB_KEY)||'{}'); } catch { return {}; } }
function saveDB(db) { localStorage.setItem(DB_KEY, JSON.stringify(db)); }

/* ══════════════════════════════════════════════════════
   HISTORY
══════════════════════════════════════════════════════ */
async function renderHistory() {
  const grid = document.getElementById('histGrid');
  grid.innerHTML = `<div class="hist-empty"><span class="ei">⏳</span><p>Carregando histórico...</p></div>`;

  // try cloud first
  let dbData = null;
  if(window.fbLoadHistory) dbData = await window.fbLoadHistory();

  // merge with local as fallback
  const localDb = loadDB();
  if(!dbData || !Object.keys(dbData).length) dbData = localDb;
  else {
    // merge: cloud + local
    Object.keys(localDb).forEach(k => { if(!dbData[k]) dbData[k] = localDb[k]; });
  }

  const keys = Object.keys(dbData).sort().reverse();
  if(!keys.length) {
    grid.innerHTML = `<div class="hist-empty"><span class="ei">📭</span><p>Nenhuma conferência salva ainda.</p></div>`;
    return;
  }
  grid.innerHTML = keys.map(k => {
    const rec  = dbData[k];
    const tots = rec.rows.reduce((a,r) => ({
      ctes:  a.ctes  + (r.ctes||0),
      ocorr: a.ocorr + ((r.occCodes&&r.occCodes.length)?1:0),
    }), {ctes:0,ocorr:0});
    const ret  = rec.rows.filter(r => r.statusPrestacao === 'Retornou' || r.status === 'Retornou').length;
    const d    = new Date(k+'T12:00:00');
    const dd   = d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'});
    const wk   = d.toLocaleDateString('pt-BR',{weekday:'long'});
    return `
    <div class="hist-card" onclick="loadHistEntry('${k}', ${JSON.stringify(rec).replace(/"/g,'&quot;')})">
      <div class="hist-card-top">
        <div>
          <div class="hist-date">${dd}</div>
          <div class="hist-weekday">${wk}</div>
        </div>
        <button class="hist-del-btn" onclick="event.stopPropagation();askDeleteHist('${k}')">🗑</button>
      </div>
      <div class="hist-chips">
        <span class="chip chip-blue">📦 ${tots.ctes} CTEs</span>
        <span class="chip chip-green">✅ ${ret} retornaram</span>
        <span class="chip chip-amber">⚠️ ${tots.ocorr} ocorr.</span>
        <span class="chip chip-blue">${rec.rows.length} motoristas</span>
      </div>
    </div>`;
  }).join('');
}

// Chave temporária para edição de dias anteriores
let _editingHistKey = null;
let _todayRowsBackup = null;

function loadHistEntry(key, recData) {
  let rec = recData;
  if(!rec) {
    const dbLocal = loadDB();
    rec = dbLocal[key];
  }
  if(!rec) return;

  const today = todayKey();
  if(key !== today) {
    // Salvar dados do dia atual em backup para restaurar depois
    _editingHistKey = key;
    _todayRowsBackup = rows.length ? [...rows] : null;
    rows = rec.rows.map(r => ({...r})); // cópia independente
    document.getElementById('importSection').style.display = 'none';
    document.getElementById('dashboard').style.display     = 'block';
    renderDashboard();
    const d = new Date(key+'T12:00:00');
    document.getElementById('datePill').textContent =
      '⚠️ EDITANDO: ' + d.toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'short',year:'numeric'});
    // mostrar banner de aviso
    showHistEditBanner(key, d);
    showPage('today');
    toast(`📋 Editando conferência de ${d.toLocaleDateString('pt-BR')} — salve para confirmar.`,'t-amber');
  } else {
    _editingHistKey = null;
    rows = rec.rows;
    document.getElementById('importSection').style.display = 'none';
    document.getElementById('dashboard').style.display     = 'block';
    renderDashboard();
    const d = new Date(key+'T12:00:00');
    document.getElementById('datePill').textContent =
      d.toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'short',year:'numeric'});
    showPage('today');
    toast(`📋 Conferência de hoje carregada.`,'t-green');
  }
}

function showHistEditBanner(key, dateObj) {
  let banner = document.getElementById('histEditBanner');
  if(!banner) {
    banner = document.createElement('div');
    banner.id = 'histEditBanner';
    banner.style.cssText = 'position:fixed;top:68px;left:0;right:0;background:#F59E0B;color:#fff;padding:10px 20px;font-size:13px;font-weight:700;z-index:300;display:flex;align-items:center;justify-content:space-between;gap:12px;';
    document.body.appendChild(banner);
  }
  banner.innerHTML = `
    <span>⚠️ Você está editando a conferência de ${dateObj.toLocaleDateString('pt-BR')} — alterações serão salvas SOMENTE nessa data.</span>
    <div style="display:flex;gap:8px">
      <button onclick="saveHistEdit('${key}')" style="background:#fff;color:#F59E0B;border:none;padding:6px 14px;border-radius:8px;font-weight:700;cursor:pointer">💾 Salvar nessa data</button>
      <button onclick="cancelHistEdit()" style="background:rgba(255,255,255,0.2);color:#fff;border:1px solid rgba(255,255,255,0.4);padding:6px 14px;border-radius:8px;font-weight:700;cursor:pointer">✕ Cancelar</button>
    </div>`;
  banner.style.display = 'flex';
}

function saveHistEdit(key) {
  // Salva APENAS na data histórica, sem tocar no dia atual
  const entry = {date:key, rows:[...rows], saved:new Date().toISOString(), _histEdit: true};
  const dbLocal = loadDB();
  dbLocal[key] = entry;
  saveDB(dbLocal);
  // também salva no Firebase na key correta
  if(window.fbDB) {
    try {
      window.fbDB.collection('conferencias').doc(key).set(entry);
    } catch(e) {}
  }
  toast(`✅ Conferência de ${new Date(key+'T12:00:00').toLocaleDateString('pt-BR')} salva!`,'t-green');
  cancelHistEdit();
}

function cancelHistEdit() {
  _editingHistKey = null;
  // Restaurar dados do dia atual se existiam
  if(_todayRowsBackup) {
    rows = _todayRowsBackup;
    _todayRowsBackup = null;
    renderDashboard();
  } else {
    rows = [];
    document.getElementById('importSection').style.display = 'block';
    document.getElementById('dashboard').style.display = 'none';
  }
  updateDatePill();
  const banner = document.getElementById('histEditBanner');
  if(banner) banner.style.display = 'none';
  showPage('history');
}

function askDeleteHist(key) { deleteHistKey=key; openModal('modalDelHist'); }
function confirmDeleteHist() {
  if(!deleteHistKey) return;
  const dbLocal = loadDB();
  delete dbLocal[deleteHistKey];
  saveDB(dbLocal);
  if(window.fbDeleteHistEntry) window.fbDeleteHistEntry(deleteHistKey);
  closeModal('modalDelHist');
  renderHistory();
  deleteHistKey = null;
  toast('🗑️ Conferência excluída.','');
}

/* ══════════════════════════════════════════════════════
   NEW DAY
══════════════════════════════════════════════════════ */
function confirmNewDay() {
  if(!rows.length) { startNewDay(); return; }
  openModal('modalNewDay');
}
function startNewDay() {
  rows = [];
  closeModal('modalNewDay');
  document.getElementById('importSection').style.display = 'block';
  document.getElementById('dashboard').style.display     = 'none';
  document.getElementById('fileInput').value='';
  document.getElementById('searchInput').value='';
  updateDatePill();
  localStorage.removeItem(AS_KEY);
  showPage('today');
  if(chartPrest) { chartPrest.destroy(); chartPrest=null; }
  if(chartOcorr) { chartOcorr.destroy(); chartOcorr=null; }
}

/* ══════════════════════════════════════════════════════
   EXPORT XLSX
══════════════════════════════════════════════════════ */
function exportXLSX() {
  if(!rows.length) { toast('Nenhum dado para exportar.','t-red'); return; }
  const data=[['Motorista','Placa','CTEs','Status Prestação','Ocorrências','Descrições','Observações']];
  rows.forEach(r => {
    const codes = (r.occCodes||[]).join(', ');
    const descs = (r.occCodes||[]).map(c => getOccLabel(c)).join(' | ');
    data.push([r.nome, r.placa, r.ctes, r.status||'', codes, descs, r.obs||'']);
  });
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'CONFERÊNCIA');
  const d = new Date();
  XLSX.writeFile(wb, `Conferencia_${d.toLocaleDateString('pt-BR').replace(/\//g,'-')}.xlsx`);
  toast('⬇️ Excel exportado!','t-green');
}

function exportAllXLSX() {
  const db   = loadDB();
  const keys = Object.keys(db).sort();
  if(!keys.length) { toast('Nenhum histórico para exportar.','t-amber'); return; }
  const wb = XLSX.utils.book_new();
  keys.forEach(k => {
    const rec = db[k];
    const data=[['Motorista','Placa','CTEs','Status','Ocorrências','Descrições','Observações']];
    rec.rows.forEach(r => {
      const codes = (r.occCodes||[]).join(', ');
      const descs = (r.occCodes||[]).map(c => getOccLabel(c)).join(' | ');
      data.push([r.nome,r.placa,r.ctes,r.status||'',codes,descs,r.obs||'']);
    });
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, k);
  });
  XLSX.writeFile(wb, `Historico_Conferencias.xlsx`);
  toast('⬇️ Histórico exportado!','t-green');
}

/* ══════════════════════════════════════════════════════
   MODALS / TOAST
══════════════════════════════════════════════════════ */
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

/* ══════════════════════════════════════════════════════
   MÓDULO 12 — CORREÇÃO CRÍTICA: HISTÓRICO PROTEGIDO
══════════════════════════════════════════════════════ */
const HIST_IMMUTABLE_KEY = 'conf_hist_immutable_v1';

function loadImmutableHist() {
  try { return JSON.parse(localStorage.getItem(HIST_IMMUTABLE_KEY)||'{}'); } catch { return {}; }
}
function saveImmutableHist(db) { localStorage.setItem(HIST_IMMUTABLE_KEY, JSON.stringify(db)); }

// Override saveDay to use immutable storage
const _originalSaveDay = window.saveDay;
function saveDay() {
  if(!rows.length) { toast('Nenhum dado para salvar.','t-red'); return; }
  const key = todayKey();
  const rowsNorm = rows.map(r => ({
    ...r,
    statusPrestacao: r.statusPrestacao || r.status || ''
  }));
  const entry = {date:key, rows:rowsNorm, saved:new Date().toISOString()};

  // Salvar no registro mutable normal (para edição do dia corrente)
  const dbLocal = loadDB();
  dbLocal[key]  = entry;
  saveDB(dbLocal);

  // Salvar também no registro imutável (nunca sobrescreve conferências já finalizadas de outros dias)
  const immutableDb = loadImmutableHist();
  // Somente preserva entradas que não são do dia atual (dias anteriores são imutáveis)
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate()-1);
  const yesterdayKey = yesterday.toISOString().slice(0,10);
  // Para o dia corrente, sempre atualiza; para dias anteriores, preserva se já existir
  if(!immutableDb[key] || key === todayKey()) {
    immutableDb[key] = {...entry, _locked: false};
  }
  saveImmutableHist(immutableDb);

  // cloud
  if(window.fbSaveToday) window.fbSaveToday(rowsNorm);
  toast('✅ Conferência salva e protegida!','t-green');
}

// Protege entradas antigas do dia anterior em diante
function lockPreviousDays() {
  const key = todayKey();
  const immDb = loadImmutableHist();
  let changed = false;
  Object.keys(immDb).forEach(k => {
    if(k < key && !immDb[k]._locked) {
      immDb[k]._locked = true;
      changed = true;
    }
  });
  if(changed) saveImmutableHist(immDb);
}

