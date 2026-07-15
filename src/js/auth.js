// ===== LOGIN SYSTEEM =====
// PIN standaard '1234' voor kassier — eigenaar heeft geen PIN nodig
// Rol en actieve gebruiker worden gezet bij login via email + wachtwoord.
let _loginRol = null; // 'eigenaar' of 'kassier'
let _actieveKassier = null;
let _toegankelijkeRol = null;

// Dedupliceert een kassier-array op e-mailadres (laatste entry wint bij duplicaat-id).
// Voorkomt dat dezelfde persoon met twee verschillende `id`s in de lijst belandt
// als gevolg van een race-condition bij het parallel laden van meerdere bedrijven.
function _dedupKassiers(lijst){
  const map = {};
  (lijst||[]).forEach(k=>{
    const sleutel = String(k.email||k.id||'').toLowerCase();
    if(!sleutel) return;
    // Bewaar de entry met de meeste modules/bedrijven als er al één bestaat
    if(!map[sleutel]) map[sleutel] = k;
    else {
      const bestaand = map[sleutel];
      const nieuwer = (k.bedrijven||[]).length >= (bestaand.bedrijven||[]).length;
      if(nieuwer) map[sleutel] = k;
    }
  });
  return Object.values(map);
}

// Vul _actieveKassier aan met de volledige gegevens uit DB.kassiers
// (modules én opdrachtgevers). Wordt herkend op e-mailadres.
// DB.kassiers laadt async, dus deze functie wordt op meerdere momenten aangeroepen.
function verrijkActieveKassier(){
  if(_loginRol !== 'kassier' || !_actieveKassier) return false;
  // Gebruik altijd .email als primaire sleutel — na de eerste verrijking is .naam
  // de weergavenaam (bijv. "Jan"), niet het e-mailadres. Zonder .email fallback
  // mislukt elke volgende verrijking en worden module-updates nooit doorgevoerd.
  const email = String(_actieveKassier.email || _actieveKassier.naam || '').toLowerCase();
  const k = (DB.kassiers||[]).find(x=>String(x.email||'').toLowerCase()===email);
  if(!k) return false;
  _actieveKassier = {
    naam: k.naam || _actieveKassier.naam,
    email: k.email || email,
    bedrijven: k.bedrijven || _actieveKassier.bedrijven || [],
    modules: k.modules || ['dashboard','kassa','uploads'],
  };
  return true;
}

async function laadKassiersVoorLogin(){
  // Laad kassiers van ALLE bekende bedrijven — in een VERSE lijst, los van wat
  // er nog in DB.kassiers zit (localStorage). Firebase is de waarheid: een
  // gebruiker die op een ander apparaat verwijderd is staat in geen enkel
  // bedrijfsdocument meer en mag hier dus niet uit oude lokale data herleven.
  // Fallback naar lokale cache alleen als Firebase onbereikbaar is.
  const bedrijven = getBedrijven();
  let firebaseGelukt = false;
  const versLijst = [];
  const promises = bedrijven.map(b=>
    fbAanroep(fb=>fb.laadAlles(b)).then(json=>{
      try{
        const d = JSON.parse(json||'{}');
        // Geslaagde ophaling = Firebase bereikbaar, ook als de lijst leeg is.
        // (Een lege lijst betekent: alle kassiers van dit bedrijf zijn verwijderd.)
        firebaseGelukt = true;
        if(Array.isArray(d.kassiers)){
          // Kassiers van meerdere bedrijven samenvoegen, per id.
          d.kassiers.forEach(k=>{
            const idx = versLijst.findIndex(x=>x.id===k.id);
            if(idx === -1) versLijst.push(k);
            else versLijst[idx] = k;
          });
        }
        if(Array.isArray(d.kassalijsten)){
          if(!DB.kassalijsten) DB.kassalijsten = [];
          d.kassalijsten.forEach(kl=>{
            const idx = DB.kassalijsten.findIndex(x=>x.id===kl.id);
            if(idx === -1) DB.kassalijsten.push(kl);
            else DB.kassalijsten[idx] = kl;
          });
        }
      }catch(e){}
    }).catch(()=>{})
  );
  await Promise.all(promises);
  if(firebaseGelukt){
    // Firebase wint: vervang de hele lijst (dedup op e-mail tegen dubbele ids).
    // Cache ook bijwerken als de lijst leeg is — leeg is dan de waarheid.
    DB.kassiers = _dedupKassiers(versLijst);
    try{ localStorage.setItem('ledger_kassiers_cache', JSON.stringify(DB.kassiers)); }catch(e){}
  }
  // Fallback: lokale cache ALLEEN als Firebase onbereikbaar was.
  // Niet als Firebase met succes een lege lijst gaf — dan is leeg de waarheid.
  if(!firebaseGelukt && !(DB.kassiers||[]).length){
    try{
      const cached = JSON.parse(localStorage.getItem('ledger_kassiers_cache')||'[]');
      if(cached.length){
        DB.kassiers = cached;
        console.log('[Login] Firebase offline — kassiers uit lokale cache geladen:', cached.length);
      }
    }catch(e){}
  }
}

