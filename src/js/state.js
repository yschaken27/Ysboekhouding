// ===== STATE =====
let DB = { verkoop:[], inkoop:[], transacties:[], grootboek:[], regels:[], imports:[], btwNotities:{}, profiel:{}, kassalijsten:[], kassiers:[], uren:[], editId:null, editType:null, koppelId:null, csvRaw:[], csvHeaders:[], fVK:'', fsVK:'', fIK:'', fsIK:'', fT:'', fsT:'', huidigeBankId:null };

// Standaard rekeningschema (zzp). Bestaande nummers zijn bewust ongewijzigd
// zodat lopende boekingen kloppen. 'Accumuleerde afschrijvingen' staat als
// type 'passiva' maar wordt door renderBalans (via de naam 'accum'/'afschr')
// aan de ACTIVA-kant als contra-activa (min) getoond — dat is de bedoeling.
const DEFAULT_GB = [
  // --- Liquide middelen ---
  {id:'gb1',nummer:'1000',naam:'Kas',type:'activa',saldo:0},
  {id:'gb2',nummer:'1100',naam:'Bank – hoofdrekening',type:'activa',subtype:'bank',iban:'',saldo:0},
  {id:'gb19',nummer:'1200',naam:'Spaarrekening',type:'activa',saldo:0},
  // --- Vorderingen & BTW ---
  {id:'gb3',nummer:'1300',naam:'Debiteuren',type:'activa',saldo:0},
  {id:'gb12',nummer:'1500',naam:'BTW te vorderen (inkoop)',type:'activa',saldo:0},
  {id:'gb13',nummer:'1510',naam:'BTW te betalen (verkoop)',type:'passiva',saldo:0},
  // --- Vlottende / vaste activa ---
  {id:'gb4',nummer:'2000',naam:'Inventaris',type:'vlottende_activa',saldo:0},
  {id:'gb15',nummer:'2900',naam:'Accumuleerde afschrijvingen',type:'passiva',saldo:0},
  // --- Passiva (schulden) ---
  {id:'gb6',nummer:'2100',naam:'Crediteuren',type:'passiva',saldo:0},
  {id:'gb20',nummer:'2200',naam:'Te betalen belastingen',type:'passiva',saldo:0},
  // --- Eigen vermogen & privé ---
  {id:'gb5',nummer:'3000',naam:'Eigen vermogen',type:'eigen_vermogen',saldo:0},
  {id:'gb17',nummer:'3100',naam:'Privé-stortingen eigenaar',type:'eigen_vermogen',saldo:0},
  {id:'gb16',nummer:'3200',naam:'Privé-opnames eigenaar',type:'eigen_vermogen',saldo:0},
  // --- Omzet ---
  {id:'gb7',nummer:'4000',naam:'Omzet diensten',type:'omzet',saldo:0},
  {id:'gb8',nummer:'4100',naam:'Omzet producten',type:'omzet',saldo:0},
  {id:'gb21',nummer:'4200',naam:'Omzet uren/dagtarief',type:'omzet',saldo:0},
  // --- Kosten ---
  {id:'gb22',nummer:'8000',naam:'Inkoopwaarde omzet',type:'kosten',saldo:0},
  {id:'gb9',nummer:'8100',naam:'Personeelskosten',type:'kosten',saldo:0},
  {id:'gb10',nummer:'8200',naam:'Huisvestingskosten',type:'kosten',saldo:0},
  {id:'gb11',nummer:'8300',naam:'Overige kosten',type:'kosten',saldo:0},
  {id:'gb14',nummer:'8400',naam:'Afschrijvingskosten',type:'kosten',saldo:0},
  {id:'gb24',nummer:'8500',naam:'Verkoop- en marketingkosten',type:'kosten',saldo:0},
  {id:'gb25',nummer:'8600',naam:'Kantoor- en administratiekosten',type:'kosten',saldo:0},
  {id:'gb26',nummer:'8700',naam:'Verzekeringen',type:'kosten',saldo:0},
  {id:'gb27',nummer:'8800',naam:'Autokosten',type:'kosten',saldo:0},
  {id:'gb18',nummer:'8900',naam:'Betalingsverschillen',type:'kosten',saldo:0},
];

// Vult ontbrekende standaardrekeningen aan bij een bestaand bedrijf: voegt
// alleen toe wat qua nummer nog niet bestaat, bestaande rekeningen en saldi
// blijven ongemoeid. Geeft het aantal toegevoegde rekeningen terug.
function vulStandaardRekeningenAan(){
  if(!Array.isArray(DB.grootboek)) DB.grootboek = [];
  const bestaand = new Set(DB.grootboek.map(g=>String(g.nummer)));
  let toegevoegd = 0;
  DEFAULT_GB.forEach(std=>{
    if(!bestaand.has(String(std.nummer))){
      DB.grootboek.push({...std, id:'gb_std_'+std.nummer});
      bestaand.add(String(std.nummer));
      toegevoegd++;
    }
  });
  return toegevoegd;
}

// Labels bij de type-waarden — gedeeld door renderGB en de typevalidatie in slaGBOp.
const GB_TYPE_LABELS = {
  vaste_activa:'Vaste activa', vlottende_activa:'Vlottende activa', activa:'Activa',
  passiva:'Passiva', eigen_vermogen:'Eigen vermogen', omzet:'Omzet', kosten:'Kosten'
};

