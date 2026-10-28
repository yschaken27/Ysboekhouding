// ===== KASSALIJST =====
const KASSA_CATEGORIEEN = ['Knippen','Kleuren','Wassen & Föhnen','Stylen','Baardverzorging','Overig'];

function initKassalijst(){
  const datumEl = document.getElementById('kassa-datum');
  if(datumEl) datumEl.value = today();

  // Kassier naam
  const badge = document.getElementById('kassier-naam-badge');
  if(badge) badge.textContent = _loginRol==='kassier' ? '👤 ' + (_actieveKassier?.naam||'Kassier') : '🔑 Eigenaar';

  // Bouw categorieën op
  const catEl = document.getElementById('kassa-categorieen');
  if(catEl){
    catEl.innerHTML = KASSA_CATEGORIEEN.map((cat,i)=>kassaCatRij(cat, i)).join('');
  }

  // Bouw uitgaven op
  const uitEl = document.getElementById('kassa-uitgaven');
  if(uitEl) uitEl.innerHTML = '';

  // Beginsaldo uit vorige dag
  const vorigeSaldo = berekenVorigEindsaldo();
  const beginEl = document.getElementById('kassa-beginsaldo');
  if(beginEl) beginEl.value = vorigeSaldo > 0 ? vorigeSaldo.toFixed(2) : '';

  herberekeKassa();
}

function berekenVorigEindsaldo(){
  const goedgekeurde = (DB.kassalijsten||[])
    .filter(k=>k.status==='goedgekeurd')
    .sort((a,b)=>b.datum.localeCompare(a.datum));
  return goedgekeurde.length ? parseFloat(goedgekeurde[0].eindsaldo||0) : 0;
}

function kassaCatRij(naam, idx){
  return `<div class="kassa-cat-rij" id="kcr-${idx}" style="display:grid;grid-template-columns:1fr 80px 90px 90px 24px;gap:6px;align-items:center;margin-bottom:6px;">
    <input type="text" value="${naam}" placeholder="Categorie" style="font-size:12px;" oninput="herberekeKassa()">
    <input type="number" placeholder="Aantal" min="0" style="font-size:12px;text-align:center;font-family:var(--mono);" oninput="herberekeKassa()">
    <input type="number" placeholder="Contant" step="0.01" style="font-size:12px;text-align:right;font-family:var(--mono);" oninput="herberekeKassa()">
    <input type="number" placeholder="Pin/Kaart" step="0.01" style="font-size:12px;text-align:right;font-family:var(--mono);" oninput="herberekeKassa()">
    <button onclick="document.getElementById('kcr-${idx}').remove();herberekeKassa()" style="background:none;border:none;color:var(--danger);cursor:pointer;">✕</button>
  </div>`;
}

function voegKassaCategorieToeBetaling(){
  const el = document.getElementById('kassa-categorieen');
  const idx = Date.now();
  const div = document.createElement('div');
  div.innerHTML = kassaCatRij('', idx);
  el.appendChild(div.firstElementChild);
}

function voegKassaUitgaafToe(){
  const el = document.getElementById('kassa-uitgaven');
  const idx = Date.now();
  const div = document.createElement('div');
  div.style.cssText = 'display:grid;grid-template-columns:1fr 90px 24px;gap:6px;align-items:center;margin-bottom:6px;';
  div.innerHTML = `
    <input type="text" placeholder="Omschrijving uitgave" style="font-size:12px;" oninput="herberekeKassa()">
    <input type="number" placeholder="Bedrag" step="0.01" style="font-size:12px;text-align:right;font-family:var(--mono);" oninput="herberekeKassa()">
    <button onclick="this.closest('div').remove();herberekeKassa()" style="background:none;border:none;color:var(--danger);cursor:pointer;">✕</button>`;
  el.appendChild(div);
}

function herberekeKassa(){
  const begin    = parseFloat(document.getElementById('kassa-beginsaldo')?.value)||0;
  const eindsaldo= parseFloat(document.getElementById('kassa-eindsaldo')?.value)||0;
  const verwacht = begin; // Simpel: verwacht = beginsaldo (geen uitgaven/inkomsten apart)
  const verschil = eindsaldo > 0 ? eindsaldo - begin : 0;

  const verwEl = document.getElementById('kassa-af-verwacht');
  if(verwEl) verwEl.textContent = fmt(begin);

  const verschilEl = document.getElementById('kassa-af-verschil');
  if(verschilEl && eindsaldo > 0){
    verschilEl.textContent = fmt(verschil);
    verschilEl.style.color = Math.abs(verschil)<0.01 ? '#16a34a' : verschil>0 ? '#16a34a' : '#dc2626';
  } else if(verschilEl){
    verschilEl.textContent = '—';
    verschilEl.style.color = 'var(--text-dim)';
  }
}

function slaKassaOp(){
  const datum = document.getElementById('kassa-datum')?.value;
  if(!datum){ toast('Selecteer een datum.','error'); return; }

  const begin    = parseFloat(document.getElementById('kassa-beginsaldo')?.value)||0;
  const eindsaldo= parseFloat(document.getElementById('kassa-eindsaldo')?.value)||0;
  if(!eindsaldo){ toast('Vul het eindsaldo in.','error'); return; }
  const verschil = eindsaldo - begin;
  const notities = document.getElementById('kassa-notities')?.value||'';
  const naam = _actieveKassier?.naam || 'Gebruiker';

  // BTW tarief van bedrijfsprofiel — kassier stelt dit niet zelf in
  const kassaBtwTarief = parseInt(DB.profiel?.btwStandaard||'21');
  const omzetIncl = eindsaldo - begin;
  // Bereken excl BTW op basis van profieltarief
  const omzetExcl = kassaBtwTarief > 0 ? omzetIncl / (1 + kassaBtwTarief / 100) : omzetIncl;
  const omzetBtw  = omzetIncl - omzetExcl;

  const nieuw = {
    id: 'kassa_' + uid(), // uid() = tijd + random; Date.now() alleen botst tussen toestellen (#31)
    datum,
    ingevoerdDoor: naam,
    ingevoerdOp: new Date().toISOString(),
    status: 'ingediend',
    beginsaldo: begin,
    eindsaldo,
    verwacht: begin,
    verschil,
    totContant: 0,
    totPin: 0,
    totUitgaven: 0,
    totaalOmzet: omzetExcl,   // excl BTW — consistent met facturen
    totaalOmzetIncl: omzetIncl, // incl BTW — voor weergave
    omzetBtw,                  // BTW bedrag
    btwTarief: kassaBtwTarief, // tarief voor BTW aangifte
    categorieen: [],
    uitgaven: [],
    notities,
  };

  if(!DB.kassalijsten) DB.kassalijsten = [];
  DB.kassalijsten.push(nieuw);

  // Kassier stuurt ALLEEN de kassalijst naar de server
  // Niet de volledige DB — veel efficiënter en geen risico op conflicten
  slaKassalijstOpCloud(nieuw);

  // Sla lokaal ook op zodat kassier zijn eigen inzendingen ziet
  localStorage.setItem(storageKey(), JSON.stringify(DB));

  toast(`Kassa van ${datum} ingediend ter goedkeuring. ✓`, 'success');

  // Reset scherm
  document.getElementById('kassa-eindsaldo').value = '';
  document.getElementById('kassa-notities').value = '';
  herberekeKassa();
}

function slaKassalijstOpCloud(kassalijst){
  if(!checkOnline()) return;
  toonSyncStatus('opslaan');

  fbAanroep(fb=>fb.voegKassalijstToe(huidigBedrijf, JSON.stringify(kassalijst)))
    .then(result=>{
      try{
        const r = typeof result === 'string' ? JSON.parse(result) : result;
        if(r?.ok) toonSyncStatus('opgeslagen');
        else { toonSyncStatus('fout'); toast('Opslaan mislukt — probeer opnieuw.','error'); }
      }catch(e){ toonSyncStatus('fout'); }
    })
    .catch(()=>{
      toonSyncStatus('fout');
      toast('Geen verbinding. Verbind met internet en probeer opnieuw.','error');
    });
}

// Bijwerken/verwijderen van één uren-/sales-ingave in de cloud. Kijkt naar het
// resultaat van de transactie: {ok:false} betekent dat er NIETS geschreven is
// (bv. de ingave is op een ander toestel al verwijderd) — dan geen "opgeslagen".
// De lokale wijziging blijft dan staan tot er een nieuwe snapshot of herlaad komt.
// alGoed: bij verwijderen is 'niet gevonden' gewoon 'al weg' — geen fout.
function _urenCloudWrite(aanroep, foutTekst, alGoed){
  toonSyncStatus('opslaan');
  return fbAanroep(aanroep)
    .then(result=>{
      const r = typeof result === 'string' ? JSON.parse(result) : result;
      if(r?.ok || (alGoed && r?.reden==='niet gevonden')){ toonSyncStatus('opgeslagen'); return; }
      toonSyncStatus('fout');
      toast(r?.reden==='niet gevonden'
        ? 'Deze ingave staat niet meer in de cloud (elders verwijderd?) — er is niets opgeslagen.'
        : foutTekst, 'error', 7000);
    })
    .catch(()=>{ toonSyncStatus('fout'); toast(foutTekst,'error'); });
}

// Sla één uren-ingave los op in de cloud (raakt de rest van de data niet)
function slaUrenOpCloud(ingave){
  if(!checkOnline()) return;
  toonSyncStatus('opslaan');

  fbAanroep(fb=>fb.voegUrenToe(huidigBedrijf, JSON.stringify(ingave)))
    .then(result=>{
      try{
        const r = typeof result === 'string' ? JSON.parse(result) : result;
        if(r?.ok) toonSyncStatus('opgeslagen');
        else { toonSyncStatus('fout'); toast('Opslaan mislukt — probeer opnieuw.','error'); }
      }catch(e){ toonSyncStatus('fout'); }
    })
    .catch((err)=>{
      toonSyncStatus('fout');
      console.error('[Uren] Cloud-upload mislukt:', err);
      toast('Geen verbinding. Verbind met internet en probeer opnieuw.','error');
    });
}

// Schrijf de kassiers-lijst direct naar Firebase, los van save() en de balanscheck.
// Wordt aangeroepen na elke wijziging aan een gebruiker (toevoegen/bewerken/verwijderen).
// Schrijft de VOLLEDIGE huidige DB.kassiers, zodat wijzigen en verwijderen ook
// doorkomen (uren/kassalijsten zijn append-only, kassiers niet).
function slaKassiersOpCloud(){
  if(!checkOnline()) return Promise.resolve();
  toonSyncStatus('opslaan');
  // Schrijf naar ALLE bekende bedrijven zodat module-wijzigingen overal zichtbaar zijn,
  // ongeacht in welk bedrijf de eigenaar op dat moment werkt.
  const bedrijven = typeof getBedrijven === 'function' ? getBedrijven() : [huidigBedrijf];
  return Promise.all(bedrijven.map(b=>
    fbAanroep(fb=>fb.slaKassiersOp(b, JSON.stringify(DB.kassiers||[])))
  ))
    .then(()=>{ toonSyncStatus('opgeslagen'); })
    .catch(()=>{
      toonSyncStatus('fout');
      toast('Geen verbinding. Verbind met internet en probeer opnieuw.','error');
    });
}
// ============================================================
function _mobUrenOpdrachtgevers(){
  return (DB.profiel?.opdrachtgevers || []).map(o=>{
    // Backward compat: oud enkel tarief-veld → tarieven array
    if(!Array.isArray(o.tarieven)){
      const t = parseFloat(o.tarief);
      return {...o, tarieven: t > 0 ? [{naam:'Standaard', bedrag:t}] : []};
    }
    return o;
  });
}

function initMobUren(){
  // Datum op vandaag
  const d = document.getElementById('mob-uren-datum');
  if(d && !d.value) d.value = new Date().toISOString().slice(0,10);

  // Opdrachtgever-dropdown vullen
  const sel = document.getElementById('mob-uren-opdrachtgever');
  const lijst = _mobUrenOpdrachtgevers();
  if(sel){
    sel.innerHTML = lijst.map((o,i)=>`<option value="${i}">${esc(o.naam)}</option>`).join('');
  }
  mobUrenVulTarieven();
  renderMobUrenLijst();
}

function mobUrenVulTarieven(){
  const oi = parseInt(document.getElementById('mob-uren-opdrachtgever')?.value);
  const opdr = _mobUrenOpdrachtgevers()[oi];
  const wrap = document.getElementById('mob-uren-tarief-wrap');
  const sel  = document.getElementById('mob-uren-tarief');
  const tarieven = opdr?.tarieven || [];
  const info = eenheidInfo(opdr?.eenheid);
  if(sel){
    sel.innerHTML = tarieven.map((t,i)=>
      `<option value="${i}">${esc(t.naam||'Tarief')} — €${(t.bedrag||0).toFixed(2)}${info.per}</option>`
    ).join('');
  }
  if(wrap) wrap.style.display = tarieven.length > 1 ? 'block' : 'none';
  // Flexibel tarief: kassier mag zelf het tarief invullen (voorinvulling = vast tarief)
  const eigenWrap = document.getElementById('mob-uren-eigen-tarief-wrap');
  if(eigenWrap) eigenWrap.style.display = opdr?.flexibelTarief ? 'block' : 'none';
  const eigenLbl = document.getElementById('mob-uren-eigen-tarief-label');
  if(eigenLbl) eigenLbl.textContent = 'Tarief (€' + info.per + ')';
  if(opdr?.flexibelTarief) _mobUrenVulEigenTarief();
  // Label van het aantal-veld volgt de eenheid (uren/dagen).
  const lbl = document.getElementById('mob-uren-aantal-label');
  if(lbl) lbl.textContent = 'Aantal ' + info.meervoud;
  mobUrenHerbereken();
}

// Getal-invoer (tarief, uren) accepteert zowel komma als punt als decimaalteken
function parseDecimaalInvoer(waarde){
  return parseFloat(String(waarde||'').trim().replace(',','.')) || 0;
}

function _mobUrenVulEigenTarief(){
  const inp = document.getElementById('mob-uren-eigen-tarief');
  if(!inp) return;
  const oi = parseInt(document.getElementById('mob-uren-opdrachtgever')?.value);
  const opdr = _mobUrenOpdrachtgevers()[oi];
  const tarieven = opdr?.tarieven || [];
  const ti = tarieven.length > 1 ? parseInt(document.getElementById('mob-uren-tarief')?.value||'0') : 0;
  const t = tarieven[ti] || tarieven[0];
  inp.value = (t && t.bedrag > 0) ? String(t.bedrag).replace('.',',') : '';
}

function mobUrenTariefGewijzigd(){
  const oi = parseInt(document.getElementById('mob-uren-opdrachtgever')?.value);
  const opdr = _mobUrenOpdrachtgevers()[oi];
  if(opdr?.flexibelTarief) _mobUrenVulEigenTarief();
  mobUrenHerbereken();
}

