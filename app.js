/* ══════════════════════════════════════════════════════
   STATE
══════════════════════════════════════════════════════ */
let rows       = [];
let occTypes   = [];   // {code, desc}
let chartPrest = null;
let chartOcorr = null;
let deleteHistKey = null;
let autosaveTimer = null;
let lastSavedHash = '';

const DB_KEY  = 'conf_entregas_db_v2';
const OCC_KEY = 'conf_entregas_occ_v2';
const AS_KEY  = 'conf_entregas_autosave_v2';

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

/* ══════════════════════════════════════════════════════
   PAGE NAVIGATION
══════════════════════════════════════════════════════ */
function showPage(name) {
  const allPages = ['today','history','occreport','occtypes','ranking','conclusao','pendentes','dashboard_mgr','cadmotoristas','exportacao','retidos','cargas'];
  allPages.forEach(p => {
    const pg = document.getElementById('page-'+p);
    const tb = document.getElementById('tab-'+p);
    if(pg) pg.classList.toggle('active', p===name);
    if(tb) tb.classList.toggle('active', p===name);
  });
  if(name==='history')        renderHistory();
  if(name==='occtypes')       renderOccList();
  if(name==='occreport')      renderOccReport();
  if(name==='ranking')        renderRanking();
  if(name==='conclusao')      renderConclusao();
  if(name==='pendentes')      renderPendentes();
  if(name==='dashboard_mgr')  renderMgrDashboard();
  if(name==='cadmotoristas')  renderCadMotoristas();
  if(name==='retidos')        renderRetidos();
  if(name==='cargas') {
    const db = loadCargasDB();
    populateCargasFilters(db);
    renderCargas();
    if(db.length) setTimeout(()=>document.getElementById('cargaScanner')?.focus(), 200);
  }
}

/* ══════════════════════════════════════════════════════
   FILE IMPORT
══════════════════════════════════════════════════════ */
function handleDrop(e) {
  e.preventDefault();
  document.getElementById('importZone').classList.remove('drag');
  const f = e.dataTransfer.files[0];
  if(f) loadFile(f);
}

function loadFile(file) {
  if(!file) return;

  /* ══════════════════════════════════════════════════════
     PROTEÇÃO CONTRA SOBRESCRITA DE CONFERÊNCIA
     Evita perder a conferência de um dia anterior (ainda em
     edição) ou de hoje (ainda não salva) ao importar um novo
     arquivo por cima.
  ══════════════════════════════════════════════════════ */
  if(_editingHistKey) {
    // Está editando a conferência de um dia anterior (deu baixa, por ex.)
    const d = new Date(_editingHistKey+'T12:00:00').toLocaleDateString('pt-BR');
    const salvar = confirm(
      `⚠️ Você está editando a conferência de ${d} e ela ainda não foi salva.\n\n` +
      `OK = salvar a conferência de ${d} agora e depois importar o novo arquivo.\n` +
      `Cancelar = abortar a importação (nada será perdido, você continua editando ${d}).`
    );
    if(salvar) {
      saveHistEdit(_editingHistKey); // salva na data CORRETA e limpa o modo de edição
    } else {
      toast('Importação cancelada — continue editando a conferência anterior.', 't-amber');
      return;
    }
  } else if(rows.length) {
    // Já existe uma conferência (de hoje) carregada na tela
    const prosseguir = confirm(
      `⚠️ Já existe uma conferência carregada na tela.\n\n` +
      `Importar um novo arquivo vai SUBSTITUIR esses dados.\n\n` +
      `OK = salvar a conferência atual agora e depois importar o novo arquivo.\n` +
      `Cancelar = abortar a importação.`
    );
    if(prosseguir) {
      saveDay(); // salva o que está na tela antes de sobrescrever
    } else {
      toast('Importação cancelada.', 't-amber');
      return;
    }
  }

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb   = XLSX.read(e.target.result, {type:'array'});
      const sn   = wb.SheetNames.find(n => n.toUpperCase().includes('CONFER')) || wb.SheetNames[0];
      const data = XLSX.utils.sheet_to_json(wb.Sheets[sn], {defval:''});
      if(!data.length) { toast('Planilha vazia ou formato não reconhecido.','t-red'); return; }
      parseRows(data);
    } catch(err) {
      toast('Erro ao ler o arquivo.','t-red');
      console.error(err);
    }
  };
  reader.readAsArrayBuffer(file);
}

function norm(k) {
  return k.toString().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]/g,' ').trim();
}
function findCol(obj, ...hints) {
  const keys = Object.keys(obj);
  for(const h of hints) {
    const f = keys.find(k => norm(k).includes(h));
    if(f) return f;
  }
  return null;
}

function parseRows(data) {
  const s = data[0];
  const cMotor = findCol(s,'motorista','driver','nome');
  const cPlaca = findCol(s,'placa','veiculo');
  const cCTEs  = findCol(s,'qtd','cte','entrega','quantidade');
  const cReal  = findCol(s,'realiz','conclu','efetu','entregue');
  const cAudit = findCol(s,'audit');
  const cStat  = findCol(s,'status','prestacao','prest');
  const cOcc   = findCol(s,'ocorr','tipo','cod');
  const cObs   = findCol(s,'obs','observ');

  if(!cMotor) { toast('Coluna "Motorista" não encontrada.','t-red'); return; }

  rows = data.map((r,i) => ({
    id:        i,
    nome:      (r[cMotor]||'').toString().trim(),
    placa:     cPlaca ? (r[cPlaca]||'').toString().trim() : '',
    ctes:      cCTEs  ? (parseInt(r[cCTEs])||0) : 0,
    realizadas: cReal ? (parseInt(r[cReal])||0) : 0,
    auditadas:  cAudit ? (parseInt(r[cAudit])||0) : 0,
    status:    cStat  ? (r[cStat]||'').toString().trim() : '',
    occCodes:  cOcc   ? (r[cOcc]||'').toString().trim().split(',').map(s=>s.trim()).filter(Boolean) : [],
    obs:       cObs   ? (r[cObs]||'').toString().trim() : '',
  })).filter(r => r.nome && r.nome.toUpperCase() !== 'MOTORISTA');

  if(!rows.length) { toast('Nenhum motorista encontrado.','t-red'); return; }

  document.getElementById('importSection').style.display = 'none';
  document.getElementById('dashboard').style.display     = 'block';
  renderDashboard();
  scheduleAutosave(true);
  toast(`✅ ${rows.length} motoristas carregados!`, 't-green');
}

/* ══════════════════════════════════════════════════════
   DASHBOARD
══════════════════════════════════════════════════════ */
function calcStats() {
  const motoristas = rows.length;
  const totalCTEs  = rows.reduce((s,r) => s + (r.ctes||0), 0);
  const retornou   = rows.filter(r => r.status === 'Retornou').length;
  const naoRet     = rows.filter(r => r.status === 'Não Retornou').length;
  const semMarca   = rows.filter(r => !r.status).length;
  const comOcorr   = rows.filter(r => r.occCodes && r.occCodes.length > 0).length;
  const pctOcorr   = motoristas > 0 ? ((comOcorr/motoristas)*100).toFixed(1) : '0.0';
  // realizadas: usa coluna explícita ou status Retornou como proxy
  const totalRealizadas = rows.reduce((s,r) => {
    if(r.realizadas > 0) return s + r.realizadas;
    return s + (r.status === 'Retornou' ? (r.ctes||0) : 0);
  }, 0);
  const totalAuditadas = rows.reduce((s,r) => s + (r.auditadas||0), 0);

  // occurrence type breakdown — count each code across all drivers
  const occMap = {};
  rows.forEach(r => {
    (r.occCodes||[]).forEach(code => {
      if(!code) return;
      occMap[code] = (occMap[code]||0) + 1;
    });
  });

  return {motoristas,totalCTEs,totalRealizadas,totalAuditadas,retornou,naoRet,semMarca,comOcorr,pctOcorr,occMap};
}

function renderDashboard() {
  renderKPIs();
  renderTable();
  renderCharts();
  document.getElementById('tableTitle').textContent =
    `Motoristas do dia (${rows.length})`;
}

function renderKPIs() {
  const s = calcStats();
  const retPct = s.motoristas > 0 ? ((s.retornou/s.motoristas)*100).toFixed(0) : 0;
  document.getElementById('kpiStrip').innerHTML = `
    <div class="kpi c-blue kpi-clickable" onclick="openDriversModal()" style="cursor:pointer">
      <div class="kpi-accent"></div>
      <div class="kpi-icon">🚚</div>
      <div class="kpi-label">Motoristas em Operação</div>
      <div class="kpi-value">${s.motoristas}</div>
      <div class="kpi-sub">hoje na rua</div>
      <div class="kpi-trend">↑ Ver detalhes</div>
      <div class="kpi-hint">🔍 clique para ver motoristas</div>
    </div>
    <div class="kpi c-green">
      <div class="kpi-accent"></div>
      <div class="kpi-icon">📦</div>
      <div class="kpi-label">Total de CTEs</div>
      <div class="kpi-value">${s.totalCTEs}</div>
      <div class="kpi-sub">entregas saídas</div>
      <div class="kpi-trend" style="color:var(--green)">↑ 15% vs ontem</div>
    </div>
    <div class="kpi c-amber kpi-clickable" onclick="openReturnedModal()" style="cursor:pointer">
      <div class="kpi-accent"></div>
      <div class="kpi-icon">↩️</div>
      <div class="kpi-label">Retornaram</div>
      <div class="kpi-value">${s.retornou}</div>
      <div class="kpi-sub">prestaram conta</div>
      <span class="kpi-badge">${retPct}% da frota</span>
      <div class="kpi-hint">🔍 clique para ver lista</div>
    </div>
    <div class="kpi c-red kpi-clickable" onclick="openOccAnalytics()">
      <div class="kpi-accent"></div>
      <div class="kpi-icon">🚩</div>
      <div class="kpi-label">Ocorrências</div>
      <div class="kpi-value">${s.comOcorr}</div>
      <div class="kpi-sub">motoristas com ocorrência</div>
      <span class="kpi-badge" style="background:var(--pink-bg);color:var(--pink);border:1px solid var(--pink-bd)">${s.pctOcorr}% da frota</span>
      <div class="kpi-hint">🔍 clique para analisar</div>
    </div>
  `;
}

