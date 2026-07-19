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