// Laad profielnamen van alle bedrijven uit Firebase en cache ze lokaal
// Zodat kassier op elk device op profielnaam kan inloggen
async function laadBedrijfNamenUitFirebase(){
  const bedrijven = getBedrijven();
  await Promise.all(bedrijven.map(b=>
    fbAanroep(fb=>fb.laadAlles(b)).then(json=>{
      try{
        const d = JSON.parse(json||'{}');
        if(d.profiel?.naam){
          saveBedrijfProfielNaam(b, d.profiel.naam);
        }
      }catch(e){}
    }).catch(()=>{})
  ));
}

async function syncBedrijvenVanuitFirebase(){
  // Firebase is de ENIGE bron van waarheid voor de bedrijvenlijst.
  // localStorage is uitsluitend een noodcache voor als Firebase tijdelijk
  // onbereikbaar is — het mag NOOIT bepalen welke bedrijven bestaan.
  try{
    const json = await fbAanroep(fb=>fb.getBedrijvenLijst());
    const firebaseBedrijven = JSON.parse(json||'[]');
    // 'Persoonlijk' is een vast lokaal bedrijf dat altijd bestaat.
    const lijst = [...new Set(['Persoonlijk', ...firebaseBedrijven])];
    // Firebase is leidend: de lijst is exact wat Firebase teruggeeft
    // (plus 'Persoonlijk'). Verwijderde bedrijven worden NIET teruggehaald
    // uit localStorage. We overschrijven de cache met deze actuele lijst.
    window._bedrijvenLijst = lijst;
    localStorage.setItem('ledger_bedrijven', JSON.stringify(lijst));
    console.log('[Bedrijven] Gesynchroniseerd vanuit Firebase:', firebaseBedrijven.join(', '));
  }catch(e){
    // Firebase niet bereikbaar — val terug op localStorage cache.
    console.warn('[Bedrijven] Firebase sync mislukt, gebruik lokale cache:', e);
    const cached = JSON.parse(localStorage.getItem('ledger_bedrijven')||'["Persoonlijk"]');
    window._bedrijvenLijst = cached;
  }
}

// ============================================================
// Na inloggen: bepaal bedrijven en toon kiezer
// ============================================================

// Toon een specifieke login-stap, verberg de rest.
function _toonLoginStap(id){
  ['login-stap-rol','login-stap-bedrijf-kiezer'].forEach(function(s){
    var el = document.getElementById(s);
    if(el) el.style.display = (s === id) ? 'block' : 'none';
  });
}

// Welke bedrijven mag dit e-mailadres zien, en in welke rol?
// Hoofdeigenaar ziet alles als eigenaar. Anders: kassier bij de bedrijven
// waar zijn e-mail op de gastenlijst (toegang/lijst) staat.
async function _bepaalToegankelijkeBedrijven(email){
  email = (email||'').trim().toLowerCase();
  const isEigenaar = email === (window._HOOFD_EIGENAAR||'').toLowerCase();

  // Zorg dat we de actuele bedrijvenlijst hebben.
  try{ await syncBedrijvenVanuitFirebase(); }catch(e){}
  const alle = getBedrijven();

  if(isEigenaar){
    return { rol:'eigenaar', bedrijven: alle };
  }

  // Kassier: primaire bron is bedrijven_toegang/{email} — dit document wordt
  // altijd bijgewerkt door syncToegangVoorEmail(), ook als de eigenaar een ander
  // bedrijf bekijkt. Hierdoor werken toevoegen én verwijderen van bedrijven correct.
  // Fallback: DB.kassiers — geladen bij initLogin, kan stale zijn als kassierdata
  // is opgeslagen in een ander bedrijf dan 'Persoonlijk'.
  try{
    const json = await fbAanroep(fb=>fb.getBedrijvenVoorKassier(email));
    const result = JSON.parse(json||'{"exists":false,"bedrijven":[]}');
    const lijst = Array.isArray(result.bedrijven) ? result.bedrijven : (Array.isArray(result) ? result : []);
    const docBestaat = result.exists !== undefined ? result.exists : lijst.length > 0;
    if(lijst.length){
      console.log('[Login] Bedrijven uit bedrijven_toegang:', lijst.join(', '));
      return { rol:'kassier', bedrijven: lijst };
    }
    if(docBestaat && !lijst.length){
      // Doc bestaat maar bedrijven is leeg = kassier is verwijderd door eigenaar
      console.warn('[Login] Kassier is gedeactiveerd (bedrijven_toegang leeg):', email);
      return { rol:'kassier', bedrijven: [] };
    }
  }catch(e){ console.warn('[Login] bedrijven_toegang ophalen mislukt:', e); }

  // Fallback op DB.kassiers (alleen als bedrijven_toegang nog niet bestaat = nieuw account)
  const kassierRecord = (DB.kassiers||[]).find(k=>
    String(k.email||'').trim().toLowerCase() === email
  );
  if(kassierRecord && Array.isArray(kassierRecord.bedrijven) && kassierRecord.bedrijven.length){
    console.log('[Login] Bedrijven uit DB.kassiers (fallback):', kassierRecord.bedrijven.join(', '));
    return { rol:'kassier', bedrijven: kassierRecord.bedrijven };
  }

  console.warn('[Login] Geen bedrijven gevonden voor kassier:', email);
  return { rol:'kassier', bedrijven: [] };
}

