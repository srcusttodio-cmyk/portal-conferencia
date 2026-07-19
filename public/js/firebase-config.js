/* ══════════════════════════════════════════════════════
   FIREBASE SETUP (compat mode — funciona no Electron)
══════════════════════════════════════════════════════ */
(function() {
  // ⚠️  SEGURANÇA: As credenciais do Firebase foram removidas do código-fonte.
  // Configure as variáveis abaixo em um arquivo de ambiente (.env) ou via
  // servidor de configuração antes de fazer deploy em produção.
  // Para uso local temporário, substitua os valores vazios pelas suas chaves.
  const firebaseConfig = {
    apiKey:            window.__FB_API_KEY__            || "",
    authDomain:        window.__FB_AUTH_DOMAIN__        || "",
    projectId:         window.__FB_PROJECT_ID__         || "",
    storageBucket:     window.__FB_STORAGE_BUCKET__     || "",
    messagingSenderId: window.__FB_MESSAGING_SENDER_ID__|| "",
    appId:             window.__FB_APP_ID__             || ""
  };

  let fbDB = null;

  function initFB() {
    try {
      if(!firebase.apps.length) firebase.initializeApp(firebaseConfig);
      fbDB = firebase.firestore();
      setSyncStatus('synced');
      // load occTypes from cloud on init
      loadCloudOccTypes();
      // start real-time listener for today
      startTodayListener();
    } catch(e) {
      console.warn('Firebase init error:', e);
      setSyncStatus('offline');
    }
  }

  /* ── SYNC STATUS ── */
  function setSyncStatus(state) {
    const badge = document.getElementById('syncBadge');
    const dot   = document.getElementById('syncDot');
    const text  = document.getElementById('syncText');
    if(!badge) return;
    badge.className = 'sync-badge show ' + state;
    if(state === 'syncing') {
      dot.className = 'sync-dot pulse';
      text.textContent = 'Sincronizando...';
    } else if(state === 'synced') {
      dot.className = 'sync-dot';
      text.textContent = '☁️ Sincronizado';
      setTimeout(() => badge.classList.remove('show'), 3000);
    } else if(state === 'offline') {
      dot.className = 'sync-dot';
      text.textContent = '📴 Modo offline';
    } else if(state === 'error') {
      dot.className = 'sync-dot';
      text.textContent = '⚠️ Erro de sincronização';
    }
  }
  window.setSyncStatus = setSyncStatus;

  /* ── SAVE TODAY ── */
  window.fbSaveToday = async function(rows) {
    if(!fbDB || !rows || !rows.length) return;
    try {
      setSyncStatus('syncing');
      const key = window.todayKey ? window.todayKey() : new Date().toISOString().slice(0,10);
      await fbDB.collection('conferencias').doc(key).set({
        date: key, rows: rows, saved: new Date().toISOString()
      });
      setSyncStatus('synced');
    } catch(e) {
      console.warn('Firebase save error:', e);
      setSyncStatus('offline');
    }
  };

  /* ── SAVE OCC TYPES ── */
  window.fbSaveOccTypes = async function(types) {
    if(!fbDB) return;
    try {
      await fbDB.collection('config').doc('occTypes').set({ types });
    } catch(e) { console.warn('Firebase occTypes save error:', e); }
  };

  /* ── LOAD OCC TYPES FROM CLOUD ── */
  async function loadCloudOccTypes() {
    if(!fbDB) return;
    try {
      const snap = await fbDB.collection('config').doc('occTypes').get();
      if(snap.exists && snap.data().types && snap.data().types.length) {
        window._fbOccTypes = snap.data().types;
        window.dispatchEvent(new Event('fbOccTypesLoaded'));
      }
    } catch(e) { console.warn('Firebase occTypes load error:', e); }
  }

  /* ── LOAD HISTORY ── */
  window.fbLoadHistory = async function() {
    if(!fbDB) return null;
    try {
      const snap = await fbDB.collection('conferencias').get();
      const result = {};
      snap.forEach(d => { result[d.id] = d.data(); });
      return result;
    } catch(e) {
      console.warn('Firebase history load error:', e);
      return null;
    }
  };

  /* ── DELETE HISTORY ENTRY ── */
  window.fbDeleteHistEntry = async function(key) {
    if(!fbDB) return;
    try {
      await fbDB.collection('conferencias').doc(key).delete();
    } catch(e) { console.warn('Firebase delete error:', e); }
  };

  /* ── REAL-TIME LISTENER FOR TODAY ── */
  let todayUnsubscribe = null;
  function startTodayListener() {
    if(!fbDB) return;
    const key = window.todayKey ? window.todayKey() : new Date().toISOString().slice(0,10);
    let first = true;
    todayUnsubscribe = fbDB.collection('conferencias').doc(key).onSnapshot(snap => {
      if(first) { first = false; return; }
      if(!snap.exists) return;
      const data = snap.data();
      if(!data || !data.rows) return;
      // only auto-update if no active session
      if(typeof rows !== 'undefined' && !rows.length) {
        rows = data.rows;
        document.getElementById('importSection').style.display = 'none';
        document.getElementById('dashboard').style.display     = 'block';
        if(typeof renderDashboard === 'function') renderDashboard();
        if(typeof toast === 'function') toast('🔄 Dados atualizados em tempo real!','t-green');
      }
    }, err => console.warn('Listener error:', err));
  }

  // init Firebase after DOM is ready
  if(document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFB);
  } else {
    initFB();
  }
})();
