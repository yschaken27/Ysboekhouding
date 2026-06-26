// ===== STATE =====
let DB = { verkoop:[], inkoop:[], transacties:[], grootboek:[], regels:[], imports:[], profiel:{}, kassalijsten:[], kassiers:[], uren:[], editId:null, editType:null, koppelId:null, csvRaw:[], csvHeaders:[], fVK:'', fsVK:'', fIK:'', fsIK:'', fT:'', fsT:'', huidigeBankId:null };

const DEFAULT_GB = [
  {id:'gb1',nummer:'1000',naam:'Kas',type:'activa',saldo:0},
  {id:'gb2',nummer:'1100',naam:'Hoofdrekening',type:'activa',subtype:'bank',iban:'',saldo:0},
  {id:'gb3',nummer:'1300',naam:'Debiteuren',type:'activa',saldo:0},
  {id:'gb4',nummer:'2000',naam:'Inventaris',type:'vlottende_activa',saldo:0},
  {id:'gb5',nummer:'3000',naam:'Eigen vermogen',type:'eigen_vermogen',saldo:0},
  {id:'gb6',nummer:'4000',naam:'Crediteuren',type:'passiva',saldo:0},
  {id:'gb7',nummer:'8000',naam:'Omzet diensten',type:'omzet',saldo:0},
  {id:'gb8',nummer:'8100',naam:'Omzet producten',type:'omzet',saldo:0},
  {id:'gb9',nummer:'4100',naam:'Personeelskosten',type:'kosten',saldo:0},
  {id:'gb10',nummer:'4200',naam:'Huisvestingskosten',type:'kosten',saldo:0},
  {id:'gb11',nummer:'4300',naam:'Overige kosten',type:'kosten',saldo:0},
  {id:'gb12',nummer:'1500',naam:'BTW te vorderen (inkoop)',type:'activa',saldo:0},
  {id:'gb13',nummer:'1510',naam:'BTW te betalen (verkoop)',type:'passiva',saldo:0},
  {id:'gb14',nummer:'4400',naam:'Afschrijvingskosten',type:'kosten',saldo:0},
  {id:'gb15',nummer:'2900',naam:'Accumuleerde afschrijvingen',type:'passiva',saldo:0},
  {id:'gb16',nummer:'3000',naam:'Privé-opnames eigenaar',type:'eigen_vermogen',saldo:0},
  {id:'gb17',nummer:'3100',naam:'Privé-stortingen eigenaar',type:'eigen_vermogen',saldo:0},
  {id:'gb18',nummer:'8900',naam:'Betalingsverschillen',type:'kosten',saldo:0},
];

// ===== TOAST =====
function toast(msg, type='success', duur=3000){
  const icons={success:'✓',error:'✕',info:'ℹ',warning:'⚠'};
  const container=document.getElementById('toast-container');
  const el=document.createElement('div');
  el.className=`toast ${type}`;
  el.innerHTML=`<span class="toast-icon">${icons[type]||'✓'}</span><span class="toast-msg">${msg}</span><button class="toast-close" onclick="this.closest('.toast').remove()">✕</button>`;
  container.appendChild(el);
  setTimeout(()=>{ el.classList.add('out'); setTimeout(()=>el.remove(),300); },duur);
}

// ===== CONFIRM =====
let _confirmResolve=null;
function bevestig(msg, titel='Bevestigen', btnLabel='Verwijderen'){
  return new Promise(resolve=>{
    _confirmResolve=resolve;
    document.getElementById('confirm-title').textContent=titel;
    document.getElementById('confirm-msg').textContent=msg;
    document.getElementById('confirm-yes').textContent=btnLabel;
    document.getElementById('confirm-overlay').classList.add('open');
  });
}
// Automatisch herladen bij terugkeren naar de app (bijv. wisselen tussen apparaten)
let _visibilityTimer = null;
// Centrale sync functie — herlaadt alles vanuit Firebase
async function volledigeSyncVanuitFirebase(){
  if(!USE_CLOUD || !_loginRol) return;
  toonSyncStatus('laden');
  // Sync bedrijvenlijst en profielnamen parallel aan data reload
  await Promise.all([
    syncBedrijvenVanuitFirebase(),
    laadBedrijfNamenUitFirebase(),
    new Promise(resolve=>{ loadCloud(); setTimeout(resolve, 2000); }),
  ]);
  // Herrender bedrijflijst zodat nieuwe namen zichtbaar zijn
  if(typeof renderBedrijfList === 'function') renderBedrijfList();
}

document.addEventListener('visibilitychange', ()=>{
  if(document.visibilityState === 'visible'){
    // Scherm is weer actief — herlaad alles inclusief bedrijvenlijst en namen
    clearTimeout(_visibilityTimer);
    _visibilityTimer = setTimeout(()=>{
      volledigeSyncVanuitFirebase();
    }, 1000);
  }
});

// Automatisch herladen na 5 minuten inactiviteit
let _inactiviteitTimer = null;
function resetInactiviteitTimer(){
  clearTimeout(_inactiviteitTimer);
  _inactiviteitTimer = setTimeout(()=>{
    if(USE_CLOUD && _loginRol && document.visibilityState === 'visible'){
      volledigeSyncVanuitFirebase();
    }
  }, 5 * 60 * 1000); // 5 minuten
}
['click','keydown','touchstart'].forEach(evt=>{
  document.addEventListener(evt, resetInactiviteitTimer, {passive:true});
});

document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('confirm-yes').onclick=()=>{
    document.getElementById('confirm-overlay').classList.remove('open');
    if(_confirmResolve) _confirmResolve(true);
  };
  document.getElementById('confirm-no').onclick=()=>{
    document.getElementById('confirm-overlay').classList.remove('open');
    if(_confirmResolve) _confirmResolve(false);
  };
});

// ===== KEYBOARD SHORTCUTS =====
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    document.querySelectorAll('.modal-overlay.open').forEach(m=>m.classList.remove('open'));
    document.getElementById('confirm-overlay')?.classList.remove('open');
  }
});

