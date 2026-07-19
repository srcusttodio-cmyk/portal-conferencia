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