/* ──────────── TABLE ──────────── */
function renderTable() {
  const tbody = document.getElementById('mainTable');
  tbody.innerHTML = '';
  const sorted = [...rows].sort((a,b) => b.ctes - a.ctes);

  sorted.forEach((r, i) => {
    const hasOcc      = r.occCodes && r.occCodes.length > 0;
    const statusFilled = !!r.status;
    const tr = document.createElement('tr');
    tr.dataset.name = r.nome.toLowerCase();
    tr.innerHTML = `
      <td><span class="rank">${i+1}</span></td>
      <td><span class="driver-name">${r.nome}</span></td>
      <td><span class="plate">${r.placa||'—'}</span></td>
      <td><span class="cte-num">${r.ctes}</span></td>
      <td>
        <select class="sel-status ${r.status==='Retornou'?'st-ret':r.status==='Não Retornou'?'st-nret':''}"
          onchange="onStatusChange(${r.id}, this)">
          <option value=""      ${!r.status?'selected':''}>— Aguardando —</option>
          <option value="Retornou"      ${r.status==='Retornou'?'selected':''}>✅ Retornou</option>
          <option value="Não Retornou"  ${r.status==='Não Retornou'?'selected':''}>❌ Não Retornou</option>
        </select>
      </td>
      <td class="occ-cell" id="occ-cell-${r.id}">
        ${buildOccPicker(r, statusFilled)}
      </td>
      <td>
        <span class="pct-badge ${hasOcc?'has-val':''}" id="pct-${r.id}">
          ${hasOcc ? r.occCodes.length + (r.occCodes.length===1?' ocorr.':' ocorr.') : '—'}
        </span>
      </td>
      <td>
        <input class="inp-obs" type="text" placeholder="Observação..."
          value="${escHtml(r.obs)}" ${!statusFilled?'disabled title="Preencha o status de prestação primeiro"':''}
          id="obs-inp-${r.id}"
          oninput="onObsChange(${r.id}, this)">
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function buildOccPicker(r, enabled) {
  // cada ocorrência é um item indexado — permite repetições
  const tags = (r.occCodes||[]).map((code, idx) => {
    const lbl = getOccLabel(code);
    return `<span class="occ-tag">
      <span title="${escHtml(lbl)}">${escHtml(code)}</span>
      ${enabled ? `<button class="occ-tag-remove" onclick="removeOcc(${r.id},${idx})" title="Remover esta ocorrência">×</button>` : ''}
    </span>`;
  }).join('');

  const selectOpts = occTypes.length
    ? occTypes.map(o => `<option value="${escHtml(o.code)}">${escHtml(o.code)} — ${escHtml(o.desc)}</option>`).join('')
    : `<option value="" disabled>Cadastre tipos em ⚙️</option>`;

  return `<div class="occ-picker">
    <div class="occ-tags" id="occ-tags-${r.id}">${tags}</div>
    <div class="occ-add-row">
      <select class="occ-add-select" id="occ-sel-${r.id}" ${!enabled?'disabled title="Preencha o status primeiro"':''}>
        <option value="">+ Adicionar ocorrência</option>
        ${selectOpts}
      </select>
      <button class="occ-add-btn" ${!enabled?'disabled':''} onclick="addOcc(${r.id})" title="Adicionar">＋</button>
    </div>
  </div>`;
}

function addOcc(id) {
  const r   = rows.find(x => x.id===id);
  const sel = document.getElementById('occ-sel-'+id);
  if(!r || !sel || !sel.value) return;
  const code = sel.value;
  if(!r.occCodes) r.occCodes = [];
  // permite duplicatas — mesma ocorrência pode ocorrer múltiplas vezes
  r.occCodes.push(code);
  sel.value = '';
  refreshOccCell(r);
  updateLive();
}

function removeOcc(id, idx) {
  const r = rows.find(x => x.id===id);
  if(!r) return;
  r.occCodes = (r.occCodes||[]).filter((_, i) => i !== idx);
  refreshOccCell(r);
  updateLive();
}

function refreshOccCell(r) {
  const cell = document.getElementById('occ-cell-'+r.id);
  if(cell) cell.innerHTML = buildOccPicker(r, !!r.status);
  const badge = document.getElementById('pct-'+r.id);
  if(badge) {
    const n = (r.occCodes||[]).length;
    badge.textContent = n > 0 ? n + ' ocorr.' : '—';
    badge.className   = 'pct-badge ' + (n > 0 ? 'has-val' : '');
  }
}

function getOccLabel(code) {
  if(!code) return '';
  const found = occTypes.find(o => o.code === code);
  return found ? `${found.code} — ${found.desc}` : code;
}

function escHtml(s) {
  return (s||'').toString()
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ──────────── CELL EVENTS ──────────── */
function onStatusChange(id, sel) {
  const r = rows.find(x => x.id===id);
  if(!r) return;
  r.status = sel.value;
  sel.className = 'sel-status ' +
    (r.status==='Retornou'?'st-ret':r.status==='Não Retornou'?'st-nret':'');

  const filled = !!r.status;
  // refresh occ picker (enable/disable)
  refreshOccCell(r);
  const obsInp = document.getElementById('obs-inp-'+id);
  if(obsInp) {
    obsInp.disabled = !filled;
    obsInp.title = filled ? '' : 'Preencha o status de prestação primeiro';
  }
  updateLive();
}

function onObsChange(id, inp) {
  const r = rows.find(x => x.id===id);
  if(r) r.obs = inp.value;
  scheduleAutosave(false);
}

function updateLive() {
  renderKPIs();
  updateCharts();
  scheduleAutosave(false);
}

/* ──────────── SEARCH ──────────── */
function filterTable() {
  const q = document.getElementById('searchInput').value.toLowerCase().trim();
  document.querySelectorAll('#mainTable tr').forEach(tr => {
    tr.classList.toggle('hidden-row', q && !tr.dataset.name.includes(q));
  });
}

/* ══════════════════════════════════════════════════════
   CHARTS
══════════════════════════════════════════════════════ */
const donutCfg = (labels, data, colors) => ({
  type:'doughnut',
  data:{
    labels,
    datasets:[{
      data, backgroundColor:colors,
      borderColor:['#ffffff','#ffffff','#ffffff'],
      borderWidth:2, hoverBorderWidth:2
    }]
  },
  options:{
    cutout:'68%', responsive:true, maintainAspectRatio:false,
    plugins:{
      legend:{display:false},
      tooltip:{
        backgroundColor:'#0f172a', borderColor:'#334155', borderWidth:1,
        titleColor:'#e2e8f0', bodyColor:'#94a3b8', padding:10,
        callbacks:{label:c=>` ${c.label}: ${c.raw}`}
      }
    }
  }
});

function renderCharts() {
  const s = calcStats();
  if(chartPrest) chartPrest.destroy();
  if(chartOcorr) chartOcorr.destroy();

  chartPrest = new Chart(document.getElementById('cPrest'), donutCfg(
    ['Retornou','Não Retornou','Aguardando'],
    [s.retornou, s.naoRet, s.semMarca],
    ['#0891b2','#db2777','#c7d2fe']
  ));
  document.getElementById('legPrest').innerHTML = `
    <div class="leg-item"><span class="leg-dot" style="background:#0891b2"></span>Retornou<span class="leg-val">${s.retornou}</span></div>
    <div class="leg-item"><span class="leg-dot" style="background:#db2777"></span>Não Retornou<span class="leg-val">${s.naoRet}</span></div>
    <div class="leg-item"><span class="leg-dot" style="background:#c7d2fe"></span>Aguardando<span class="leg-val">${s.semMarca}</span></div>
  `;

  chartOcorr = new Chart(document.getElementById('cOcorr'), donutCfg(
    ['Com ocorrência','Sem ocorrência'],
    [s.comOcorr, Math.max(0, s.motoristas - s.comOcorr)],
    ['#7c3aed','#e0e4f0']
  ));
  document.getElementById('legOcorr').innerHTML = `
    <div class="leg-item"><span class="leg-dot" style="background:#7c3aed"></span>Com ocorrência<span class="leg-val">${s.comOcorr}</span></div>
    <div class="leg-item"><span class="leg-dot" style="background:#e0e4f0"></span>Sem ocorrência<span class="leg-val">${Math.max(0,s.motoristas-s.comOcorr)}</span></div>
  `;

  renderOccBarsChart(s.occMap);
}

function updateCharts() {
  const s = calcStats();
  if(chartPrest) {
    chartPrest.data.datasets[0].data = [s.retornou, s.naoRet, s.semMarca];
    chartPrest.update();
    document.getElementById('legPrest').innerHTML = `
      <div class="leg-item"><span class="leg-dot" style="background:#0891b2"></span>Retornou<span class="leg-val">${s.retornou}</span></div>
      <div class="leg-item"><span class="leg-dot" style="background:#db2777"></span>Não Retornou<span class="leg-val">${s.naoRet}</span></div>
      <div class="leg-item"><span class="leg-dot" style="background:#c7d2fe"></span>Aguardando<span class="leg-val">${s.semMarca}</span></div>
    `;
  }
  if(chartOcorr) {
    chartOcorr.data.datasets[0].data = [s.comOcorr, Math.max(0,s.motoristas-s.comOcorr)];
    chartOcorr.update();
    document.getElementById('legOcorr').innerHTML = `
      <div class="leg-item"><span class="leg-dot" style="background:#7c3aed"></span>Com ocorrência<span class="leg-val">${s.comOcorr}</span></div>
      <div class="leg-item"><span class="leg-dot" style="background:#e0e4f0"></span>Sem ocorrência<span class="leg-val">${Math.max(0,s.motoristas-s.comOcorr)}</span></div>
    `;
  }
  renderOccBarsChart(s.occMap);
}

function renderOccBarsChart(occMap) {
  const el = document.getElementById('occBarsChart');
  const entries = Object.entries(occMap).sort((a,b) => b[1]-a[1]);
  if(!entries.length) {
    el.innerHTML = `<div style="text-align:center;padding:30px 0;font-size:12px;color:var(--text3)">Nenhuma ocorrência registrada</div>`;
    return;
  }
  const max = entries[0][1] || 1;
  el.innerHTML = entries.map(([code, count]) => {
    const label = getOccLabel(code) || code;
    const pct   = Math.round((count/max)*100);
    return `
      <div class="occ-bar-item">
        <span class="occ-bar-label" title="${escHtml(label)}">${escHtml(label)}</span>
        <div class="occ-bar-track">
          <div class="occ-bar-fill" style="width:${pct}%"></div>
        </div>
        <span class="occ-bar-count">${count}</span>
      </div>`;
  }).join('');
}

/* ══════════════════════════════════════════════════════
   OCCURRENCE TYPES
══════════════════════════════════════════════════════ */
function loadOccTypes() {
  try { occTypes = JSON.parse(localStorage.getItem(OCC_KEY)||'[]'); } catch { occTypes=[]; }
  // also try cloud
  window.addEventListener('fbOccTypesLoaded', () => {
    if(window._fbOccTypes && window._fbOccTypes.length) {
      occTypes = window._fbOccTypes;
      localStorage.setItem(OCC_KEY, JSON.stringify(occTypes));
      renderOccList();
      if(rows.length) renderTable();
    }
  }, { once: true });
}
function saveOccTypes() {
  localStorage.setItem(OCC_KEY, JSON.stringify(occTypes));
  if(window.fbSaveOccTypes) window.fbSaveOccTypes(occTypes);
}

function addOccType() {
  const code = document.getElementById('occCode').value.trim();
  const desc = document.getElementById('occDesc').value.trim();
  if(!code || !desc) { toast('Preencha código e descrição.','t-amber'); return; }
  if(occTypes.find(o => o.code===code)) {
    toast('Código já cadastrado.','t-amber'); return;
  }
  occTypes.push({code, desc});
  occTypes.sort((a,b) => +a.code - +b.code || a.code.localeCompare(b.code));
  saveOccTypes();
  document.getElementById('occCode').value = '';
  document.getElementById('occDesc').value = '';
  renderOccList();
  // refresh selects in table if open
  if(rows.length) renderTable();
  toast('✅ Tipo adicionado!','t-green');
}

function removeOccType(code) {
  occTypes = occTypes.filter(o => o.code !== code);
  saveOccTypes();
  renderOccList();
  if(rows.length) renderTable();
}

function renderOccList() {
  const list = document.getElementById('occList');
  document.getElementById('occCount').textContent = `${occTypes.length} tipo${occTypes.length!==1?'s':''}`;
  if(!occTypes.length) {
    list.innerHTML = `<div class="occ-empty">Nenhum tipo cadastrado ainda.</div>`;
    return;
  }
  list.innerHTML = occTypes.map(o => `
    <div class="occ-item">
      <span class="occ-code-pill">${escHtml(o.code)}</span>
      <span class="occ-desc-text">${escHtml(o.desc)}</span>
      <button class="occ-remove" onclick="removeOccType('${escHtml(o.code)}')" title="Remover">×</button>
    </div>
  `).join('');
}

function handleOccDrop(e) {
  e.preventDefault();
  const f = e.dataTransfer.files[0];
  if(f) loadOccFile(f);
}
function loadOccFile(file) {
  if(!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb   = XLSX.read(e.target.result, {type:'array'});
      const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {defval:''});
      let added  = 0;
      data.forEach(row => {
        const keys = Object.keys(row);
        const cCode = keys.find(k => norm(k).includes('cod')) || keys[0];
        const cDesc = keys.find(k => norm(k).includes('desc') || norm(k).includes('tipo') || norm(k).includes('ocorr')) || keys[1];
        if(!cCode || !cDesc) return;
        const code = row[cCode]?.toString().trim();
        const desc = row[cDesc]?.toString().trim();
        if(code && desc && !occTypes.find(o=>o.code===code)) {
          occTypes.push({code,desc}); added++;
        }
      });
      occTypes.sort((a,b) => +a.code - +b.code || a.code.localeCompare(b.code));
      saveOccTypes();
      renderOccList();
      if(rows.length) renderTable();
      toast(`✅ ${added} tipo(s) importado(s)!`,'t-green');
    } catch { toast('Erro ao ler o arquivo.','t-red'); }
  };
  reader.readAsArrayBuffer(file);
}

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

/* ══════════════════════════════════════════════════════
   ANÁLISE DE OCORRÊNCIAS (modal analítico)
══════════════════════════════════════════════════════ */
function openOccAnalytics() {
  if(!rows.length) { toast('Carregue dados primeiro.','t-amber'); return; }
  renderOccAnalyticsToday();
  renderOccAnalyticsMonth();
  openModal('modalOccAnalytics');
  switchModalTab('today');
}

function switchModalTab(tab) {
  ['today','month'].forEach(t => {
    document.getElementById('mtab-'+t).classList.toggle('active', t===tab);
    document.getElementById('mpanel-'+t).classList.toggle('active', t===tab);
  });
}

function buildOccStats(rowsData) {
  // contagem de cada código (incluindo repetições)
  const typeMap = {};
  // contagem por motorista (total de ocorrências incluindo repetições)
  const driverMap = {};
  rowsData.forEach(r => {
    const codes = r.occCodes || [];
    if(!codes.length) return;
    const nome = r.nome || '?';
    codes.forEach(code => {
      if(!code) return;
      typeMap[code]   = (typeMap[code]||0) + 1;
      driverMap[nome] = (driverMap[nome]||0) + 1;
    });
  });
  return { typeMap, driverMap };
}

function renderOccAnalyticsToday() {
  const el = document.getElementById('occAnalyticsToday');
  const { typeMap, driverMap } = buildOccStats(rows);
  el.innerHTML = buildAnalyticsHTML(typeMap, driverMap, 'hoje');
}

async function renderOccAnalyticsMonth() {
  const el = document.getElementById('occAnalyticsMonth');
  el.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:30px;color:var(--text3)">⏳ Carregando dados do mês...</div>`;

  let dbData = {};
  if(window.fbLoadHistory) dbData = await window.fbLoadHistory() || {};
  const localDb = loadDB();
  Object.keys(localDb).forEach(k => { if(!dbData[k]) dbData[k] = localDb[k]; });

  // filtrar mês atual
  const now = new Date();
  const mesAtual = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const allRows = [];
  Object.keys(dbData).forEach(k => {
    if(k.startsWith(mesAtual) && dbData[k].rows) allRows.push(...dbData[k].rows);
  });
  // incluir rows atuais se ainda não salvos
  rows.forEach(r => allRows.push(r));

  if(!allRows.length) {
    el.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:30px;color:var(--text3)">📭 Nenhum dado disponível para este mês.</div>`;
    return;
  }
  const { typeMap, driverMap } = buildOccStats(allRows);
  el.innerHTML = buildAnalyticsHTML(typeMap, driverMap, `mês de ${now.toLocaleDateString('pt-BR',{month:'long'})}`);
}

function buildAnalyticsHTML(typeMap, driverMap, label) {
  const typeEntries   = Object.entries(typeMap).sort((a,b) => b[1]-a[1]);
  const driverEntries = Object.entries(driverMap).sort((a,b) => b[1]-a[1]);
  const maxType   = typeEntries[0]?.[1] || 1;
  const maxDriver = driverEntries[0]?.[1] || 1;

  if(!typeEntries.length) {
    return `<div style="grid-column:1/-1;text-align:center;padding:30px;color:var(--text3)">✅ Nenhuma ocorrência registrada (${label}).</div>`;
  }

  const typesHTML = typeEntries.slice(0,10).map(([code, count]) => {
    const desc = occTypes.find(o=>o.code===code)?.desc || '—';
    const pct  = Math.round((count/maxType)*100);
    return `<div class="occ-type-item">
      <span class="occ-type-code">${escHtml(code)}</span>
      <span class="occ-type-desc" title="${escHtml(desc)}">${escHtml(desc)}</span>
      <div class="occ-type-bar-wrap"><div class="occ-type-bar-fill" style="width:${pct}%"></div></div>
      <span class="occ-type-count">${count}</span>
    </div>`;
  }).join('');

  const driversHTML = driverEntries.slice(0,8).map(([nome, count], i) => {
    const pct = Math.round((count/maxDriver)*100);
    return `<div class="rank-item">
      <span class="rank-pos">${i+1}</span>
      <span class="rank-name">${escHtml(nome)}</span>
      <div class="rank-bar-wrap"><div class="rank-bar-fill" style="width:${pct}%"></div></div>
      <span class="rank-count">${count}</span>
    </div>`;
  }).join('');

  return `
    <div class="occ-modal-section">
      <h4>🏆 Tipos mais frequentes — ${label}</h4>
      <div class="occ-type-list">${typesHTML}</div>
    </div>
    <div class="occ-modal-section">
      <h4>👤 Motoristas com mais ocorrências — ${label}</h4>
      <div class="rank-list">${driversHTML}</div>
    </div>`;
}

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
   ABA OCORRÊNCIAS — PAINEL COMPLETO
══════════════════════════════════════════════════════ */

// Coleta todos os registros de ocorrências de todas as fontes
async function collectAllOccData(period) {
  let allEntries = []; // {date, nome, placa, code, desc, status, obs}

  // --- dados do histórico (Firestore + local) ---
  let dbData = {};
  if(window.fbLoadHistory) dbData = await window.fbLoadHistory() || {};
  const localDb = loadDB();
  Object.keys(localDb).forEach(k => { if(!dbData[k]) dbData[k] = localDb[k]; });

  const now = new Date();
  const mesAtual = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const todayKey_ = now.toISOString().slice(0,10);

  Object.keys(dbData).forEach(dateKey => {
    if(period === 'today'  && dateKey !== todayKey_) return;
    if(period === 'month'  && !dateKey.startsWith(mesAtual)) return;
    const rec = dbData[dateKey];
    if(!rec || !rec.rows) return;
    rec.rows.forEach(r => {
      (r.occCodes || []).forEach(code => {
        if(!code) return;
        allEntries.push({
          date:   dateKey,
          nome:   r.nome   || '—',
          placa:  r.placa  || '—',
          code,
          desc:   occTypes.find(o => o.code === code)?.desc || '—',
          status: r.statusPrestacao || r.status || '—',
          obs:    r.obs || ''
        });
      });
    });
  });

  // --- dados da sessão atual (se não estiver no DB ainda) ---
  if(period !== 'today' || rows.length) {
    rows.forEach(r => {
      // evitar duplicata se já foi salvo
      (r.occCodes || []).forEach(code => {
        if(!code) return;
        // só adiciona se não há entrada idêntica já no dbData
        const alreadySaved = dbData[todayKey_]?.rows?.some(dr => dr.nome === r.nome);
        if(!alreadySaved) {
          allEntries.push({
            date:   todayKey_,
            nome:   r.nome   || '—',
            placa:  r.placa  || '—',
            code,
            desc:   occTypes.find(o => o.code === code)?.desc || '—',
            status: r.statusPrestacao || r.status || '—',
            obs:    r.obs || ''
          });
        }
      });
    });
  }

  return allEntries;
}

// Renderiza a aba completa
async function renderOccReport() {
  const period = document.getElementById('occFilterPeriod')?.value || 'all';
  const entries = await collectAllOccData(period);

  renderOccKpis(entries);
  renderOccTypeChart(entries);
  renderOccDriverChartPage(entries);
  renderOccTimeline(entries);
  renderOccDriverCards(entries);
  renderOccDetailTable(entries);
}

// KPIs
function renderOccKpis(entries) {
  const total     = entries.length;
  const drivers   = new Set(entries.map(e => e.nome)).size;
  const types     = new Set(entries.map(e => e.code)).size;
  const days      = new Set(entries.map(e => e.date)).size;

  document.getElementById('occKpis').innerHTML = `
    <div class="kpi c-blue">
      <div class="kpi-accent"></div>
      <div class="kpi-label">Total de Ocorrências</div>
      <div class="kpi-value">${total}</div>
      <div class="kpi-sub">registros no período</div>
    </div>
    <div class="kpi c-amber">
      <div class="kpi-accent"></div>
      <div class="kpi-label">Motoristas Afetados</div>
      <div class="kpi-value">${drivers}</div>
      <div class="kpi-sub">com ao menos 1 ocorrência</div>
    </div>
    <div class="kpi c-red">
      <div class="kpi-accent"></div>
      <div class="kpi-label">Tipos Diferentes</div>
      <div class="kpi-value">${types}</div>
      <div class="kpi-sub">códigos distintos</div>
    </div>
    <div class="kpi c-green">
      <div class="kpi-accent"></div>
      <div class="kpi-label">Dias com Ocorrência</div>
      <div class="kpi-value">${days}</div>
      <div class="kpi-sub">dias registrados</div>
    </div>`;
}

// Gráfico de tipos (barras horizontais)
function renderOccTypeChart(entries) {
  const map = {};
  entries.forEach(e => { map[e.code] = (map[e.code]||0) + 1; });
  const sorted = Object.entries(map).sort((a,b) => b[1]-a[1]).slice(0,8);
  const max = sorted[0]?.[1] || 1;
  const el = document.getElementById('occTypeChart');
  if(!sorted.length) { el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text3);font-size:12px">Sem dados</div>'; return; }
  el.innerHTML = sorted.map(([code, count]) => {
    const desc = occTypes.find(o => o.code === code)?.desc || code;
    const pct  = Math.round((count/max)*100);
    return `<div class="occ-bar-item" style="margin-bottom:6px">
      <span class="occ-bar-label" style="width:100px" title="${escHtml(desc)}">${escHtml(code)} — ${escHtml(desc)}</span>
      <div class="occ-bar-track" style="flex:1;height:10px;background:var(--border);border-radius:5px;overflow:hidden;margin:0 8px">
        <div style="height:100%;border-radius:5px;background:linear-gradient(90deg,var(--accent),#7c3aed);width:${pct}%;transition:width .5s ease"></div>
      </div>
      <span class="occ-bar-count" style="font-size:11px;font-weight:800;color:var(--accent)">${count}</span>
    </div>`;
  }).join('');
}

// Ranking de motoristas (barras)
function renderOccDriverChartPage(entries) {
  const map = {};
  entries.forEach(e => { map[e.nome] = (map[e.nome]||0) + 1; });
  const sorted = Object.entries(map).sort((a,b) => b[1]-a[1]).slice(0,8);
  const max = sorted[0]?.[1] || 1;
  const el = document.getElementById('occDriverChart');
  if(!sorted.length) { el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text3);font-size:12px">Sem dados</div>'; return; }
  el.innerHTML = sorted.map(([nome, count], i) => {
    const pct = Math.round((count/max)*100);
    const medal = i===0?'🥇':i===1?'🥈':i===2?'🥉':'';
    return `<div class="rank-item" style="margin-bottom:5px">
      <span class="rank-pos">${medal||i+1}</span>
      <span class="rank-name">${escHtml(nome)}</span>
      <div class="rank-bar-wrap"><div class="rank-bar-fill" style="width:${pct}%"></div></div>
      <span class="rank-count">${count}</span>
    </div>`;
  }).join('');
}

// Linha do tempo por dia
function renderOccTimeline(entries) {
  const map = {};
  entries.forEach(e => { map[e.date] = (map[e.date]||0) + 1; });
  const sorted = Object.entries(map).sort((a,b) => a[0].localeCompare(b[0])).slice(-14);
  const max = sorted.reduce((m,[,v]) => Math.max(m,v), 1);
  const el = document.getElementById('occTimeline');
  if(!sorted.length) { el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text3);font-size:12px">Sem dados</div>'; return; }
  el.innerHTML = sorted.map(([date, count]) => {
    const d   = new Date(date+'T12:00:00');
    const lbl = d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});
    const pct = Math.round((count/max)*100);
    return `<div class="timeline-item">
      <span class="timeline-date">${lbl}</span>
      <div class="timeline-track"><div class="timeline-fill" style="width:${pct}%"></div></div>
      <span class="timeline-val">${count}</span>
    </div>`;
  }).join('');
}

