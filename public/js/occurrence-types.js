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