// ===== AUTO FACTUURNUMMER =====
function nextFactuurNummer(type){
  const prefix=type==='verkoop'?'VK':type==='uren'?'UF':'IK';
  const arr=type==='inkoop'?DB.inkoop:DB.verkoop;
  if(!arr.length) return `${prefix}-${new Date().getFullYear()}-001`;
  const nummers=arr
    .filter(f=>type==='uren'?f.nummer?.startsWith('UF-'):type==='verkoop'?f.nummer?.startsWith('VK-'):f.nummer?.startsWith('IK-'))
    .map(f=>{ const m=f.nummer?.match(/(\d+)$/); return m?parseInt(m[1]):0; });
  const max=Math.max(...nummers,0);
  return `${prefix}-${new Date().getFullYear()}-${String(max+1).padStart(3,'0')}`;
}
let huidigBedrijf='Persoonlijk';

function getBedrijven(){
  // In-memory lijst is leidend — gevuld door syncBedrijvenVanuitFirebase bij initLogin
  if(window._bedrijvenLijst?.length) return window._bedrijvenLijst;
  // Fallback: localStorage cache
  try{ return JSON.parse(localStorage.getItem('ledger_bedrijven')||'["Persoonlijk"]'); }
  catch(e){ return ['Persoonlijk']; }
}

function saveBedrijven(lijst){
  window._bedrijvenLijst = lijst;
  localStorage.setItem('ledger_bedrijven',JSON.stringify(lijst));
}

// Profielnamen — in-memory map, gevuld vanuit Firebase bij initLogin
// localStorage alleen als snelle cache tussen sessies
window._bedrijfNamen = {};

function getBedrijfProfielNamen(){
  return window._bedrijfNamen;
}
function saveBedrijfProfielNaam(identifier, weergavenaam){
  window._bedrijfNamen[identifier] = weergavenaam;
  // Sla ook lokaal op als cache voor volgende sessie
  try{
    const cached = JSON.parse(localStorage.getItem('ledger_bedrijf_namen')||'{}');
    cached[identifier] = weergavenaam;
    localStorage.setItem('ledger_bedrijf_namen', JSON.stringify(cached));
  }catch(e){}
}
// Laad cache uit localStorage in geheugen bij opstarten
function laadProfielNamenCache(){
  try{
    const cached = JSON.parse(localStorage.getItem('ledger_bedrijf_namen')||'{}');
    Object.assign(window._bedrijfNamen, cached);
  }catch(e){}
}
// Geeft weergavenaam terug — altijd uit in-memory map (gevuld vanuit Firebase)
function getBedrijfWeergavenaam(identifier){
  return window._bedrijfNamen[identifier] || identifier;
}

function isLocalStorageBeschikbaar(){
  try{ localStorage.setItem('_test','1'); localStorage.removeItem('_test'); return true; }
  catch(e){ return false; }
}

function storageKey(){
  return 'ledger_'+huidigBedrijf.replace(/\s+/g,'_').toLowerCase();
}

// ============================================================
// GOOGLE SHEETS BACKEND CONFIGURATIE
// Plak hier je Apps Script Web App URL na het deployen
// ============================================================
// ============================================================
// FIREBASE CONFIG — vul jouw config hier in
// ============================================================
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyDCwgK-b4OEXAG7-gXqr6j5ilgTRAxuCTM",
  authDomain: "boekhouding-6bcfe.firebaseapp.com",
  projectId: "boekhouding-6bcfe",
  storageBucket: "boekhouding-6bcfe.firebasestorage.app",
  messagingSenderId: "412388229605",
  appId: "1:412388229605:web:ea2b4fc84a68536706ef0c"
};

const USE_CLOUD = true;

// Firebase wrapper — wacht tot FB beschikbaar is
function fbAanroep(fn){
  return new Promise((resolve,reject)=>{
    function probeer(tries=0){
      if(window.FB){ fn(window.FB).then(resolve).catch(reject); }
      else if(tries<50){ setTimeout(()=>probeer(tries+1),100); }
      else { reject('Firebase niet beschikbaar'); }
    }
    probeer();
  });
}

// ============================================================
// OFFLINE CHECK — kassier acties vereisen internetverbinding
// ============================================================
function checkOnline(){
  if(!navigator.onLine){
    toast('Geen internetverbinding. Verbind met wifi of mobiele data en probeer opnieuw.','error');
    return false;
  }
  return true;
}

// ============================================================
// OFFLINE-BLOKKADE: de hele app vereist internet (cloud-only)
// Zonder verbinding verschijnt een scherm over alles heen,
// dat automatisch verdwijnt zodra de verbinding terug is.
// ============================================================
function toonOfflineBlokkade(){
  let el = document.getElementById('offline-blokkade');
  if(!el){
    el = document.createElement('div');
    el.id = 'offline-blokkade';
    el.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(20,28,38,.96);display:flex;align-items:center;justify-content:center;padding:24px;backdrop-filter:blur(4px);';
    el.innerHTML = '<div style="max-width:360px;text-align:center;color:#fff;font-family:var(--sans,sans-serif);">'
      + '<div style="font-size:48px;margin-bottom:16px;">&#128246;</div>'
      + '<div style="font-size:20px;font-weight:600;margin-bottom:10px;">Geen internetverbinding</div>'
      + '<div style="font-size:15px;line-height:1.5;opacity:.85;">Deze app werkt alleen met internet. Verbind met wifi of mobiele data; zodra je weer online bent, gaat het scherm vanzelf verder.</div>'
      + '</div>';
    document.body.appendChild(el);
  }
  el.style.display = 'flex';
}

function verbergOfflineBlokkade(){
  const el = document.getElementById('offline-blokkade');
  if(el) el.style.display = 'none';
}

function updateOfflineBlokkade(){
  if(navigator.onLine) verbergOfflineBlokkade();
  else toonOfflineBlokkade();
}

window.addEventListener('online', updateOfflineBlokkade);
window.addEventListener('offline', updateOfflineBlokkade);
// Bij het laden meteen controleren
if(typeof document !== 'undefined'){
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', updateOfflineBlokkade);
  } else {
    updateOfflineBlokkade();
  }
}


// ============================================================
// SYNC STATUS
// ============================================================
let _syncBezig = false;
let _pendingSave = false;
let _recentlySaved = false;