function _mobUrenGekozenTarief(){
  const oi = parseInt(document.getElementById('mob-uren-opdrachtgever')?.value);
  const opdr = _mobUrenOpdrachtgevers()[oi];
  if(!opdr) return null;
  const tarieven = opdr.tarieven || [];
  const eenheid = opdr.eenheid === 'dag' ? 'dag' : 'uur';
  const ti = tarieven.length > 1 ? parseInt(document.getElementById('mob-uren-tarief')?.value||'0') : 0;
  const t = tarieven[ti] || tarieven[0] || null;
  if(opdr.flexibelTarief){
    // Kassier vult zelf het tarief in; label blijft het vaste tarief als het bedrag gelijk is
    const eigen = parseDecimaalInvoer(document.getElementById('mob-uren-eigen-tarief')?.value);
    const label = (t && parseFloat(t.bedrag) === eigen) ? (t.naam || eenheidInfo(eenheid).gewerkt) : 'Eigen tarief';
    return { opdrachtgever: opdr.naam, eenheid, flexibel: true, tarief: { label, bedrag: eigen } };
  }
  if(!t) return null;
  return { opdrachtgever: opdr.naam, eenheid, tarief: { label: t.naam || eenheidInfo(eenheid).gewerkt, bedrag: t.bedrag || 0 } };
}

function mobUrenHerbereken(){
  const aantal = parseDecimaalInvoer(document.getElementById('mob-uren-aantal')?.value);
  const g = _mobUrenGekozenTarief();
  const el = document.getElementById('mob-uren-bedrag-val');
  if(!el) return;
  if(!g || !aantal){ el.textContent = '—'; return; }
  const bedrag = aantal * (g.tarief.bedrag || 0);
  el.textContent = '€ ' + bedrag.toFixed(2);
}

function mobSlaUrenOp(){
  const datum = document.getElementById('mob-uren-datum')?.value;
  const aantal = parseDecimaalInvoer(document.getElementById('mob-uren-aantal')?.value);
  const notitie = document.getElementById('mob-uren-notitie')?.value.trim() || '';
  const g = _mobUrenGekozenTarief();

  if(!checkOnline()) return;
  if(!datum){ toast('Kies een datum.','error'); return; }
  if(!g){ toast('Kies een opdrachtgever.','error'); return; }
  if(aantal <= 0){ toast('Vul het aantal '+eenheidInfo(g.eenheid).meervoud+' in.','error'); return; }
  if(g.flexibel && !(g.tarief.bedrag > 0)){ toast('Vul een tarief in.','error'); return; }

  const bedrag = aantal * (g.tarief.bedrag || 0);
  const ingave = {
    id: uid(),
    datum,
    wie: _actieveKassier?.naam || '',
    opdrachtgever: g.opdrachtgever,
    eenheid: g.eenheid || 'uur',
    tariefLabel: g.tarief.label || '',
    tariefBedrag: g.tarief.bedrag || 0,
    uren: aantal,
    bedrag: Math.round(bedrag*100)/100,
    notitie,
    status: 'ingediend',
    aangemaakt: new Date().toISOString()
  };

  if(!DB.uren) DB.uren = [];
  DB.uren.push(ingave);
  // Lokaal cachen voor directe weergave; cloud krijgt alleen deze ene ingave
  localStorage.setItem(storageKey(), JSON.stringify(DB));
  slaUrenOpCloud(ingave);

  toast('Uren ingediend.','success');
  // Formulier deels resetten — datum en opdrachtgever laten staan voor snel volgende ingave
  document.getElementById('mob-uren-aantal').value = '';
  document.getElementById('mob-uren-notitie').value = '';
  mobUrenHerbereken();
  renderMobUrenLijst();
}

function _vulMobUrenMaandFilter(){
  const sel = document.getElementById('mob-uren-maand-filter');
  if(!sel || sel.options.length > 1) return;
  const nu = new Date();
  const opties = [];
  for(let i = 0; i < 6; i++){
    const d = new Date(nu.getFullYear(), nu.getMonth() - i, 1);
    // LOKALE jaar-maand, niet toISOString(): die zet 1 juli 00:00 (UTC+2) terug naar
    // 30 juni 22:00 UTC → '2026-06', waardoor de optie "juli" op juni ging filteren
    // en de echte huidige maand helemaal geen optie kreeg.
    const val = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
    const label = d.toLocaleDateString('nl-NL',{month:'long',year:'numeric'});
    opties.push(`<option value="${val}">${label}</option>`);
  }
  sel.innerHTML = opties.join('');
}

function renderMobUrenLijst(){
  const el = document.getElementById('mob-uren-lijst');
  if(!el) return;
  _vulMobUrenMaandFilter();
  const sel = document.getElementById('mob-uren-maand-filter');
  const _nu = new Date();
  const filterMaand = sel?.value || (_nu.getFullYear() + '-' + String(_nu.getMonth()+1).padStart(2,'0'));
  // Gezamenlijke lijst: alle uren van het bedrijf, niet alleen eigen ingaves.
  const lijst = (DB.uren||[])
    .filter(u=> !isSalesIngave(u) && (u.datum||'').slice(0,7)===filterMaand)
    .sort((a,b)=> (b.datum||'').localeCompare(a.datum||''));

  if(!lijst.length){
    el.innerHTML = '<div style="font-size:13px;color:var(--text-dim);padding:8px 0;">Geen uren gevonden voor deze maand.</div>';
    return;
  }
  el.innerHTML = lijst.map(u=>{
    const dd = new Date(u.datum).toLocaleDateString('nl-NL',{day:'numeric',month:'short'});
    const status = u.status==='goedgekeurd' ? '<span style="color:var(--accent);">✓ goedgekeurd</span>' : u.status==='afgewezen' ? '<span style="color:#ef4444;">✗ afgewezen</span>' : 'ingediend';
    const wijzigBtn = u.status==='ingediend'
      ? `<button onclick="openEigenaarUrenModal('${u.id}')" style="font-size:11px;padding:2px 10px;border-radius:5px;border:1px solid var(--border);background:var(--surface);cursor:pointer;margin-top:6px;">Wijzigen</button>`
      : '';
    return `<div style="background:var(--surface2);border-radius:10px;padding:12px 14px;margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <strong style="font-size:14px;">${esc(u.opdrachtgever)}</strong>
        <span style="font-family:var(--mono);font-weight:700;">€ ${(u.bedrag||0).toFixed(2)}</span>
      </div>
      <div style="font-size:12px;color:var(--text-mid);margin-top:3px;">
        ${dd} · ${eenheidAantalTekst(u.uren, u.eenheid)}${u.tariefLabel?(' · '+esc(u.tariefLabel)):''}${u.wie?(' · '+esc(u.wie)):''} · ${status}
      </div>
      ${u.notitie?`<div style="font-size:12px;color:var(--text-dim);margin-top:4px;">${esc(u.notitie)}</div>`:''}
      ${wijzigBtn}
    </div>`;
  }).join('');
}

// ============================================================
// URENOVERZICHT (eigenaar) — nakijken, goedkeuren, factureren
// ============================================================
function initUrenoverzichtMaand(){
  const el = document.getElementById('uren-filter-maand');
  if(el && !el.value){
    const nu = new Date();
    el.value = nu.getFullYear() + '-' + String(nu.getMonth()+1).padStart(2,'0');
  }
}

function _urenMaandFilter(){
  return document.getElementById('uren-filter-maand')?.value || '';
}

// Periode van het urenoverzicht: één maand, of een reeks maanden als
// "Meerdere maanden" aanstaat (bv. juli t/m augustus op één factuur).
// Geeft {van, tot} als 'YYYY-MM'; tot === van bij een enkele maand.
function _urenPeriode(){
  const van = _urenMaandFilter();
  const aan = document.getElementById('uren-filter-periode')?.checked;
  const totRaw = document.getElementById('uren-filter-maand-tot')?.value || '';
  const tot = (aan && totRaw && totRaw >= van) ? totRaw : van;
  return { van, tot, meerdere: tot !== van };
}

function toggleUrenPeriode(){
  const aan = document.getElementById('uren-filter-periode')?.checked;
  const wrap = document.getElementById('uren-filter-tm');
  if(wrap) wrap.style.display = aan ? 'inline-flex' : 'none';
  const totEl = document.getElementById('uren-filter-maand-tot');
  // Standaard: t/m dezelfde maand, zodat het overzicht niet leeg springt
  if(aan && totEl && !totEl.value) totEl.value = _urenMaandFilter();
  renderUrenoverzicht();
}

function _urenVanMaand(){
  const { van, tot } = _urenPeriode();
  if(!van) return [];
  return (DB.uren||[]).filter(u=>{
    if(isSalesIngave(u)) return false;
    const m = (u.datum||'').slice(0,7);
    return m >= van && m <= tot;
  });
}

// Leesbaar label voor de gekozen periode: "augustus 2026" of "juli t/m augustus 2026"
function _urenPeriodeLabel(){
  const { van, tot, meerdere } = _urenPeriode();
  const naam = m => {
    if(!m) return '';
    const [j,mm] = m.split('-');
    return new Date(j, parseInt(mm)-1, 1).toLocaleDateString('nl-NL',{month:'long',year:'numeric'});
  };
  if(!meerdere) return naam(van);
  // Zelfde jaar → jaartal alleen achteraan ("juli t/m augustus 2026")
  const kort = m => { const [j,mm]=m.split('-'); return new Date(j,parseInt(mm)-1,1).toLocaleDateString('nl-NL',{month:'long'}); };
  return van.slice(0,4)===tot.slice(0,4)
    ? `${kort(van)} t/m ${naam(tot)}`
    : `${naam(van)} t/m ${naam(tot)}`;
}

