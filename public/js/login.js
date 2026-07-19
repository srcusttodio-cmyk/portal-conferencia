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