function toonSyncStatus(status){
  let el = document.getElementById('sync-status');
  if(!el){
    el = document.createElement('div');
    el.id = 'sync-status';
    el.style.cssText = 'position:fixed;bottom:20px;right:20px;padding:8px 14px;border-radius:8px;font-size:12px;font-family:var(--mono);z-index:8000;transition:all .3s;pointer-events:none;display:flex;align-items:center;gap:8px;font-weight:500;box-shadow:0 2px 8px rgba(30,42,59,.12);';
    document.body.appendChild(el);
  }
  const stijlen = {
    opslaan:    'background:#fff;border:1px solid var(--border);color:var(--text-mid);',
    opgeslagen: 'background:#dcfce7;border:1px solid #86efac;color:#15803d;',
    laden:      'background:#dbeafe;border:1px solid #93c5fd;color:#1d4ed8;',
    fout:       'background:#fee2e2;border:1px solid #fca5a5;color:#dc2626;',
    lokaal:     'background:#f1f5f9;border:1px solid var(--border);color:var(--text-mid);',
  };
  const iconen = {
    opslaan:    '↑',
    opgeslagen: '✓',
    laden:      '↓',
    fout:       '✕',
    lokaal:     '◉',
  };
  const tekst = {
    opslaan:    'Opslaan...',
    opgeslagen: 'Opgeslagen in Google Sheets',
    laden:      'Data laden...',
    fout:       'Sync mislukt',
    lokaal:     'Lokaal opgeslagen',
  };
  el.style.cssText += stijlen[status]||stijlen.lokaal;
  el.style.opacity = '1';
  el.innerHTML = `<span>${iconen[status]||'◉'}</span><span>${tekst[status]||status}</span>`;

  // Ook topbar sync indicator updaten
  const topEl = document.getElementById('sync-status-top');
  if(topEl){
    topEl.textContent = tekst[status]||'';
    topEl.style.color = status==='opgeslagen'?'rgba(255,255,255,.9)':status==='fout'?'#fca5a5':'rgba(255,255,255,.6)';
  }

  // Verberg na 3 seconden bij succes, bij fout blijft hij staan
  clearTimeout(window._syncHideTimer);
  if(status==='opgeslagen'){
    window._syncHideTimer = setTimeout(()=>{
      el.style.opacity='0';
    }, 3000);
  } else if(status==='lokaal'){
    window._syncHideTimer = setTimeout(()=>{
      el.style.opacity='0';
    }, 2000);
  }
}


// ============================================================
// SAVE — lokaal + cloud
// ============================================================
function checkBalansEvenwicht(){
  // Balans moet altijd kloppen: Activa = Passiva + Eigen Vermogen + (Omzet - Kosten)
  // Geen enkele afwijking is acceptabel — bij verschil wordt opslaan geblokkeerd
  if(DB.grootboek.length < 5) return true; // te weinig rekeningen voor zinvolle check
  const totActiva = DB.grootboek
    .filter(g=>['vaste_activa','vlottende_activa','activa'].includes(g.type))
    .reduce((a,g)=>a+parseFloat(g.saldo||0),0);
  const totPassiva = DB.grootboek
    .filter(g=>g.type==='passiva')
    .reduce((a,g)=>a+parseFloat(g.saldo||0),0);
  const totEV = DB.grootboek
    .filter(g=>g.type==='eigen_vermogen')
    .reduce((a,g)=>a+parseFloat(g.saldo||0),0);
  const totOmzet = DB.grootboek
    .filter(g=>g.type==='omzet')
    .reduce((a,g)=>a+parseFloat(g.saldo||0),0);
  const totKosten = DB.grootboek
    .filter(g=>g.type==='kosten')
    .reduce((a,g)=>a+parseFloat(g.saldo||0),0);
  const passivaPlusEV = totPassiva + totEV + totOmzet - totKosten;
  const verschil = Math.abs(totActiva - passivaPlusEV);
  if(verschil > 0){
    const msg = `Boekhoudkundige fout — balans is niet in evenwicht.

Activa: ${fmt(totActiva)}
Passiva + EV + Resultaat: ${fmt(passivaPlusEV)}
Verschil: ${fmt(verschil)}

De boeking is niet opgeslagen. Controleer de laatste handeling.`;
    alert(msg);
    console.error('BALANS FOUT:', {totActiva, passivaPlusEV, verschil});
    return false;
  }
  return true;
}

function save(){
  // Blokkeer opslaan als balans niet klopt
  if(!checkBalansEvenwicht()) return;
  localStorage.setItem(storageKey(), JSON.stringify(DB));
  _recentlySaved = true;
  clearTimeout(window._recentSavedTimer);
  // Kort venster: lang genoeg om de eigen Firebase-echo van deze opslag op te
  // vangen (komt doorgaans binnen 1-2s terug), kort genoeg dat een ECHTE wijziging
  // van een ander apparaat niet lang geblokkeerd wordt. 30s was te lang en kon
  // updates van het andere apparaat laten verdwijnen.
  window._recentSavedTimer = setTimeout(()=>{ _recentlySaved=false; }, 3000);
  if(USE_CLOUD) saveCloud();
  else toonSyncStatus('lokaal');
}

let _saveTimer = null;
function saveCloud(){
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(()=>_doSaveCloud(), 800);
}

function _doSaveCloud(){
  // Zonder internet niets naar de cloud schrijven. Firebase is de enige
  // bron van waarheid; er wordt bewust GEEN offline kopie bewaard die later
  // gemerged moet worden (dat veroorzaakte teruggekeerde/verwijderde data).
  if(!checkOnline()){ _syncBezig=false; return; }
  if(_syncBezig){ _pendingSave=true; return; }
  _syncBezig=true;
  toonSyncStatus('opslaan');
  const data = JSON.stringify({
    verkoop:DB.verkoop, inkoop:DB.inkoop, transacties:DB.transacties,
    grootboek:DB.grootboek, regels:DB.regels, memoriaal:DB.memoriaal||[],
    vasteActiva:DB.vasteActiva||[], profiel:DB.profiel||{},
    kassalijsten:DB.kassalijsten||[], kassiers:DB.kassiers||[],
    uren:DB.uren||[],
  });

  function onSuccess(){
    toonSyncStatus('opgeslagen');
    _syncBezig=false;
    if(_pendingSave){ _pendingSave=false; _doSaveCloud(); }
  }
  function onFail(err){
    toonSyncStatus('fout');
    toast('Opslaan mislukt — controleer je internetverbinding en probeer opnieuw.','error');
    console.error('Save fout:', err);
    _syncBezig=false;
    if(_pendingSave){ _pendingSave=false; _doSaveCloud(); }
  }

  fbAanroep(fb=>fb.slaAllesOp(huidigBedrijf, data))
    .then(onSuccess).catch(onFail);
}

