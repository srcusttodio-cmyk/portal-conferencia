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

