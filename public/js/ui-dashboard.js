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