function renderUrenoverzicht(){
  const lijst = _urenVanMaand();

  const totUren = lijst.reduce((a,u)=>a+(parseFloat(u.uren)||0),0);
  const totBedrag = lijst.reduce((a,u)=>a+(parseFloat(u.bedrag)||0),0);
  const wacht = lijst.filter(u=>u.status==='ingediend').length;
  const opdrSet = new Set(lijst.map(u=>u.opdrachtgever));
  const z=(id,v)=>{ const e=document.getElementById(id); if(e) e.textContent=v; };
  z('uov-uren', (Math.round(totUren*100)/100).toString());
  z('uov-bedrag', '€ ' + totBedrag.toFixed(2).replace('.',','));
  z('uov-wacht', wacht.toString());
  z('uov-opdr', opdrSet.size.toString());

  const el = document.getElementById('uren-overzicht-lijst');
  if(!el) return;
  if(!lijst.length){
    el.innerHTML = `<div style="color:var(--text-dim);padding:24px 0;text-align:center;">Geen uren in ${esc(_urenPeriodeLabel()||'deze periode')}.</div>`;
    return;
  }

  const perOpdr = {};
  lijst.forEach(u=>{ (perOpdr[u.opdrachtgever] ||= []).push(u); });

  el.innerHTML = Object.keys(perOpdr).sort().map(opdr=>{
    const items = perOpdr[opdr].sort((a,b)=>(a.datum||'').localeCompare(b.datum||''));
    const uSom = items.reduce((a,u)=>a+(parseFloat(u.uren)||0),0);
    const bSom = items.reduce((a,u)=>a+(parseFloat(u.bedrag)||0),0);
    const allGoed = items.every(u=>u.status==='goedgekeurd');
    // Eenheid van deze opdrachtgever (uur/dag) — bepaalt het label in het totaal
    const grpInfo = eenheidInfo(items[0]?.eenheid || eenheidVanOpdrachtgever(opdr));

    const rijen = items.map(u=>{
      const dd = new Date(u.datum).toLocaleDateString('nl-NL',{day:'2-digit',month:'short'});
      const keurBtns = u.status==='goedgekeurd'
        ? '<span style="color:#16a34a;">✓</span>'
        : `<span style="display:inline-flex;gap:6px;">
             <button onclick="urenKeur('${u.id}','goedgekeurd')" style="font-size:11px;padding:2px 8px;border-radius:5px;border:none;background:#16a34a;color:#fff;cursor:pointer;">Goedkeuren</button>
             <button onclick="urenKeur('${u.id}','afgewezen')" style="font-size:11px;padding:2px 8px;border-radius:5px;border:1px solid var(--border);background:var(--surface);color:var(--text-mid);cursor:pointer;">×</button>
           </span>`;
      const st = `<span style="display:inline-flex;gap:4px;align-items:center;">${keurBtns}<button onclick="openEigenaarUrenModal('${u.id}')" title="Bewerken" style="font-size:12px;padding:2px 6px;border-radius:5px;border:1px solid var(--border);background:var(--surface);cursor:pointer;">✏️</button><button onclick="verwijderUrenEigenaar('${u.id}')" title="Verwijderen" style="font-size:12px;padding:2px 6px;border-radius:5px;border:none;background:#ef4444;color:#fff;cursor:pointer;">🗑</button></span>`;
      const afgewezen = u.status==='afgewezen' ? 'opacity:0.45;text-decoration:line-through;' : '';
      return `<tr style="${afgewezen}">
        <td style="padding:6px 8px;font-size:12px;">${dd}</td>
        <td style="padding:6px 8px;font-size:12px;">${esc(u.wie||'')}</td>
        <td style="padding:6px 8px;font-size:12px;">${esc(u.tariefLabel||'')}</td>
        <td style="padding:6px 8px;font-size:12px;text-align:right;font-family:var(--mono);">${u.uren}</td>
        <td style="padding:6px 8px;font-size:12px;text-align:right;font-family:var(--mono);">€ ${(u.bedrag||0).toFixed(2)}</td>
        <td style="padding:6px 8px;font-size:12px;color:var(--text-dim);">${esc(u.notitie||'')}</td>
        <td style="padding:6px 8px;text-align:right;">${st}</td>
      </tr>`;
    }).join('');

    return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <div>
          <strong style="font-size:15px;">${esc(opdr)}</strong>
          <span style="font-size:12px;color:var(--text-mid);margin-left:10px;">${eenheidAantalTekst(uSom, grpInfo.eenheid)} · € ${bSom.toFixed(2)}</span>
        </div>
        <button onclick="maakUrenFactuur('${encodeURIComponent(opdr)}')"
          style="font-size:12px;padding:6px 14px;border-radius:6px;border:none;background:var(--accent);color:#fff;cursor:pointer;"
          title="${allGoed?'':'Let op: nog niet alle uren zijn goedgekeurd'}">
          🧾 Factuur maken${allGoed?'':' *'}
        </button>
      </div>
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr style="border-bottom:1px solid var(--border);">
          <th style="padding:4px 8px;text-align:left;font-size:11px;color:var(--text-dim);font-weight:600;">Datum</th>
          <th style="padding:4px 8px;text-align:left;font-size:11px;color:var(--text-dim);font-weight:600;">Wie</th>
          <th style="padding:4px 8px;text-align:left;font-size:11px;color:var(--text-dim);font-weight:600;">Tarief</th>
          <th style="padding:4px 8px;text-align:right;font-size:11px;color:var(--text-dim);font-weight:600;">Aantal</th>
          <th style="padding:4px 8px;text-align:right;font-size:11px;color:var(--text-dim);font-weight:600;">Bedrag</th>
          <th style="padding:4px 8px;text-align:left;font-size:11px;color:var(--text-dim);font-weight:600;">Notitie</th>
          <th style="padding:4px 8px;text-align:right;font-size:11px;color:var(--text-dim);font-weight:600;">Status</th>
        </tr></thead>
        <tbody>${rijen}</tbody>
      </table>
    </div>`;
  }).join('');
}

function openEigenaarUrenModal(editId){
  const isEdit = !!editId;
  const bestaand = isEdit ? (DB.uren||[]).find(u=>u.id===editId) : null;

  // Titel aanpassen
  const titel = document.getElementById('eu-modal-titel');
  if(titel) titel.textContent = isEdit ? 'Uren bewerken' : 'Uren toevoegen';
  const editIdEl = document.getElementById('eu-edit-id');
  if(editIdEl) editIdEl.value = editId || '';

  // Kassier-dropdown: toon bij eigenaar (add én edit), verberg bij kassier-edit
  const kasRij = document.getElementById('eu-kassier-rij');
  const kasSelect = document.getElementById('eu-kassier');
  const isEigenaarView = (typeof _loginRol !== 'undefined' && _loginRol === 'eigenaar');
  if(kasRij) kasRij.style.display = isEigenaarView ? '' : 'none';
  if(kasSelect){
    const kassiers = (DB.kassiers||[]).filter(k=>(k.bedrijven||[]).includes(huidigBedrijf));
    if(isEigenaarView && !kassiers.length){ toast('Geen medewerkers gevonden voor dit bedrijf.','warning'); return; }
    kasSelect.innerHTML = kassiers.map(k=>`<option value="${esc(k.naam)}">${esc(k.naam)}</option>`).join('');
    if(isEdit && bestaand) kasSelect.value = bestaand.wie;
  }

  // Tarief-dropdown
  const tarSelect = document.getElementById('eu-tarief');
  if(!tarSelect) return;
  const opdrachtgevers = DB.profiel?.opdrachtgevers || [];
  const opties = [];
  opdrachtgevers.forEach(o=>{
    const eenheid = o.eenheid === 'dag' ? 'dag' : 'uur';
    const flexibel = !!o.flexibelTarief;
    let tarLijst = Array.isArray(o.tarieven) ? o.tarieven : [{naam:'Standaard',bedrag:o.tarief||0}];
    // Flexibele opdrachtgever zonder vaste tarieven moet toch kiesbaar zijn
    if(!tarLijst.length && flexibel) tarLijst = [{naam:'Eigen tarief', bedrag:0}];
    tarLijst.forEach(t=>{
      opties.push({ opdrachtgever: o.naam, eenheid, flexibel, tariefLabel: t.naam||t.label||'Standaard', tariefBedrag: parseFloat(t.bedrag||0) });
    });
  });
  if(!opties.length){ toast('Geen opdrachtgevers ingesteld. Voeg ze toe via ⚙ Opdrachtgevers.','warning'); return; }
  tarSelect.innerHTML = opties.map((o,i)=>
    `<option value="${i}">${esc(o.opdrachtgever)} — ${esc(o.tariefLabel)} (€ ${(o.tariefBedrag).toFixed(2).replace('.',',')}${eenheidInfo(o.eenheid).per})</option>`
  ).join('');
  tarSelect._opties = opties;

  // Pre-vullen bij bewerken
  const datumEl = document.getElementById('eu-datum');
  if(isEdit && bestaand){
    if(datumEl) datumEl.value = bestaand.datum || '';
    document.getElementById('eu-uren').value = bestaand.uren != null ? String(bestaand.uren).replace('.',',') : '';
    document.getElementById('eu-notitie').value = bestaand.notitie || '';
    // Tarief-optie zoeken op opdrachtgever + label (flexibele entry: val terug op opdrachtgever)
    let matchIdx = opties.findIndex(o=>o.opdrachtgever===bestaand.opdrachtgever && o.tariefLabel===bestaand.tariefLabel);
    if(matchIdx < 0) matchIdx = opties.findIndex(o=>o.opdrachtgever===bestaand.opdrachtgever);
    if(matchIdx >= 0) tarSelect.value = matchIdx;
  } else {
    if(datumEl && !datumEl.value) datumEl.value = new Date().toISOString().slice(0,10);
    document.getElementById('eu-uren').value = '';
    document.getElementById('eu-notitie').value = '';
  }
  _euSyncEigenTarief(isEdit && bestaand ? bestaand.tariefBedrag : null);
  eigenaarUrenHerbereken();
  openModal('modal-eigenaar-uren');
}

// Toont/verbergt het eigen-tariefveld en vult het voor met het vaste tarief.
// bestaandBedrag: tariefBedrag van een entry die bewerkt wordt (anders null).
function _euSyncEigenTarief(bestaandBedrag){
  const tarSelect = document.getElementById('eu-tarief');
  const opties = tarSelect?._opties || [];
  const optie = opties[parseInt(tarSelect?.value||'0')] || {};
  const wrap = document.getElementById('eu-eigen-tarief-wrap');
  const inp = document.getElementById('eu-eigen-tarief');
  if(wrap) wrap.style.display = optie.flexibel ? '' : 'none';
  if(inp && optie.flexibel){
    const voorvul = bestaandBedrag != null ? bestaandBedrag : optie.tariefBedrag;
    inp.value = voorvul > 0 ? String(voorvul).replace('.',',') : '';
  }
}

function eigenaarUrenTariefGewijzigd(){
  _euSyncEigenTarief(null);
  eigenaarUrenHerbereken();
}

function eigenaarUrenHerbereken(){
  const tarSelect = document.getElementById('eu-tarief');
  const opties = tarSelect?._opties || [];
  const idx = parseInt(tarSelect?.value||'0');
  const tarief = opties[idx] || {};
  const uren = parseDecimaalInvoer(document.getElementById('eu-uren')?.value);
  const perEenheid = tarief.flexibel
    ? parseDecimaalInvoer(document.getElementById('eu-eigen-tarief')?.value)
    : (tarief.tariefBedrag||0);
  const bedrag = Math.round(uren * perEenheid * 100) / 100;
  const el = document.getElementById('eu-bedrag-preview');
  if(el) el.textContent = '€ ' + bedrag.toFixed(2).replace('.',',');
  // Aantal-label volgt de eenheid van de gekozen opdrachtgever
  const lbl = document.getElementById('eu-uren-label');
  if(lbl) lbl.textContent = 'Aantal ' + eenheidInfo(tarief.eenheid).meervoud;
}

function eigenaarVoegUrenToe(){
  const editId = document.getElementById('eu-edit-id')?.value || '';
  const datum = document.getElementById('eu-datum')?.value;
  const kasEl = document.getElementById('eu-kassier');
  const isEigenaarView = (typeof _loginRol !== 'undefined' && _loginRol === 'eigenaar');
  const wie = isEigenaarView
    ? (kasEl?.value || '')
    : (_actieveKassier?.naam || '');
  const uren = parseDecimaalInvoer(document.getElementById('eu-uren')?.value);
  const notitie = document.getElementById('eu-notitie')?.value.trim() || '';
  const tarSelect = document.getElementById('eu-tarief');
  const opties = tarSelect?._opties || [];
  const idx = parseInt(tarSelect?.value||'0');
  const tarief = opties[idx];

  if(!datum){ toast('Kies een datum.','error'); return; }
  if(!wie){ toast('Kies een medewerker.','error'); return; }
  if(!tarief){ toast('Kies een opdrachtgever en tarief.','error'); return; }
  if(uren <= 0){ toast('Vul het aantal '+eenheidInfo(tarief.eenheid).meervoud+' in.','error'); return; }

  // Flexibel tarief: het ingevulde bedrag telt; label blijft het vaste tarief als het gelijk is
  let tariefBedrag = tarief.tariefBedrag;
  let tariefLabel = tarief.tariefLabel;
  if(tarief.flexibel){
    tariefBedrag = parseDecimaalInvoer(document.getElementById('eu-eigen-tarief')?.value);
    if(tariefBedrag <= 0){ toast('Vul een tarief in.','error'); return; }
    if(tariefBedrag !== tarief.tariefBedrag) tariefLabel = 'Eigen tarief';
  }

  const bedrag = Math.round(uren * tariefBedrag * 100) / 100;
  const eenheid = tarief.eenheid === 'dag' ? 'dag' : 'uur';
  // Uren gaan alleen via de losse cloud-write, niet via save() — offline zou de
  // wijziging bij de volgende snapshot verdwijnen. Dus eerst online controleren.
  if(!checkOnline()) return;

  if(editId){
    // Bewerken
    const entry = (DB.uren||[]).find(u=>u.id===editId);
    if(!entry){ toast('Uren-entry niet gevonden.','error'); return; }
    Object.assign(entry, { datum, wie, opdrachtgever: tarief.opdrachtgever, eenheid, tariefLabel, tariefBedrag, uren, bedrag, notitie });
    localStorage.setItem(storageKey(), JSON.stringify(DB));
    _urenCloudWrite(fb=>fb.updateUrenItem(huidigBedrijf, editId, JSON.stringify({ datum, wie, opdrachtgever: tarief.opdrachtgever, eenheid, tariefLabel, tariefBedrag, uren, bedrag, notitie })), 'Opslaan mislukt — probeer opnieuw.');
    closeModal('modal-eigenaar-uren');
    if(isEigenaarView) renderUrenoverzicht(); else renderMobUrenLijst();
    toast('Uren bijgewerkt.','success');
    return;
  }

  // Nieuw toevoegen
  const ingave = {
    id: uid(), datum, wie,
    opdrachtgever: tarief.opdrachtgever,
    eenheid,
    tariefLabel,
    tariefBedrag,
    uren, bedrag, notitie,
    status: isEigenaarView ? 'goedgekeurd' : 'ingediend',
    aangemaakt: new Date().toISOString()
  };
  if(!DB.uren) DB.uren = [];
  DB.uren.push(ingave);
  localStorage.setItem(storageKey(), JSON.stringify(DB));
  slaUrenOpCloud(ingave);
  closeModal('modal-eigenaar-uren');
  if(isEigenaarView) renderUrenoverzicht(); else renderMobUrenLijst();
  toast(`Uren toegevoegd voor ${wie}.`,'success');
}

function verwijderUrenEigenaar(id){
  const u = (DB.uren||[]).find(x=>x.id===id);
  if(!u) return;
  if(!checkOnline()) return;
  if(!confirm(`Uren van ${u.wie} op ${u.datum} verwijderen?`)) return;
  DB.uren = (DB.uren||[]).filter(x=>x.id!==id);
  localStorage.setItem(storageKey(), JSON.stringify(DB));
  _urenCloudWrite(fb=>fb.verwijderUrenItem(huidigBedrijf, id), 'Verwijderen mislukt — probeer opnieuw.', true);
  renderUrenoverzicht();
  toast('Uren verwijderd.','success');
}

function urenKeur(id, status){
  const u = (DB.uren||[]).find(x=>x.id===id);
  if(!u) return;
  if(!checkOnline()) return;
  u.status = status;
  // Lokaal cachen en alleen deze ene status in de cloud bijwerken
  localStorage.setItem(storageKey(), JSON.stringify(DB));
  _urenCloudWrite(fb=>fb.updateUrenStatus(huidigBedrijf, id, status), 'Bijwerken mislukt — probeer opnieuw.');
  renderUrenoverzicht();
}

// Datum voor een factuurregel: 2026-08-01 → 01-08-2026 (leeg blijft leeg)
function _factuurDatumKort(iso){
  if(!iso) return '';
  const d = String(iso).slice(0,10).split('-');
  return d.length===3 ? `${d[2]}-${d[1]}-${d[0]}` : String(iso);
}

// Zoekt een eerder gemaakte uren-/dagfactuur voor dezelfde opdrachtgever én periode,
// zodat maakUrenFactuur() die kan vervangen i.p.v. er een tweede naast te zetten.
//
// Matcht ALLEEN op een exact vastgelegde periode. Er heeft hier eerst een terugval
// op de maand van de factuurdatum gezeten voor facturen van vóór aug 2026 (die geen
// periodeVan/periodeTot hebben), maar die gokte ernaast: een factuur over juni die
// begin juli verstuurd was, werd aangezien voor de julifactuur en aangeboden om te
// overschrijven. Een misser kost hier een al verstuurde factuur, dus liever geen
// match dan een verkeerde — het nummer is in de factuurgegevens-dialoog alsnog
// met de hand te kiezen.
function _zoekBestaandeUrenFactuur(opdr, van, tot){
  if(!van) return null;
  return (DB.verkoop||[]).find(f=>
    f && f.type==='uren' && f.klant===opdr &&
    f.periodeVan===van && f.periodeTot===tot
  ) || null;
}

// ── Factuurgegevens-dialoog (modal-uren-factuurnr in index.html) ──────────────
// Geeft een Promise die {nummer, datum, vervaldatum} teruggeeft, of null bij
// annuleren. Bestaat zodat de eigenaar een teruggestuurde factuur opnieuw kan
// maken met hetzelfde nummer en dezelfde factuurdatum als de klant al heeft.
// voorstel.type = 'uren' (standaard) of 'sales': alleen een bestaande factuur
// van datzelfde type mag via het nummer vervangen worden.
let _ufnResolve = null;
let _ufnType = 'uren';

function vraagUrenFactuurGegevens(voorstel){
  return new Promise(resolve=>{
    _ufnResolve = resolve;
    _ufnType = voorstel.type || 'uren';
    document.getElementById('ufn-context').innerHTML   = voorstel.context || '';
    document.getElementById('ufn-nummer').value        = voorstel.nummer || '';
    document.getElementById('ufn-datum').value         = voorstel.datum || '';
    document.getElementById('ufn-vervaldatum').value   = voorstel.vervaldatum || '';
    openModal('modal-uren-factuurnr');
    _ufnControleer();
  });
}

// Live terugkoppeling op het ingetypte nummer: bestaat het al, dan moet zichtbaar
// zijn DÁT er een bestaande factuur vervangen wordt, en welke.
function _ufnControleer(){
  const nr  = (document.getElementById('ufn-nummer').value||'').trim();
  const mld = document.getElementById('ufn-melding');
  const ok  = document.getElementById('ufn-ok');
  const zet = (tekst, kleur)=>{
    mld.style.display    = tekst ? 'block' : 'none';
    mld.innerHTML        = tekst;
    mld.style.background = kleur==='rood' ? 'rgba(220,38,38,.1)' : 'rgba(234,179,8,.12)';
    mld.style.color      = kleur==='rood' ? '#dc2626' : '#a16207';
  };

  if(!nr){ zet('Vul een factuurnummer in.','rood'); ok.disabled = true; return; }

  const bestaand = (DB.verkoop||[]).find(f=>f && (f.nummer||'').trim()===nr);
  if(!bestaand){
    zet('',''); ok.disabled = false; ok.textContent = 'Factuur aanmaken'; return;
  }
  if(bestaand.type!==_ufnType){
    const soort = bestaand.type==='uren' ? 'een urenfactuur' : bestaand.type==='sales' ? 'een salesfactuur' : 'een handmatige verkoopfactuur';
    zet(`Nummer ${esc(nr)} is al in gebruik door ${soort} (${esc(bestaand.klant||'')}). Kies een ander nummer.`,'rood');
    ok.disabled = true; return;
  }
  if(bestaand.status==='betaald' || _getBetalingen(bestaand).length){
    zet(`Factuur ${esc(nr)} is al betaald of gekoppeld aan een banktransactie. Draai die betaling eerst terug bij Verkoopfacturen.`,'rood');
    ok.disabled = true; return;
  }
  zet(`Let op: factuur ${esc(nr)} (${esc(bestaand.klant||'')}, ${fmt(bestaand.totaalIncl)}) bestaat al en wordt vervángen. De oude boeking wordt teruggedraaid.`,'geel');
  ok.disabled = false; ok.textContent = 'Factuur vervangen';
}

function _ufnBevestig(){
  const nr     = (document.getElementById('ufn-nummer').value||'').trim();
  const datum  = document.getElementById('ufn-datum').value;
  const verval = document.getElementById('ufn-vervaldatum').value;
  if(!nr)    { toast('Vul een factuurnummer in.','error'); return; }
  if(!datum) { toast('Vul een factuurdatum in.','error'); return; }
  if(verval && verval < datum){ toast('De vervaldatum ligt vóór de factuurdatum.','error'); return; }
  closeModal('modal-uren-factuurnr');
  const r = _ufnResolve; _ufnResolve = null;
  if(r) r({ nummer:nr, datum, vervaldatum: verval || datum });
}

function _ufnAnnuleer(){
  closeModal('modal-uren-factuurnr');
  const r = _ufnResolve; _ufnResolve = null;
  if(r) r(null);
}

// De globale Escape-handler (state.js) sluit élke open modal, maar weet niets van
// onze Promise — zonder dit bleef maakUrenFactuur() na een Escape eeuwig wachten.
document.addEventListener('keydown', e=>{
  if(e.key==='Escape' && _ufnResolve) _ufnAnnuleer();
});

async function maakUrenFactuur(opdrEnc){
  const opdr = decodeURIComponent(opdrEnc);
  const items = _urenVanMaand()
    .filter(u=>u.opdrachtgever===opdr && u.status!=='afgewezen')
    .sort((a,b)=>(a.datum||'').localeCompare(b.datum||''));
  if(!items.length){ toast('Geen factureerbare uren voor deze opdrachtgever.','warning'); return; }

  const p = DB.profiel || {};
  const bedrijf = p.naam || huidigBedrijf;

  // Opdrachtgever-object opzoeken uit centraal register
  const opdrObj = (DB.profiel?.opdrachtgevers||[]).find(o=>o.naam===opdr) || {};

  if(!await _bevestigFactuurVelden(p, opdrObj, opdr)) return;

  // Periode van deze factuur — legt ook vast welke eerdere factuur bij dezelfde
  // periode hoort, zodat de dialoog verderop die kan voorstellen om te vervangen.
  const { van: perVan, tot: perTot } = _urenPeriode();

  // Periode op de factuur: één maand, of de hele reeks bij "Meerdere maanden"
  const maandLabel = _urenPeriodeLabel();

  // Eenheid van deze opdrachtgever (uur/dag) — bepaalt de factuurregels.
  // Uit de ingaves zelf, met het opdrachtgever-register als fallback.
  const opdrEenheid = items.find(u=>u.eenheid)?.eenheid || eenheidVanOpdrachtgever(opdr);
  const eInfo = eenheidInfo(opdrEenheid);

  // Twee factuurindelingen (per opdrachtgever in te stellen):
  // - regelPerDienst: elke ingave een eigen regel met datum en notitie — voor klanten
  //   die per dienst gespecificeerd willen zien;
  // - standaard: samengevoegd per tarieftype, één regel per tarief.
  const perDienst = !!opdrObj.regelPerDienst;
  let regelLijst;
  if(perDienst){
    regelLijst = items.map(u=>({
      label: u.notitie || u.tariefLabel || eInfo.gewerkt,
      datum: u.datum || '',
      wie: u.wie || '',
      tarief: parseFloat(u.tariefBedrag)||0,
      uren: parseFloat(u.uren)||0,
      bedrag: parseFloat(u.bedrag)||0
    }));
  } else {
    // Groepeer per tarieftype (aantal = uren óf dagen, afhankelijk van eenheid)
    const groepen = {};
    items.forEach(u=>{
      const lbl = u.tariefLabel || eInfo.gewerkt;
      const tarief = parseFloat(u.tariefBedrag)||0;
      const key = lbl + '|' + tarief;
      if(!groepen[key]) groepen[key] = { label:lbl, tarief, uren:0, bedrag:0 };
      groepen[key].uren += parseFloat(u.uren)||0;
      groepen[key].bedrag += parseFloat(u.bedrag)||0;
    });
    regelLijst = Object.values(groepen);
  }

  // Regelbedrag is exact aantal × tarief. De uren worden eerst op 2 decimalen
  // gezet, want dat aantal komt zo op de factuur én in de opgeslagen regel te
  // staan; het bedrag mag daarna NIET afgerond worden.
  regelLijst.forEach(r=>{
    r.uren = Math.round((parseFloat(r.uren)||0)*100)/100;
    r.bedrag = r.uren * (parseFloat(r.tarief)||0);
  });

  const zonderBtw = !!p.urenZonderBtw;
  const btwPct = 21;
  // Exact dezelfde twee formules als slaFactuurOp() in facturen.js: subtotaal is de
  // ongeronde som van aantal × prijs, BTW wordt PER REGEL afgerond. Dat is geen
  // detail — draaiFactuurGBTerug() en de BTW-aangifte herberekenen deze bedragen
  // uit de opgeslagen regels. Rondde je hier anders af, dan haalde de terugdraai
  // een iets ander bedrag van de omzetrekening dan er ooit op geboekt is, bleef er
  // na het vervangen van een factuur een restje staan, en gaf rubriek 1a een ander
  // BTW-bedrag dan er op 1510 staat.
  const subtotaalExcl = regelLijst.reduce((a,r)=>a+r.bedrag,0);
  const btwBedrag = zonderBtw ? 0
    : regelLijst.reduce((a,r)=>a+Math.round(r.bedrag*btwPct)/100,0);
  const totaalIncl = subtotaalExcl + btwBedrag;

  // ── Factuurnummer, factuurdatum en vervaldatum: de app stelt voor, de eigenaar
  // beslist. Automatisch bepalen ging mis zodra een factuur gecorrigeerd moest
  // worden: dan kreeg de klant een nieuw, hoger nummer terwijl hij het oude al
  // op zijn bureau had liggen.
  const bestaande = _zoekBestaandeUrenFactuur(opdr, perVan, perTot);
  const standaardDatum = bestaande?.datum || new Date().toISOString().slice(0,10);
  const standaardVerval = bestaande?.vervaldatum
    || (()=>{ const d=new Date(standaardDatum); d.setDate(d.getDate()+30); return d.toISOString().slice(0,10); })();

  const keuze = await vraagUrenFactuurGegevens({
    context: bestaande
      ? `Er staat al een factuur voor ${esc(opdr)} over ${esc(maandLabel)}. Laat het nummer staan om die te vervangen, of geef een ander nummer op.`
      : `Factuur voor ${esc(opdr)} over ${esc(maandLabel)} — ${fmt(totaalIncl)} incl. BTW.`,
    nummer: bestaande?.nummer || nextFactuurNummer('uren'),
    datum: standaardDatum,
    vervaldatum: standaardVerval
  });
  if(!keuze) return;

  const factuurNr      = keuze.nummer;
  const datumISO       = keuze.datum;
  const betaaldatumISO = keuze.vervaldatum;
  const vandaagFmt     = new Date(datumISO).toLocaleDateString('nl-NL',{day:'numeric',month:'long',year:'numeric'});
  const betaaldatumFmt = new Date(betaaldatumISO).toLocaleDateString('nl-NL',{day:'numeric',month:'long',year:'numeric'});

  // Hoort het gekozen nummer al bij een uren-factuur, dan vervangen we die. De
  // dialoog heeft dat zichtbaar gemaakt; hier nog een keer de betaal-/bankcheck,
  // want de data kan tussentijds via de cloud gewijzigd zijn.
  const vervangen = (DB.verkoop||[]).find(f=>f && f.type==='uren' && (f.nummer||'').trim()===factuurNr) || null;
  if(vervangen && (vervangen.status==='betaald' || _getBetalingen(vervangen).length)){
    toast(`Factuur ${factuurNr} is al betaald of gekoppeld aan een banktransactie. Draai die betaling eerst terug bij Verkoopfacturen.`,'error',9000);
    return;
  }

  // Opmaak komt uit de gedeelde bouwFactuurHtml() in facturen.js — dezelfde
  // template als de "Factuur"-knop bij verkoopfacturen, zodat er maar een
  // factuurontwerp te onderhouden is (zie CLAUDE.md, geen dubbele code).
  const html = bouwFactuurHtml({
    bedrijf, p,
    klantNaam: opdr,
    klantRegels: [
      opdrObj.straat || opdrObj.adres || '',
      (String(opdrObj.postcode||'')+' '+String(opdrObj.stad||'')).trim(),
      opdrObj.btwNummer ? 'BTW: '+opdrObj.btwNummer : ''
    ],
    factuurNr,
    factuurdatumFmt: vandaagFmt,
    vervaldatumFmt: betaaldatumFmt,
    // Uit de datums zelf: de vervaldatum is nu vrij te kiezen, dus een vaste
    // "30 dagen" op de factuur zou een onwaarheid kunnen worden.
    termijnLabel: berekenTermijnLabel(datumISO, betaaldatumISO),
    kolommen: perDienst
      ? ['Omschrijving','Datum','Aantal',eInfo.tariefLabel,'Bedrag']
      : ['Omschrijving','Periode','Aantal',eInfo.tariefLabel,'Bedrag'],
    rijen: regelLijst.map(r=>[
      perDienst
        ? `${r.label}${r.wie?' ('+r.wie+')':''}`
        : `${eInfo.gewerkt} — ${r.label}`,
      perDienst ? _factuurDatumKort(r.datum) : maandLabel,
      eenheidAantalTekst(r.uren, eInfo.eenheid),
      '€ '+r.tarief.toFixed(2)+eInfo.per,
      '€ '+r.bedrag.toFixed(2)
    ]),
    subtotaalExcl,
    btwRegels: zonderBtw ? [] : [{label:`BTW ${btwPct}%`, bedrag:btwBedrag}],
    totaalIncl,
    zonderBtw
  });

  // Sla op als verkoop-entry zodat factuurnummer-teller klopt en factuur in dashboard verschijnt.
  // De factuurregels gaan MEE: zonder `regels` toonde de knop "📄 Factuur" bij
  // Verkoopfacturen een lege regeltabel en maakte "Bewerk" er één regel van met
  // aantal 1 en omschrijving "Factuur UF-…" — de urenspecificatie was dan weg.
  const gbOmzetRek = _zorgFactuurRekeningen();
  const verkoopRegels = regelLijst.map(r=>({
    omschrijving: perDienst
      ? `${r.label}${r.wie?' ('+r.wie+')':''}${r.datum?' — '+_factuurDatumKort(r.datum):''}`
      : `${eInfo.gewerkt} — ${r.label} (${maandLabel})`,
    aantal: r.uren,          // al afgerond op 2 decimalen, en r.bedrag = aantal × tarief
    prijs: parseFloat(r.tarief)||0,
    // Expliciet de omzetrekening waarop hieronder ook geboekt wordt. Leeg laten zou
    // deze omzet in de P&L onder "overig" laten vallen (btw-rapport.js, verdeelFactuur).
    gbId: gbOmzetRek?.id || '',
    btw: zonderBtw ? '0' : String(btwPct)
  }));
  const verkoopEntry = {
    id: vervangen?.id || uid(),
    nummer: factuurNr,
    datum: datumISO,
    vervaldatum: betaaldatumISO,
    klant: opdr,
    adres: _opdrachtgeverAdres(opdrObj),
    btwnr: opdrObj.btwNummer || '',
    regels: verkoopRegels,
    omschrijving: `${eInfo.gewerkt} ${maandLabel}`,
    totaalExcl: subtotaalExcl,
    totaalIncl: totaalIncl,
    totaal: totaalIncl,
    btwBedrag: btwBedrag,
    btwTarief: zonderBtw ? 0 : btwPct,
    status: 'verstuurd',
    type: 'uren',
    // Periode vastleggen zodat een volgende generatie deze factuur terugvindt
    periodeVan: perVan,
    periodeTot: perTot,
    periodeLabel: maandLabel
  };

  if(!_boekGegenereerdeFactuur(verkoopEntry, vervangen)) return;
  openFactuurVenster(html);
}

// ── Gedeeld door maakUrenFactuur() en maakSalesFactuur() ─────────────────────

// Waarschuwt over ontbrekende wettelijk verplichte velden (art. 35a Wet OB 1968).
// Geeft true als er doorgegaan mag worden.
async function _bevestigFactuurVelden(p, opdrObj, opdr){
  const ontbrekend = [];
  if(!p.straat)      ontbrekend.push('Bedrijfsadres (Instellingen → Bedrijfsprofiel)');
  if(!p.btw && !p.urenZonderBtw) ontbrekend.push('BTW-nummer (Instellingen → Bedrijfsprofiel)');
  if(!p.kvk)         ontbrekend.push('KvK-nummer (Instellingen → Bedrijfsprofiel)');
  if(!p.iban)        ontbrekend.push('IBAN (Instellingen → Bedrijfsprofiel)');
  if(!opdrObj.straat && !opdrObj.adres) ontbrekend.push(`Adres van opdrachtgever "${opdr}" (Instellingen → Opdrachtgevers)`);
  if(!ontbrekend.length) return true;
  return bevestig(
    `Waarschuwing: de factuur is mogelijk ongeldig.\n\nOntbrekende verplichte velden:\n• ${ontbrekend.join('\n• ')}\n\nToch doorgaan?`,
    'Toch aanmaken', 'Annuleer'
  );
}

// Adres van een opdrachtgever zoals het in f.adres van een verkoopfactuur staat.
function _opdrachtgeverAdres(opdrObj){
  return [
    opdrObj.straat || opdrObj.adres || '',
    (String(opdrObj.postcode||'')+' '+String(opdrObj.stad||'')).trim()
  ].filter(Boolean).join('\n');
}

// Zorgt dat Debiteuren, Omzet en BTW te betalen bestaan (aangevuld uit
// DEFAULT_GB als ze ontbreken) en geeft de omzetrekening terug. Moet vóór het
// opbouwen van de factuurregels, want die verwijzen naar de omzetrekening
// waar _boekGegenereerdeFactuur() straks ook echt op boekt.
function _zorgFactuurRekeningen(){
  if(!DB.grootboek) DB.grootboek = [];
  [
    {nummer:'1300', naam:'Debiteuren',              type:'activa'},
    {nummer:'4000', naam:'Omzet diensten',           type:'omzet'},
    {nummer:'1510', naam:'BTW te betalen (verkoop)', type:'passiva'},
  ].forEach(def => {
    const bestaat = DB.grootboek.find(g=>g.nummer===def.nummer);
    if(!bestaat) DB.grootboek.push({id:'gb_auto_'+def.nummer, ...def, saldo:0});
  });
  return DB.grootboek.find(g=>g.type==='omzet')
      || DB.grootboek.find(g=>(g.naam||'').toLowerCase().includes('omzet'));
}

// Zet een gegenereerde factuur (uren of sales) in DB.verkoop en boekt hem
// (factuurstelsel, CLAUDE.md #11): Debiteuren D totaalIncl / Omzet C totaalExcl /
// BTW te betalen C btwBedrag. Bij `vervangen` wordt de oude boeking eerst
// gespiegeld (#21.4). Geeft false als save() de handeling heeft teruggedraaid.
function _boekGegenereerdeFactuur(entry, vervangen){
  if(!DB.verkoop) DB.verkoop=[];
  if(vervangen){
    // Oude boeking eerst spiegelen, anders komt de nieuwe er bovenop (#21.4)
    draaiFactuurGBTerug(vervangen, 'verkoop');
    const i = DB.verkoop.findIndex(f=>f.id===vervangen.id);
    if(i>=0) DB.verkoop[i] = entry; else DB.verkoop.push(entry);
  } else {
    DB.verkoop.push(entry);
  }

  const gbDebiteuren = DB.grootboek.find(g=>g.nummer==='1300')
                    || DB.grootboek.find(g=>(g.naam||'').toLowerCase().includes('debiteuren'));
  if(gbDebiteuren) gbDebiteuren.saldo = (parseFloat(gbDebiteuren.saldo)||0) + entry.totaalIncl;

  const gbOmzet = DB.grootboek.find(g=>g.type==='omzet')
               || DB.grootboek.find(g=>(g.naam||'').toLowerCase().includes('omzet'));
  if(gbOmzet) gbOmzet.saldo = (parseFloat(gbOmzet.saldo)||0) + entry.totaalExcl;

  // Drempel MOET gelijk blijven aan die in draaiFactuurGBTerug() (facturen.js),
  // anders draait vervangen/verwijderen niet exact terug wat hier geboekt is.
  if(entry.btwBedrag > 0.01){
    const gbBtw = DB.grootboek.find(g=>g.nummer==='1510')
               || DB.grootboek.find(g=>g.nummer==='1530')
               || DB.grootboek.find(g=>(g.naam||'').toLowerCase().includes('btw te betalen'));
    if(gbBtw) gbBtw.saldo = (parseFloat(gbBtw.saldo)||0) + entry.btwBedrag;
  }

  // save() draait de hele handeling terug zodra de balans niet klopt. Dat resultaat
  // MOET gecontroleerd worden (zie state.js), anders volgt een succesmelding en
  // een factuurvenster terwijl er niets bewaard is.
  if(!save()){
    toast('De factuur is niet aangemaakt: de balans zou er niet meer door kloppen. Er is niets gewijzigd.','error',9000);
    return false;
  }

  // Verkooplijst en dashboard bijwerken — bij vervangen verandert een bestaande
  // rij, en die blijft anders de oude bedragen tonen tot de pagina herladen wordt.
  if(typeof renderFacturen==='function') renderFacturen('verkoop');
  if(typeof renderDashboard==='function') renderDashboard();

  toast(vervangen
    ? `Factuur ${entry.nummer} vervangen — de oude boeking is teruggedraaid.`
    : `Factuur ${entry.nummer} aangemaakt.`, 'success', 6000);
  return true;
}

// ============================================================
// SALES — medewerker vult per maand zijn omzet excl. BTW in, eigenaar keurt
// goed en factureert per opdrachtgever per maand.
//
// Een sales-ingave staat in hetzelfde document als de uren (DB.uren /
// data/uren) met soort:'sales'. Zo werken de bestaande directe cloud-writes
// (voegUrenToe, updateUrenStatus, updateUrenItem, verwijderUrenItem — alle vier
// transactioneel, en de enige schrijvers van data/uren: save() raakt het niet)
// en de security rules ongewijzigd, en hoeft de sync-set (#22) niet uitgebreid.
// Gevolg: ELKE uren-doorloop moet isSalesIngave() uitsluiten, anders telt een
// salesbedrag als gewerkte uren mee.
//
// Velden: id, soort:'sales', maand ('YYYY-MM'), datum (maand+'-01', voor
// code die op datum filtert), wie, wieEmail, opdrachtgever, bedrag (excl.
// BTW, 2 decimalen), notitie, status ('ingediend'|'goedgekeurd'|'afgewezen'),
// aangemaakt.
// ============================================================
function isSalesIngave(u){ return u?.soort === 'sales'; }

function _salesMaandLabel(m){
  if(!m) return '';
  const [j,mm] = m.split('-');
  return new Date(j, parseInt(mm)-1, 1).toLocaleDateString('nl-NL',{month:'long',year:'numeric'});
}

// Bedrag-invoer met Nederlandse duizendtallen. parseDecimaalInvoer() leest
// "2.500" als 2,5 — prima voor uren, maar een salesbedrag van € 2.500 zou dan
// € 2,50 worden. Hier: met een komma zijn punten duizendtallen ("2.500,75");
// zonder komma alleen als het patroon er exact op lijkt ("2.500", "12.500.000").
function _parseBedragInvoer(waarde){
  let s = String(waarde||'').replace(/[€\s]/g,'');
  if(s.includes(',')) s = s.replace(/\./g,'').replace(',','.');
  else if(/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g,'');
  return Math.round((parseFloat(s)||0)*100)/100;
}

function _salesHuidigeMaand(){
  const nu = new Date();
  return nu.getFullYear() + '-' + String(nu.getMonth()+1).padStart(2,'0');
}

// Bestaat er voor deze medewerker al een (niet-afgewezen) ingave voor dezelfde
// opdrachtgever en maand? Eén bedrag per maand — een tweede zou dubbel gefactureerd
// worden. `behalveId` = de ingave die nu bewerkt wordt.
function _salesDubbel(wieEmail, wieNaam, opdr, maand, behalveId){
  const email = String(wieEmail||'').toLowerCase();
  return (DB.uren||[]).find(u=>
    isSalesIngave(u) && u.id!==behalveId && u.status!=='afgewezen' &&
    u.opdrachtgever===opdr && u.maand===maand &&
    (email ? String(u.wieEmail||'').toLowerCase()===email : u.wie===wieNaam)
  ) || null;
}

// Eigenaar: zichtbaar als minstens één medewerker van dit bedrijf de module heeft.
function isSalesInGebruik(){
  return (DB.kassiers||[]).some(k=>
    (k.modules||[]).includes('sales') && (k.bedrijven||[]).includes(huidigBedrijf));
}

function updateSalesNav(){
  const nav = document.getElementById('nav-item-salesoverzicht');
  const isEigenaar = typeof _loginRol !== 'undefined' && _loginRol === 'eigenaar';
  if(nav) nav.style.display = (isEigenaar && isSalesInGebruik()) ? '' : 'none';
}

// ---- Kassier (telefoon) ----
function renderMobSales(){
  const sel = document.getElementById('mob-sales-opdrachtgever');
  if(sel){
    const vorige = sel.value;
    const lijst = (DB.profiel?.opdrachtgevers||[]).map(o=>o.naam).filter(Boolean);
    sel.innerHTML = lijst.length
      ? lijst.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('')
      : '<option value="">Geen opdrachtgevers — vraag de eigenaar</option>';
    if(lijst.includes(vorige)) sel.value = vorige;
  }
  const maandEl = document.getElementById('mob-sales-maand');
  if(maandEl && !maandEl.value) maandEl.value = _salesHuidigeMaand();

  const el = document.getElementById('mob-sales-lijst');
  if(!el) return;
  const mijnEmail = String(_actieveKassier?.email||'').toLowerCase();
  const mijn = (DB.uren||[]).filter(u=>isSalesIngave(u) &&
    (mijnEmail ? String(u.wieEmail||'').toLowerCase()===mijnEmail : u.wie===_actieveKassier?.naam))
    .sort((a,b)=>(b.maand||'').localeCompare(a.maand||'') || String(b.aangemaakt||'').localeCompare(String(a.aangemaakt||'')))
    .slice(0,12);
  if(!mijn.length){
    el.innerHTML = '<div style="color:rgba(255,255,255,0.25);font-size:14px;padding:16px 0">Nog geen sales ingediend.</div>';
    return;
  }
  el.innerHTML = mijn.map(u=>{
    const st = u.status==='goedgekeurd' ? ['goed','Goedgekeurd']
             : u.status==='afgewezen'   ? ['afgekeurd','Afgewezen']
             : ['ingediend','Ingediend'];
    const intrekken = u.status==='ingediend'
      ? `<button class="mob-factuur-btn terug" onclick="mobTrekSalesIn('${u.id}')">↩ Intrekken</button>` : '';
    return `<div class="mob-lijst-item mob-factuur-item">
      <div class="mob-factuur-top">
        <div>
          <div class="mob-lijst-datum">${esc(u.opdrachtgever||'')} · ${esc(_salesMaandLabel(u.maand))}</div>
          <div class="mob-lijst-bedrag" style="font-size:15px;">${mobFmtEur(u.bedrag||0)} <span style="font-size:11px;opacity:.6;font-weight:400;">excl. BTW</span></div>
          ${u.notitie?`<div style="font-size:12px;color:rgba(255,255,255,0.45);margin-top:2px;">${esc(u.notitie)}</div>`:''}
        </div>
        <span class="mob-lijst-status ${st[0]}">${st[1]}</span>
      </div>
      ${intrekken}
    </div>`;
  }).join('');
}

function mobSlaSalesOp(){
  if(!checkOnline()) return;
  const opdr    = document.getElementById('mob-sales-opdrachtgever')?.value || '';
  const maand   = document.getElementById('mob-sales-maand')?.value || '';
  const bedrag  = _parseBedragInvoer(document.getElementById('mob-sales-bedrag')?.value);
  const notitie = document.getElementById('mob-sales-notitie')?.value.trim() || '';
  const wie      = _actieveKassier?.naam || '';
  const wieEmail = String(_actieveKassier?.email||'').toLowerCase();

  if(!opdr){ toast('Kies een opdrachtgever.','error'); return; }
  if(!/^\d{4}-\d{2}$/.test(maand)){ toast('Kies een maand.','error'); return; }
  if(!(bedrag > 0)){ toast('Vul het bedrag excl. BTW in.','error'); return; }
  const dubbel = _salesDubbel(wieEmail, wie, opdr, maand);
  if(dubbel){
    toast(`Je hebt voor ${opdr} over ${_salesMaandLabel(maand)} al ${mobFmtEur(dubbel.bedrag)} ingediend. `+
          (dubbel.status==='ingediend' ? 'Trek die eerst in om een nieuw bedrag op te geven.' : 'Die is al goedgekeurd — vraag de eigenaar om het aan te passen.'),
          'error', 8000);
    return;
  }

  const ingave = {
    id: uid(), soort:'sales', maand, datum: maand+'-01',
    wie, wieEmail, opdrachtgever: opdr,
    bedrag, notitie,
    status: 'ingediend',
    aangemaakt: new Date().toISOString()
  };
  if(!DB.uren) DB.uren = [];
  DB.uren.push(ingave);
  localStorage.setItem(storageKey(), JSON.stringify(DB));
  slaUrenOpCloud(ingave);

  toast(`Sales ${_salesMaandLabel(maand)} ingediend: ${mobFmtEur(bedrag)} excl. BTW.`,'success');
  document.getElementById('mob-sales-bedrag').value = '';
  document.getElementById('mob-sales-notitie').value = '';
  renderMobSales();
}

async function mobTrekSalesIn(id){
  if(!checkOnline()) return;
  const u = (DB.uren||[]).find(x=>x.id===id);
  if(!u || !isSalesIngave(u)) return;
  if(u.status!=='ingediend'){ toast('Deze is al beoordeeld en kan niet meer ingetrokken worden.','error'); return; }
  const ok = await bevestig(`Sales ${_salesMaandLabel(u.maand)} voor ${u.opdrachtgever} (${mobFmtEur(u.bedrag)}) intrekken?`, 'Intrekken', 'Intrekken');
  if(!ok) return;
  // Dit scherm kan achterlopen (PWA in het geheugen, #9). De cloud controleert
  // in dezelfde transactie als het verwijderen of de status nog 'ingediend' is:
  // heeft de eigenaar intussen goedgekeurd — misschien al gefactureerd — dan
  // blijft de ingave staan. Pas na bevestiging lokaal weghalen.
  toonSyncStatus('opslaan');
  let r;
  try{
    r = JSON.parse(await fbAanroep(fb=>fb.verwijderUrenItem(huidigBedrijf, id, 'ingediend')) || '{}');
  }catch(e){ toonSyncStatus('fout'); toast('Intrekken mislukt — probeer opnieuw.','error'); return; }
  if(!r.ok && r.reden==='status'){
    toonSyncStatus('fout');
    toast('De eigenaar heeft deze al beoordeeld — intrekken kan niet meer.','error',7000);
    renderMobFacturen();
    return;
  }
  // ok, of 'niet gevonden' (al weg in de cloud): lokaal ook weg
  toonSyncStatus('opgeslagen');
  DB.uren = DB.uren.filter(x=>x.id!==id);
  localStorage.setItem(storageKey(), JSON.stringify(DB));
  renderMobSales();
}

// ---- Eigenaar: overzicht, goedkeuren, factureren ----
function _salesFilterMaand(){
  const el = document.getElementById('sales-filter-maand');
  if(el && !el.value) el.value = _salesHuidigeMaand();
  return el?.value || _salesHuidigeMaand();
}

function _zoekBestaandeSalesFactuur(opdr, maand){
  // Alleen exact op de vastgelegde periode — nooit gokken (CLAUDE.md #29).
  return (DB.verkoop||[]).find(f=>
    f && f.type==='sales' && f.klant===opdr && f.periodeVan===maand && f.periodeTot===maand
  ) || null;
}

function renderSalesoverzicht(){
  const maand = _salesFilterMaand();
  const lijst = (DB.uren||[]).filter(u=>isSalesIngave(u) && u.maand===maand);
  const geldig = lijst.filter(u=>u.status!=='afgewezen');
  const z=(id,v)=>{ const e=document.getElementById(id); if(e) e.textContent=v; };
  z('sov-bedrag', fmt(geldig.reduce((a,u)=>a+(parseFloat(u.bedrag)||0),0)));
  z('sov-goed',   fmt(geldig.filter(u=>u.status==='goedgekeurd').reduce((a,u)=>a+(parseFloat(u.bedrag)||0),0)));
  z('sov-wacht',  String(lijst.filter(u=>u.status==='ingediend').length));
  z('sov-opdr',   String(new Set(geldig.map(u=>u.opdrachtgever)).size));

  const el = document.getElementById('sales-overzicht-lijst');
  if(!el) return;
  if(!lijst.length){
    el.innerHTML = `<div style="color:var(--text-dim);padding:24px 0;text-align:center;">Geen sales ingediend over ${esc(_salesMaandLabel(maand))}.</div>`;
    return;
  }

  const perOpdr = {};
  lijst.forEach(u=>{ (perOpdr[u.opdrachtgever] ||= []).push(u); });
  const th = (t,r)=>`<th style="padding:4px 8px;text-align:${r?'right':'left'};font-size:11px;color:var(--text-dim);font-weight:600;">${t}</th>`;

  el.innerHTML = Object.keys(perOpdr).sort().map(opdr=>{
    const items = perOpdr[opdr].sort((a,b)=>(a.wie||'').localeCompare(b.wie||''));
    const som = items.filter(u=>u.status!=='afgewezen').reduce((a,u)=>a+(parseFloat(u.bedrag)||0),0);
    const kanFactureren = items.some(u=>u.status==='goedgekeurd');
    const wacht = items.some(u=>u.status==='ingediend');
    const bestaande = _zoekBestaandeSalesFactuur(opdr, maand);

    const rijen = items.map(u=>{
      const keur = u.status==='goedgekeurd'
        ? '<span style="color:#16a34a;">✓</span>'
        : u.status==='afgewezen'
        ? '<span style="color:var(--text-dim);font-size:11px;">afgewezen</span>'
        : `<span style="display:inline-flex;gap:6px;">
             <button onclick="salesKeur('${u.id}','goedgekeurd')" style="font-size:11px;padding:2px 8px;border-radius:5px;border:none;background:#16a34a;color:#fff;cursor:pointer;">Goedkeuren</button>
             <button onclick="salesKeur('${u.id}','afgewezen')" style="font-size:11px;padding:2px 8px;border-radius:5px;border:1px solid var(--border);background:var(--surface);color:var(--text-mid);cursor:pointer;">×</button>
           </span>`;
      const knoppen = `<span style="display:inline-flex;gap:4px;align-items:center;">${keur}<button onclick="openSalesModal('${u.id}')" title="Bewerken" style="font-size:12px;padding:2px 6px;border-radius:5px;border:1px solid var(--border);background:var(--surface);cursor:pointer;">✏️</button><button onclick="verwijderSales('${u.id}')" title="Verwijderen" style="font-size:12px;padding:2px 6px;border-radius:5px;border:none;background:#ef4444;color:#fff;cursor:pointer;">🗑</button></span>`;
      const afgewezen = u.status==='afgewezen' ? 'opacity:0.45;text-decoration:line-through;' : '';
      return `<tr style="${afgewezen}">
        <td style="padding:6px 8px;font-size:12px;">${esc(u.wie||'')}</td>
        <td style="padding:6px 8px;font-size:12px;text-align:right;font-family:var(--mono);">${fmt(u.bedrag||0)}</td>
        <td style="padding:6px 8px;font-size:12px;color:var(--text-dim);">${esc(u.notitie||'')}</td>
        <td style="padding:6px 8px;text-align:right;">${knoppen}</td>
      </tr>`;
    }).join('');

    return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:10px;flex-wrap:wrap;">
        <div>
          <strong style="font-size:15px;">${esc(opdr)}</strong>
          <span style="font-size:12px;color:var(--text-mid);margin-left:10px;">${fmt(som)} excl. BTW</span>
          ${bestaande?`<span style="font-size:11px;color:var(--text-dim);margin-left:10px;">Gefactureerd: ${esc(bestaande.nummer||'')}</span>`:''}
        </div>
        <button onclick="maakSalesFactuur('${encodeURIComponent(opdr)}')" ${kanFactureren?'':'disabled'}
          style="font-size:12px;padding:6px 14px;border-radius:6px;border:none;background:var(--accent);color:#fff;cursor:${kanFactureren?'pointer':'default'};opacity:${kanFactureren?1:.5};"
          title="${kanFactureren?(wacht?'Alleen de goedgekeurde bedragen gaan op de factuur':''):'Keur eerst een bedrag goed'}">
          🧾 ${bestaande?'Factuur opnieuw maken':'Factuur maken'}${wacht?' *':''}
        </button>
      </div>
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr style="border-bottom:1px solid var(--border);">${th('Medewerker')}${th('Bedrag excl. BTW',1)}${th('Notitie')}${th('Status',1)}</tr></thead>
        <tbody>${rijen}</tbody>
      </table>
    </div>`;
  }).join('');
}