// ============================================================
// LOAD — cloud eerst, localStorage als fallback
// ============================================================
function load(){
  // Laad profielnamen cache uit localStorage in geheugen voor snelle weergave
  laadProfielNamenCache();
  const el=document.getElementById('sidebar-bedrijf-naam');
  if(el) el.textContent=getBedrijfWeergavenaam(huidigBedrijf);
  if(USE_CLOUD) loadCloud();
  else loadLokaal();
}

function loadLokaal(){
  // WAARSCHUWING: loadLokaal wordt alleen aangeroepen als USE_CLOUD=false of als Firebase faalt
  // Bij USE_CLOUD=true is Firebase altijd leidend — localStorage is alleen cache
  if(USE_CLOUD) console.warn('[Data] loadLokaal aangeroepen terwijl USE_CLOUD=true — Firebase had prioriteit moeten hebben');
  const r=localStorage.getItem(storageKey());
  if(r){ try{ const p=JSON.parse(r); DB={...DB,...p}; }catch(e){ console.error('localStorage data corrupt:',e); toast('Lokale data kon niet worden geladen — data mogelijk corrupt.','error'); } }
  else {
    DB.verkoop=[]; DB.inkoop=[]; DB.transacties=[]; DB.regels=[]; DB.imports=[];
    DB.grootboek=JSON.parse(JSON.stringify(DEFAULT_GB));
  }
  toonSyncStatus('lokaal');
}

let _stopCloudListeners = ()=>{};
function loadCloud(){
  toonSyncStatus('laden');
  loadLokaal();
  renderDashboard(); renderGB(); renderImports();

  function verwerkCloudData(jsonStr){
    try {
      const d = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
      if(_recentlySaved){ toonSyncStatus('opgeslagen'); return; }

      // Firebase is de enige bron van waarheid. Geen merge: de cloud overschrijft
      // altijd de lokale data. Eigen invoer (kassalijsten, uren) wordt los van save()
      // direct naar Firebase geschreven, dus die zit hier al in de clouddata.
      // De _recentlySaved-check hierboven beschermt een net-gedane eigen wijziging
      // tegen een vertraagde echo, tot Firebase die bevestigt.
      if(d.verkoop      !== undefined) DB.verkoop      = d.verkoop      || [];
      if(d.inkoop       !== undefined) DB.inkoop       = d.inkoop       || [];
      if(d.transacties  !== undefined) DB.transacties  = d.transacties  || [];
      if(d.regels       !== undefined) DB.regels       = d.regels       || [];
      if(d.memoriaal    !== undefined) DB.memoriaal    = d.memoriaal    || [];
      if(d.vasteActiva  !== undefined) DB.vasteActiva  = d.vasteActiva  || [];
      if(d.kassalijsten !== undefined) DB.kassalijsten = d.kassalijsten || [];
      if(d.uren         !== undefined) DB.uren         = d.uren         || [];
      if(d.kassiers     !== undefined) DB.kassiers     = d.kassiers     || [];
      if(d.grootboek    !== undefined) DB.grootboek    = d.grootboek    || [];

      // Profiel: cloud wint altijd (eigenaar beheert dit)
      if(d.profiel && Object.keys(d.profiel).length) DB.profiel=d.profiel;

      localStorage.setItem(storageKey(), JSON.stringify(DB));
      toonSyncStatus('opgeslagen');
      renderDashboard(); renderGB(); renderImports();
      // Uren-zichtbaarheid bijwerken nu de bedrijfsinstelling (profiel) geladen is
      if(_loginRol === 'kassier'){
        verrijkActieveKassier();
        if(typeof mobBouwNav === 'function') mobBouwNav();
        if(typeof renderMobDashboard === 'function') renderMobDashboard();
        // Herlaad actieve tab zodat opdrachtgever-dropdown en uren-lijst bijgewerkt worden
        // als de eigenaar profiel-data (bijv. opdrachtgevers) heeft aangepast.
        const actiefeMobTab = document.querySelector('.mob-page.active')?.id?.replace('mob-page-','');
        if(actiefeMobTab === 'uren' && typeof initMobUren === 'function') initMobUren();
        if(actiefeMobTab === 'kassa' && typeof initMobKassa === 'function') initMobKassa();
      } else {
        const urenNav = document.getElementById('nav-item-urenoverzicht');
        if(urenNav) urenNav.style.display = isUrenAan() ? '' : 'none';
      }
      const actievePagina = document.querySelector('.page.active')?.id?.replace('page-','');
      if(actievePagina && actievePagina!=='dashboard') showPage(actievePagina);
    } catch(e){
      toonSyncStatus('fout');
      toast('Cloud laden mislukt — lokale data wordt gebruikt.','warning');
      console.error('Load fout:', e);
    }
  }

  _stopCloudListeners();
  if(!window.FB){ toonSyncStatus('fout'); return; }
  _stopCloudListeners = window.FB.luisterAlles(
    huidigBedrijf,
    verwerkCloudData,
    err=>{ toonSyncStatus('fout'); toast('Cloud laden mislukt.','warning'); console.error('Load fout:', err); }
  );
  laadGebruikersInDB();
}
async function laadGebruikersInDB(){
  try{
    const json = await fbAanroep(fb=>fb.laadGebruikers());
    const lijst = JSON.parse(json||'[]');
    if(Array.isArray(lijst)){
      DB.kassiers = lijst;
      localStorage.setItem(storageKey(), JSON.stringify(DB));
      // Herverrijk de actieve kassier — laadGebruikersInDB loopt asynchroon en
      // kan DB.kassiers overschrijven nádat verrijkActieveKassier() al gedraaid had.
      if(typeof verrijkActieveKassier === 'function') verrijkActieveKassier();
      if(typeof mobBouwNav === 'function') mobBouwNav();
    }
  }catch(e){ /* offline: bestaande DB.kassiers bewaren */ }
}

// ============================================================
// BEDRIJVEN — cloud + lokaal
// ============================================================
async function wisselBedrijf(naam){
  _stopCloudListeners();
  _stopCloudListeners = ()=>{};
  huidigBedrijf=naam;
  localStorage.setItem('ledger_actief_bedrijf', naam);
  DB={ verkoop:[], inkoop:[], transacties:[], grootboek:[], regels:[], imports:[],
       profiel:{}, memoriaal:[], vasteActiva:[], kassalijsten:[], kassiers:[], uren:[],
       editId:null, editType:null, koppelId:null,
       csvRaw:[], csvHeaders:[], fVK:'', fsVK:'', fIK:'', fsIK:'', fT:'', fsT:'', huidigeBankId:null };
  closeModal('modal-bedrijf');
  showPage('dashboard');
  load();
  renderGB(); renderRegels();
  const el=document.getElementById('sidebar-bedrijf-naam');
  if(el) el.textContent=getBedrijfWeergavenaam(naam);
}

