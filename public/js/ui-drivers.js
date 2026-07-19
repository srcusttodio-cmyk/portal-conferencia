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