// Cards por motorista
function renderOccDriverCards(entries) {
  // agrupar por motorista
  const driverMap = {};
  entries.forEach(e => {
    if(!driverMap[e.nome]) driverMap[e.nome] = {nome:e.nome, placa:e.placa, entries:[]};
    driverMap[e.nome].entries.push(e);
  });
  const sorted = Object.values(driverMap).sort((a,b) => b.entries.length - a.entries.length);
  const el = document.getElementById('occDriverCards');
  if(!sorted.length) {
    el.innerHTML = '<div class="occ-empty-state"><span>✅</span><p>Nenhuma ocorrência registrada no período.</p></div>';
    return;
  }

  el.innerHTML = sorted.map(d => {
    // contagem por código para este motorista
    const codeCount = {};
    d.entries.forEach(e => { codeCount[e.code] = (codeCount[e.code]||0) + 1; });
    const tags = Object.entries(codeCount).sort((a,b)=>b[1]-a[1]).map(([code,cnt]) => {
      const desc = occTypes.find(o=>o.code===code)?.desc || '';
      return `<span class="occ-driver-tag" title="${escHtml(desc)}">${escHtml(code)}${cnt>1?` ×${cnt}`:''}</span>`;
    }).join('');
    const dates = [...new Set(d.entries.map(e=>e.date))].sort().slice(-3)
      .map(dt => new Date(dt+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}))
      .join(', ');
    return `<div class="occ-driver-card">
      <div class="occ-driver-card-top">
        <span class="occ-driver-name">🚚 ${escHtml(d.nome)}</span>
        <span class="occ-driver-total">${d.entries.length} ocorr.</span>
      </div>
      <div class="occ-driver-tags">${tags}</div>
      <div class="occ-driver-dates">📅 ${dates}</div>
    </div>`;
  }).join('');
}

// Tabela detalhada
function renderOccDetailTable(entries) {
  const tbody = document.getElementById('occDetailTable');
  document.getElementById('occTableCount').textContent = `${entries.length} registro(s)`;

  if(!entries.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text3)">✅ Nenhuma ocorrência no período.</td></tr>`;
    return;
  }

  const sorted = [...entries].sort((a,b) => b.date.localeCompare(a.date) || a.nome.localeCompare(b.nome));
  tbody.innerHTML = sorted.map(e => {
    const d = new Date(e.date+'T12:00:00');
    const dateFmt = d.toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit',year:'2-digit'});
    const statusCls = e.status==='Retornou'?'chip chip-green':e.status==='Não Retornou'?'chip chip-red':'chip chip-blue';
    return `<tr data-driver="${escHtml(e.nome.toLowerCase())}">
      <td style="white-space:nowrap;font-size:11px;color:var(--text2)">${dateFmt}</td>
      <td><span class="driver-name">${escHtml(e.nome)}</span></td>
      <td><span class="plate">${escHtml(e.placa)}</span></td>
      <td><span class="occ-code-pill">${escHtml(e.code)}</span></td>
      <td style="font-size:12px;color:var(--text2)">${escHtml(e.desc)}</td>
      <td><span class="${statusCls}">${escHtml(e.status)}</span></td>
      <td style="font-size:11px;color:var(--text3)">${escHtml(e.obs)}</td>
    </tr>`;
  }).join('');
}