async function voegBedrijfToe(){
  const naam=document.getElementById('nieuw-bedrijf-naam').value.trim();
  if(!naam){toast('Vul een bedrijfsnaam in.','error');return;}
  const lijst=getBedrijven();
  if(lijst.includes(naam)){toast('Dit bedrijf bestaat al.','warning');return;}

  // Identifier = naam (uniek, gebruikt als Firebase sleutel)
  lijst.push(naam);
  saveBedrijven(lijst);
  // Sla ook weergavenaam op in lokale map
  saveBedrijfProfielNaam(naam, naam);

  document.getElementById('nieuw-bedrijf-naam').value='';
  renderBedrijfList();

  // Cloud: maak bedrijf aan in Firebase — verwijder lokaal als dat mislukt
  try{
    await fbAanroep(fb=>fb.maakBedrijf(naam));
    toast(`Bedrijf "${naam}" aangemaakt.`,'success');
  }catch(e){
    // Rollback: verwijder lokaal want Firebase aanmaken faalde
    const terugLijst = getBedrijven().filter(b=>b!==naam);
    saveBedrijven(terugLijst);
    renderBedrijfList();
    toast(`Bedrijf aanmaken mislukt — controleer je verbinding.`,'error');
  }
}

// ============================================================
// BIJLAGEN — Google Drive upload
// ============================================================
async function slaaBijlagenOp(factuurId){
  if(!USE_CLOUD){
    // Lokale modus: gebruik IndexedDB zoals voorheen
    return _slaaBijlagenIDB(factuurId);
  }
  // Cloud modus: zonder internet kan er niets geüpload worden
  if(!checkOnline()) return [];
  // Cloud modus: upload naar Google Drive
  const meta = [];
  for(let i=0; i<_bijlagenBuffer.length; i++){
    const b = _bijlagenBuffer[i];
    if(!b.isNew && b.driveId){ meta.push(b); continue; } // Al geupload
    try {
      const uploadResult = await fbAanroep(fb=>fb.uploadBijlage(huidigBedrijf, JSON.stringify({naam:b.naam,type:b.type,data:b.data,factuurId})))
        .then(r=>{ try{ const j=JSON.parse(r||'{}'); return j.ok?j.result:null; }catch(e){ return null; } })
        .catch(()=>null);
      if(uploadResult){
        meta.push({naam:b.naam, type:b.type, datum:b.datum, ...uploadResult});
      } else {
        toast(`Upload mislukt: ${b.naam}`,'error');
      }
    } catch(e){
      toast(`Upload fout: ${b.naam}`,'error');
    }
  }
  return meta;
}

// Lokale IndexedDB fallback voor bijlagen
async function _slaaBijlagenIDB(factuurId){
  const db = await openIDB();
  const alleKeys = await new Promise(res=>{
    const tx = db.transaction(IDB_STORE,'readonly');
    const req = tx.objectStore(IDB_STORE).getAllKeys();
    req.onsuccess = ()=>res(req.result);
  });
  const oudeKeys = alleKeys.filter(k=>k.startsWith(`factuur_${factuurId}_`));
  for(const k of oudeKeys) await idbVerwijder(k);
  for(let i=0; i<_bijlagenBuffer.length; i++){
    const b = _bijlagenBuffer[i];
    await idbSla(bijlageIdbId(factuurId, i), {naam:b.naam, type:b.type, datum:b.datum});
    await idbSla(bijlageIdbId(factuurId, i)+'_data', b.data);
  }
  return _bijlagenBuffer.map(b=>({naam:b.naam, type:b.type, datum:b.datum}));
}

async function verwijderBedrijf(naam){
  if(naam===huidigBedrijf){toast('Wissel eerst naar een ander bedrijf voor je dit verwijdert.','warning');return;}
  const ok=await bevestig(`Bedrijf "${naam}" en alle data permanent verwijderen?\n\nDit verwijdert ook alle data in Firebase.`,'Bedrijf verwijderen','Verwijderen');
  if(!ok) return;
  // Verwijder lokaal
  localStorage.removeItem('ledger_'+naam.replace(/\s+/g,'_').toLowerCase());
  const lijst=getBedrijven().filter(b=>b!==naam);
  saveBedrijven(lijst);
  // Verwijder uit Firebase — alle subcollectie documenten
  try{
    const db = window.FB?.db;
    if(db){
      const docs = ['main','verkoop','inkoop','transacties','kassalijsten'];
      await Promise.all(docs.map(doc=>
        db.collection('bedrijven').doc(naam).collection('data').doc(doc).delete().catch(()=>{})
      ));
      // Verwijder uploads subcollectie
      const upSnap = await db.collection('bedrijven').doc(naam).collection('uploads').get().catch(()=>null);
      if(upSnap) await Promise.all(upSnap.docs.map(d=>d.ref.delete().catch(()=>{})));
      // Verwijder ook eventuele toegang/gastenlijst subcollectie
      const toeSnap = await db.collection('bedrijven').doc(naam).collection('toegang').get().catch(()=>null);
      if(toeSnap) await Promise.all(toeSnap.docs.map(d=>d.ref.delete().catch(()=>{})));
      // BELANGRIJK: verwijder tot slot het bedrijf-document zelf. Zonder dit
      // blijft bedrijven/{naam} bestaan (met zijn naam-veld) en blijft het
      // bedrijf op andere apparaten in de lijst staan.
      await db.collection('bedrijven').doc(naam).delete().catch(()=>{});
      toast(`Bedrijf "${naam}" volledig verwijderd.`,'info');
    }
  }catch(e){
    toast(`Bedrijf lokaal verwijderd — cloud verwijdering mislukt.`,'warning');
    console.error('Firebase verwijder fout:', e);
  }
  renderBedrijfList();
}

function switchBedrijfTab(tab){
  ['lijst','profiel','opdrachtgevers'].forEach(t=>{
    const tabEl = document.getElementById('bedrijf-tab-'+t);
    const wrapEl = document.getElementById('bedrijf-wrap-'+t);
    if(tabEl) tabEl.classList.toggle('active',t===tab);
    if(wrapEl) wrapEl.style.display=t===tab?'':'none';
  });
  if(tab==='profiel') laadBedrijfProfiel();
  if(tab==='opdrachtgevers') renderCentraalOpdrachtgevers();
}