function salesKeur(id, status){
  const u = (DB.uren||[]).find(x=>x.id===id);
  if(!u || !isSalesIngave(u)) return;
  if(!checkOnline()) return;
  u.status = status;
  localStorage.setItem(storageKey(), JSON.stringify(DB));
  _urenCloudWrite(fb=>fb.updateUrenStatus(huidigBedrijf, id, status), 'Bijwerken mislukt — probeer opnieuw.');
  renderSalesoverzicht();
}

async function verwijderSales(id){
  const u = (DB.uren||[]).find(x=>x.id===id);
  if(!u || !isSalesIngave(u)) return;
  if(!checkOnline()) return;
  const ok = await bevestig(`Sales van ${u.wie||'?'} voor ${u.opdrachtgever} over ${_salesMaandLabel(u.maand)} (${fmt(u.bedrag)}) verwijderen?`, 'Verwijderen', 'Verwijderen');
  if(!ok) return;
  DB.uren = DB.uren.filter(x=>x.id!==id);
  localStorage.setItem(storageKey(), JSON.stringify(DB));
  _urenCloudWrite(fb=>fb.verwijderUrenItem(huidigBedrijf, id), 'Verwijderen mislukt — probeer opnieuw.', true);
  renderSalesoverzicht();
  toast('Sales verwijderd.','success');
}