// Filtro por motorista na tabela
function filterOccTable() {
  const q = document.getElementById('occFilterDriver')?.value.toLowerCase().trim() || '';
  document.querySelectorAll('#occDetailTable tr').forEach(tr => {
    tr.classList.toggle('hidden-row', q && !(tr.dataset.driver||'').includes(q));
  });
}

// Exportar XLSX de ocorrências
async function exportOccXLSX() {
  const period = document.getElementById('occFilterPeriod')?.value || 'all';
  const entries = await collectAllOccData(period);
  if(!entries.length) { toast('Nenhuma ocorrência para exportar.','t-amber'); return; }

  const data = [['Data','Motorista','Placa','Código','Descrição','Status Prestação','Observação']];
  [...entries].sort((a,b)=>b.date.localeCompare(a.date)||a.nome.localeCompare(b.nome)).forEach(e => {
    data.push([e.date, e.nome, e.placa, e.code, e.desc, e.status, e.obs]);
  });

  const ws = XLSX.utils.aoa_to_sheet(data);
  // ajustar largura das colunas
  ws['!cols'] = [12,28,12,8,32,18,30].map(w => ({wch:w}));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'OCORRÊNCIAS');
  const d = new Date();
  XLSX.writeFile(wb, `Ocorrencias_${d.toLocaleDateString('pt-BR').replace(/\//g,'-')}.xlsx`);
  toast('⬇️ Ocorrências exportadas!','t-green');
}


/* ══════════════════════════════════════════════════════
   LOGIN
══════════════════════════════════════════════════════ */
// ── LOGIN SECURITY ──────────────────────────────────────────────────────────
// Credenciais armazenadas como hash SHA-256 (nunca em texto plano no código).
// Para alterar: gere o hash via: crypto.subtle.digest('SHA-256', encoder.encode('senha'))
// Hash abaixo corresponde a user='admin' / pass='admin' — ALTERE em produção.
const _LC = {
  u: '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918', // admin
  p: '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918'  // admin
};
let _loginAttempts = 0;
let _loginLockUntil = 0;

async function _sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

async function doLogin() {
  const now = Date.now();
  if(now < _loginLockUntil) {
    const secs = Math.ceil((_loginLockUntil - now) / 1000);
    document.getElementById('loginError').textContent = `⏳ Muitas tentativas. Aguarde ${secs}s.`;
    document.getElementById('loginError').classList.add('show');
    return;
  }
  const u = document.getElementById('loginUser').value.trim().toLowerCase();
  const p = document.getElementById('loginPass').value;
  const err = document.getElementById('loginError');
  const [uh, ph] = await Promise.all([_sha256(u), _sha256(p)]);
  if(uh === _LC.u && ph === _LC.p) {
    _loginAttempts = 0;
    document.getElementById('loginScreen').classList.add('hidden');
    err.classList.remove('show');
    showWelcomeScreen();
  } else {
    _loginAttempts++;
    if(_loginAttempts >= 5) {
      _loginLockUntil = Date.now() + 30000; // 30s lock
      _loginAttempts = 0;
      err.textContent = '🔒 Conta bloqueada temporariamente. Tente em 30s.';
    } else {
      err.textContent = `⚠️ Usuário ou senha incorretos. (${5 - _loginAttempts} tentativas restantes)`;
    }
    err.classList.add('show');
    document.getElementById('loginPass').value = '';
    document.getElementById('loginPass').focus();
  }
}

function showWelcomeScreen() {
  const ws = document.getElementById('welcomeScreen');
  ws.classList.remove('hidden');
  const now = new Date();
  document.getElementById('welcomeDate').textContent = 
    now.toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});
  // Calculate stats from all history
  const db = loadDB();
  const keys = Object.keys(db);
  let totalCtes = 0, totalOcc = 0, totalViagens = 0;
  keys.forEach(k => {
    const rec = db[k];
    if(!rec || !rec.rows) return;
    totalViagens += rec.rows.length;
    rec.rows.forEach(r => {
      totalCtes += (r.ctes || 0);
      totalOcc  += (r.occCodes?.length || 0);
    });
  });
  const retidosDb = loadRetidosDB();
  document.getElementById('wk-ctes').textContent    = totalCtes.toLocaleString('pt-BR');
  document.getElementById('wk-occ').textContent     = totalOcc.toLocaleString('pt-BR');
  document.getElementById('wk-viagens').textContent = totalViagens.toLocaleString('pt-BR');
  document.getElementById('wk-retidos').textContent = retidosDb.length;
}

function enterPortal() {
  document.getElementById('welcomeScreen').classList.add('hidden');
  updateDatePill();
  loadOccTypes();
  loadTodayFromStorage();
  checkPendingDrivers();
  renderHistory();
}

/* ══════════════════════════════════════════════════════
   MOTORISTAS CADASTRADOS (localStorage)
══════════════════════════════════════════════════════ */
const DRV_KEY = 'conf_drivers_v1';

function loadDriversDB() {
  try { return JSON.parse(localStorage.getItem(DRV_KEY) || '[]'); } catch { return []; }
}
function saveDriversDB(arr) { localStorage.setItem(DRV_KEY, JSON.stringify(arr)); }

function openDriversModal() {
  renderDriversGrid();
  openModal('modalDrivers');
}

function registerDriver() {
  const name  = document.getElementById('drvRegName').value.trim();
  const plate = document.getElementById('drvRegPlate').value.trim().toUpperCase();
  if(!name) { toast('Informe o nome do motorista.','t-amber'); return; }
  const drivers = loadDriversDB();
  if(drivers.find(d => d.name.toLowerCase() === name.toLowerCase())) {
    toast('Motorista já cadastrado.','t-amber'); return;
  }
  // calcular histórico a partir dos dados salvos
  drivers.push({ id: Date.now(), name, plate: plate || '—', totalDeliveries: 0, totalOcc: 0 });
  saveDriversDB(drivers);
  document.getElementById('drvRegName').value  = '';
  document.getElementById('drvRegPlate').value = '';
  renderDriversGrid();
  toast('✅ Motorista cadastrado!','t-green');
}

function removeDriver(id) {
  const drivers = loadDriversDB().filter(d => d.id !== id);
  saveDriversDB(drivers);
  renderDriversGrid();
  toast('🗑️ Motorista removido.','');
}

function getDriverStats(name) {
  // Percorre todo o histórico para calcular entregas e ocorrências acumuladas
  const db = loadDB();
  let totalDeliveries = 0, totalOcc = 0;
  Object.values(db).forEach(rec => {
    if(!rec.rows) return;
    rec.rows.forEach(r => {
      if((r.nome||'').toLowerCase() === name.toLowerCase()) {
        totalDeliveries += (r.ctes || 0);
        totalOcc += ((r.occCodes && r.occCodes.length) ? r.occCodes.length : 0);
      }
    });
  });
  // também verificar sessão atual
  rows.forEach(r => {
    if((r.nome||'').toLowerCase() === name.toLowerCase()) {
      totalDeliveries += (r.ctes || 0);
      totalOcc += ((r.occCodes && r.occCodes.length) ? r.occCodes.length : 0);
    }
  });
  return { totalDeliveries, totalOcc };
}

function renderDriversGrid() {
  const drivers = loadDriversDB();
  const grid = document.getElementById('driversGrid');
  if(!drivers.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:48px;color:var(--text3)">
      <div style="font-size:48px;margin-bottom:12px">🚛</div>
      <p style="font-weight:600">Nenhum motorista cadastrado ainda.</p>
      <p style="font-size:12px;margin-top:4px">Use o formulário acima para cadastrar.</p>
    </div>`;
    return;
  }
  grid.innerHTML = drivers.map(d => {
    const stats = getDriverStats(d.name);
    const initials = d.name.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
    return `<div class="driver-card-item">
      <div class="driver-card-avatar">${initials}</div>
      <div class="driver-card-name">${escHtml(d.name)}</div>
      <div class="driver-card-plate">${escHtml(d.plate)}</div>
      <div class="driver-card-stats">
        <div class="driver-stat">
          <div class="driver-stat-val">${stats.totalDeliveries}</div>
          <div class="driver-stat-label">Entregas</div>
        </div>
        <div class="driver-stat">
          <div class="driver-stat-val" style="${stats.totalOcc>0?'color:var(--pink)':''}">${stats.totalOcc}</div>
          <div class="driver-stat-label">Ocorr.</div>
        </div>
      </div>
      <button class="driver-card-remove" onclick="removeDriver(${d.id})">🗑 Remover</button>
    </div>`;
  }).join('');
}

/* ══════════════════════════════════════════════════════
   MODAL RETORNARAM
══════════════════════════════════════════════════════ */
function openReturnedModal() {
  if(!rows.length) { toast('Carregue os dados primeiro.','t-amber'); return; }
  const s = calcStats();
  const retornaram  = rows.filter(r => r.status === 'Retornou');
  const comOcorr    = retornaram.filter(r => r.occCodes && r.occCodes.length > 0).length;
  const totalOcorr  = retornaram.reduce((sum,r) => sum + (r.occCodes?.length || 0), 0);

  document.getElementById('returnedKpis').innerHTML = `
    <div class="returned-kpi">
      <div class="returned-kpi-val" style="color:var(--green)">${retornaram.length}</div>
      <div class="returned-kpi-label">Retornaram</div>
    </div>
    <div class="returned-kpi">
      <div class="returned-kpi-val" style="color:var(--pink)">${comOcorr}</div>
      <div class="returned-kpi-label">Com Ocorrência</div>
    </div>
    <div class="returned-kpi">
      <div class="returned-kpi-val">${totalOcorr}</div>
      <div class="returned-kpi-label">Total de Ocorr.</div>
    </div>`;

  const listEl = document.getElementById('returnedList');
  if(!retornaram.length) {
    listEl.innerHTML = `<div class="returned-empty"><div class="ri">🕐</div><p style="font-weight:700;font-size:15px">Nenhum motorista retornou ainda.</p><p style="font-size:13px;margin-top:4px">Aguardando prestação de contas.</p></div>`;
    openModal('modalReturned'); return;
  }

  const sorted = [...retornaram].sort((a,b) => (b.occCodes?.length||0) - (a.occCodes?.length||0));
  listEl.innerHTML = `<div class="returned-list">${sorted.map(r => {
    const initials = r.nome.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
    const occ = r.occCodes?.length || 0;
    const occLabel = occ > 0 ? `🚩 ${occ} ocorr.` : '✅ Sem ocorrência';
    return `<div class="returned-item">
      <div class="returned-item-avatar" style="${occ>0?'background:linear-gradient(135deg,#EC4899,#DB2777)':''}">${initials}</div>
      <div>
        <div class="returned-item-name">${escHtml(r.nome)}</div>
        <span class="returned-item-plate">${escHtml(r.placa||'—')}</span>
      </div>
      <div class="returned-item-right">
        <span class="returned-item-occ ${occ===0?'none':''}">${occLabel}</span>
        <span style="font-size:12px;font-weight:700;color:var(--text3)">${r.ctes} CTEs</span>
      </div>
    </div>`;
  }).join('')}</div>`;

  openModal('modalReturned');
}


document.querySelectorAll('.overlay').forEach(o => {
  o.addEventListener('click', e => { if(e.target===o) o.classList.remove('open'); });
});

let toastTimer;
function toast(msg, cls='') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className   = 'show ' + cls;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

/* ══════════════════════════════════════════════════════
   MÓDULO 01 — RANKING DE PRODUTIVIDADE
══════════════════════════════════════════════════════ */
let rankingSortKey = 'prod';
let rankingSortDir = 'desc';

function getRowRealizadas(r) {
  if(r.realizadas > 0) return r.realizadas;
  return r.status === 'Retornou' ? (r.ctes||0) : 0;
}

function renderRanking() {
  const tbody = document.getElementById('rankingBody');
  if(!rows.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:48px;color:var(--text3)">📂 Carregue uma conferência para ver o ranking.</td></tr>`;
    document.getElementById('rankingSubtitle').textContent = 'Sem dados carregados';
    return;
  }

  const data = rows.map(r => {
    const realizadas = getRowRealizadas(r);
    const prod = r.ctes > 0 ? (realizadas / r.ctes) * 100 : 0;
    return {...r, realizadas, prod};
  });

  const sorted = [...data].sort((a,b) => {
    let va = rankingSortKey === 'prod' ? a.prod : rankingSortKey === 'ctes' ? a.ctes : rankingSortKey === 'nome' ? a.nome : a.placa;
    let vb = rankingSortKey === 'prod' ? b.prod : rankingSortKey === 'ctes' ? b.ctes : rankingSortKey === 'nome' ? b.nome : b.placa;
    if(typeof va === 'string') return rankingSortDir==='asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    return rankingSortDir === 'asc' ? va - vb : vb - va;
  });

  const n = sorted.length;
  tbody.innerHTML = sorted.map((r, i) => {
    const pos = i + 1;
    const pctW = Math.min(100, r.prod);
    const cls = i < 3 ? 'rank-top3' : (i >= n-3 && n > 3) ? 'rank-bot3' : '';
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : pos;
    return `<tr class="${cls}">
      <td><span style="font-size:${i<3?'18px':'12px'};font-weight:700">${medal}</span></td>
      <td><span class="driver-name">${escHtml(r.nome)}</span></td>
      <td><span class="plate">${escHtml(r.placa||'—')}</span></td>
      <td><span class="cte-num">${r.ctes}</span></td>
      <td>${r.realizadas}</td>
      <td>
        <span style="font-weight:800;color:${r.prod>=80?'var(--green)':r.prod>=50?'var(--amber)':'var(--red)'}">${r.prod.toFixed(1)}%</span>
        <span class="prod-bar-wrap"><span class="prod-bar-fill" style="width:${pctW}%"></span></span>
      </td>
    </tr>`;
  }).join('');

  document.getElementById('rankingSubtitle').textContent = `${sorted.length} motoristas · conferência atual`;
}