function laadBedrijfProfiel(){
  const p=DB.profiel||{};
  document.getElementById('bp-naam').value=p.naam||huidigBedrijf;
  document.getElementById('bp-kvk').value=p.kvk||'';
  document.getElementById('bp-btw').value=p.btw||'';
  document.getElementById('bp-iban').value=p.iban||'';
  document.getElementById('bp-tel').value=p.tel||'';
  document.getElementById('bp-email').value=p.email||'';
  document.getElementById('bp-adres').value=p.adres||'';
  document.getElementById('bp-website').value=p.website||'';
  document.getElementById('bp-rechtsvorm').value=p.rechtsvorm||'';
  document.getElementById('bp-boekjaar').value=p.boekjaar||'1';
  document.getElementById('bp-btw-standaard').value=p.btwStandaard||'21';
  document.getElementById('bp-btw-stelsel').value=p.btwStelsel||'factuurstelsel';
  document.getElementById('bp-uren-aan').checked = !!p.urenAan;
  document.getElementById('bp-notities').value=p.notities||'';
}

function slaBedrijfProfielOp(){
  DB.profiel={
    naam:document.getElementById('bp-naam').value.trim(),
    kvk:document.getElementById('bp-kvk').value.trim(),
    btw:document.getElementById('bp-btw').value.trim(),
    iban:document.getElementById('bp-iban').value.trim(),
    tel:document.getElementById('bp-tel').value.trim(),
    email:document.getElementById('bp-email').value.trim(),
    adres:document.getElementById('bp-adres').value.trim(),
    website:document.getElementById('bp-website').value.trim(),
    rechtsvorm:document.getElementById('bp-rechtsvorm').value,
    boekjaar:document.getElementById('bp-boekjaar').value,
    btwStandaard:document.getElementById('bp-btw-standaard').value,
    btwStelsel:document.getElementById('bp-btw-stelsel').value,
    urenAan:document.getElementById('bp-uren-aan').checked,
    notities:document.getElementById('bp-notities').value.trim(),
    opdrachtgevers: DB.profiel?.opdrachtgevers || [],
  };
  // Sla weergavenaam op in profielnamen map zodat bedrijflijst het toont
  if(DB.profiel.naam){
    saveBedrijfProfielNaam(huidigBedrijf, DB.profiel.naam);
    const el=document.getElementById('sidebar-bedrijf-naam');
    if(el) el.textContent=DB.profiel.naam;
  }
  save();
  renderBedrijfList();
  closeModal('modal-bedrijf');toast('Profiel opgeslagen.');
}

function renderBedrijfList(){
  const lijst=getBedrijven();
  const el=document.getElementById('bedrijf-list');
  if(!el) return;
  el.innerHTML=lijst.map(b=>{
    const weergave = getBedrijfWeergavenaam(b);
    const isActief = b===huidigBedrijf;
    return `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-radius:6px;margin-bottom:6px;background:${isActief?'rgba(0,255,135,.08)':'var(--surface2)'};border:1px solid ${isActief?'rgba(0,255,135,.3)':'var(--border)'};">
      <div>
        <div style="font-size:13px;font-weight:500;">${weergave}</div>
        ${weergave!==b?`<div style="font-size:10px;color:var(--text-dim);margin-top:1px;">${b}</div>`:''}
        ${isActief?'<div style="font-size:11px;color:var(--accent);margin-top:2px;">Actief</div>':''}
      </div>
      <div style="display:flex;gap:6px;">
        ${!isActief?`<button class="btn btn-primary btn-sm" onclick="wisselBedrijf('${b}')">Wissel</button>`:''}
        ${lijst.length>1&&!isActief?`<button class="btn btn-danger btn-sm" onclick="verwijderBedrijf('${b}')">✕</button>`:''}
      </div>
    </div>`;
  }).join('');
}

function openBedrijfModal(){
  renderBedrijfList();
  // Opdrachtgevers-tab alleen tonen als uren-registratie actief is
  const opdrTab = document.getElementById('bedrijf-tab-opdrachtgevers');
  if(opdrTab) opdrTab.style.display = isUrenAan() ? '' : 'none';
  switchBedrijfTab('lijst');
  openModal('modal-bedrijf');
}

// ===== CENTRAAL OPDRACHTGEVER-REGISTER =====
let _cpOpdrachtgevers = [];

function renderCentraalOpdrachtgevers(){
  _cpOpdrachtgevers = JSON.parse(JSON.stringify(DB.profiel?.opdrachtgevers || [])).map(o=>{
    if(!Array.isArray(o.tarieven)){
      const t = parseFloat(o.tarief);
      o.tarieven = t > 0 ? [{naam:'Standaard', bedrag:t}] : [{naam:'', bedrag:null}];
    }
    return o;
  });
  _tekenCentraalOpdrachtgevers();
}

function _tekenCentraalOpdrachtgevers(){
  const el = document.getElementById('bp-opdrachtgevers-lijst');
  if(!el) return;
  if(!_cpOpdrachtgevers.length){
    el.innerHTML = '<div style="font-size:12px;color:var(--text-dim);padding:8px 0;">Nog geen opdrachtgevers toegevoegd.</div>';
    return;
  }
  el.innerHTML = _cpOpdrachtgevers.map((o,i)=>`
    <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:12px;">
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;">
        <input type="text" value="${esc(o.naam||'')}" placeholder="Naam opdrachtgever"
          oninput="_cpOpdrachtgevers[${i}].naam=this.value"
          style="flex:1;font-size:13px;font-weight:600;padding:7px 9px;">
        <button type="button" onclick="verwijderCentraalOpdrachtgever(${i})" title="Verwijderen"
          style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:16px;">🗑</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;">
        <input type="text" value="${esc(o.adres||'')}" placeholder="Adres (straat, postcode, stad)"
          oninput="_cpOpdrachtgevers[${i}].adres=this.value"
          style="font-size:12px;padding:6px 8px;">
        <div style="display:flex;gap:6px;">
          <input type="text" value="${esc(o.btwNummer||'')}" placeholder="BTW-nummer (optioneel)"
            oninput="_cpOpdrachtgevers[${i}].btwNummer=this.value"
            style="flex:1;font-size:12px;padding:6px 8px;">
          <input type="email" value="${esc(o.email||'')}" placeholder="E-mailadres"
            oninput="_cpOpdrachtgevers[${i}].email=this.value"
            style="flex:1;font-size:12px;padding:6px 8px;">
        </div>
        <div style="margin-top:6px;">
          <div style="font-size:11px;color:var(--text-dim);margin-bottom:4px;">Tarieven</div>
          ${(o.tarieven||[]).map((t,ti)=>`
            <div style="display:flex;gap:6px;align-items:center;margin-bottom:4px;">
              <input type="text" value="${esc(t.naam||'')}" placeholder="Omschrijving (bijv. Dag)"
                oninput="_cpOpdrachtgevers[${i}].tarieven[${ti}].naam=this.value"
                style="flex:1;font-size:12px;padding:5px 7px;">
              <input type="number" min="0" step="0.01" value="${t.bedrag!=null?t.bedrag:''}" placeholder="€/u"
                oninput="_cpOpdrachtgevers[${i}].tarieven[${ti}].bedrag=parseFloat(this.value)||null"
                style="width:80px;font-size:12px;padding:5px 7px;">
              <button type="button" onclick="_cpVerwijderTarief(${i},${ti})"
                style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:14px;padding:0 4px;">✕</button>
            </div>`).join('')}
          <button type="button" onclick="_cpVoegTariefToe(${i})"
            style="font-size:11px;color:var(--accent);background:none;border:none;cursor:pointer;padding:2px 0;">+ Tarief toevoegen</button>
        </div>
      </div>
    </div>`).join('');
}