// Toevoegen (door de eigenaar, meteen goedgekeurd) of bewerken van een ingave.
function openSalesModal(editId){
  const bestaand = editId ? (DB.uren||[]).find(u=>u.id===editId && isSalesIngave(u)) : null;
  if(editId && !bestaand){ toast('Sales-ingave niet gevonden.','error'); return; }
  const kassiers = (DB.kassiers||[]).filter(k=>(k.bedrijven||[]).includes(huidigBedrijf) && (k.modules||[]).includes('sales'));
  if(!bestaand && !kassiers.length){ toast('Geen medewerkers met de module Sales in dit bedrijf.','warning'); return; }
  const opdrachtgevers = (DB.profiel?.opdrachtgevers||[]).map(o=>o.naam).filter(Boolean);
  if(!opdrachtgevers.length){ toast('Voeg eerst een opdrachtgever toe (⚙ Opdrachtgevers).','warning'); return; }

  document.getElementById('sm-titel').textContent = bestaand ? 'Sales bewerken' : 'Sales toevoegen';
  document.getElementById('sm-edit-id').value = editId || '';
  const kasSel = document.getElementById('sm-kassier');
  // Bij bewerken: de oorspronkelijke medewerker altijd selecteerbaar, ook als
  // zijn module inmiddels uit staat.
  const opties = kassiers.map(k=>({naam:k.naam, email:String(k.email||'').toLowerCase()}));
  if(bestaand && !opties.some(o=>o.email && o.email===String(bestaand.wieEmail||'').toLowerCase()))
    opties.unshift({naam:bestaand.wie||'?', email:String(bestaand.wieEmail||'').toLowerCase()});
  kasSel.innerHTML = opties.map((o,i)=>`<option value="${i}">${esc(o.naam)}</option>`).join('');
  kasSel._opties = opties;
  if(bestaand){
    const i = opties.findIndex(o=>o.email===String(bestaand.wieEmail||'').toLowerCase());
    kasSel.value = String(Math.max(0,i));
  }
  const opdrSel = document.getElementById('sm-opdrachtgever');
  const opdrLijst = bestaand && !opdrachtgevers.includes(bestaand.opdrachtgever) ? [bestaand.opdrachtgever, ...opdrachtgevers] : opdrachtgevers;
  opdrSel.innerHTML = opdrLijst.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('');
  if(bestaand) opdrSel.value = bestaand.opdrachtgever;
  document.getElementById('sm-maand').value   = bestaand?.maand || _salesFilterMaand();
  document.getElementById('sm-bedrag').value  = bestaand ? String(bestaand.bedrag).replace('.',',') : '';
  document.getElementById('sm-notitie').value = bestaand?.notitie || '';
  openModal('modal-sales');
}