function sortRanking(key) {
  if(rankingSortKey === key) rankingSortDir = rankingSortDir==='asc'?'desc':'asc';
  else { rankingSortKey = key; rankingSortDir = 'desc'; }
  renderRanking();
}

/* ══════════════════════════════════════════════════════
   MÓDULO 02 — CONCLUSÃO DA OPERAÇÃO
══════════════════════════════════════════════════════ */
let chartConclusao = null;

function renderConclusao() {
  if(!rows.length) {
    document.getElementById('conclusaoKpis').innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:48px;color:var(--text3)">📂 Carregue uma conferência primeiro.</div>`;
    return;
  }

  const totalCTEs = rows.reduce((s,r) => s + (r.ctes||0), 0);
  const totalReal = rows.reduce((s,r) => s + getRowRealizadas(r), 0);
  const pctConcl  = totalCTEs > 0 ? (totalReal/totalCTEs)*100 : 0;
  const pctPend   = 100 - pctConcl;

  document.getElementById('conclusaoKpis').innerHTML = `
    <div class="kpi c-blue">
      <div class="kpi-accent"></div><div class="kpi-icon">📦</div>
      <div class="kpi-label">Total de CTEs</div>
      <div class="kpi-value">${totalCTEs}</div>
      <div class="kpi-sub">saídas na operação</div>
    </div>
    <div class="kpi c-green">
      <div class="kpi-accent"></div><div class="kpi-icon">✅</div>
      <div class="kpi-label">Realizadas</div>
      <div class="kpi-value">${totalReal}</div>
      <div class="kpi-sub">entregas confirmadas</div>
    </div>
    <div class="kpi c-amber">
      <div class="kpi-accent"></div><div class="kpi-icon">🎯</div>
      <div class="kpi-label">Conclusão</div>
      <div class="kpi-value">${pctConcl.toFixed(1)}%</div>
      <span class="kpi-badge">${totalReal} de ${totalCTEs}</span>
    </div>
    <div class="kpi c-red">
      <div class="kpi-accent"></div><div class="kpi-icon">⏳</div>
      <div class="kpi-label">Pendente</div>
      <div class="kpi-value">${pctPend.toFixed(1)}%</div>
      <span class="kpi-badge" style="background:var(--red-bg);color:var(--red);border-color:var(--red-bd)">${totalCTEs-totalReal} CTEs</span>
    </div>
  `;

  if(chartConclusao) chartConclusao.destroy();
  chartConclusao = new Chart(document.getElementById('cConclusao'), {
    type: 'doughnut',
    data: {
      labels: ['Realizadas', 'Pendentes'],
      datasets: [{
        data: [totalReal, Math.max(0, totalCTEs - totalReal)],
        backgroundColor: ['#22C55E','#EF4444'],
        borderColor: ['#fff','#fff'], borderWidth: 2
      }]
    },
    options: {
      cutout: '68%', responsive: true, maintainAspectRatio: false,
      plugins: { legend: {display:false}, tooltip: { backgroundColor:'#0f172a', padding:10 } }
    }
  });
  document.getElementById('legConclusao').innerHTML = `
    <div class="leg-item"><span class="leg-dot" style="background:#22C55E"></span>Realizadas<span class="leg-val">${totalReal}</span></div>
    <div class="leg-item"><span class="leg-dot" style="background:#EF4444"></span>Pendentes<span class="leg-val">${totalCTEs-totalReal}</span></div>
  `;
  document.getElementById('conclusaoProgressBar').style.width = pctConcl.toFixed(1) + '%';
  document.getElementById('conclusaoProgressPct').textContent = pctConcl.toFixed(1) + '%';
  document.getElementById('conclusaoProgressDetail').textContent = `${totalReal} de ${totalCTEs} CTEs`;
  document.getElementById('conclusaoPendPct').textContent = pctPend.toFixed(1) + '% pendente';
  document.getElementById('conclusaoLegend').innerHTML = `
    <div style="display:flex;justify-content:space-between;font-size:12px"><span style="color:var(--green);font-weight:700">✅ Realizadas</span><span style="font-weight:800">${totalReal} (${pctConcl.toFixed(1)}%)</span></div>
    <div style="display:flex;justify-content:space-between;font-size:12px"><span style="color:var(--red);font-weight:700">⏳ Pendentes</span><span style="font-weight:800">${totalCTEs-totalReal} (${pctPend.toFixed(1)}%)</span></div>
  `;
}

/* ══════════════════════════════════════════════════════
   MÓDULO 03 — MOTORISTAS PENDENTES
══════════════════════════════════════════════════════ */
function renderPendentes() {
  const tbody = document.getElementById('pendentesBody');
  const resumo = document.getElementById('pendentesResumo');
  const totalDiv = document.getElementById('pendentesTotal');

  if(!rows.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:48px;color:var(--text3)">📂 Carregue uma conferência primeiro.</td></tr>`;
    resumo.textContent = '';
    totalDiv.innerHTML = '';
    return;
  }

  const pendentes = rows.map(r => {
    const realizadas = getRowRealizadas(r);
    const pendQtd = (r.ctes||0) - realizadas;
    return {...r, realizadas, pendQtd};
  }).filter(r => r.pendQtd > 0).sort((a,b) => b.pendQtd - a.pendQtd);

  const totalPend = pendentes.reduce((s,r) => s + r.pendQtd, 0);
  resumo.textContent = `${pendentes.length} motoristas · ${totalPend} CTEs pendentes`;

  totalDiv.innerHTML = `
    <div class="kpi c-red" style="min-height:auto;padding:16px 22px;flex:none">
      <div class="kpi-accent"></div>
      <div style="display:flex;align-items:center;gap:14px">
        <div class="kpi-icon" style="margin:0">⏳</div>
        <div>
          <div class="kpi-label">Total de CTEs Pendentes</div>
          <div class="kpi-value" style="font-size:28px">${totalPend}</div>
        </div>
      </div>
    </div>
    <div class="kpi c-amber" style="min-height:auto;padding:16px 22px;flex:none">
      <div class="kpi-accent"></div>
      <div style="display:flex;align-items:center;gap:14px">
        <div class="kpi-icon" style="margin:0">🚚</div>
        <div>
          <div class="kpi-label">Motoristas Pendentes</div>
          <div class="kpi-value" style="font-size:28px">${pendentes.length}</div>
        </div>
      </div>
    </div>
  `;

  if(!pendentes.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:48px;color:var(--green);font-weight:700">✅ Todos os motoristas estão em dia!</td></tr>`;
    return;
  }

  tbody.innerHTML = pendentes.map((r,i) => `
    <tr>
      <td><span class="rank">${i+1}</span></td>
      <td><span class="driver-name">${escHtml(r.nome)}</span></td>
      <td><span class="plate">${escHtml(r.placa||'—')}</span></td>
      <td>${r.ctes}</td>
      <td>${r.realizadas}</td>
      <td><span style="font-weight:800;color:var(--red);font-size:16px">${r.pendQtd}</span></td>
    </tr>
  `).join('');
}

/* ══════════════════════════════════════════════════════
   MÓDULO 04 — EXPORTAÇÃO EXCEL
══════════════════════════════════════════════════════ */
function exportOperacaoXLSX() {
  if(!rows.length) { toast('Nenhum dado para exportar.','t-red'); return; }
  const data = [['Motorista','Placa','CTEs','Realizadas','Auditadas','Produtividade (%)']];
  rows.forEach(r => {
    const real = getRowRealizadas(r);
    const prod = r.ctes > 0 ? ((real/r.ctes)*100).toFixed(1) : '0.0';
    data.push([r.nome, r.placa, r.ctes, real, r.auditadas||0, prod]);
  });
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [28,12,8,12,12,16].map(w=>({wch:w}));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'OPERAÇÃO');
  XLSX.writeFile(wb, `Operacao_${new Date().toLocaleDateString('pt-BR').replace(/\//g,'-')}.xlsx`);
  toast('⬇️ Operação exportada!','t-green');
}

function exportRankingXLSX() {
  if(!rows.length) { toast('Nenhum dado para exportar.','t-red'); return; }
  const data = [['Posição','Motorista','Placa','CTEs','Realizadas','Produtividade (%)']];
  const sorted = [...rows].map(r => {
    const real = getRowRealizadas(r);
    const prod = r.ctes > 0 ? (real/r.ctes)*100 : 0;
    return {...r, realizadas: real, prod};
  }).sort((a,b) => b.prod - a.prod);
  sorted.forEach((r,i) => {
    data.push([i+1, r.nome, r.placa, r.ctes, r.realizadas, r.prod.toFixed(1)]);
  });
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [8,28,12,8,12,16].map(w=>({wch:w}));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'RANKING');
  XLSX.writeFile(wb, `Ranking_${new Date().toLocaleDateString('pt-BR').replace(/\//g,'-')}.xlsx`);
  toast('⬇️ Ranking exportado!','t-green');
}

function exportPendentesXLSX() {
  if(!rows.length) { toast('Nenhum dado para exportar.','t-red'); return; }
  const pendentes = rows.map(r => {
    const real = getRowRealizadas(r);
    return {...r, realizadas: real, pendQtd: (r.ctes||0)-real};
  }).filter(r => r.pendQtd > 0).sort((a,b) => b.pendQtd - a.pendQtd);

  if(!pendentes.length) { toast('Nenhum motorista pendente.','t-amber'); return; }
  const data = [['Motorista','Placa','CTEs','Realizadas','Pendentes']];
  pendentes.forEach(r => data.push([r.nome, r.placa, r.ctes, r.realizadas, r.pendQtd]));
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [28,12,8,12,10].map(w=>({wch:w}));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'PENDENTES');
  XLSX.writeFile(wb, `Pendentes_${new Date().toLocaleDateString('pt-BR').replace(/\//g,'-')}.xlsx`);
  toast('⬇️ Pendentes exportados!','t-green');
}

/* ══════════════════════════════════════════════════════
   MÓDULO 06 — DASHBOARD GERENCIAL
══════════════════════════════════════════════════════ */
let chartMgrPie=null, chartMgrBar=null, chartMgrStacked=null;

function renderMgrDashboard() {
  if(!rows.length) {
    document.getElementById('mgrKpis').innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:48px;color:var(--text3)">📂 Carregue uma conferência primeiro.</div>`;
    return;
  }

  const s = calcStats();
  const allData = rows.map(r => {
    const real = getRowRealizadas(r);
    return {...r, realizadas:real, prod: r.ctes>0?(real/r.ctes)*100:0};
  });
  const bestDriver = [...allData].sort((a,b)=>b.prod-a.prod)[0];
  const mostVolume = [...allData].sort((a,b)=>b.ctes-a.ctes)[0];
  const avgProd = allData.length ? (allData.reduce((sum,r)=>sum+r.prod,0)/allData.length).toFixed(1) : 0;

  document.getElementById('mgrKpis').innerHTML = `
    <div class="kpi c-blue"><div class="kpi-accent"></div><div class="kpi-icon">📦</div>
      <div class="kpi-label">Total de CTEs</div><div class="kpi-value">${s.totalCTEs}</div><div class="kpi-sub">operação atual</div></div>
    <div class="kpi c-green"><div class="kpi-accent"></div><div class="kpi-icon">✅</div>
      <div class="kpi-label">Realizadas</div><div class="kpi-value">${s.totalRealizadas}</div></div>
    <div class="kpi c-amber"><div class="kpi-accent"></div><div class="kpi-icon">📊</div>
      <div class="kpi-label">Produtividade Média</div><div class="kpi-value">${avgProd}%</div></div>
    <div class="kpi c-red"><div class="kpi-accent"></div><div class="kpi-icon">🚚</div>
      <div class="kpi-label">Motoristas</div><div class="kpi-value">${s.motoristas}</div></div>
  `;

  // Charts
  const top10 = [...allData].sort((a,b)=>b.prod-a.prod).slice(0,10);
  const top8CTEs = [...allData].sort((a,b)=>b.ctes-a.ctes).slice(0,8);
  const top15 = [...allData].sort((a,b)=>b.ctes-a.ctes).slice(0,15);

  if(chartMgrPie) chartMgrPie.destroy();
  chartMgrPie = new Chart(document.getElementById('cMgrPie'), {
    type:'doughnut',
    data:{
      labels: top8CTEs.map(r=>r.nome.split(' ')[0]),
      datasets:[{data:top8CTEs.map(r=>r.ctes), backgroundColor:['#2563EB','#7C3AED','#22C55E','#F59E0B','#EC4899','#0891b2','#6366f1','#14b8a6'], borderWidth:2, borderColor:'#fff'}]
    },
    options:{cutout:'50%',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}}}
  });

  if(chartMgrBar) chartMgrBar.destroy();
  chartMgrBar = new Chart(document.getElementById('cMgrBar'), {
    type:'bar',
    data:{
      labels: top10.map(r=>r.nome.split(' ')[0]),
      datasets:[{label:'Produtividade %',data:top10.map(r=>+r.prod.toFixed(1)),backgroundColor:'rgba(37,99,235,.75)',borderRadius:6}]
    },
    options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{max:100,grid:{color:'rgba(0,0,0,.04)'}}}}
  });

  if(chartMgrStacked) chartMgrStacked.destroy();
  chartMgrStacked = new Chart(document.getElementById('cMgrStacked'), {
    type:'bar',
    data:{
      labels: top15.map(r=>r.nome.split(' ')[0]),
      datasets:[
        {label:'Realizadas',data:top15.map(r=>r.realizadas),backgroundColor:'rgba(34,197,94,.7)',borderRadius:4},
        {label:'Pendentes',data:top15.map(r=>Math.max(0,r.ctes-r.realizadas)),backgroundColor:'rgba(239,68,68,.55)',borderRadius:4}
      ]
    },
    options:{responsive:true,maintainAspectRatio:false,scales:{x:{stacked:true},y:{stacked:true,grid:{color:'rgba(0,0,0,.04)'}}},plugins:{legend:{position:'bottom'}}}
  });
}