// Bouw de bedrijfskiezer op na succesvol inloggen.
async function toonBedrijfsKiezer(email){
  _toegankelijkeRol = null;
  const sub = document.getElementById('login-bedrijf-kiezer-sub');
  const lijstEl = document.getElementById('login-bedrijf-kiezer-lijst');
  const leegEl = document.getElementById('login-bedrijf-kiezer-leeg');
  if(lijstEl) lijstEl.innerHTML = '<div style="color:var(--text-mid);font-size:13px;">Bedrijven laden…</div>';
  if(leegEl) leegEl.style.display = 'none';
  _toonLoginStap('login-stap-bedrijf-kiezer');

  const res = await _bepaalToegankelijkeBedrijven(email);
  _toegankelijkeRol = res.rol;

  // Laad profielnamen voor bedrijven die nog niet in de map staan
  // (kassiers kunnen niet de volledige bedrijvenlijst ophalen, dus dit
  // doet het alsnog voor hun specifieke bedrijven)
  const namen = getBedrijfProfielNamen();
  const ontbrekende = res.bedrijven.filter(b => !namen[b]);
  if(ontbrekende.length){
    await Promise.all(ontbrekende.map(b=>
      fbAanroep(fb=>fb.laadAlles(b)).then(json=>{
        try{
          const d = JSON.parse(json||'{}');
          if(d.profiel?.naam) saveBedrijfProfielNaam(b, d.profiel.naam);
        }catch(e){}
      }).catch(()=>{})
    ));
  }

  if(sub){
    sub.textContent = res.rol === 'eigenaar'
      ? 'Je bent ingelogd als eigenaar. Kies welke administratie je wilt openen.'
      : 'Welkom! Kies het bedrijf dat je wilt openen.';
  }

  if(!res.bedrijven.length){
    if(lijstEl) lijstEl.innerHTML = '';
    if(leegEl){
      leegEl.style.display = 'block';
      leegEl.textContent = res.rol === 'kassier'
        ? 'Je e-mailadres staat nog bij geen enkel bedrijf op de toegangslijst. Vraag de eigenaar om je toe te voegen.'
        : 'Er zijn nog geen bedrijven.';
    }
    return;
  }

  if(lijstEl){
    lijstEl.innerHTML = res.bedrijven.map(function(b){
      const weergave = (namen[b]||b);
      const veilig = b.replace(/'/g, "\\'");
      return '<button onclick="kiesBedrijfNaLogin(\'' + veilig + '\')" class="btn btn-secondary" '
        + 'style="padding:16px;font-size:16px;border-radius:10px;text-align:left;">🏢 ' + weergave + '</button>';
    }).join('');
  }
}

// De gebruiker koos een bedrijf in de kiezer → log werkelijk in.
// Hergebruikt dezelfde "ingelogd"-stappen als de oude PIN-flow.
async function kiesBedrijfNaLogin(bedrijf){
  const rol = _toegankelijkeRol || 'eigenaar';
  _loginRol = (rol === 'kassier') ? 'kassier' : 'eigenaar';

  if(_loginRol === 'kassier'){
    const email = (window.FBAuth && FBAuth.currentEmail && FBAuth.currentEmail()) || 'Gebruiker';
    _actieveKassier = { naam: email, bedrijven: [bedrijf] };
  } else {
    _actieveKassier = null;
  }

  // Wissel naar het gekozen bedrijf en laad de data.
  if(bedrijf !== huidigBedrijf){
    huidigBedrijf = bedrijf;
    try{ localStorage.setItem('ledger_actief_bedrijf', bedrijf); }catch(e){}
  }
  // Laad bedrijfsdata en gebruik het resultaat meteen om DB te vullen —
  // zodat verrijkActieveKassier() direct modules + opdrachtgevers kan lezen,
  // ook al is de async Firestore listener (loadCloud) nog niet gevuurd.
  // Laad verse bedrijfsdata en sla op NADAT load() klaar is.
  // load() roept loadLokaal() aan die DB overschrijft vanuit localStorage —
  // als we de verse Firebase-data er vóór zetten, verdwijnt die weer.
  let _versKassiers = null, _versProfiel = null;
  try{
    const json = await fbAanroep(fb=>fb.laadAlles(bedrijf));
    const d = JSON.parse(json||'{}');
    if(Array.isArray(d.kassiers)) _versKassiers = d.kassiers;
    if(d.profiel && Object.keys(d.profiel).length) _versProfiel = d.profiel;
  }catch(e){}
  load();
  // Firebase wint: het bedrijfsdocument bevat per design de VOLLEDIGE
  // gebruikerslijst (slaKassiersOpCloud schrijft naar alle bedrijven), dus
  // die vervangt hier alles wat load() uit localStorage haalde. Mergen met
  // lokale data liet elders verwijderde gebruikers herleven. Alleen als
  // Firebase onbereikbaar was (_versKassiers null) blijft de lokale lijst
  // staan als offline-fallback.
  if(_versKassiers){
    DB.kassiers = _dedupKassiers(_versKassiers);
    try{ localStorage.setItem('ledger_kassiers_cache', JSON.stringify(DB.kassiers)); }catch(e){}
  }
  if(_versProfiel)  DB.profiel  = _versProfiel;

  // Vul de kassier-gegevens aan (modules) uit de zojuist geladen data.
  verrijkActieveKassier();

  stopLoginSyncInterval();
  document.getElementById('login-overlay').style.display = 'none';
  pasNavAanRol();

  if(_loginRol === 'kassier'){
    const badge = document.getElementById('kassier-naam-badge');
    if(badge) badge.textContent = '👤 ' + _actieveKassier.naam;
    toast('Welkom 👋','success');
  } else {
    toast('Ingelogd als eigenaar 🔑','success');
  }
}


async function inloggen(){
  const emailInp = document.getElementById('login-email');
  const wachtwoordInp = document.getElementById('login-wachtwoord');
  const status = document.getElementById('login-status');
  const email = (emailInp && emailInp.value || '').trim().toLowerCase();
  const wachtwoord = wachtwoordInp && wachtwoordInp.value || '';
  function toon(tekst, kleur){
    if(!status) return;
    status.style.display = 'block';
    status.style.color = kleur;
    status.textContent = tekst;
  }
  if(!email || email.indexOf('@') < 0){
    toon('Vul een geldig e-mailadres in.', '#dc2626');
    return;
  }
  if(!wachtwoord){
    toon('Vul je wachtwoord in.', '#dc2626');
    return;
  }
  toon('Bezig met inloggen…', 'var(--text-mid)');
  try{
    const ingelogdAls = await FBAuth.inloggenMetWachtwoord(email, wachtwoord);
    toon('', '');
    status.style.display = 'none';
    toonBedrijfsKiezer(ingelogdAls);
  }catch(err){
    console.warn('Inloggen mislukt:', err);
    const code = err && err.code;
    let msg = 'Inloggen mislukt: ' + (err && err.message ? err.message : 'onbekende fout');
    if(code === 'auth/wrong-password' || code === 'auth/invalid-credential') msg = 'Onjuist wachtwoord. Probeer opnieuw of reset je wachtwoord.';
    if(code === 'auth/user-not-found') msg = 'Geen account gevonden met dit e-mailadres.';
    if(code === 'auth/too-many-requests') msg = 'Te veel pogingen. Probeer het later opnieuw.';
    toon(msg, '#dc2626');
  }
}
function wachtwoordVergeten(){
  const emailInp = document.getElementById('login-email');
  const email = (emailInp && emailInp.value || '').trim().toLowerCase();
  const status = document.getElementById('login-status');
  function toon(tekst, kleur){
    if(!status) return;
    status.style.display = 'block';
    status.style.color = kleur;
    status.textContent = tekst;
  }
  if(!email || email.indexOf('@') < 0){
    toon('Vul eerst je e-mailadres in.', '#dc2626');
    return;
  }
  FBAuth.wachtwoordResetten(email)
    .then(()=>{
      toon('Reset-mail verstuurd naar ' + email + '. Check je inbox (ook spam).', '#16a34a');
      if(typeof toast === 'function') toast('Reset-mail verstuurd naar ' + email, 'success');
    })
    .catch(err=>{
      const msg = (err && err.message ? err.message : String(err));
      toon('Kon de reset-mail niet versturen: ' + msg, '#dc2626');
      if(typeof toast === 'function') toast('Reset-mail mislukt: ' + msg, 'error');
    });
}

// Registreren voor kassiers die door de eigenaar zijn toegevoegd maar nog
// geen Firebase Auth-account hebben. Ze kiezen zelf een wachtwoord met de
// gewone e-mail/wachtwoord-velden. Na registratie zijn ze direct ingelogd
// en checkt toonBedrijfsKiezer() of hun e-mail op een toegangslijst staat —
// zo niet, dan zien ze daar de melding om de eigenaar te vragen.
async function registreren(){
  const emailInp = document.getElementById('login-email');
  const wachtwoordInp = document.getElementById('login-wachtwoord');
  const status = document.getElementById('login-status');
  const email = (emailInp && emailInp.value || '').trim().toLowerCase();
  const wachtwoord = wachtwoordInp && wachtwoordInp.value || '';
  function toon(tekst, kleur){
    if(!status) return;
    status.style.display = 'block';
    status.style.color = kleur;
    status.textContent = tekst;
  }
  if(!email || email.indexOf('@') < 0){
    toon('Vul een geldig e-mailadres in.', '#dc2626');
    return;
  }
  if(!wachtwoord || wachtwoord.length < 6){
    toon('Kies een wachtwoord van minimaal 6 tekens.', '#dc2626');
    return;
  }
  toon('Account aanmaken…', 'var(--text-mid)');
  try{
    const ingelogdAls = await FBAuth.registrerenMetWachtwoord(email, wachtwoord);
    toon('', '');
    status.style.display = 'none';
    if(typeof toast === 'function') toast('Account aangemaakt 🎉','success');
    toonBedrijfsKiezer(ingelogdAls);
  }catch(err){
    console.warn('Registreren mislukt:', err);
    const code = err && err.code;
    let msg = 'Registreren mislukt: ' + (err && err.message ? err.message : 'onbekende fout');
    if(code === 'auth/email-already-in-use') msg = 'Er bestaat al een account met dit e-mailadres. Log gewoon in, of gebruik "Wachtwoord vergeten?".';
    if(code === 'auth/weak-password') msg = 'Wachtwoord is te zwak. Kies minimaal 6 tekens.';
    if(code === 'auth/invalid-email') msg = 'Dit e-mailadres is ongeldig.';
    if(code === 'auth/too-many-requests') msg = 'Te veel pogingen. Probeer het later opnieuw.';
    toon(msg, '#dc2626');
  }
}

async function initLogin(){
  // Sync bedrijvenlijst vanuit Firebase zodat alle devices alle bedrijven kennen
  await syncBedrijvenVanuitFirebase();
  // Laad profielnamen en kassiers parallel
  await Promise.all([
    laadKassiersVoorLogin(),
    laadBedrijfNamenUitFirebase(),
  ]);
  // Debug — toon hoeveel gebruikers geladen zijn
  const aantalGebruikers = (DB.kassiers||[]).length;
  if(aantalGebruikers === 0){
    console.warn('Geen gebruikers geladen vanuit cloud');
  } else {
    console.log('Gebruikers geladen:', DB.kassiers.map(k=>k.naam).join(', '));
  }
  document.getElementById('login-overlay').style.display = 'flex';
  // Start login sync interval — hersynct elke 30s zolang loginscherm open is
  startLoginSyncInterval();
}

function startLoginSyncInterval(){
  stopLoginSyncInterval();
  window._loginSyncInterval = setInterval(async ()=>{
    // Alleen synchen als loginscherm nog zichtbaar is en niet ingelogd
    const overlay = document.getElementById('login-overlay');
    if(!overlay || overlay.style.display === 'none') { stopLoginSyncInterval(); return; }
    if(_loginRol) { stopLoginSyncInterval(); return; }
    await Promise.all([
      syncBedrijvenVanuitFirebase(),
      laadBedrijfNamenUitFirebase(),
      laadKassiersVoorLogin(),
    ]);
  }, 30000); // elke 30 seconden
}

function stopLoginSyncInterval(){
  if(window._loginSyncInterval){
    clearInterval(window._loginSyncInterval);
    window._loginSyncInterval = null;
  }
}

// (De oude PIN-login is verwijderd. Inloggen gaat nu volledig via de
//  email+wachtwoord; rol en bedrijf worden bepaald in kiesBedrijfNaLogin.)

function pasNavAanRol(){
  const isKassier = _loginRol === 'kassier';
  const opMobiel = isMobiel();
  const eigenaarApp = document.getElementById('eigenaar-app');
  // Start kassalijst polling voor eigenaar zodat nieuwe indieningen automatisch verschijnen
  if(!isKassier) startKassaPolling();

  if(isKassier){
    document.body.classList.add('kassier-modus');
    document.body.classList.add('kassier-mobiel');
    if(eigenaarApp) eigenaarApp.style.display = 'none';
  } else {
    document.body.classList.remove('kassier-modus');
    document.body.classList.remove('kassier-mobiel');
    if(eigenaarApp) eigenaarApp.style.display = 'flex';
  }
  // Kassier ziet alleen dashboard en kassa invullen
  const kassiertabs = ['facturen','financieel','rapportages'];
  kassiertabs.forEach(t=>{
    const el = document.getElementById('nav-tab-'+t);
    if(el) el.style.display = isKassier ? 'none' : '';
    const drop = document.getElementById('nav-dropdown-'+t);
    if(drop) drop.style.display = isKassier ? 'none' : '';
  });
  // Kassier tab tonen/verbergen
  const kassierTab = document.getElementById('nav-tab-kassalijst');
  if(kassierTab) kassierTab.style.display = isKassier ? 'flex' : 'none';
  // Wissel knop verbergen voor kassier
  const wisselBtn = document.getElementById('wissel-btn');
  if(wisselBtn) wisselBtn.style.display = isKassier ? 'none' : '';
  const bedrijfEl = document.getElementById('sidebar-bedrijf-naam');
  if(bedrijfEl) bedrijfEl.style.cursor = isKassier ? 'default' : 'pointer';
  // Instellingen knop alleen voor eigenaar
  const instBtn = document.getElementById('inst-btn');
  if(instBtn) instBtn.style.display = isKassier ? 'none' : '';
  // Urenoverzicht-navitem alleen tonen als uren-registratie aan staat voor dit bedrijf
  const urenNav = document.getElementById('nav-item-urenoverzicht');
  if(urenNav) urenNav.style.display = (!isKassier && isUrenAan()) ? '' : 'none';

  // Gebruiker gaat naar kassa invullen, eigenaar naar dashboard
  if(isKassier){
    // Altijd de volledige kassier-interface (dashboard, kassa, facturen, bonnen, lijsten)
    mobBouwNav();
    const modules = _actieveKassier?.modules || ['dashboard','kassa','uploads'];
    const startTab = modules.includes('dashboard') ? 'dashboard' : modules[0] || 'kassa';
    mobNav(startTab);
  } else {
    navTo('dashboard');
  }
}

function uitloggen(){
  _loginRol = null;
  _toegankelijkeRol = null;
  document.body.classList.remove('kassier-mobiel');
  _actieveKassier = null;
  document.body.classList.remove('kassier-modus');
  // Beëindig de Firebase-sessie zodat je echt uitlogt.
  try{ if(window.FBAuth && FBAuth.uitloggen) FBAuth.uitloggen(); }catch(e){}
  // Reset alle login stappen
  const stapKiezer = document.getElementById('login-stap-bedrijf-kiezer');
  if(stapKiezer) stapKiezer.style.display = 'none';
  const stapRol = document.getElementById('login-stap-rol');
  if(stapRol) stapRol.style.display = 'block';
  // Reset velden
  const emailVeld = document.getElementById('login-email');
  if(emailVeld) emailVeld.value = '';
  const wachtwoordVeld = document.getElementById('login-wachtwoord');
  if(wachtwoordVeld) wachtwoordVeld.value = '';
  const st = document.getElementById('login-status');
  if(st) st.style.display = 'none';
  // Toon login overlay
  document.getElementById('login-overlay').style.display = 'flex';
  // Verberg uitloggen en instellingen knop
  const instBtn = document.getElementById('inst-btn');
  if(instBtn) instBtn.style.display = 'none';
}

// ===== KASSIER BEHEER =====

function renderGebruikersBeheer(){
  // Vul bedrijven checkboxes in voor nieuwe kassier
  const bedrijven = getBedrijven();
  const nkBedrijven = document.getElementById('nk-bedrijven');
  if(nkBedrijven){
    nkBedrijven.innerHTML = bedrijven.map(b=>`
      <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;
        background:var(--surface);border:1px solid var(--border);border-radius:6px;
        padding:5px 10px;">
        <input type="checkbox" value="${b}" style="width:auto;" checked>
        ${esc(getBedrijfWeergavenaam(b))}
      </label>`).join('');
  }

  // Render bestaande kassiers als klikbare naamkaarten
  const el = document.getElementById('kassiers-lijst');
  if(!el) return;
  const kassiers = DB.kassiers||[];
  if(!kassiers.length){
    el.innerHTML = '<div style="font-size:12px;color:var(--text-dim);padding:8px 0;">Geen gebruikers aangemaakt.</div>';
    return;
  }

  el.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:4px;">
      ${kassiers.map(k=>{
        const modules = k.modules||['dashboard','kassa','uploads'];
        const modLabels = modules.map(m=>({dashboard:'📊',kassa:'💰',facturen:'🧾',uploads:'📎',uren:'⏱'}[m]||m)).join(' ');
        const initials = (k.naam||'?').charAt(0).toUpperCase();
        return `
          <div onclick="openGebruikerDetail('${k.id}')" style="
            display:flex;align-items:center;gap:14px;
            background:var(--surface);border:1px solid var(--border);
            border-radius:var(--radius);padding:12px 16px;
            cursor:pointer;transition:border-color .15s,background .15s;"
            onmouseover="this.style.borderColor='var(--accent)';this.style.background='var(--surface2)'"
            onmouseout="this.style.borderColor='var(--border)';this.style.background='var(--surface)'">
            <div style="width:40px;height:40px;border-radius:50%;background:var(--accent-dim);
              display:flex;align-items:center;justify-content:center;
              font-size:16px;font-weight:700;color:var(--accent);flex-shrink:0;">
              ${initials}
            </div>
            <div style="flex:1;min-width:0;">
              <div style="font-size:14px;font-weight:600;color:var(--text);">${esc(k.naam)}</div>
              <div style="font-size:11px;color:var(--text-mid);margin-top:1px;font-family:var(--mono,monospace);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(k.email||'(geen e-mail)')}</div>
              <div style="font-size:11px;color:var(--text-dim);margin-top:2px;">${modLabels} · ${esc((k.bedrijven||[]).map(getBedrijfWeergavenaam).join(', '))}</div>
            </div>
            <div style="color:var(--text-dim);font-size:18px;">›</div>
          </div>`;
      }).join('')}
    </div>`;
}

// ===== GEBRUIKER DETAIL MODAL =====
let _gdKassierId = null;

function openGebruikerDetail(id){
  const k = (DB.kassiers||[]).find(k=>k.id===id);
  if(!k) return;
  _gdKassierId = id;
  const bedrijven = getBedrijven();

  document.getElementById('gd-titel').textContent = k.naam;
  document.getElementById('gd-naam-disp').textContent = k.naam;
  document.getElementById('gd-naam-input').value = k.naam;
  const emailDisp = document.getElementById('gd-email-disp');
  if(emailDisp) emailDisp.textContent = k.email || '(geen e-mail — opnieuw toevoegen)';

  // Bedrijven checkboxes
  document.getElementById('gd-bedrijven').innerHTML = bedrijven.map(b=>`
    <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;
      background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:5px 10px;">
      <input type="checkbox" value="${b}" style="width:auto;" ${(k.bedrijven||[]).includes(b)?'checked':''}>
      ${esc(getBedrijfWeergavenaam(b))}
    </label>`).join('');

  // Modules checkboxes — uren is nu een gewone module-checkbox
  const modDefs = [
    {v:'dashboard', l:'📊 Dashboard'},
    {v:'kassa',     l:'💰 Kassa'},
    {v:'uren',      l:'⏱ Uren'},
    {v:'facturen',  l:'🧾 Facturen'},
    {v:'uploads',   l:'📎 Bonnen'},
  ];
  document.getElementById('gd-modules').innerHTML = modDefs.map(m=>`
    <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;
      background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:5px 10px;">
      <input type="checkbox" value="${m.v}" style="width:auto;" ${(k.modules||['dashboard','kassa','uploads']).includes(m.v)?'checked':''}>
      ${m.l}
    </label>`).join('');

  openModal('modal-gebruiker-detail');
}


async function slaGebruikerDetailOp(){
  if(!checkOnline()) return;
  const k = (DB.kassiers||[]).find(k=>k.id===_gdKassierId);
  if(!k) return;
  const naam = document.getElementById('gd-naam-input').value.trim();
  if(!naam){ toast('Naam mag niet leeg zijn.','error'); return; }

  const bedrijvenChecks = document.querySelectorAll('#gd-bedrijven input[type="checkbox"]:checked');
  const gekozenBedrijven = [...bedrijvenChecks].map(c=>c.value);
  if(!gekozenBedrijven.length){ toast('Selecteer minimaal één bedrijf.','error'); return; }

  const modChecks = document.querySelectorAll('#gd-modules input[type="checkbox"]:checked');
  const gekozenModules = [...modChecks].map(c=>c.value);
  if(!gekozenModules.length){ toast('Selecteer minimaal één module.','error'); return; }

  k.naam = naam;
  k.bedrijven = gekozenBedrijven;
  k.modules = gekozenModules;

  save();
  await slaKassiersOpCloud();
  localStorage.setItem('ledger_kassiers_cache', JSON.stringify(DB.kassiers));

  // Laat de toegangslijsten op de server meebewegen met de gekozen bedrijven.
  if(k.email) await syncToegangVoorEmail(k.email, gekozenBedrijven);

  closeModal('modal-gebruiker-detail');
  renderGebruikersBeheer();
  toast(`Gebruiker "${naam}" opgeslagen.`,'success');
}

async function verwijderKassierViaDetail(){
  if(!checkOnline()) return;
  const k = (DB.kassiers||[]).find(k=>k.id===_gdKassierId);
  if(!k) return;
  const ok = await bevestig(`Gebruiker "${k.naam}" verwijderen? Zij kunnen daarna niet meer inloggen.`,'Gebruiker verwijderen','Verwijderen');
  if(!ok) return;
  // Haal het e-mailadres van alle toegangslijsten af (lege selectie = overal weg).
  if(k.email) await syncToegangVoorEmail(k.email, []);
  DB.kassiers = DB.kassiers.filter(k=>k.id!==_gdKassierId);
  save();
  await slaKassiersOpCloud();
  localStorage.setItem('ledger_kassiers_cache', JSON.stringify(DB.kassiers));
  closeModal('modal-gebruiker-detail');
  renderGebruikersBeheer();
  toast('Gebruiker verwijderd en toegang ingetrokken.','info');
}

// Voeg het e-mailadres toe aan de toegangslijst van de opgegeven bedrijven,
// en haal het weg bij bedrijven die niet (meer) in de lijst staan.
// Schrijft ook naar bedrijven_toegang/{email} zodat kassiers bij login
// hun eigen bedrijvenlijst kunnen ophalen zonder de hele collectie te hoeven lezen.
async function syncToegangVoorEmail(email, gekozenBedrijven){
  const adres = String(email||'').trim().toLowerCase();
  if(!adres) return;
  const alle = getBedrijven();

  // 1. Werk per-bedrijf de gastenlijst bij (voor de security rules check bij data-toegang).
  for(const b of alle){
    try{
      const json = await fbAanroep(fb=>fb.getGastenlijst(b));
      let lijst = JSON.parse(json||'[]');
      if(!Array.isArray(lijst)) lijst = [];
      lijst = lijst.map(x=>String(x).toLowerCase());
      const moetErin = gekozenBedrijven.includes(b);
      const staatErin = lijst.includes(adres);
      if(moetErin && !staatErin){
        lijst.push(adres);
        await fbAanroep(fb=>fb.setGastenlijst(b, JSON.stringify(lijst)));
      } else if(!moetErin && staatErin){
        lijst = lijst.filter(x=>x!==adres);
        await fbAanroep(fb=>fb.setGastenlijst(b, JSON.stringify(lijst)));
      }
    }catch(e){ console.warn('Toegang sync mislukt voor bedrijf', b, e); }
  }

  // 2. Schrijf de volledige bedrijvenlijst naar bedrijven_toegang/{email}.
  //    Kassier leest dit bij login om zijn bedrijven te ontdekken zonder
  //    de hele bedrijven-collectie te hoeven lezen (wat Firestore weigert).
  try{
    await fbAanroep(fb=>fb.setBedrijvenVoorKassier(adres, JSON.stringify(gekozenBedrijven)));
  }catch(e){ console.warn('setBedrijvenVoorKassier mislukt:', e); }
}

async function voegKassierToe(){
  if(!checkOnline()) return;
  const naam  = document.getElementById('nk-naam')?.value.trim();
  const email = document.getElementById('nk-email')?.value.trim().toLowerCase();
  if(!naam){ toast('Vul een naam in.','error'); return; }
  if(!email || email.indexOf('@')<0){ toast('Vul een geldig e-mailadres in.','error'); return; }

  const checks = document.querySelectorAll('#nk-bedrijven input[type="checkbox"]:checked');
  const bedrijven = [...checks].map(c=>c.value);
  if(!bedrijven.length){ toast('Selecteer minimaal één bedrijf.','error'); return; }

  const modChecks = document.querySelectorAll('#nk-modules input[type="checkbox"]:checked');
  const modules = [...modChecks].map(c=>c.value);
  if(!modules.length){ toast('Selecteer minimaal één module.','error'); return; }

  // Voorkom dubbele invoer van hetzelfde e-mailadres.
  if((DB.kassiers||[]).some(k=>String(k.email||'').toLowerCase()===email)){
    toast('Er bestaat al een gebruiker met dit e-mailadres.','error'); return;
  }

  if(!DB.kassiers) DB.kassiers = [];
  DB.kassiers.push({ id:uid(), naam, email, bedrijven, modules });
  // Kassiers gaan via een eigen directe Firebase-write, los van save() en de
  // balanscheck (anders kon een scheve balans het opslaan stilletjes blokkeren).
  save();
  await slaKassiersOpCloud();
  localStorage.setItem('ledger_kassiers_cache', JSON.stringify(DB.kassiers));

  // Schrijf het e-mailadres naar de toegangslijst van de gekozen bedrijven,
  // zodat de server deze gebruiker laat inloggen.
  await syncToegangVoorEmail(email, bedrijven);

  document.getElementById('nk-naam').value = '';
  document.getElementById('nk-email').value = '';
  renderGebruikersBeheer();

  // Stuur wachtwoord-instellen mail zodat de kassier direct kan inloggen.
  try{
    await FBAuth.wachtwoordResetten(email);
    toast(`Gebruiker "${naam}" toegevoegd. Wachtwoord-mail verstuurd naar ${email}.`, 'success');
  }catch(e){
    console.warn('Wachtwoord-mail mislukt:', e);
    toast(`Gebruiker "${naam}" toegevoegd. Stuur handmatig een uitnodiging naar ${email}.`, 'success');
  }
}

function openInstellingenModal(){
  // Alleen eigenaar mag instellingen openen
  if(_loginRol !== 'eigenaar'){
    toast('Alleen de eigenaar kan instellingen wijzigen.','error');
    return;
  }
  renderGebruikersBeheer();
  openModal('modal-instellingen');
}