function _cpVoegTariefToe(i){
  if(!Array.isArray(_cpOpdrachtgevers[i].tarieven)) _cpOpdrachtgevers[i].tarieven=[];
  _cpOpdrachtgevers[i].tarieven.push({naam:'',bedrag:null});
  _tekenCentraalOpdrachtgevers();
}
function _cpVerwijderTarief(i,ti){
  _cpOpdrachtgevers[i].tarieven.splice(ti,1);
  _tekenCentraalOpdrachtgevers();
}

function voegCentraalOpdrachtgeverToe(){
  _cpOpdrachtgevers.push({ naam:'', adres:'', btwNummer:'', email:'', tarieven:[{naam:'', bedrag:null}] });
  _tekenCentraalOpdrachtgevers();
}

function verwijderCentraalOpdrachtgever(i){
  _cpOpdrachtgevers.splice(i,1);
  _tekenCentraalOpdrachtgevers();
}

function slaCentraalOpdrachtgeversOp(){
  const schoon = _cpOpdrachtgevers
    .map(o=>({
      naam: (o.naam||'').trim(),
      adres: (o.adres||'').trim(),
      btwNummer: (o.btwNummer||'').trim(),
      email: (o.email||'').trim(),
      tarieven: (o.tarieven||[]).map(t=>({naam:(t.naam||'').trim(), bedrag:parseFloat(t.bedrag)||0})).filter(t=>t.bedrag>0||t.naam),
    }))
    .filter(o=>o.naam);
  if(!DB.profiel) DB.profiel={};
  DB.profiel.opdrachtgevers = schoon;
  save();
  closeModal('modal-bedrijf');
  toast('Opdrachtgevers opgeslagen.');
}

// ===== OPDRACHTGEVERS MODAL (standalone) =====
function openOpdrachtgeversModal(){
  _cpOpdrachtgevers = JSON.parse(JSON.stringify(DB.profiel?.opdrachtgevers || [])).map(o=>{
    if(!Array.isArray(o.tarieven)){
      const t = parseFloat(o.tarief);
      o.tarieven = t > 0 ? [{naam:'Standaard', bedrag:t}] : [{naam:'', bedrag:null}];
    }
    return o;
  });
  _tekenOpdrachtgeversModal();
  openModal('modal-opdrachtgevers');
}

function _tekenOpdrachtgeversModal(){
  const el = document.getElementById('opm-lijst');
  if(!el) return;
  if(!_cpOpdrachtgevers.length){
    el.innerHTML = '<div style="font-size:12px;color:var(--text-dim);padding:8px 0;">Nog geen opdrachtgevers toegevoegd.</div>';
    return;
  }
  el.innerHTML = _cpOpdrachtgevers.map((o,i)=>`
    <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:12px;">
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;">
        <input type="text" value="${esc(o.naam||'')}" placeholder="Naam opdrachtgever"
          oninput="_cpOpdrachtgevers[${i}].naam=this.value"
          style="flex:1;font-size:13px;font-weight:600;padding:7px 9px;">
        <button type="button" onclick="verwijderOpdrachtgeverModal(${i})" title="Verwijderen"
          style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:16px;">🗑</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;">
        <input type="text" value="${esc(o.adres||'')}" placeholder="Adres (straat, postcode, stad)"
          oninput="_cpOpdrachtgevers[${i}].adres=this.value"
          style="font-size:12px;padding:6px 8px;">
        <div style="display:flex;gap:6px;">
          <input type="text" value="${esc(o.btwNummer||'')}" placeholder="BTW-nummer (optioneel)"
            oninput="_cpOpdrachtgevers[${i}].btwNummer=this.value"
            style="flex:1;font-size:12px;padding:6px 8px;">
          <input type="email" value="${esc(o.email||'')}" placeholder="E-mailadres"
            oninput="_cpOpdrachtgevers[${i}].email=this.value"
            style="flex:1;font-size:12px;padding:6px 8px;">
        </div>
        <div style="margin-top:6px;">
          <div style="font-size:11px;color:var(--text-dim);margin-bottom:4px;">Tarieven</div>
          ${(o.tarieven||[]).map((t,ti)=>`
            <div style="display:flex;gap:6px;align-items:center;margin-bottom:4px;">
              <input type="text" value="${esc(t.naam||'')}" placeholder="Omschrijving (bijv. Dag)"
                oninput="_cpOpdrachtgevers[${i}].tarieven[${ti}].naam=this.value"
                style="flex:1;font-size:12px;padding:5px 7px;">
              <input type="number" min="0" step="0.01" value="${t.bedrag!=null?t.bedrag:''}" placeholder="€/u"
                oninput="_cpOpdrachtgevers[${i}].tarieven[${ti}].bedrag=parseFloat(this.value)||null"
                style="width:80px;font-size:12px;padding:5px 7px;">
              <button type="button" onclick="_opmVerwijderTarief(${i},${ti})"
                style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:14px;padding:0 4px;">✕</button>
            </div>`).join('')}
          <button type="button" onclick="_opmVoegTariefToe(${i})"
            style="font-size:11px;color:var(--accent);background:none;border:none;cursor:pointer;padding:2px 0;">+ Tarief toevoegen</button>
        </div>
      </div>
    </div>`).join('');
}