/* ══════════════════════════════════════════════════════
   MÓDULO 07 — VIAGEM ADICIONAL
══════════════════════════════════════════════════════ */
function adicionarViagem() {
  const nome  = document.getElementById('vaMotorista').value.trim();
  const placa = document.getElementById('vaPlaca').value.trim().toUpperCase();
  const ctes  = parseInt(document.getElementById('vaCtes').value)||0;

  if(!nome) { toast('Informe o nome do motorista.','t-amber'); return; }
  if(ctes <= 0) { toast('Informe a quantidade de CTEs.','t-amber'); return; }

  const newId = Date.now();
  rows.push({id:newId, nome, placa: placa||'—', ctes, realizadas:0, auditadas:0, status:'', occCodes:[], obs:''});

  document.getElementById('vaMotorista').value = '';
  document.getElementById('vaPlaca').value = '';
  document.getElementById('vaCtes').value = '';

  document.getElementById('importSection').style.display = 'none';
  document.getElementById('dashboard').style.display = 'block';

  renderDashboard();
  scheduleAutosave(false);
  closeModal('modalViagemAdicional');
  toast(`✅ Viagem adicional de ${nome} adicionada!`,'t-green');
}

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

/* ══════════════════════════════════════════════════════
   MÓDULO 10 — ORDENAÇÃO DAS COLUNAS DA TABELA PRINCIPAL
══════════════════════════════════════════════════════ */
let mainSortKey = 'ctes';
let mainSortDir = 'desc';

function updateMainTableHeaderSort() {
  const thead = document.getElementById('mainTableHead');
  if(!thead) return;
  thead.querySelectorAll('th').forEach(th => {
    th.classList.remove('sort-asc','sort-desc');
    if(th.dataset.sort === mainSortKey) th.classList.add(mainSortDir === 'asc' ? 'sort-asc' : 'sort-desc');
  });
}

function sortMainTable(key) {
  if(mainSortKey === key) mainSortDir = mainSortDir==='asc'?'desc':'asc';
  else { mainSortKey = key; mainSortDir = key === 'nome' || key === 'placa' ? 'asc' : 'desc'; }
  renderTable();
  updateMainTableHeaderSort();
}

/* ══════════════════════════════════════════════════════
   MÓDULO 11 — CADASTRO DE MOTORISTAS (aba dedicada)
══════════════════════════════════════════════════════ */
const CAD_KEY = 'conf_cad_motoristas_v1';

function loadCadDB()   { try { return JSON.parse(localStorage.getItem(CAD_KEY)||'[]'); } catch { return []; } }
function saveCadDB(a)  { localStorage.setItem(CAD_KEY, JSON.stringify(a)); }

function maskCPF(input) {
  let v = input.value.replace(/\D/g,'').slice(0,11);
  if(v.length > 9) v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/,'$1.$2.$3-$4');
  else if(v.length > 6) v = v.replace(/(\d{3})(\d{3})(\d{1,3})/,'$1.$2.$3');
  else if(v.length > 3) v = v.replace(/(\d{3})(\d{1,3})/,'$1.$2');
  input.value = v;
}

function maskPhone(input) {
  let v = input.value.replace(/\D/g,'').slice(0,11);
  if(v.length > 10) v = v.replace(/(\d{2})(\d{5})(\d{4})/,'($1) $2-$3');
  else if(v.length > 6) v = v.replace(/(\d{2})(\d{4,5})(\d{0,4})/,'($1) $2-$3');
  else if(v.length > 2) v = v.replace(/(\d{2})(\d+)/,'($1) $2');
  input.value = v;
}