function slaSalesModalOp(){
  const editId  = document.getElementById('sm-edit-id').value || '';
  const kasSel  = document.getElementById('sm-kassier');
  const kassier = (kasSel._opties||[])[parseInt(kasSel.value||'0')];
  const opdr    = document.getElementById('sm-opdrachtgever').value || '';
  const maand   = document.getElementById('sm-maand').value || '';
  const bedrag  = _parseBedragInvoer(document.getElementById('sm-bedrag').value);
  const notitie = document.getElementById('sm-notitie').value.trim();

  if(!kassier){ toast('Kies een medewerker.','error'); return; }
  if(!opdr){ toast('Kies een opdrachtgever.','error'); return; }
  if(!/^\d{4}-\d{2}$/.test(maand)){ toast('Kies een maand.','error'); return; }
  if(!(bedrag > 0)){ toast('Vul het bedrag excl. BTW in.','error'); return; }
  const dubbel = _salesDubbel(kassier.email, kassier.naam, opdr, maand, editId);
  if(dubbel){
    toast(`${kassier.naam} heeft voor ${opdr} over ${_salesMaandLabel(maand)} al ${fmt(dubbel.bedrag)} staan. Eén bedrag per maand — pas die aan.`,'error',8000);
    return;
  }
  if(!checkOnline()) return;

  const velden = { maand, datum: maand+'-01', wie: kassier.naam, wieEmail: kassier.email, opdrachtgever: opdr, bedrag, notitie };
  if(editId){
    const u = (DB.uren||[]).find(x=>x.id===editId);
    if(!u){ toast('Sales-ingave niet gevonden.','error'); return; }
    Object.assign(u, velden);
    _urenCloudWrite(fb=>fb.updateUrenItem(huidigBedrijf, editId, JSON.stringify(velden)), 'Opslaan mislukt — probeer opnieuw.');
    toast('Sales bijgewerkt.','success');
  } else {
    const ingave = { id: uid(), soort:'sales', ...velden, status:'goedgekeurd', aangemaakt: new Date().toISOString() };
    if(!DB.uren) DB.uren = [];
    DB.uren.push(ingave);
    slaUrenOpCloud(ingave);
    toast(`Sales toegevoegd voor ${kassier.naam}.`,'success');
  }
  localStorage.setItem(storageKey(), JSON.stringify(DB));
  closeModal('modal-sales');
  // Overzicht naar de maand van de ingave, zodat hij direct zichtbaar is
  const f = document.getElementById('sales-filter-maand');
  if(f) f.value = maand;
  renderSalesoverzicht();
}

// Factuur over één maand voor één opdrachtgever, uit de GOEDGEKEURDE bedragen.
// Per medewerker één regel "Sales-/verkoopwerkzaamheden <maand> — <naam>" met
// het bedrag — geen aantal of tarief.
async function maakSalesFactuur(opdrEnc){
  const opdr  = decodeURIComponent(opdrEnc);
  const maand = _salesFilterMaand();
  const alle  = (DB.uren||[]).filter(u=>isSalesIngave(u) && u.maand===maand && u.opdrachtgever===opdr);
  const items = alle.filter(u=>u.status==='goedgekeurd').sort((a,b)=>(a.wie||'').localeCompare(b.wie||''));
  if(!items.length){ toast('Keur eerst een bedrag goed — alleen goedgekeurde sales worden gefactureerd.','warning'); return; }
  const openstaand = alle.filter(u=>u.status==='ingediend');
  if(openstaand.length){
    const ok = await bevestig(
      `${openstaand.length} bedrag(en) voor ${opdr} wacht(en) nog op goedkeuring en gaan NIET mee op de factuur.\n\nToch de factuur maken met alleen de goedgekeurde bedragen?`,
      'Nog niet alles goedgekeurd', 'Toch maken');
    if(!ok) return;
  }

  const p = DB.profiel || {};
  const bedrijf = p.naam || huidigBedrijf;
  const opdrObj = (p.opdrachtgevers||[]).find(o=>o.naam===opdr) || {};
  if(!await _bevestigFactuurVelden(p, opdrObj, opdr)) return;

  const maandLabel = _salesMaandLabel(maand);
  // Art. 35a Wet OB vraagt de aard van de dienst en de periode; "Sales" alleen
  // is te vaag, dus de dienst voluit plus wie hem verricht heeft.
  const regelLijst = items.map(u=>({
    omschrijving: `Sales-/verkoopwerkzaamheden ${maandLabel}${u.wie ? ' — '+u.wie : ''}`,
    bedrag: Math.round((parseFloat(u.bedrag)||0)*100)/100
  }));

  const zonderBtw = !!p.urenZonderBtw;
  const btwPct = 21;
  // Zelfde formules als slaFactuurOp() (CLAUDE.md #30): subtotaal = som van
  // aantal × prijs (aantal is hier 1), BTW per regel afgerond.
  const subtotaalExcl = regelLijst.reduce((a,r)=>a+r.bedrag,0);
  const btwBedrag = zonderBtw ? 0 : regelLijst.reduce((a,r)=>a+Math.round(r.bedrag*btwPct)/100,0);
  const totaalIncl = subtotaalExcl + btwBedrag;

  const bestaande = _zoekBestaandeSalesFactuur(opdr, maand);
  const standaardDatum = bestaande?.datum || new Date().toISOString().slice(0,10);
  const standaardVerval = bestaande?.vervaldatum
    || (()=>{ const d=new Date(standaardDatum); d.setDate(d.getDate()+30); return d.toISOString().slice(0,10); })();
  const keuze = await vraagUrenFactuurGegevens({
    type: 'sales',
    context: bestaande
      ? `Er staat al een salesfactuur voor ${esc(opdr)} over ${esc(maandLabel)}. Laat het nummer staan om die te vervangen, of geef een ander nummer op.`
      : `Salesfactuur voor ${esc(opdr)} over ${esc(maandLabel)} — ${fmt(totaalIncl)} incl. BTW.`,
    nummer: bestaande?.nummer || nextFactuurNummer('sales'),
    datum: standaardDatum,
    vervaldatum: standaardVerval
  });
  if(!keuze) return;

  const factuurNr = keuze.nummer;
  const vervangen = (DB.verkoop||[]).find(f=>f && f.type==='sales' && (f.nummer||'').trim()===factuurNr) || null;
  if(vervangen && (vervangen.status==='betaald' || _getBetalingen(vervangen).length)){
    toast(`Factuur ${factuurNr} is al betaald of gekoppeld aan een banktransactie. Draai die betaling eerst terug bij Verkoopfacturen.`,'error',9000);
    return;
  }

  const dFmt = d => new Date(d).toLocaleDateString('nl-NL',{day:'numeric',month:'long',year:'numeric'});
  const html = bouwFactuurHtml({
    bedrijf, p,
    klantNaam: opdr,
    klantRegels: [
      opdrObj.straat || opdrObj.adres || '',
      (String(opdrObj.postcode||'')+' '+String(opdrObj.stad||'')).trim(),
      opdrObj.btwNummer ? 'BTW: '+opdrObj.btwNummer : ''
    ],
    factuurNr,
    factuurdatumFmt: dFmt(keuze.datum),
    vervaldatumFmt: dFmt(keuze.vervaldatum),
    termijnLabel: berekenTermijnLabel(keuze.datum, keuze.vervaldatum),
    kolommen: ['Omschrijving','Bedrag'],
    rijen: regelLijst.map(r=>[r.omschrijving, '€ '+r.bedrag.toFixed(2)]),
    subtotaalExcl,
    btwRegels: zonderBtw ? [] : [{label:`BTW ${btwPct}%`, bedrag:btwBedrag}],
    totaalIncl,
    zonderBtw
  });

  const gbOmzetRek = _zorgFactuurRekeningen();
  const entry = {
    id: vervangen?.id || uid(),
    nummer: factuurNr,
    datum: keuze.datum,
    vervaldatum: keuze.vervaldatum,
    klant: opdr,
    adres: _opdrachtgeverAdres(opdrObj),
    btwnr: opdrObj.btwNummer || '',
    // Aantal 1 × prijs = bedrag: zo rekenen draaiFactuurGBTerug(), de
    // BTW-aangifte en de grootboekkaart exact hetzelfde terug als hier geboekt.
    regels: regelLijst.map(r=>({
      omschrijving: r.omschrijving,
      aantal: 1,
      prijs: r.bedrag,
      gbId: gbOmzetRek?.id || '',
      btw: zonderBtw ? '0' : String(btwPct)
    })),
    omschrijving: `Sales-/verkoopwerkzaamheden ${maandLabel}`,
    totaalExcl: subtotaalExcl,
    totaalIncl,
    totaal: totaalIncl,
    btwBedrag,
    btwTarief: zonderBtw ? 0 : btwPct,
    status: 'verstuurd',
    type: 'sales',
    periodeVan: maand,
    periodeTot: maand,
    periodeLabel: maandLabel
  };

  if(!_boekGegenereerdeFactuur(entry, vervangen)) return;
  renderSalesoverzicht();
  openFactuurVenster(html);
}