function _opmVoegTariefToe(i){
  if(!Array.isArray(_cpOpdrachtgevers[i].tarieven)) _cpOpdrachtgevers[i].tarieven=[];
  _cpOpdrachtgevers[i].tarieven.push({naam:'',bedrag:null});
  _tekenOpdrachtgeversModal();
}
function _opmVerwijderTarief(i,ti){
  _cpOpdrachtgevers[i].tarieven.splice(ti,1);
  _tekenOpdrachtgeversModal();
}

function voegOpdrachtgeverModalToe(){
  _cpOpdrachtgevers.push({ naam:'', adres:'', btwNummer:'', email:'', tarieven:[{naam:'', bedrag:null}] });
  _tekenOpdrachtgeversModal();
}

function verwijderOpdrachtgeverModal(i){
  _cpOpdrachtgevers.splice(i,1);
  _tekenOpdrachtgeversModal();
}

function slaOpdrachtgeversModalOp(){
  const schoon = _cpOpdrachtgevers
    .map(o=>({
      naam: (o.naam||'').trim(),
      adres: (o.adres||'').trim(),
      btwNummer: (o.btwNummer||'').trim(),
      email: (o.email||'').trim(),
      tarieven: (o.tarieven||[]).map(t=>({naam:(t.naam||'').trim(), bedrag:parseFloat(t.bedrag)||0})).filter(t=>t.bedrag>0||t.naam),
    }))
    .filter(o=>o.naam);
  if(!DB.profiel) DB.profiel={};
  DB.profiel.opdrachtgevers = schoon;
  save();
  closeModal('modal-opdrachtgevers');
  toast('Opdrachtgevers opgeslagen.');
}

function uid(){ return 'id_'+Date.now()+'_'+Math.random().toString(36).slice(2,6); }

// ===== KASSTELSEL HELPERS =====
function isKasstelsel(){
  return (DB.profiel?.btwStelsel||'factuurstelsel') === 'kasstelsel';
}

// ===== UREN-MODULE (bedrijfsinstelling) =====
// Staat uren-registratie aan voor het huidige bedrijf?
function isUrenAan(){
  return !!(DB.profiel?.urenAan);
}

// Zoek alle gekoppelde banktransacties voor een factuur
function _getBetalingen(factuur){
  return DB.transacties.filter(t=>
    t.status==='gekoppeld' &&
    (t.factuurId===factuur.id ||
     (factuur.nummer && t.gekoppeldAan && t.gekoppeldAan.includes(factuur.nummer)))
  );
}

// Berekent hoeveel van het factuurtotaal betaald is (ratio 0-1)
// Altijd 1 bij factuurstelsel
function _getBetaaldRatio(factuur){
  if(!isKasstelsel()) return 1;
  const totaalIncl = parseFloat(factuur.totaalIncl||0);
  if(totaalIncl <= 0) return 0;
  const betaald = _getBetalingen(factuur).reduce((a,t)=>a+Math.abs(parseFloat(t.bedrag)||0),0);
  return Math.min(betaald / totaalIncl, 1);
}

// Geeft de relevante datum terug voor BTW aangifte:
// - Factuurstelsel: altijd factuurdatum
// - Kasstelsel: datum van eerste betaling, null als nog niet betaald
// - Kasstelsel fallback: als factuur status=betaald maar geen transactie gevonden,
//   gebruik factuurdatum zodat handmatig betaalde facturen niet wegvallen
function getBtwDatum(factuur){
  if(!isKasstelsel()) return factuur.datum;
  const betalingen = _getBetalingen(factuur);
  if(betalingen.length > 0){
    // Gebruik de vroegste betaaldatum
    return betalingen
      .map(t=>t.datum)
      .filter(Boolean)
      .sort()[0] || null;
  }
  // Fallback: factuur handmatig op betaald gezet zonder bankkoppeling
  if(factuur.status === 'betaald') return factuur.datum;
  return null; // onbetaald, telt niet mee
}

// Geeft de belastbare omzet excl BTW terug voor deze factuur in deze periode
// Bij kasstelsel: proportioneel op basis van betaald bedrag
function getOmzetKas(factuur){
  const ratio = _getBetaaldRatio(factuur);
  return parseFloat(factuur.totaalExcl||0) * ratio;
}

// Geeft het aftrekbare BTW-bedrag terug voor inkoop
// Bij kasstelsel: proportioneel op basis van betaald bedrag
function getBtwBedragKas(factuur){
  const ratio = _getBetaaldRatio(factuur);
  return parseFloat(factuur.btwBedrag||0) * ratio;
}

// Geeft de aftrekbare inkoop excl BTW terug
// Bij kasstelsel: proportioneel op basis van betaald bedrag
function getInkoopKas(factuur){
  const ratio = _getBetaaldRatio(factuur);
  return parseFloat(factuur.totaalExcl||0) * ratio;
}
function today(){ return new Date().toISOString().split('T')[0]; }
function fmt(n){ return '€ '+parseFloat(n||0).toFixed(2).replace('.',',').replace(/\B(?=(\d{3})+(?!\d))/g,'.'); }
function fmtRaw(n){ return parseFloat(n||0).toFixed(2).replace('.',','); }
// Consistente afronding op 2 decimalen — voorkomt floating point fouten
function rond(n){ return Math.round((parseFloat(n)||0)*100)/100; }
// Veilige optelling die floating point fouten voorkomt
function telOp(...bedragen){ return rond(bedragen.reduce((a,b)=>a+(parseFloat(b)||0),0)); }
// XSS escaping — gebruik altijd voor gebruikersinvoer in innerHTML
function esc(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function badge(s){
  const m={concept:'badge-gray',verstuurd:'badge-orange',betaald:'badge-green',verlopen:'badge-red',
           gedeeltelijk:'badge-blue',ontvangen:'badge-blue','te betalen':'badge-orange',
           ingediend:'badge-orange',goedgekeurd:'badge-green',afgewezen:'badge-red'};
  return `<span class="badge ${m[s]||'badge-gray'}">${s}</span>`;
}
function openModal(id){ document.getElementById(id).classList.add('open'); }
function closeModal(id){ document.getElementById(id).classList.remove('open'); }