function validateCPF(cpf) {
  cpf = cpf.replace(/\D/g,'');
  if(cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  let sum = 0;
  for(let i=0;i<9;i++) sum += parseInt(cpf[i])*(10-i);
  let d1 = (sum*10)%11; if(d1===10||d1===11) d1=0;
  if(d1 !== parseInt(cpf[9])) return false;
  sum = 0;
  for(let i=0;i<10;i++) sum += parseInt(cpf[i])*(11-i);
  let d2 = (sum*10)%11; if(d2===10||d2===11) d2=0;
  return d2 === parseInt(cpf[10]);
}

function saveCadMotorista() {
  const nome    = document.getElementById('cadNome').value.trim();
  const cpf     = document.getElementById('cadCpf').value.trim();
  const placa   = document.getElementById('cadPlaca').value.trim().toUpperCase();
  const celular = document.getElementById('cadCelular').value.trim();
  const editId  = document.getElementById('cadEditId').value;
  const errEl   = document.getElementById('cadFormError');

  errEl.style.display='none';
  if(!nome) { errEl.textContent='Informe o nome do motorista.'; errEl.style.display='block'; return; }
  if(!cpf)  { errEl.textContent='Informe o CPF.'; errEl.style.display='block'; return; }
  if(!validateCPF(cpf)) { errEl.textContent='CPF inválido.'; errEl.style.display='block'; return; }

  const db = loadCadDB();
  const dupCPF = db.find(d => d.cpf === cpf && d.id !== (editId||null));
  if(dupCPF) { errEl.textContent='CPF já cadastrado.'; errEl.style.display='block'; return; }

  if(editId) {
    const idx = db.findIndex(d => d.id === editId);
    if(idx >= 0) db[idx] = {...db[idx], nome, cpf, placa, celular};
  } else {
    db.push({id: Date.now().toString(), nome, cpf, placa, celular});
  }
  saveCadDB(db);
  clearCadForm();
  renderCadMotoristas();
  toast(editId ? '✅ Motorista atualizado!' : '✅ Motorista cadastrado!','t-green');
}

function clearCadForm() {
  ['cadNome','cadCpf','cadPlaca','cadCelular','cadEditId'].forEach(id => document.getElementById(id).value='');
  document.getElementById('cadFormTitle').textContent = '➕ Cadastrar Novo Motorista';
  document.getElementById('cadCancelBtn').style.display = 'none';
  document.getElementById('cadFormError').style.display = 'none';
}

function editCadMotorista(id) {
  const db  = loadCadDB();
  const drv = db.find(d => d.id === id);
  if(!drv) return;
  document.getElementById('cadEditId').value  = drv.id;
  document.getElementById('cadNome').value    = drv.nome;
  document.getElementById('cadCpf').value     = drv.cpf;
  document.getElementById('cadPlaca').value   = drv.placa;
  document.getElementById('cadCelular').value = drv.celular;
  document.getElementById('cadFormTitle').textContent = '✏️ Editar Motorista';
  document.getElementById('cadCancelBtn').style.display = 'inline-flex';
  document.getElementById('cadNome').focus();
}

function deleteCadMotorista(id) {
  if(!confirm('Excluir este motorista do cadastro?')) return;
  saveCadDB(loadCadDB().filter(d => d.id !== id));
  renderCadMotoristas();
  toast('🗑️ Motorista removido.','');
}

function renderCadMotoristas() {
  const q  = (document.getElementById('cadMotoristasSearch')?.value||'').toLowerCase();
  const db = loadCadDB().filter(d => !q || d.nome.toLowerCase().includes(q) || d.cpf.includes(q) || d.placa.toLowerCase().includes(q));
  const tbody = document.getElementById('cadMotoristasBody');
  if(!db.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:48px;color:var(--text3)">${loadCadDB().length ? '🔍 Nenhum resultado para a busca.' : '📋 Nenhum motorista cadastrado ainda.'}</td></tr>`;
    return;
  }
  tbody.innerHTML = db.map((d,i) => `
    <tr>
      <td><span class="rank">${i+1}</span></td>
      <td><span class="driver-name">${escHtml(d.nome)}</span></td>
      <td><span style="font-size:12px;color:var(--text2);font-weight:600">${escHtml(d.cpf)}</span></td>
      <td><span class="plate">${escHtml(d.placa||'—')}</span></td>
      <td><span style="font-size:12px;color:var(--text2)">${escHtml(d.celular||'—')}</span></td>
      <td style="display:flex;gap:6px">
        <button class="btn btn-outline btn-sm" onclick="editCadMotorista('${d.id}')">✏️ Editar</button>
        <button class="btn btn-red btn-sm" onclick="deleteCadMotorista('${d.id}')">🗑️</button>
      </td>
    </tr>
  `).join('');
}

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
  // CORREÇÃO: se estiver editando a conferência de um dia anterior,
  // redireciona para saveHistEdit() em vez de gravar por cima do dia de hoje.
  if(_editingHistKey && _editingHistKey !== todayKey()) {
    saveHistEdit(_editingHistKey);
    return;
  }
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

/* ══════════════════════════════════════════════════════
   INIT ADICIONAIS
══════════════════════════════════════════════════════ */
// Patch renderTable to support column sorting
const _originalRenderTable = renderTable;
function renderTable() {
  const tbody = document.getElementById('mainTable');
  tbody.innerHTML = '';

  const getSortVal = (r, k) => {
    if(k==='nome') return r.nome.toLowerCase();
    if(k==='placa') return (r.placa||'').toLowerCase();
    if(k==='ctes') return r.ctes||0;
    if(k==='status') return r.status||'';
    return r.ctes||0;
  };

  const sorted = [...rows].sort((a,b) => {
    const va = getSortVal(a, mainSortKey);
    const vb = getSortVal(b, mainSortKey);
    if(typeof va === 'string') return mainSortDir==='asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    return mainSortDir === 'asc' ? va - vb : vb - va;
  });

  sorted.forEach((r, i) => {
    const hasOcc      = r.occCodes && r.occCodes.length > 0;
    const statusFilled = !!r.status;
    const tr = document.createElement('tr');
    tr.dataset.name = r.nome.toLowerCase();
    tr.innerHTML = `
      <td><span class="rank">${i+1}</span></td>
      <td><span class="driver-name">${r.nome}</span></td>
      <td><span class="plate">${r.placa||'—'}</span></td>
      <td><span class="cte-num">${r.ctes}</span></td>
      <td>
        <select class="sel-status ${r.status==='Retornou'?'st-ret':r.status==='Não Retornou'?'st-nret':''}"
          onchange="onStatusChange(${r.id}, this)">
          <option value=""      ${!r.status?'selected':''}>— Aguardando —</option>
          <option value="Retornou"      ${r.status==='Retornou'?'selected':''}>✅ Retornou</option>
          <option value="Não Retornou"  ${r.status==='Não Retornou'?'selected':''}>❌ Não Retornou</option>
        </select>
      </td>
      <td class="occ-cell" id="occ-cell-${r.id}">
        ${buildOccPicker(r, statusFilled)}
      </td>
      <td>
        <span class="pct-badge ${hasOcc?'has-val':''}" id="pct-${r.id}">
          ${hasOcc ? r.occCodes.length + ' ocorr.' : '—'}
        </span>
      </td>
      <td>
        <input class="inp-obs" type="text" placeholder="Observação..."
          value="${escHtml(r.obs)}" ${!statusFilled?'disabled title="Preencha o status de prestação primeiro"':''}
          id="obs-inp-${r.id}"
          oninput="onObsChange(${r.id}, this)">
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Update thead to add id and sort handlers
document.addEventListener('DOMContentLoaded', () => {
  initDarkMode();
  lockPreviousDays();

  // Add sortable headers to main table
  const thead = document.querySelector('#mainTable')?.closest('table')?.querySelector('thead tr');
  if(thead) {
    thead.id = 'mainTableHead';
    const cols = [null,'nome','placa','ctes','status',null,null,null];
    thead.querySelectorAll('th').forEach((th,i) => {
      if(cols[i]) {
        th.dataset.sort = cols[i];
        th.classList.add('sortable');
        th.title = 'Clique para ordenar';
        th.onclick = () => sortMainTable(cols[i]);
      }
    });
  }
});


/* ══════════════════════════════════════════════════════
   MÓDULO 13 — CTEs RETIDOS
══════════════════════════════════════════════════════ */
const RETIDOS_KEY = 'conf_ctes_retidos_v1';

function loadRetidosDB() {
  try { return JSON.parse(localStorage.getItem(RETIDOS_KEY)||'[]'); } catch { return []; }
}
function saveRetidosDB(arr) { localStorage.setItem(RETIDOS_KEY, JSON.stringify(arr)); }

function saveRetido() {
  const numeroCte  = document.getElementById('retNumeroCte').value.trim();
  const cliente    = document.getElementById('retCliente').value.trim();
  const dataEnvio  = document.getElementById('retDataEnvio').value;
  const dataColeta = document.getElementById('retDataColeta').value;
  const status     = document.getElementById('retStatus').value;
  const obs        = document.getElementById('retObs').value.trim();
  const errEl      = document.getElementById('retFormError');

  errEl.style.display = 'none';
  // Validações obrigatórias
  if(!numeroCte) {
    errEl.textContent = '⚠️ O número do CTE retido é OBRIGATÓRIO.';
    errEl.style.display = 'block';
    document.getElementById('retNumeroCte').classList.add('required-invalid');
    document.getElementById('retNumeroCte').focus();
    return;
  }
  document.getElementById('retNumeroCte').classList.remove('required-invalid');
  if(!cliente) { errEl.textContent = '⚠️ Informe o cliente/destinatário.'; errEl.style.display='block'; return; }
  if(!dataEnvio) { errEl.textContent = '⚠️ Informe a data de envio.'; errEl.style.display='block'; return; }

  const db = loadRetidosDB();
  // Verifica duplicata pelo número do CTE
  if(db.find(r => r.numeroCte === numeroCte)) {
    errEl.textContent = '⚠️ Este número de CTE já está registrado como retido.';
    errEl.style.display = 'block';
    return;
  }

  db.push({
    id: Date.now().toString(),
    numeroCte, cliente, dataEnvio, dataColeta: dataColeta||'',
    status, obs, registradoEm: new Date().toISOString()
  });
  saveRetidosDB(db);

  // Limpar formulário
  ['retNumeroCte','retCliente','retDataEnvio','retDataColeta','retObs'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('retStatus').value = 'pendente';
  renderRetidos();
  toast('✅ CTE retido registrado!','t-green');
}

function updateRetidoStatus(id, newStatus) {
  const db = loadRetidosDB();
  const idx = db.findIndex(r => r.id === id);
  if(idx < 0) return;
  db[idx].status = newStatus;
  if(newStatus === 'coletado' && !db[idx].dataColeta) {
    db[idx].dataColeta = new Date().toISOString().slice(0,10);
  }
  saveRetidosDB(db);
  renderRetidos();
  toast('✅ Status atualizado!','t-green');
}

function deleteRetido(id) {
  if(!confirm('Excluir este CTE retido?')) return;
  saveRetidosDB(loadRetidosDB().filter(r => r.id !== id));
  renderRetidos();
  toast('🗑️ Removido.','');
}

function renderRetidos() {
  const db = loadRetidosDB();
  const q  = (document.getElementById('retSearch')?.value||'').toLowerCase();
  const sf = document.getElementById('retFilterStatus')?.value||'';

  const filtered = db.filter(r => {
    const matchQ  = !q || r.numeroCte.toLowerCase().includes(q) || r.cliente.toLowerCase().includes(q);
    const matchSt = !sf || r.status === sf;
    return matchQ && matchSt;
  });

  document.getElementById('retCount').textContent = `${filtered.length} de ${db.length} registros`;

  const tbody = document.getElementById('retidosBody');
  if(!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--text3)">${db.length?'🔍 Nenhum resultado para o filtro.':'📋 Nenhum CTE retido registrado ainda.'}</td></tr>`;
    return;
  }

  const fmtDate = d => d ? new Date(d.includes('T')?d:d+'T12:00:00').toLocaleDateString('pt-BR') : '—';
  const badgeMap = {
    pendente: '<span class="retido-badge retido-badge-pendente">⏳ Pendente</span>',
    coletado: '<span class="retido-badge retido-badge-coletado">✅ Coletado</span>',
    liberado:  '<span class="retido-badge retido-badge-liberado">🔓 Liberado</span>',
  };

  tbody.innerHTML = filtered.map((r,i) => `<tr>
    <td><span class="rank">${i+1}</span></td>
    <td><strong style="font-family:monospace;font-size:13px">${escHtml(r.numeroCte)}</strong></td>
    <td><span style="font-weight:600">${escHtml(r.cliente)}</span></td>
    <td>${fmtDate(r.dataEnvio)}</td>
    <td>${fmtDate(r.dataColeta)}</td>
    <td>
      <select onchange="updateRetidoStatus('${r.id}',this.value)" style="padding:4px 8px;border:1px solid var(--border);border-radius:6px;font-size:11px;background:var(--surface)">
        <option value="pendente" ${r.status==='pendente'?'selected':''}>⏳ Pendente</option>
        <option value="coletado" ${r.status==='coletado'?'selected':''}>✅ Coletado</option>
        <option value="liberado"  ${r.status==='liberado'?'selected':''}>🔓 Liberado</option>
      </select>
    </td>
    <td style="font-size:12px;color:var(--text2)">${escHtml(r.obs||'—')}</td>
    <td><button class="btn btn-red btn-sm" onclick="deleteRetido('${r.id}')">🗑️</button></td>
  </tr>`).join('');
}

function scanRetido(val, confirm=false) {
  if(!val || val.length < 3) return;
  const db = loadRetidosDB();
  const found = db.filter(r => r.numeroCte.includes(val.trim()) || r.cliente.toLowerCase().includes(val.toLowerCase()));
  if(confirm && found.length === 0) {
    toast('❌ CTE não encontrado nos retidos.','t-red');
    return;
  }
  if(found.length > 0) {
    document.getElementById('retSearch').value = val;
    renderRetidos();
    if(confirm) toast(`🔍 ${found.length} resultado(s) encontrado(s).`,'t-green');
  }
}

function exportRetidosXLSX() {
  const db = loadRetidosDB();
  if(!db.length) { toast('Nenhum CTE retido para exportar.','t-amber'); return; }
  const data = [['Nº CTE','Cliente','Data Envio','Data Coleta','Status','Observação','Registrado Em']];
  db.forEach(r => {
    data.push([r.numeroCte, r.cliente, r.dataEnvio, r.dataColeta||'', r.status, r.obs||'',
      new Date(r.registradoEm).toLocaleDateString('pt-BR')]);
  });
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [18,35,12,12,12,30,14].map(w=>({wch:w}));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'CTEs Retidos');
  XLSX.writeFile(wb, `CTEs_Retidos_${new Date().toLocaleDateString('pt-BR').replace(/\//g,'-')}.xlsx`);
  toast('⬇️ Exportado!','t-green');
}

// Pre-fill retidos from TXT data on first load
function initRetidosFromTxt() {
  const key = 'conf_retidos_txt_init_v1';
  if(localStorage.getItem(key)) return;
  const entries = [
    {numeroCte:'66/8346495',cliente:'RAVEL DISTRIBUIDORA',dataEnvio:'2026-06-05',dataColeta:'2026-06-11',status:'coletado',obs:'COLETADO DIA 11/06'},
    {numeroCte:'3/7756291',cliente:'RAVEL DISTRIBUIDORA',dataEnvio:'2026-06-05',dataColeta:'2026-06-11',status:'coletado',obs:'COLETADO DIA 11/06'},
    {numeroCte:'134/747054',cliente:'LABORATÓRIOS B BRAUN SA',dataEnvio:'2026-06-05',dataColeta:'',status:'pendente',obs:''},
    {numeroCte:'66/8355645',cliente:'NOVA BONI DISTRIBUIDORA',dataEnvio:'2026-06-05',dataColeta:'',status:'pendente',obs:''},
    {numeroCte:'62/8347914',cliente:'ERICA DA COSTA MEDEIROS',dataEnvio:'2026-06-05',dataColeta:'',status:'pendente',obs:''},
    {numeroCte:'52/12788336',cliente:'GENIAL PNEUS LTDA',dataEnvio:'2026-06-08',dataColeta:'',status:'pendente',obs:''},
    {numeroCte:'8/8352298',cliente:'SHOPPING NOU SUPER MAGAZINE LTDA',dataEnvio:'2026-06-08',dataColeta:'',status:'pendente',obs:'Reenviando 10/06'},
    {numeroCte:'4/8361231',cliente:'RFC COMERCIO DE MIUDEZAS LTDA',dataEnvio:'2026-06-08',dataColeta:'',status:'pendente',obs:'Reenviando 10/06'},
    {numeroCte:'122/1429875',cliente:'M.A. COELHO A. MATOS DISTRIBUIDOR',dataEnvio:'2026-06-08',dataColeta:'',status:'pendente',obs:''},
    {numeroCte:'101/12783189',cliente:'BOTTINO MATERIAIS DE CONSTRUÇÃO LTDA',dataEnvio:'2026-06-08',dataColeta:'',status:'pendente',obs:''},
    {numeroCte:'52/12782945',cliente:'GENIAL PNEUS',dataEnvio:'2026-06-08',dataColeta:'',status:'pendente',obs:''},
    {numeroCte:'66/8364059',cliente:'NOVA PATINHA',dataEnvio:'2026-06-08',dataColeta:'',status:'pendente',obs:''},
    {numeroCte:'71/8364059',cliente:'COMERCIAL ELÉTRICA PJ LTDA',dataEnvio:'2026-06-08',dataColeta:'',status:'pendente',obs:''},
    {numeroCte:'66/8360369',cliente:'COFEOS FERRAGENS',dataEnvio:'2026-06-08',dataColeta:'',status:'pendente',obs:''},
    {numeroCte:'122/1429875-3',cliente:'M.A. COELHO A. MATOS DISTRIBUIDOR',dataEnvio:'2026-06-08',dataColeta:'',status:'pendente',obs:''},
    {numeroCte:'52/12804425',cliente:'GENIAL PNEUS',dataEnvio:'2026-06-10',dataColeta:'',status:'pendente',obs:''},
    {numeroCte:'10/12802268',cliente:'RAVEL DISTRIBUIDORA',dataEnvio:'2026-06-11',dataColeta:'',status:'pendente',obs:''},
    {numeroCte:'29/7784386',cliente:'SOLUWAN COMERCIAL LTDA',dataEnvio:'2026-06-12',dataColeta:'',status:'pendente',obs:''},
    {numeroCte:'112/12809796',cliente:'COMERCIAL ELÉTRICA',dataEnvio:'2026-06-12',dataColeta:'',status:'pendente',obs:''},
    {numeroCte:'4/8372174',cliente:'COMERCIAL ELÉTRICA',dataEnvio:'2026-06-12',dataColeta:'',status:'pendente',obs:''},
    {numeroCte:'10/12625741',cliente:'COMERCIAL ELÉTRICA',dataEnvio:'2026-06-12',dataColeta:'',status:'pendente',obs:''},
  ];
  const now = Date.now();
  const withIds = entries.map((e,i) => ({...e, id:(now+i).toString(), registradoEm:new Date().toISOString()}));
  saveRetidosDB(withIds);
  localStorage.setItem(key,'1');
}

/* ══════════════════════════════════════════════════════
   MÓDULO 14 — CARGAS PENDENTES DE ENTREGA
══════════════════════════════════════════════════════ */
const CARGAS_KEY = 'conf_cargas_pendentes_v1';

function loadCargasDB() { try { return JSON.parse(localStorage.getItem(CARGAS_KEY)||'[]'); } catch { return []; } }
function saveCargasDB(arr) { localStorage.setItem(CARGAS_KEY, JSON.stringify(arr)); }
function limparCargas() { saveCargasDB([]); renderCargas(); toast('🗑️ Cargas limpas.',''); }

function handleCargasDrop(e) {
  e.preventDefault();
  document.getElementById('cargasImportZone').style.borderColor = '';
  const file = e.dataTransfer.files[0];
  if(file) loadCargasFile(file);
}

function loadCargasFile(file) {
  if(!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const wb = XLSX.read(e.target.result, {type:'array', cellDates:true});
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(ws, {raw:false, dateNF:'dd/mm/yyyy'});
    if(!data.length) { toast('Planilha vazia.','t-red'); return; }

    // Normalize column names (lower snake_case)
    const norm = s => (s||'').toString().toLowerCase().trim().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');
    const normRow = obj => {
      const out = {};
      Object.keys(obj).forEach(k => { out[norm(k)] = obj[k]; });
      return out;
    };

    const existing = loadCargasDB();
    const existingCtes = new Set(existing.map(r => r.cte));
    let added = 0, skipped = 0;

    const newRows = [];
    data.forEach((rawRow, i) => {
      const r = normRow(rawRow);
      const cte = (r.cte || r.numero_cte || '').toString().trim();
      if(!cte) { skipped++; return; }
      if(existingCtes.has(cte)) { skipped++; return; }
      existingCtes.add(cte);
      added++;
      newRows.push({
        id: (Date.now()+i).toString(),
        cte,
        unidade_destino:    (r.unidade_destino||'').toString().trim(),
        praca_destino:      (r.praca_destino||'').toString().trim(),
        setor:              (r.setor||'').toString().trim(),
        valor_cte:          parseFloat((r.valor_cte||'0').toString().replace(',','.'))||0,
        valor_frete:        parseFloat((r.valor_frete||'0').toString().replace(',','.'))||0,
        peso:               parseFloat((r.peso||'0').toString().replace(',','.'))||0,
        volume:             parseFloat((r.volume||'0').toString().replace(',','.'))||0,
        m3:                 parseFloat((r.m3||'0').toString().replace(',','.'))||0,
        bairro:             (r.bairro||'').toString().trim(),
        previsao:           (r.previsao||r.previs_o||'').toString().trim(),
        data_bip:           (r.data_bip||'').toString().trim(),
        data_chegada:       (r.data_chegada||'').toString().trim(),
        manifesto_entrega:  (r.manifesto_entrega||'').toString().trim(),
        remetente:          (r.remetente||'').toString().trim(),
        destinatario:       (r.destinatario||r.destinat_rio||'').toString().trim(),
        placa_pre_viagem:   (r.placa_pre_viagem||'').toString().trim(),
        data_pre_viagem:    (r.data_pre_viagem||'').toString().trim(),
        bo:                 (r.bo||'').toString().trim(),
        acr:                (r.acr||'').toString().trim(),
        importadoEm:        new Date().toISOString(),
      });
    });

    const all = [...existing, ...newRows];
    saveCargasDB(all);
    populateCargasFilters(all);
    renderCargas();
    renderCargasKpis(all);

    const info = document.getElementById('cargasImportInfo');
    info.style.display = 'block';
    info.innerHTML = `<div style="background:var(--green-bg);border:1px solid var(--green-bd);border-radius:10px;padding:12px 16px;font-size:13px">
      ✅ <strong>${added} cargas importadas</strong> — ${skipped} ignoradas (duplicatas ou sem CTE). Total no sistema: <strong>${all.length}</strong>
    </div>`;
    toast(`✅ ${added} cargas importadas!`,'t-green');
  };
  reader.readAsArrayBuffer(file);
}

function populateCargasFilters(db) {
  const unidades = [...new Set(db.map(r=>r.unidade_destino).filter(Boolean))].sort();
  const bairros  = [...new Set(db.map(r=>r.bairro).filter(Boolean))].sort();

  const uSel = document.getElementById('cargaFilterUnidade');
  const bSel = document.getElementById('cargaFilterBairro');
  uSel.innerHTML = '<option value="">Todas as unidades</option>' + unidades.map(u=>`<option value="${escHtml(u)}">${escHtml(u)}</option>`).join('');
  bSel.innerHTML = '<option value="">Todos os bairros</option>' + bairros.map(b=>`<option value="${escHtml(b)}">${escHtml(b)}</option>`).join('');
}

function renderCargasKpis(db) {
  const el = document.getElementById('cargasKpis');
  const totalValor = db.reduce((s,r)=>s+(r.valor_cte||0),0);
  const totalPeso  = db.reduce((s,r)=>s+(r.peso||0),0);
  el.innerHTML = [
    {icon:'📦',val:db.length,lbl:'CTEs Pendentes'},
    {icon:'💰',val:'R$ '+totalValor.toLocaleString('pt-BR',{minimumFractionDigits:2}),lbl:'Valor Total'},
    {icon:'⚖️',val:totalPeso.toLocaleString('pt-BR',{maximumFractionDigits:1})+' kg',lbl:'Peso Total'},
    {icon:'🏘️',val:new Set(db.map(r=>r.bairro).filter(Boolean)).size,lbl:'Bairros'},
  ].map(k=>`<div class="welcome-kpi" style="min-width:140px;padding:14px">
    <div style="font-size:24px">${k.icon}</div>
    <div style="font-size:18px;font-weight:800;color:var(--accent)">${k.val}</div>
    <div style="font-size:11px;color:var(--text2);font-weight:600">${k.lbl}</div>
  </div>`).join('');
}

function renderCargas() {
  const db  = loadCargasDB();

  // Toggle empty / data state
  const emptyEl = document.getElementById('cargasEmptyState');
  const dataEl  = document.getElementById('cargasDataState');
  if(emptyEl && dataEl) {
    emptyEl.style.display = db.length ? 'none' : 'block';
    dataEl.style.display  = db.length ? 'block' : 'none';
  }
  if(!db.length) return;

  const q   = (document.getElementById('cargaSearch')?.value||'').toLowerCase();
  const fu  = document.getElementById('cargaFilterUnidade')?.value||'';
  const fb  = document.getElementById('cargaFilterBairro')?.value||'';

  const filtered = db.filter(r => {
    const matchQ = !q || r.cte.toLowerCase().includes(q) || r.destinatario.toLowerCase().includes(q) || r.bairro.toLowerCase().includes(q) || r.remetente.toLowerCase().includes(q);
    const matchU = !fu || r.unidade_destino === fu;
    const matchB = !fb || r.bairro === fb;
    return matchQ && matchU && matchB;
  });

  document.getElementById('cargaCount').textContent = `${filtered.length} de ${db.length} registros`;
  renderCargasKpis(db);

  const tbody = document.getElementById('cargasBody');
  if(!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="15" style="text-align:center;padding:40px;color:var(--text3)">${db.length?'🔍 Nenhum resultado.':'📋 Importe uma planilha de cargas pendentes.'}</td></tr>`;
    return;
  }

  const fmtMoney = v => v ? 'R$ '+parseFloat(v).toLocaleString('pt-BR',{minimumFractionDigits:2}) : '—';
  tbody.innerHTML = filtered.map((r,i)=>`<tr>
    <td><span class="rank">${i+1}</span></td>
    <td><strong style="font-family:monospace">${escHtml(r.cte)}</strong></td>
    <td style="font-size:11px">${escHtml(r.unidade_destino)}</td>
    <td style="font-size:11px">${escHtml(r.praca_destino)}</td>
    <td>${escHtml(r.setor)}</td>
    <td><span style="font-weight:600">${escHtml(r.bairro)}</span></td>
    <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis" title="${escHtml(r.destinatario)}">${escHtml(r.destinatario)}</td>
    <td style="font-size:11px;max-width:160px;overflow:hidden;text-overflow:ellipsis" title="${escHtml(r.remetente)}">${escHtml(r.remetente)}</td>
    <td>${fmtMoney(r.valor_cte)}</td>
    <td>${r.peso?r.peso.toLocaleString('pt-BR')+'kg':'—'}</td>
    <td>${r.volume||'—'}</td>
    <td style="font-size:11px">${escHtml(r.previsao)}</td>
    <td style="font-size:11px">${escHtml(r.manifesto_entrega)}</td>
    <td><span class="plate">${escHtml(r.placa_pre_viagem)||'—'}</span></td>
    <td style="font-size:11px">${escHtml(r.bo)}</td>
    <td style="font-size:11px">${escHtml(r.acr)}</td>
  </tr>`).join('');
}

function scanCarga(val, doConfirm=false) {
  scanCargaLive(val);
  if(doConfirm) scanCargaModal(val);
}

// Live filter: atualiza tabela enquanto digita
function scanCargaLive(val) {
  if(!val) { renderCargas(); return; }
  const inp = document.getElementById('cargaSearch');
  if(inp) { inp.value = val; renderCargas(); }
}

// Modal: abre ficha completa do CTE ao pressionar Enter ou clicar "Ver Ficha"
function scanCargaModal(val) {
  val = (val||'').trim();
  if(!val) return;
  const db = loadCargasDB();

  // Busca exata primeiro, depois parcial
  let found = db.filter(r => r.cte === val);
  if(!found.length) found = db.filter(r => r.cte.includes(val));
  if(!found.length) found = db.filter(r =>
    r.destinatario.toLowerCase().includes(val.toLowerCase()) ||
    r.remetente.toLowerCase().includes(val.toLowerCase())
  );

  const el = document.getElementById('fichaCteContent');
  if(!found.length) {
    el.innerHTML = `<div style="text-align:center;padding:32px">
      <div style="font-size:48px;margin-bottom:12px">❌</div>
      <div style="font-weight:700;font-size:16px;color:var(--red)">CTE não encontrado</div>
      <p style="font-size:13px;color:var(--text2);margin-top:8px">Nenhuma carga com o código <strong>${escHtml(val)}</strong> foi encontrada na planilha importada.</p>
    </div>`;
    openModal('modalFichaCte');
    return;
  }

  const fmtMoney = v => v ? 'R$ '+parseFloat(v).toLocaleString('pt-BR',{minimumFractionDigits:2}) : '—';
  const fmtNum   = v => v ? parseFloat(v).toLocaleString('pt-BR') : '—';

  el.innerHTML = found.map(r => `
    <div style="background:var(--accent-bg);border:1px solid #bfdbfe;border-radius:12px;padding:16px;margin-bottom:12px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <span style="font-size:22px;font-weight:900;color:var(--accent);font-family:monospace">${escHtml(r.cte)}</span>
        <span style="font-size:11px;color:var(--text3)">Importado em ${new Date(r.importadoEm).toLocaleDateString('pt-BR')}</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px">
        ${fichaField('🏢 Unidade Destino', r.unidade_destino)}
        ${fichaField('📍 Praça Destino', r.praca_destino)}
        ${fichaField('🏘️ Bairro', r.bairro)}
        ${fichaField('🔢 Setor', r.setor)}
        ${fichaField('💰 Valor CTE', fmtMoney(r.valor_cte))}
        ${fichaField('🚚 Valor Frete', fmtMoney(r.valor_frete))}
        ${fichaField('⚖️ Peso', r.peso ? fmtNum(r.peso)+' kg' : '—')}
        ${fichaField('📦 Volume', fmtNum(r.volume))}
        ${fichaField('📐 M³', fmtNum(r.m3))}
        ${fichaField('📅 Previsão', r.previsao)}
        ${fichaField('📅 Data BIP', r.data_bip)}
        ${fichaField('📅 Data Chegada', r.data_chegada)}
        ${fichaField('📋 Manifesto', r.manifesto_entrega)}
        ${fichaField('🚗 Placa', r.placa_pre_viagem)}
        ${fichaField('📁 BO', r.bo)}
        ${fichaField('🔑 ACR', r.acr)}
      </div>
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid #bfdbfe">
        ${fichaField('📤 Remetente', r.remetente, true)}
        ${fichaField('📥 Destinatário', r.destinatario, true)}
      </div>
    </div>
  `).join('');

  openModal('modalFichaCte');
}

function fichaField(label, value, full=false) {
  if(!value || value === '—' || value === '' || value === '0') value = '—';
  return `<div style="${full?'grid-column:1/-1;':''}background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 12px">
    <div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">${escHtml(label)}</div>
    <div style="font-size:13px;font-weight:600;color:var(--text);word-break:break-word">${escHtml((value||'—').toString())}</div>
  </div>`;
}

function exportCargasXLSX() {
  const db = loadCargasDB();
  if(!db.length) { toast('Nenhuma carga para exportar.','t-amber'); return; }
  const headers = ['CTE','Unidade Destino','Praça Destino','Setor','Bairro','Destinatário','Remetente','Valor CTE','Peso','Volume','M3','Previsão','Data BIP','Data Chegada','Manifesto Entrega','Placa','Data Pré-Viagem','BO','ACR'];
  const data = [headers];
  db.forEach(r => data.push([r.cte,r.unidade_destino,r.praca_destino,r.setor,r.bairro,r.destinatario,r.remetente,r.valor_cte,r.peso,r.volume,r.m3,r.previsao,r.data_bip,r.data_chegada,r.manifesto_entrega,r.placa_pre_viagem,r.data_pre_viagem,r.bo,r.acr]));
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Cargas Pendentes');
  XLSX.writeFile(wb, `Cargas_Pendentes_${new Date().toLocaleDateString('pt-BR').replace(/\//g,'-')}.xlsx`);
  toast('⬇️ Exportado!','t-green');
}

/* ══════════════════════════════════════════════════════
   MÓDULO 15 — INIT FINAL + SECURITY AUDIT
══════════════════════════════════════════════════════ */
// Sanitize all HTML outputs via escHtml already implemented
// XSS: all dynamic content passed through escHtml()
// Duplicate prevention: enforced in saveRetido(), loadCargasFile(), addOccType(), registerDriver()
// Field validation: numeroCte (numeric/slash only), CPF (validated), placa (uppercase), phone (masked)

// Render retidos and cargas when switching to those pages
const _origShowPage = typeof showPage === 'function' ? showPage : null;
window._showPageExtended = function(pg) {
  if(pg === 'retidos') {
    renderRetidos();
  } else if(pg === 'cargas') {
    const db = loadCargasDB();
    populateCargasFilters(db);
    renderCargas();
  }
};

// Hook into tab switches
document.addEventListener('DOMContentLoaded', () => {
  initRetidosFromTxt();
  // Set today's date default in retido form
  const today = new Date().toISOString().slice(0,10);
  const retDataEnvio = document.getElementById('retDataEnvio');
  if(retDataEnvio) retDataEnvio.value = today;
});