// Herstelt het `type` van standaardrekeningen dat in de bedrijfsdata is afgeweken.
// Boekingen zoeken rekeningen op NUMMER (find(g=>g.nummer==='1300')), maar
// checkBalansEvenwicht() en renderBalans groeperen op TYPE. Staat 1300 Debiteuren
// dus op 'passiva', dan belandt een volkomen correcte factuurboeking aan de
// credit-kant en blokkeert de balanscontrole elke volgende opslag — een fout die
// als codebug oogt terwijl alleen de data stuk is (zie CLAUDE.md #24).
// Draait bij elke load, vóór de eerste save: idempotent, raakt alleen nummers uit
// DEFAULT_GB, laat saldi, namen en zelf toegevoegde rekeningen ongemoeid.
// Net als vulStandaardRekeningenAan() alleen in-memory — save() zou hier nog
// blokkeren op het (nog niet herstelde) balansverschil; de correctie persisteert
// vanzelf bij de eerstvolgende reguliere save van de gebruiker.
function herstelGBTypes(){
  if(!Array.isArray(DB.grootboek)) return 0;
  const hersteld = [];
  DB.grootboek.forEach(g=>{
    const std = DEFAULT_GB.find(s=>String(s.nummer)===String(g.nummer));
    if(std && g.type !== std.type){
      hersteld.push(`${g.nummer} ${g.naam}: ${g.type||'(leeg)'} → ${std.type}`);
      g.type = std.type;
    }
  });
  if(hersteld.length){
    console.warn('[Grootboek] verkeerd rekeningtype hersteld:\n'+hersteld.join('\n'));
    toast(`${hersteld.length} grootboekrekening(en) hadden een verkeerd type — automatisch hersteld. Controleer de balans.`,'warning',7000);
  }
  return hersteld.length;
}