// Herlaad kassaoverzicht periodiek als eigenaar actief is — zodat ingediende kassalijsten verschijnen
function startKassaPolling(){
  if(window._kassaPollInterval) clearInterval(window._kassaPollInterval);
  window._kassaPollInterval = setInterval(()=>{
    // Alleen als eigenaar ingelogd is en kassaoverzicht pagina actief is
    if(_loginRol !== 'eigenaar') return;
    const kassaPagina = document.getElementById('page-kassaoverzicht');
    if(!kassaPagina || kassaPagina.style.display === 'none') return;
    // Herlaad kassalijsten stil op de achtergrond
    fbAanroep(fb=>fb.laadAlles(huidigBedrijf))
      .then(json=>{
        try{
          const data = JSON.parse(json||'{}');
          if(data.kassalijsten && JSON.stringify(data.kassalijsten) !== JSON.stringify(DB.kassalijsten)){
            DB.kassalijsten = data.kassalijsten;
            renderKassaoverzicht();
          }
        }catch(e){}
      }).catch(()=>{});
  }, 15000); // Elke 15 seconden
}

// ── Kassaoverzicht (eigenaar) ──
function renderKassaoverzicht(){
  if(!DB.kassalijsten) DB.kassalijsten=[];
  const filter = document.getElementById('kassa-filter-status')?.value||'';
  let lijst = [...DB.kassalijsten].sort((a,b)=>b.datum.localeCompare(a.datum));
  if(filter) lijst = lijst.filter(k=>k.status===filter);

  // Stats
  const geboekt  = DB.kassalijsten.filter(k=>k.status==='goedgekeurd');
  // Gebruik totaalOmzetIncl voor weergave — dat is wat fysiek in de kassa zat
  const totOmzet = geboekt.reduce((a,k)=>a+parseFloat(k.totaalOmzetIncl||k.totaalOmzet||0),0);
  // Contant in kas = exact het bedrag dat keurKassaGoed op rekening 1000 boekt:
  // totContant als die gevuld is, anders de omzet incl BTW, min de uitgaven.
  const totCont  = geboekt.reduce((a,k)=>{
    const cont = parseFloat(k.totContant||0);
    const incl = parseFloat(k.totaalOmzetIncl||k.totaalOmzet||0);
    return a + (cont>0?cont:incl) - parseFloat(k.totUitgaven||0);
  },0);
  const wacht    = DB.kassalijsten.filter(k=>k.status==='ingediend').length;
  // BTW die met deze kassalijsten is meegeboekt naar de BTW-schuldrekening.
  const totBtw   = geboekt.reduce((a,k)=>{
    const incl = parseFloat(k.totaalOmzetIncl||k.totaalOmzet||0);
    const excl = parseFloat(k.totaalOmzet||0);
    return a + parseFloat(k.omzetBtw||(incl-excl)||0);
  },0);

  const s = id => document.getElementById(id);
  if(s('kov-omzet'))   s('kov-omzet').textContent   = fmt(totOmzet);
  if(s('kov-contant')) s('kov-contant').textContent  = fmt(totCont);
  if(s('kov-wacht'))   s('kov-wacht').textContent    = wacht;
  if(s('kov-btw'))     s('kov-btw').textContent      = fmt(totBtw);

  const el = document.getElementById('kassa-overzicht-lijst');
  if(!el) return;

  if(!lijst.length){
    el.innerHTML='<div class="empty"><span class="icon">💰</span><p>Geen kassalijsten gevonden</p></div>';
    return;
  }

  el.innerHTML = lijst.map(k=>{
    const statusKleur = {ingediend:'#d97706',goedgekeurd:'#16a34a',afgewezen:'#dc2626'}[k.status]||'#64748b';
    const statusLabel = {ingediend:'⏳ Wacht goedkeuring',goedgekeurd:'✓ Goedgekeurd',afgewezen:'✕ Afgewezen'}[k.status]||k.status;

    // Wat de kassier daadwerkelijk heeft ingevoerd — de basis van de hele lijst.
    const begin     = parseFloat(k.beginsaldo||0);
    const eind      = parseFloat(k.eindsaldo||0);
    const omzetIncl = parseFloat(k.totaalOmzetIncl||k.totaalOmzet||0);
    const omzetExcl = parseFloat(k.totaalOmzet||0);
    const btwBedrag = parseFloat(k.omzetBtw||(omzetIncl-omzetExcl)||0);
    const btwTarief = k.btwTarief ?? DB.profiel?.btwStandaard ?? 21;
    // Kastelling: eind − begin hoort exact de omzet incl BTW te zijn. Wijkt dat af,
    // dan is de lijst met de hand aangepast. Oude lijsten uit de categorie-invoer
    // hebben helemaal geen eindsaldo — daar is er niets te vergelijken.
    const heeftTelling = k.eindsaldo !== undefined && k.eindsaldo !== null && k.eindsaldo !== '';
    const telVerschil  = (eind-begin) - omzetIncl;
    const telAfwijking = heeftTelling && Math.abs(telVerschil) > 0.01;

    // Contant/pin/uitgaven zijn in de huidige invoer altijd 0 — alleen tonen
    // als een (oudere) lijst ze echt gevuld heeft.
    const heeftKasDetails = (parseFloat(k.totContant||0)!==0)
      || (parseFloat(k.totPin||0)!==0) || (parseFloat(k.totUitgaven||0)!==0);
    const categorieen = (k.categorieen||[]).filter(c=>(parseFloat(c.contant)||0)+(parseFloat(c.pin)||0)>0);
    const uitgaven = k.uitgaven||[];

    return `<div class="card" style="margin-bottom:10px;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px;">
        <div>
          <div style="font-size:15px;font-weight:600;">${k.datum}</div>
          <div style="font-size:12px;color:var(--text-mid);margin-top:2px;">
            Ingediend door: ${k.ingevoerdDoor} &nbsp;·&nbsp;
            ${new Date(k.ingevoerdOp).toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'})}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:12px;font-weight:600;color:${statusKleur};">${statusLabel}</span>
          ${k.status==='ingediend'?`
            <button class="btn btn-primary btn-sm" onclick="keurKassaGoed('${k.id}')">✓ Goedkeuren</button>
            <button class="btn btn-danger btn-sm" onclick="wijsKassaAf('${k.id}')">✕ Afwijzen</button>`
          : k.status==='goedgekeurd'?`<button class="btn btn-secondary btn-sm" onclick="trekKassaGBTerug('${k.id}')">↩ Terugdraaien</button>`
          : ''}
          <button class="btn btn-secondary btn-sm" style="color:#dc2626;" onclick="verwijderKassalijst('${k.id}')">🗑</button>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:12px;">
        <div><div style="font-size:10px;color:var(--text-dim);font-family:var(--mono);text-transform:uppercase;letter-spacing:.07em;">Beginsaldo kas</div><div style="font-size:14px;font-family:var(--mono);font-weight:600;margin-top:3px;">${heeftTelling?fmt(begin):'—'}</div></div>
        <div><div style="font-size:10px;color:var(--text-dim);font-family:var(--mono);text-transform:uppercase;letter-spacing:.07em;">Eindsaldo kas</div><div style="font-size:14px;font-family:var(--mono);font-weight:600;margin-top:3px;">${heeftTelling?fmt(eind):'—'}</div></div>
        <div><div style="font-size:10px;color:var(--text-dim);font-family:var(--mono);text-transform:uppercase;letter-spacing:.07em;">Omzet incl BTW</div><div style="font-size:14px;font-family:var(--mono);font-weight:600;color:#16a34a;margin-top:3px;">${fmt(omzetIncl)}</div></div>
        <div><div style="font-size:10px;color:var(--text-dim);font-family:var(--mono);text-transform:uppercase;letter-spacing:.07em;">Omzet excl BTW</div><div style="font-size:14px;font-family:var(--mono);font-weight:600;margin-top:3px;">${fmt(omzetExcl)}</div></div>
        <div><div style="font-size:10px;color:var(--text-dim);font-family:var(--mono);text-transform:uppercase;letter-spacing:.07em;">BTW ${btwTarief}%</div><div style="font-size:14px;font-family:var(--mono);font-weight:600;margin-top:3px;">${fmt(btwBedrag)}</div></div>
      </div>

      ${telAfwijking?`<div style="font-size:12px;color:#dc2626;background:rgba(220,38,38,.08);border-radius:6px;padding:6px 10px;margin-bottom:12px;">
        ⚠ Kastelling wijkt af: eindsaldo − beginsaldo = ${fmt(eind-begin)}, maar de geboekte omzet incl BTW is ${fmt(omzetIncl)} (verschil ${fmt(telVerschil)}).
      </div>`:''}

      <details>
        <summary style="cursor:pointer;font-size:12px;color:var(--text-dim);list-style:none;display:flex;align-items:center;gap:6px;user-select:none;">
          <span>▸</span> Details tonen
        </summary>
        <div style="margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div>
            <div style="font-size:11px;color:var(--text-dim);font-family:var(--mono);text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px;">Ingevoerd door kassier</div>
            ${heeftTelling?`
              <div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0;">
                <span>Bedrag in kas bij opening</span><span class="mono">${fmt(begin)}</span>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0;">
                <span>Geteld bedrag bij sluiting</span><span class="mono">${fmt(eind)}</span>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0;border-top:1px solid var(--border);margin-top:3px;">
                <span>Toename kas (eind − begin)</span><span class="mono">${fmt(eind-begin)}</span>
              </div>`
            :`<div style="font-size:12px;color:var(--text-dim);padding:3px 0;">Geen kastelling vastgelegd (oude invoer).</div>`}
            ${heeftKasDetails?`
              <div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0;">
                <span>Contant</span><span class="mono">${fmt(k.totContant||0)}</span>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0;">
                <span>Pin/Kaart</span><span class="mono">${fmt(k.totPin||0)}</span>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0;">
                <span>Uitgaven</span><span class="mono amount-neg">-${fmt(k.totUitgaven||0)}</span>
              </div>`:''}
            ${categorieen.length?`<div style="font-size:11px;color:var(--text-dim);font-family:var(--mono);text-transform:uppercase;letter-spacing:.07em;margin:10px 0 6px;">Omzet per categorie</div>
            ${categorieen.map(c=>`
              <div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0;">
                <span>${esc(c.naam)}${c.aantal>0?` (${c.aantal}x)`:''}</span>
                <span class="mono">${fmt((parseFloat(c.contant)||0)+(parseFloat(c.pin)||0))}</span>
              </div>`).join('')}`:''}
          </div>
          <div>
            <div style="font-size:11px;color:var(--text-dim);font-family:var(--mono);text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px;">Boeking bij goedkeuren</div>
            <div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0;">
              <span>Kas (1000)</span><span class="mono">+${fmt((parseFloat(k.totContant||0)>0?parseFloat(k.totContant):omzetIncl)-parseFloat(k.totUitgaven||0))}</span>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0;">
              <span>Omzet excl BTW</span><span class="mono">+${fmt(omzetExcl)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0;">
              <span>BTW te betalen ${btwTarief}%</span><span class="mono">+${fmt(btwBedrag)}</span>
            </div>
            ${uitgaven.length?`<div style="font-size:11px;color:var(--text-dim);font-family:var(--mono);text-transform:uppercase;letter-spacing:.07em;margin:10px 0 6px;">Uitgaven</div>
            ${uitgaven.map(u=>`
              <div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0;">
                <span>${esc(u.oms||'')}</span>
                <span class="mono amount-neg">-${fmt(u.bedrag)}</span>
              </div>`).join('')}`:''}
            ${k.notities?`<div style="font-size:11px;color:var(--text-dim);margin-top:8px;">📝 ${esc(k.notities)}</div>`:''}
          </div>
        </div>
      </details>
    </div>`;
  }).join('');
}

