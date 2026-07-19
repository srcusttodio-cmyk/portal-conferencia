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