// ===== TOAST =====
function toast(msg, type='success', duur=3000){
  const icons={success:'✓',error:'✕',info:'ℹ',warning:'⚠'};
  const container=document.getElementById('toast-container');
  // Kan ontbreken als er al vóór DOMContentLoaded getoast wordt (bijv. herstelGBTypes
  // tijdens een vroege load) — dan alleen loggen i.p.v. crashen op appendChild.
  if(!container){ console.log('[toast]', type, msg); return; }
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
  } else {
    // Naar de achtergrond (tab wissel / app naar achtergrond): schrijf openstaande
    // wijzigingen meteen weg i.p.v. de 800ms-debounce af te wachten, zodat een net
    // gemaakte bewerking niet verdampt als de PWA bevroren of afgesloten wordt.
    if(typeof flushSave === 'function') flushSave();
  }
});
// Laatste redmiddel bij het sluiten van het tabblad: probeer de wachtende save nog
// te starten (best-effort — kan niet garanderen dat de upload de sluiting overleeft).
window.addEventListener('beforeunload', ()=>{
  if(_pendingSaveData){ clearTimeout(_saveTimer); _kickSave(); }
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
// Cloud-save state — één bron van waarheid voor wat er nog weg moet en wat er loopt:
//   _pendingSaveData = de nieuwste, nog niet verzonden momentopname {bedrijf, data}.
//   _saveInFlight    = Promise van de lopende schrijfactie naar Firebase (of null).
// Zolang één van beide gezet is, bestaat er een onbevestigde eigen wijziging en mag
// de Firestore-listener de lokale data NIET overschrijven — anders kan een oude
// cloud-stand over verse invoer heen vallen ("data verdwijnt / komt terug").
let _pendingSaveData = null;
let _saveInFlight = null;
function _heeftOnbevestigdeSave(){ return !!(_pendingSaveData || _saveInFlight); }

// ============================================================
// CONTROLE OP VERLOREN KASSIER-BOEKINGEN (alleen eigenaar)
// ============================================================
// Een kassier boekt via één Firestore-transactie (markeerFactuurBetaald) recht in
// de cloud. Jouw eigen save() schrijft data/verkoop en data/main met .set() zonder
// merge vanuit het geheugen van DIT toestel. Boekt een kassier precies terwijl jij
// een save open hebt staan, dan negeert verwerkCloudData() die snapshot (de gate
// hieronder) en overschrijft jouw save de boeking alsnog — de melding is dan weg
// zonder dat iemand het merkt.
//
// Herstellen kan niet automatisch: op dat moment is de cloudversie al verdwenen.
// Wat wél kan is het zichtbaar maken. Het logboek data/kassierboekingen staat
// buiten de zes documenten die save() overschrijft en blijft dus staan. Wijkt de
// laatste logregel van een factuur af van wat de factuur zelf laat zien, dan is
// er iets verloren gegaan en zeggen we dat — met factuurnummer, zodat je het in
// één klik kunt rechtzetten.
let _kassierCheckBezig = false;
let _kassierCheckLaatst = 0;
async function controleerKassierBoekingen(){
  if(_loginRol !== 'eigenaar' || !USE_CLOUD || !huidigBedrijf) return;
  if(_kassierCheckBezig) return;
  // Hoogstens één keer per halve minuut; dit draait na elke geslaagde save.
  if(Date.now() - _kassierCheckLaatst < 30000) return;
  _kassierCheckBezig = true;
  try {
    const json = await fbAanroep(fb=>fb.laadKassierBoekingen(huidigBedrijf));
    const items = (JSON.parse(json||'{}').items) || [];
    _kassierCheckLaatst = Date.now();

    // Alleen de laatste regel per factuur telt: een boeking die daarna is
    // teruggedraaid hoort niet meer terug te zien te zijn.
    const laatste = new Map();
    items.forEach(e=>{ if(e && e.factuurId) laatste.set(e.factuurId, e); });

    const grens = Date.now() - 7*24*60*60*1000; // ouder dan een week: laat rusten
    const kwijt = [];
    laatste.forEach(e=>{
      if(new Date(e.op).getTime() < grens) return;
      const f = (DB.verkoop||[]).find(x=>x && x.id===e.factuurId);
      if(!f) return; // factuur verwijderd — dat was een bewuste actie
      // Door jou teruggedraaid? Dan klopt het dat de melding weg is.
      if(f.kassierBoekingTeruggedraaid === e.op) return;
      const opFactuur = f.betaaldDoorKassier?.op || null;
      if(e.richting > 0 && opFactuur !== e.op) kwijt.push(e);
      if(e.richting < 0 && opFactuur) kwijt.push(e);
    });

    if(kwijt.length){
      const namen = kwijt.slice(0,3).map(e=>e.factuurNr||e.factuurId).join(', ');
      toast(
        `Let op: ${kwijt.length} betaalmelding${kwijt.length===1?'':'en'} van een medewerker `
        + `staat niet meer op de factuur (${namen}${kwijt.length>3?'…':''}). `
        + `Controleer die factu${kwijt.length===1?'ur':'ren'} en zet hem zo nodig zelf op betaald.`,
        'warning', 12000);
      console.warn('[kassierboekingen] niet terug te vinden op de factuur:', kwijt);
    }
  } catch(e){
    // Geen logboek of geen verbinding: stil laten gaan, dit is een controle.
    console.debug('[controleerKassierBoekingen]', e);
  } finally {
    _kassierCheckBezig = false;
  }
}

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
// Rekent de balans door ZONDER melding of blokkade. Gedeeld door
// checkBalansEvenwicht() (die waarschuwt en tegenhoudt) en door simulaties die
// vooraf willen weten of een handeling de balans zou sluiten — zo'n simulatie
// mag natuurlijk geen alert oproepen.
function _balansVerschil(){
  const som = types => DB.grootboek
    .filter(g=>types.includes(g.type))
    .reduce((a,g)=>a+parseFloat(g.saldo||0),0);
  const totActiva = som(['vaste_activa','vlottende_activa','activa']);
  const passivaPlusEV = som(['passiva']) + som(['eigen_vermogen']) + som(['omzet']) - som(['kosten']);
  return { totActiva, passivaPlusEV, verschil: Math.abs(totActiva - passivaPlusEV) };
}

function checkBalansEvenwicht(){
  // Balans moet altijd kloppen: Activa = Passiva + Eigen Vermogen + (Omzet - Kosten)
  // Geen enkele afwijking is acceptabel — bij verschil wordt opslaan geblokkeerd
  if(DB.grootboek.length < 5) return true; // te weinig rekeningen voor zinvolle check
  const { totActiva, passivaPlusEV, verschil } = _balansVerschil();
  // Halve cent marge tegen afrondingsruis van kommagetallen — alleen een ÉCHTE
  // afwijking (≥ 1 cent) blokkeert, zodat er geen valse balansfouten ontstaan.
  if(verschil > 0.005){
    const msg = `Boekhoudkundige fout — deze handeling brengt de balans uit evenwicht.

Activa: ${fmt(totActiva)}
Passiva + EV + Resultaat: ${fmt(passivaPlusEV)}
Verschil: ${fmt(verschil)}

Een balans moet altijd kloppen (Activa = Passiva + Eigen vermogen + Resultaat). Daarom is de laatste handeling automatisch teruggedraaid en NIET opgeslagen — de balans blijft in evenwicht.`;
    alert(msg);
    console.error('BALANS FOUT:', {totActiva, passivaPlusEV, verschil});
    return false;
  }
  return true;
}

// Draait de laatste (balansverstorende) handeling volledig terug naar de laatst
// opgeslagen, kloppende stand uit localStorage. Zo kan een scheve balans nooit
// blijven staan of bewaard worden — de stap gaat gewoon niet door.
function herstelNaLaatsteGoedeStand(){
  const r = localStorage.getItem(storageKey());
  if(r){
    try{
      const p = JSON.parse(r);
      // Houd de live/globale kassiers vast (zelfde reden als in loadLokaal).
      const _liveKassiers = (DB.kassiers||[]).length ? DB.kassiers : null;
      DB = {...DB, ...p};
      if(_liveKassiers) DB.kassiers = _liveKassiers;
      // De snapshot uit localStorage kan van vóór de type-correctie zijn; zonder
      // dit zou een recovery de verkeerde rekeningtypes terugzetten en blijft de
      // balans scheef staan waar we hem juist herstellen (CLAUDE.md #24).
      if(typeof herstelGBTypes==='function') herstelGBTypes();
    }catch(e){ console.error('Herstel na balansfout mislukt:', e); }
  }
  // Herteken het huidige scherm zodat de herstelde, kloppende stand direct zichtbaar is.
  const actievePagina = document.querySelector('.page.active')?.id?.replace('page-','');
  if(actievePagina && typeof showPage==='function') showPage(actievePagina);
  else if(typeof renderDashboard==='function') renderDashboard();
}

function save(){
  // Balans moet kloppen. Zo niet: draai de laatste handeling volledig terug en sla
  // niets op — een scheve balans mag nooit blijven staan of bewaard worden.
  // Geeft true terug als er echt is opgeslagen, false als de handeling is
  // teruggedraaid. Aanroepers die "gelukt!" melden moeten dit controleren —
  // anders zie je een succesmelding terwijl er niets bewaard is.
  if(!checkBalansEvenwicht()){ herstelNaLaatsteGoedeStand(); return false; }
  localStorage.setItem(storageKey(), JSON.stringify(DB));
  if(USE_CLOUD) saveCloud();
  else toonSyncStatus('lokaal');
  return true;
}

let _saveTimer = null;

// Bouw de momentopname die naar de cloud gaat. imports MOET mee: slaAllesOp()
// overschrijft het hele document, dus zonder imports zou de afschriftgeschiedenis
// bij elke save gewist worden.
function _bouwSaveData(){
  return JSON.stringify({
    verkoop:DB.verkoop, inkoop:DB.inkoop, transacties:DB.transacties,
    grootboek:DB.grootboek, regels:DB.regels, memoriaal:DB.memoriaal||[],
    vasteActiva:DB.vasteActiva||[], profiel:DB.profiel||{},
    kassalijsten:DB.kassalijsten||[], kassiers:DB.kassiers||[],
    uren:DB.uren||[], imports:DB.imports||[],
    btwNotities:DB.btwNotities||{},
  });
}

function saveCloud(){
  // Pin bedrijf én data NU vast (niet pas bij het afvuren over 800ms). Zo schrijft
  // een vertraagde save altijd de juiste data naar het juiste bedrijf — ook als je
  // ondertussen van bedrijf wisselt.
  _pendingSaveData = { bedrijf: huidigBedrijf, data: _bouwSaveData() };
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(()=>{ _kickSave(); }, 800);
}

// Verstuurt de wachtende momentopname naar Firebase. Serieel: zolang er een
// schrijfactie loopt wordt er niet parallel geschreven; een nieuwere wachtende
// versie gaat er direct achteraan. Geeft de lopende Promise terug (of resolved).
function _kickSave(){
  if(_saveInFlight) return _saveInFlight;
  if(!_pendingSaveData) return Promise.resolve();
  // Zonder internet: laat de wachtende data staan (blijft ook in localStorage) en
  // probeer later opnieuw. Niets wordt weggegooid.
  if(!checkOnline()){ toonSyncStatus('fout'); return Promise.resolve(); }
  const { bedrijf, data } = _pendingSaveData;
  _pendingSaveData = null;
  toonSyncStatus('opslaan');
  _saveInFlight = fbAanroep(fb=>fb.slaAllesOp(bedrijf, data))
    .then(()=>{
      toonSyncStatus('opgeslagen');
      _saveInFlight = null;
      // Kwam er tijdens het schrijven een nieuwere wijziging binnen? Direct wegschrijven.
      if(_pendingSaveData && navigator.onLine) _kickSave();
      // Deze save kan een kassier-boeking overschreven hebben die tijdens de
      // listener-gate binnenkwam. Pas als alles weggeschreven is controleren.
      else if(typeof controleerKassierBoekingen === 'function') controleerKassierBoekingen();
    })
    .catch(err=>{
      _saveInFlight = null;
      // Schrijven mislukt: zet de data terug in de wachtrij zodat niets verloren gaat
      // (tenzij er intussen al een nieuwere versie klaarstaat). GEEN automatische retry
      // hier — dat zou bij een aanhoudende fout gaan rondtollen. De volgende save() of
      // flushSave() (bij wisselen) pikt de wachtende data weer op.
      if(!_pendingSaveData) _pendingSaveData = { bedrijf, data };
      toonSyncStatus('fout');
      toast('Opslaan mislukt — controleer je internetverbinding en probeer opnieuw.','error');
      console.error('Save fout:', err);
    });
  return _saveInFlight;
}

// Schrijf alles wat nog openstaat weg en WACHT tot het klaar is. Wordt aangeroepen
// vóór het wisselen van bedrijf en bij het naar de achtergrond gaan, zodat een net
// gemaakte bewerking gegarandeerd in de cloud staat voordat er iets herladen of
// gewisseld wordt. Zonder deze garantie kon een oude cloud-stand verse invoer
// overschrijven ("data verdwijnt / komt later terug").
async function flushSave(){
  clearTimeout(_saveTimer);
  let pogingen = 0;
  while(_heeftOnbevestigdeSave() && navigator.onLine && pogingen++ < 3){
    if(_saveInFlight){ try{ await _saveInFlight; }catch(e){} }
    if(_pendingSaveData){ try{ await _kickSave(); }catch(e){} }
  }
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
  if(r){ try{
    const p=JSON.parse(r);
    // Kassiers: houd de in-memory lijst als die al gevuld is — die komt van de
    // live Firestore-listener en is dus verser dan de localStorage-blob. Zo kan
    // een save() in het herlaad-venster geen stale (bijv. elders verwijderde)
    // gebruikers terugschrijven naar Firebase. Bij koude start is DB.kassiers
    // leeg en laadt de blob gewoon als offline-fallback.
    const _liveKassiers = (DB.kassiers||[]).length ? DB.kassiers : null;
    DB={...DB,...p};
    if(_liveKassiers) DB.kassiers = _liveKassiers;
  }catch(e){ console.error('localStorage data corrupt:',e); toast('Lokale data kon niet worden geladen — data mogelijk corrupt.','error'); } }
  else {
    DB.verkoop=[]; DB.inkoop=[]; DB.transacties=[]; DB.regels=[]; DB.imports=[]; DB.btwNotities={};
    DB.grootboek=JSON.parse(JSON.stringify(DEFAULT_GB));
  }
  // Ontbrekende standaardrekeningen aanvullen (bestaande, incomplete lokale set).
  if(typeof vulStandaardRekeningenAan==='function') vulStandaardRekeningenAan();
  // …en een afgeweken rekeningtype terugzetten, anders staat het saldo aan de
  // verkeerde kant van de balans en blokkeert save() (CLAUDE.md #24).
  if(typeof herstelGBTypes==='function') herstelGBTypes();
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
      // Zolang onze eigen wijziging nog niet bevestigd naar Firebase is geschreven,
      // NEGEREN we inkomende snapshots. Anders kan een oudere cloud-stand (van vóór
      // onze nog-lopende schrijfactie) verse invoer overschrijven — dat is precies
      // de "data verdwijnt / komt later terug"-bug. Zodra de save bevestigd is
      // (_pendingSaveData én _saveInFlight beide leeg) laten we de cloud weer leidend zijn.
      if(_heeftOnbevestigdeSave()){ toonSyncStatus('opslaan'); return; }

      // Firebase is de enige bron van waarheid. Geen merge: de cloud overschrijft
      // altijd de lokale data. Eigen invoer (kassalijsten, uren) wordt los van save()
      // direct naar Firebase geschreven, dus die zit hier al in de clouddata.
      if(d.verkoop      !== undefined) DB.verkoop      = d.verkoop      || [];
      if(d.inkoop       !== undefined) DB.inkoop       = d.inkoop       || [];
      if(d.transacties  !== undefined) DB.transacties  = d.transacties  || [];
      if(d.regels       !== undefined) DB.regels       = d.regels       || [];
      if(d.memoriaal    !== undefined) DB.memoriaal    = d.memoriaal    || [];
      if(d.vasteActiva  !== undefined) DB.vasteActiva  = d.vasteActiva  || [];
      if(d.kassalijsten !== undefined) DB.kassalijsten = d.kassalijsten || [];
      if(d.uren         !== undefined) DB.uren         = d.uren         || [];
      // imports MOET hier mee. Ontbrak dit, dan bleef DB.imports leeg op een tweede
      // apparaat → geen import-regels in beeld, dus ook geen "Verwijder import"-knop,
      // terwijl de transacties zelf wél binnenkwamen. Erger: _bouwSaveData() stuurt
      // imports altijd mee en slaAllesOp() overschrijft het hele document, dus de
      // eerstvolgende save() vanaf dat apparaat wiste de importgeschiedenis in de cloud.
      if(d.imports      !== undefined) DB.imports      = d.imports      || [];
      // btwNotities is een object (sleutel: btw_notities_<jaar>_<periode>), geen array.
      // Werd voorheen alleen in localStorage bewaard: notities waren apparaat-lokaal
      // en verdwenen bij een andere browser of gewiste cache, zonder melding.
      if(d.btwNotities  !== undefined) DB.btwNotities  = d.btwNotities  || {};
      // Kassiers: cloud vervangt de lokale lijst VOLLEDIG — geen merge.
      // Elke gebruikerswijziging schrijft de complete lijst naar alle bedrijven
      // (slaKassiersOpCloud), dus dit document bevat altijd de hele waarheid.
      // De oude merge (alleen toevoegen/bijwerken) hield een elders verwijderde
      // gebruiker lokaal in leven, waarna een save() vanaf dit apparaat hem
      // weer terugschreef naar Firebase — de "verwijderd account komt terug"-bug.
      if(d.kassiers !== undefined){
        DB.kassiers = d.kassiers || [];
        if(typeof _dedupKassiers === 'function') DB.kassiers = _dedupKassiers(DB.kassiers);
        try{ localStorage.setItem('ledger_kassiers_cache', JSON.stringify(DB.kassiers)); }catch(e){}
        // Update instellingen-UI als die open is
        if(typeof renderGebruikersBeheer === 'function') renderGebruikersBeheer();
      }
      if(d.grootboek    !== undefined) DB.grootboek    = d.grootboek    || [];
      // Vul ontbrekende standaardrekeningen aan zodat bestaande bedrijven het
      // volledige schema krijgen zonder handmatig toevoegen. Bestaande saldi
      // blijven ongemoeid. Alleen in-memory: NIET zelf save() aanroepen, want
      // save() blokkeert (met alert) bij een balansverschil — een bestaand
      // bedrijf mag daar niet op vastlopen. De rekeningen worden elke load
      // opnieuw aangevuld (idempotent) en persisteren vanzelf bij de eerstvolgende
      // reguliere, kloppende save() van de gebruiker.
      if(typeof vulStandaardRekeningenAan==='function') vulStandaardRekeningenAan();
      // Hetzelfde geldt voor een afgeweken `type` op een standaardnummer: dat zet
      // het saldo aan de verkeerde kant van de balans en blokkeert daarna elke
      // save(). Herstellen vóór de localStorage-cache hieronder, zodat de
      // gerepareerde stand ook offline meegaat (CLAUDE.md #24).
      if(typeof herstelGBTypes==='function') herstelGBTypes();

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
        if(actiefeMobTab === 'facturen' && typeof renderMobFacturen === 'function') renderMobFacturen();
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
  // fb.laadGebruikers() bestaat niet in firebase-config.js — deze functie is dode code.
  // Kassiers worden geladen via kiesBedrijfNaLogin() (verse bedrijfsdata) en
  // daarna live bijgehouden door verwerkCloudData() (cloud vervangt volledig).
}

// ============================================================
// BEDRIJVEN — cloud + lokaal
// ============================================================
// Gedeelde kern van een bedrijfswissel. ELK pad dat huidigBedrijf wijzigt MOET hier
// doorheen — anders wordt de flushSave-garantie uit punt 15 omzeild en kan een net
// gemaakte wijziging verloren gaan of in het verkeerde bedrijf belanden. De aanroepers
// verschillen alleen in wat ze daarna op het scherm doen.
async function _wisselBedrijfKern(naam){
  // Schrijf eerst alle nog niet verzonden wijzigingen van het HUIDIGE bedrijf weg en
  // wacht daarop. Pas daarna legen we DB en wisselen we. Zonder dit kon een net
  // gemaakte bewerking (bijv. verwerkte bankregels) verloren gaan bij het wisselen.
  await flushSave();
  _stopCloudListeners();
  _stopCloudListeners = ()=>{};
  // Kassiers zijn globaal — bewaar ze zodat loadLokaal() (per-bedrijf cache) ze niet wist.
  // verwerkCloudData() vervangt ze zodra de cloud-lijst van het nieuwe bedrijf binnen is.
  const _bewaardeKassiers = DB.kassiers ? [...DB.kassiers] : [];
  huidigBedrijf=naam;
  localStorage.setItem('ledger_actief_bedrijf', naam);
  DB={ verkoop:[], inkoop:[], transacties:[], grootboek:[], regels:[], imports:[],
       btwNotities:{}, profiel:{}, memoriaal:[], vasteActiva:[], kassalijsten:[], kassiers:[], uren:[],
       editId:null, editType:null, koppelId:null,
       csvRaw:[], csvHeaders:[], fVK:'', fsVK:'', fIK:'', fsIK:'', fT:'', fsT:'', huidigeBankId:null };
  load(); // loadLokaal() kan DB.kassiers overschrijven met stale per-bedrijf data
  DB.kassiers = _bewaardeKassiers; // herstel globale kassiers (verwerkCloudData vervangt ze zodra de cloud vuurt)
  const el=document.getElementById('sidebar-bedrijf-naam');
  if(el) el.textContent=getBedrijfWeergavenaam(naam);
}

async function wisselBedrijf(naam){
  // finally: gaat er iets mis in de kern, dan is huidigBedrijf mogelijk al gewisseld.
  // De modal moet dan alsnog dicht en we moeten naar het dashboard — anders blijft de
  // gebruiker in een openstaande modal boven de data van een ánder bedrijf hangen,
  // terwijl de fout in een unhandled rejection verdwijnt (aanroeper is een onclick).
  try{
    await _wisselBedrijfKern(naam);
  } finally {
    closeModal('modal-bedrijf');
    showPage('dashboard');
    renderGB(); renderRegels();
  }
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
    // Schrijf de huidige gebruikerslijst ook naar het nieuwe bedrijf. Sinds de
    // cloud-lijst de lokale lijst volledig vervangt (geen merge) zou een leeg
    // kassiers-veld hier anders de lijst wissen zodra iemand dit bedrijf opent.
    if(typeof slaKassiersOpCloud === 'function' && (DB.kassiers||[]).length){
      try{ await slaKassiersOpCloud(); }catch(e){}
    }
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
  // Verwijder uit Firebase via fbAanroep
  try{
    await fbAanroep(fb=>fb.verwijderBedrijfCloud(naam));
    toast(`Bedrijf "${naam}" volledig verwijderd.`,'info');
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
  document.getElementById('bp-straat').value=p.straat||'';
  document.getElementById('bp-postcode').value=p.postcode||'';
  document.getElementById('bp-stad').value=p.stad||'';
  document.getElementById('bp-website').value=p.website||'';
  document.getElementById('bp-rechtsvorm').value=p.rechtsvorm||'';
  document.getElementById('bp-boekjaar').value=p.boekjaar||'1';
  document.getElementById('bp-btw-standaard').value=p.btwStandaard||'21';
  document.getElementById('bp-btw-stelsel').value=p.btwStelsel||'factuurstelsel';
  document.getElementById('bp-uren-aan').checked = !!p.urenAan;
  document.getElementById('bp-uren-zonder-btw').checked = !!p.urenZonderBtw;
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
    straat:document.getElementById('bp-straat').value.trim(),
    postcode:document.getElementById('bp-postcode').value.trim(),
    stad:document.getElementById('bp-stad').value.trim(),
    website:document.getElementById('bp-website').value.trim(),
    rechtsvorm:document.getElementById('bp-rechtsvorm').value,
    boekjaar:document.getElementById('bp-boekjaar').value,
    btwStandaard:document.getElementById('bp-btw-standaard').value,
    btwStelsel:document.getElementById('bp-btw-stelsel').value,
    urenAan:document.getElementById('bp-uren-aan').checked,
    urenZonderBtw:document.getElementById('bp-uren-zonder-btw').checked,
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
        <input type="text" value="${esc(o.straat||'')}" placeholder="Straatnaam + huisnummer"
          oninput="_cpOpdrachtgevers[${i}].straat=this.value"
          style="font-size:12px;padding:6px 8px;">
        <div style="display:flex;gap:6px;">
          <input type="text" value="${esc(o.postcode||'')}" placeholder="Postcode"
            oninput="_cpOpdrachtgevers[${i}].postcode=this.value"
            style="width:110px;font-size:12px;padding:6px 8px;">
          <input type="text" value="${esc(o.stad||'')}" placeholder="Stad / Gemeente"
            oninput="_cpOpdrachtgevers[${i}].stad=this.value"
            style="flex:1;font-size:12px;padding:6px 8px;">
        </div>
        <div style="display:flex;gap:6px;">
          <input type="text" value="${esc(o.btwNummer||'')}" placeholder="BTW-nummer (optioneel)"
            oninput="_cpOpdrachtgevers[${i}].btwNummer=this.value"
            style="flex:1;font-size:12px;padding:6px 8px;">
          <input type="email" value="${esc(o.email||'')}" placeholder="E-mailadres"
            oninput="_cpOpdrachtgevers[${i}].email=this.value"
            style="flex:1;font-size:12px;padding:6px 8px;">
        </div>
        <div style="display:flex;gap:6px;align-items:center;">
          <span style="font-size:11px;color:var(--text-dim);">Factureren per</span>
          <select onchange="_cpOpdrachtgevers[${i}].eenheid=this.value;_tekenCentraalOpdrachtgevers()"
            style="font-size:12px;padding:5px 7px;">
            <option value="uur" ${o.eenheid!=='dag'?'selected':''}>uur</option>
            <option value="dag" ${o.eenheid==='dag'?'selected':''}>dag</option>
          </select>
        </div>
        <label style="display:flex;gap:6px;align-items:center;font-size:11px;color:var(--text-dim);cursor:pointer;">
          <input type="checkbox" ${o.flexibelTarief?'checked':''}
            onchange="_cpOpdrachtgevers[${i}].flexibelTarief=this.checked">
          Flexibel tarief — kassier mag zelf het tarief invullen
        </label>
        <label style="display:flex;gap:6px;align-items:center;font-size:11px;color:var(--text-dim);cursor:pointer;">
          <input type="checkbox" ${o.regelPerDienst?'checked':''}
            onchange="_cpOpdrachtgevers[${i}].regelPerDienst=this.checked">
          Aparte factuurregel per dienst — notitie van de kassier komt op de factuur
        </label>
        <div style="margin-top:6px;">
          <div style="font-size:11px;color:var(--text-dim);margin-bottom:4px;">Tarieven</div>
          ${(o.tarieven||[]).map((t,ti)=>`
            <div style="display:flex;gap:6px;align-items:center;margin-bottom:4px;">
              <input type="text" value="${esc(t.naam||'')}" placeholder="Omschrijving (bijv. Dag)"
                oninput="_cpOpdrachtgevers[${i}].tarieven[${ti}].naam=this.value"
                style="flex:1;font-size:12px;padding:5px 7px;">
              <input type="number" min="0" step="0.01" value="${t.bedrag!=null?t.bedrag:''}" placeholder="${eenheidInfo(o.eenheid).perInput}"
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
  _cpOpdrachtgevers.push({ naam:'', straat:'', postcode:'', stad:'', btwNummer:'', email:'', eenheid:'uur', flexibelTarief:false, regelPerDienst:false, tarieven:[{naam:'', bedrag:null}] });
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
      straat: (o.straat||'').trim(),
      postcode: (o.postcode||'').trim(),
      stad: (o.stad||'').trim(),
      btwNummer: (o.btwNummer||'').trim(),
      email: (o.email||'').trim(),
      eenheid: o.eenheid === 'dag' ? 'dag' : 'uur',
      flexibelTarief: !!o.flexibelTarief,
      regelPerDienst: !!o.regelPerDienst,
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
        <input type="text" value="${esc(o.straat||'')}" placeholder="Straatnaam + huisnummer"
          oninput="_cpOpdrachtgevers[${i}].straat=this.value"
          style="font-size:12px;padding:6px 8px;">
        <div style="display:flex;gap:6px;">
          <input type="text" value="${esc(o.postcode||'')}" placeholder="Postcode"
            oninput="_cpOpdrachtgevers[${i}].postcode=this.value"
            style="width:110px;font-size:12px;padding:6px 8px;">
          <input type="text" value="${esc(o.stad||'')}" placeholder="Stad / Gemeente"
            oninput="_cpOpdrachtgevers[${i}].stad=this.value"
            style="flex:1;font-size:12px;padding:6px 8px;">
        </div>
        <div style="display:flex;gap:6px;">
          <input type="text" value="${esc(o.btwNummer||'')}" placeholder="BTW-nummer (optioneel)"
            oninput="_cpOpdrachtgevers[${i}].btwNummer=this.value"
            style="flex:1;font-size:12px;padding:6px 8px;">
          <input type="email" value="${esc(o.email||'')}" placeholder="E-mailadres"
            oninput="_cpOpdrachtgevers[${i}].email=this.value"
            style="flex:1;font-size:12px;padding:6px 8px;">
        </div>
        <div style="display:flex;gap:6px;align-items:center;">
          <span style="font-size:11px;color:var(--text-dim);">Factureren per</span>
          <select onchange="_cpOpdrachtgevers[${i}].eenheid=this.value;_tekenOpdrachtgeversModal()"
            style="font-size:12px;padding:5px 7px;">
            <option value="uur" ${o.eenheid!=='dag'?'selected':''}>uur</option>
            <option value="dag" ${o.eenheid==='dag'?'selected':''}>dag</option>
          </select>
        </div>
        <label style="display:flex;gap:6px;align-items:center;font-size:11px;color:var(--text-dim);cursor:pointer;">
          <input type="checkbox" ${o.flexibelTarief?'checked':''}
            onchange="_cpOpdrachtgevers[${i}].flexibelTarief=this.checked">
          Flexibel tarief — kassier mag zelf het tarief invullen
        </label>
        <label style="display:flex;gap:6px;align-items:center;font-size:11px;color:var(--text-dim);cursor:pointer;">
          <input type="checkbox" ${o.regelPerDienst?'checked':''}
            onchange="_cpOpdrachtgevers[${i}].regelPerDienst=this.checked">
          Aparte factuurregel per dienst — notitie van de kassier komt op de factuur
        </label>
        <div style="margin-top:6px;">
          <div style="font-size:11px;color:var(--text-dim);margin-bottom:4px;">Tarieven</div>
          ${(o.tarieven||[]).map((t,ti)=>`
            <div style="display:flex;gap:6px;align-items:center;margin-bottom:4px;">
              <input type="text" value="${esc(t.naam||'')}" placeholder="Omschrijving (bijv. Dag)"
                oninput="_cpOpdrachtgevers[${i}].tarieven[${ti}].naam=this.value"
                style="flex:1;font-size:12px;padding:5px 7px;">
              <input type="number" min="0" step="0.01" value="${t.bedrag!=null?t.bedrag:''}" placeholder="${eenheidInfo(o.eenheid).perInput}"
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
  _cpOpdrachtgevers.push({ naam:'', straat:'', postcode:'', stad:'', btwNummer:'', email:'', eenheid:'uur', flexibelTarief:false, regelPerDienst:false, tarieven:[{naam:'', bedrag:null}] });
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
      straat: (o.straat||'').trim(),
      postcode: (o.postcode||'').trim(),
      stad: (o.stad||'').trim(),
      btwNummer: (o.btwNummer||'').trim(),
      email: (o.email||'').trim(),
      eenheid: o.eenheid === 'dag' ? 'dag' : 'uur',
      flexibelTarief: !!o.flexibelTarief,
      regelPerDienst: !!o.regelPerDienst,
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

// Facturatie-eenheid per opdrachtgever: 'uur' (standaard) of 'dag'.
// Geeft de labels terug die overal in de UI en op de factuur gebruikt worden,
// zodat "uren" en "dagen" consistent door de hele app lopen.
function eenheidInfo(eenheid){
  return eenheid === 'dag'
    ? { eenheid:'dag', kort:'dag', meervoud:'dagen', per:'/dag', perInput:'€/dag', tariefLabel:'Dagtarief', gewerkt:'Gewerkte dagen' }
    : { eenheid:'uur', kort:'u',   meervoud:'uren',  per:'/u',   perInput:'€/u',   tariefLabel:'Uurtarief', gewerkt:'Gewerkte uren' };
}
// Zoekt de eenheid van een opdrachtgever op naam op (fallback 'uur').
function eenheidVanOpdrachtgever(naam){
  const o = (DB.profiel?.opdrachtgevers||[]).find(x=>x.naam===naam);
  return (o && o.eenheid === 'dag') ? 'dag' : 'uur';
}

// Zoek alle gekoppelde banktransacties voor een factuur
function _getBetalingen(factuur){
  if(!factuur) return [];
  const nr = String(factuur.nummer||'').trim();
  // Tekstmatch op het factuurnummer moet op woordgrenzen, niet op deeltekst.
  // `includes('1')` raakte élke omschrijving met een 1 erin, en `includes('2026-1')`
  // ook factuur 2026-12. Zo'n valse treffer laat zetFactuurBetaald() denken dat er
  // al een bankbetaling hangt, waarna hij stilletjes stopt en de factuur nooit
  // afgeboekt wordt op debiteuren.
  const nrRe = nr
    ? new RegExp('(^|[^0-9A-Za-z])' + nr.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + '([^0-9A-Za-z]|$)')
    : null;
  return DB.transacties.filter(t=>{
    if(t.status!=='gekoppeld') return false;
    // Een expliciete koppeling is de waarheid: staat er een factuurId op, dan telt
    // alleen die. Anders zou een transactie van factuur A ook bij factuur B opduiken.
    if(t.factuurId) return t.factuurId===factuur.id;
    // Alleen tekstmatchen op transacties die überhaupt aan een factuur hangen.
    // Een koppeling aan een grootboekrekening ("Betaling huur, termijn 1") mag
    // nooit als betaling van factuur 1 gelden. Ontbreekt gekoppeldType helemaal,
    // dan is het oude data van vóór dat veld en matchen we alsnog — liever een
    // dubbele betaling voorkomen dan hem missen.
    const soort = t.gekoppeldType;
    if(soort && soort!=='verkoop' && soort!=='inkoop') return false;
    return !!nrRe && !!t.gekoppeldAan && nrRe.test(t.gekoppeldAan);
  });
}

// Berekent hoeveel van het factuurtotaal betaald is (ratio 0-1)
// Altijd 1 bij factuurstelsel
function _getBetaaldRatio(factuur){
  if(!isKasstelsel()) return 1;
  const totaalIncl = parseFloat(factuur.totaalIncl||0);
  if(totaalIncl <= 0) return 0;
  const betalingen = _getBetalingen(factuur);
  // Handmatig op betaald gezet zonder bankkoppeling: telt volledig mee
  if(!betalingen.length) return factuur.status==='betaald' ? 1 : 0;
  const betaald = betalingen.reduce((a,t)=>a+Math.abs(parseFloat(t.bedrag)||0),0);
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
  // Fallback: factuur handmatig op betaald gezet zonder bankkoppeling —
  // gebruik de vastgelegde betaaldatum, met factuurdatum als laatste redmiddel
  if(factuur.status === 'betaald') return factuur.betaaldOp || factuur.datum;
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