// ── Kassalijst → grootboek ──
// Boeken en terugdraaien lopen bewust door dezelfde bedragen- en rekeningkeuze,
// zodat goedkeuren + terugdraaien op ELKE geraakte rekening netto op 0 uitkomt
// (CLAUDE.md punt 21.4). Tot juli 2026 trok het terugdraaien het EXCL-bedrag van
// de kas af terwijl er INCL was geboekt, en bleef de BTW-rekening onaangeroerd.
// Dat liet bij elke terugdraai het BTW-bedrag als spookgeld staan op zowel Kas
// als BTW te betalen — even groot aan beide kanten van de balans, dus
// checkBalansEvenwicht() zag het nooit. Splits deze functies nooit weer.
function _kassaBedragen(k){
  // totaalOmzet is excl BTW, totaalOmzetIncl is incl BTW. Oudere lijsten zonder
  // btwTarief-veld: behandel totaalOmzet als incl voor backwards compat.
  const incl     = parseFloat(k.totaalOmzetIncl || k.totaalOmzet || 0);
  const excl     = parseFloat(k.totaalOmzet || 0);
  const btw      = parseFloat(k.omzetBtw || (incl - excl) || 0);
  const contant  = parseFloat(k.totContant || 0);
  const uitgaven = parseFloat(k.totUitgaven || 0);
  // Kas ontvangt het fysieke geld: incl BTW, tenzij de lijst een contant-telling heeft.
  const kasBedrag = contant > 0 ? contant : incl;
  return {
    tarief: (t => isNaN(t) ? 21 : t)(parseInt(k.btwTarief ?? DB.profiel?.btwStandaard ?? '21')),
    incl, excl, btw, contant, uitgaven, kasBedrag,
    kasMutatie: kasBedrag - uitgaven,
    verschil: kasBedrag - excl - btw,
  };
}

// maakBtwAan alleen bij het boeken zelf — bij terugdraaien mag er nooit een
// nieuwe rekening ontstaan, dan zou je op een lege rekening terugboeken.
function _kassaRekeningen(btwBedrag, maakBtwAan){
  if(!DB.grootboek) DB.grootboek = [];
  const kasRek = DB.grootboek.find(g=>g.nummer==='1000')
    || DB.grootboek.find(g=>g.naam.toLowerCase().includes('kas'));
  const omzetRek = DB.grootboek.find(g=>g.type==='omzet'&&g.naam.toLowerCase().includes('kap'))
    || DB.grootboek.find(g=>g.type==='omzet');
  let btwRek = DB.grootboek.find(g=>g.nummer==='2300')
    || DB.grootboek.find(g=>g.nummer==='1810')
    || DB.grootboek.find(g=>g.nummer==='1510') // ook als 1510 hernoemd is: geen dubbele 1510 aanmaken
    || DB.grootboek.find(g=>g.naam.toLowerCase().includes('btw te betalen'));
  if(!btwRek && maakBtwAan && btwBedrag > 0){
    // Aanmaken als standaardrekening 1510 uit DEFAULT_GB (type 'passiva'): een eigen
    // type zoals 'schuld' telt niet mee in de balans en blokkeert de save (CLAUDE.md #24).
    const std = DEFAULT_GB.find(s=>s.nummer==='1510');
    btwRek = { ...std, id:'gb_auto_1510', saldo:0 };
    DB.grootboek.push(btwRek);
  }
  const verschilRek = DB.grootboek.find(g=>g.naam.toLowerCase().includes('kassaverschil'))
    || DB.grootboek.find(g=>g.nummer==='8900');
  // Uitgaven uit de kas (zonder bon/BTW-splitsing) → Overige kosten.
  const kostenRek = DB.grootboek.find(g=>g.nummer==='8300')
    || DB.grootboek.find(g=>g.type==='kosten');
  return { kasRek, omzetRek, btwRek, verschilRek, kostenRek };
}

// mult = 1 boekt de kassalijst, mult = -1 draait exact dezelfde mutaties terug.
function _boekKassalijst(k, mult){
  const b = _kassaBedragen(k);
  const r = _kassaRekeningen(b.btw, mult > 0);
  const muteer = (g, bedrag)=>{ if(g) g.saldo = rond((parseFloat(g.saldo)||0) + mult*bedrag); };
  muteer(r.kasRek,   b.kasMutatie);   // debet kas — fysiek geld, dus incl BTW, min uitgaven
  muteer(r.omzetRek, b.excl);         // credit omzet — alleen excl BTW
  if(b.btw > 0) muteer(r.btwRek, b.btw);
  // Tegenboeking van de uitgaven (debet kosten) — zonder deze regel ging alleen de
  // kas omlaag en blokkeerde de balanscontrole elke lijst met uitgaven.
  if(b.uitgaven > 0) muteer(r.kostenRek, b.uitgaven);
  // Kasverschil: overschot = credit, tekort = debet. Teken via het rekeningtype
  // (#17) — 8900 is een kostenrekening, daar verlaagt een credit het saldo.
  if(Math.abs(b.verschil) > 0.01 && r.verschilRek){
    muteer(r.verschilRek, _memSaldoEffect(r.verschilRek, b.verschil > 0 ? 'credit' : 'debet', Math.abs(b.verschil)));
  }
  return Object.assign({}, b, r);
}

async function keurKassaGoed(id){
  const k = DB.kassalijsten.find(k=>k.id===id);
  if(!k) return;
  const v = _kassaBedragen(k);
  const ok = await bevestig(
    `Kassalijst van ${k.datum} goedkeuren?\n\nDit wordt geboekt:\n• Kas: +${fmt(v.kasMutatie)}\n• Omzet excl BTW: +${fmt(v.excl)}\n• BTW ${v.tarief}% te betalen: +${fmt(v.btw)}`,
    'Kassalijst goedkeuren', 'Goedkeuren'
  );
  if(!ok) return;
  // Kan intussen (ander scherm, dubbele klik) al goedgekeurd zijn — dan niet nog eens boeken.
  if(DB.kassalijsten.find(x=>x.id===id)?.status==='goedgekeurd'){ toast('Deze kassalijst is al goedgekeurd.','info'); return; }

  const g = _boekKassalijst(k, 1);
  const btwTarief = g.tarief;
  const kasOmzetExcl = g.excl;
  const kasOmzetBtw = g.btw;
  const kasBoekbedrag = g.kasBedrag;
  const boekverschil = g.verschil;
  const kasRek = g.kasRek, omzetRek = g.omzetRek, btwRek = g.btwRek;

  // Memoriaalboeking — volledig in evenwicht (debet = credit)
  if(!DB.memoriaal) DB.memoriaal = [];
  DB.memoriaal.push({
    id: uid(),
    datum: k.datum,
    type: 'kassalijst',
    kassaId: k.id,
    oms: `Kassalijst ${k.datum} — goedgekeurd`,
    relatie: '',
    debet: kasBoekbedrag,
    aangemaakt: new Date().toISOString(),
    regels: [
      {dc:'debet',  gbId:kasRek?.id||'',    oms:'Kas ontvangst kassa',  bedrag:kasBoekbedrag},
      {dc:'credit', gbId:omzetRek?.id||'',  oms:'Omzet kassa excl BTW', bedrag:kasOmzetExcl},
      ...(kasOmzetBtw > 0 ? [{
        dc:'credit', gbId:btwRek?.id||'', oms:`BTW ${btwTarief}% kassa`, bedrag:kasOmzetBtw
      }] : []),
      // Uitgaven betaald uit de kas: Debet kosten / Credit kas
      ...(g.uitgaven > 0 ? [
        {dc:'debet',  gbId:g.kostenRek?.id||'', oms:'Uitgaven uit kas', bedrag:g.uitgaven},
        {dc:'credit', gbId:kasRek?.id||'',      oms:'Uitgaven uit kas', bedrag:g.uitgaven},
      ] : []),
      ...(Math.abs(boekverschil) > 0.01 ? [{
        dc: boekverschil > 0 ? 'credit' : 'debet',
        // Dezelfde rekening als waar _boekKassalijst het verschil op zette —
        // niet opnieuw zoeken, anders wijst de memoriaalregel naar een andere rekening.
        gbId: g.verschilRek?.id||'',
        oms: 'Kassaverschil',
        bedrag: Math.abs(boekverschil)
      }] : []),
    ],
  });

  k.status = 'goedgekeurd';
  k.goedgekeurdOp = new Date().toISOString();
  // Bij een balansfout draait save() alles terug (melding + hertekenen) — dan geen succesmelding.
  if(!save()) return;
  renderKassaoverzicht();
  toast(`Kassalijst ${k.datum} goedgekeurd — ${fmt(k.totaalOmzet)} geboekt.`, 'success');
}

async function wijsKassaAf(id){
  const k = DB.kassalijsten.find(k=>k.id===id);
  if(!k) return;
  const ok = await bevestig(`Kassalijst van ${k.datum} afwijzen?`, 'Afwijzen', 'Afwijzen');
  if(!ok) return;
  k.status = 'afgewezen';
  k.afgewezenOp = new Date().toISOString();
  if(!save()) return;
  renderKassaoverzicht();
  toast(`Kassalijst ${k.datum} afgewezen.`, 'info');
}

async function verwijderKassalijst(id){
  if(!DB.kassalijsten) DB.kassalijsten = [];
  const k = DB.kassalijsten.find(k=>k.id===id);
  if(!k) return;
  const wasGoedgekeurd = k.status === 'goedgekeurd';
  const bevestigTekst = wasGoedgekeurd
    ? `Kassalijst van ${k.datum} verwijderen?\n\nLet op: de grootboekboeking wordt ook teruggedraaid.`
    : `Kassalijst van ${k.datum} definitief verwijderen?`;
  const ok = await bevestig(bevestigTekst, 'Verwijderen', 'Verwijderen');
  if(!ok) return;
  // Als goedgekeurd: draai grootboek eerst terug — exacte spiegel van het boeken.
  if(wasGoedgekeurd){
    _boekKassalijst(k, -1);
    // Verwijder ook de memoriaalboeking. Op kassaId, zodat een tweede kassalijst
    // op dezelfde datum blijft staan; de tekst-match is de fallback voor oude
    // boekingen van vóór het kassaId-veld.
    if(DB.memoriaal){
      const idx = DB.memoriaal.findIndex(m=>m.kassaId===k.id);
      if(idx !== -1) DB.memoriaal.splice(idx, 1);
      else DB.memoriaal = DB.memoriaal.filter(m=>!(!m.kassaId&&m.oms&&m.oms.includes(k.datum)&&m.oms.includes('Kassalijst')));
    }
  }
  DB.kassalijsten = DB.kassalijsten.filter(x=>x.id!==id);
  if(!save()) return; // balans blokkeerde: alles is al teruggezet en hertekend
  renderKassaoverzicht();
  toast(`Kassalijst ${k.datum} verwijderd${wasGoedgekeurd?' — boeking teruggedraaid':''}.`, 'info');
}

async function trekKassaGBTerug(id){
  if(!DB.kassalijsten) DB.kassalijsten = [];
  if(!DB.grootboek) DB.grootboek = [];
  const k = DB.kassalijsten.find(k=>k.id===id);
  if(!k) return;
  if(k.status!=='goedgekeurd'){ toast('Deze kassalijst is niet (meer) geboekt.','info'); return; }
  const v = _kassaBedragen(k);
  const ok = await bevestig(
    `Boeking van kassalijst ${k.datum} terugdraaien?\n\nDit wordt teruggeboekt:\n• Kas: -${fmt(v.kasMutatie)}\n• Omzet excl BTW: -${fmt(v.excl)}\n• BTW ${v.tarief}% te betalen: -${fmt(v.btw)}`,
    'Terugdraaien', 'Terugdraaien'
  );
  if(!ok) return;

  // Exacte spiegel van keurKassaGoed — inclusief de BTW-rekening.
  _boekKassalijst(k, -1);

  // Verwijder ook de memoriaalboeking die bij goedkeuren werd aangemaakt,
  // zodat grootboek en memoriaal in sync blijven na het terugdraaien.
  // Zelfde match als verwijderKassalijst, incl. de fallback voor oude boekingen
  // zonder kassaId — anders telt de P&L de teruggedraaide omzet nog mee.
  if(DB.memoriaal){
    const idx = DB.memoriaal.findIndex(m=>m.kassaId===k.id);
    if(idx !== -1) DB.memoriaal.splice(idx, 1);
    else DB.memoriaal = DB.memoriaal.filter(m=>!(!m.kassaId&&m.oms&&m.oms.includes(k.datum)&&m.oms.includes('Kassalijst')));
  }
  k.status = 'ingediend';
  if(!save()) return;
  renderKassaoverzicht();
  toast(`Boeking teruggedraaid — kassalijst staat weer open.`, 'info');
}


const _lijst=getBedrijven();
if(!_lijst.includes(huidigBedrijf)){ _lijst.push(huidigBedrijf); saveBedrijven(_lijst); }
// Toon bedrijfsnaam in login scherm direct
// login-bedrijf element bestaat niet meer
// Laad data op de achtergrond
load();
renderDashboard();
renderGB();
renderImports();

// Herstel bestaande sessie bij opstarten via onAuthStateChanged.
(function _herstelSessie(){
  function afhandelen(){
    try{
      firebase.auth().onAuthStateChanged(function(user){
        if(user && user.email && typeof toonBedrijfsKiezer === 'function'){
          var overlay = document.getElementById('login-overlay');
          if(overlay && overlay.style.display !== 'none'){
            toonBedrijfsKiezer(user.email.toLowerCase());
          }
        }
      });
    }catch(e){ console.warn('onAuthStateChanged niet beschikbaar:', e); }
  }
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', afhandelen);
  } else {
    afhandelen();
  }
})();

// Herlaad kassier-modules wanneer de PWA naar de voorgrond komt.
// iOS/Android houdt een PWA in het geheugen als je wisselt van app. De Firestore-
// listener herstart dan, maar vuurt niet opnieuw als er ondertussen niets veranderd is.
// Resultaat: kassier ziet verouderde modules totdat hij opnieuw inlogt.
// Oplossing: bij elke foreground-switch verse kassiers ophalen en modules hertoepassen.
document.addEventListener('visibilitychange', async function(){
  if(document.visibilityState !== 'visible') return;
  if(typeof _loginRol === 'undefined' || _loginRol !== 'kassier') return;
  if(!_actieveKassier || !huidigBedrijf) return;
  try{
    const json = await fbAanroep(fb=>fb.laadAlles(huidigBedrijf));
    const d = JSON.parse(json||'{}');
    if(Array.isArray(d.kassiers)){
      // Cloud vervangt de lijst volledig — zelfde beleid als verwerkCloudData.
      // Mergen zou een elders verwijderde gebruiker hier in leven houden.
      DB.kassiers = typeof _dedupKassiers === 'function' ? _dedupKassiers(d.kassiers) : d.kassiers;
      try{ localStorage.setItem('ledger_kassiers_cache', JSON.stringify(DB.kassiers)); }catch(e){}
    }
  }catch(e){ console.warn('[visibilitychange] kassiers laden mislukt:', e); }
  verrijkActieveKassier();
  if(typeof mobBouwNav === 'function') mobBouwNav();
});

// Bijlage input event listeners — wacht op DOM
document.addEventListener('DOMContentLoaded', function(){
  const bi = document.getElementById('f-bijlage-input');
  if(bi) bi.addEventListener('change', function(){ voegBijlagesToe(this); });
  const bmi = document.getElementById('bijlagen-modal-input');
  if(bmi) bmi.addEventListener('change', function(){ voegBijlagenToeViaModal(this); });
});

