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
    id: 'kassa_' + Date.now(),
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
    .filter(u=> (u.datum||'').slice(0,7)===filterMaand)
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
        ${dd} · ${u.uren} ${eenheidInfo(u.eenheid).kort}${u.tariefLabel?(' · '+esc(u.tariefLabel)):''}${u.wie?(' · '+esc(u.wie)):''} · ${status}
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

function _urenVanMaand(){
  const m = _urenMaandFilter(); // 'YYYY-MM'
  return (DB.uren||[]).filter(u=> (u.datum||'').slice(0,7) === m);
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
    el.innerHTML = '<div style="color:var(--text-dim);padding:24px 0;text-align:center;">Geen uren in deze maand.</div>';
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
          <span style="font-size:12px;color:var(--text-mid);margin-left:10px;">${(Math.round(uSom*100)/100)} ${grpInfo.kort} · € ${bSom.toFixed(2)}</span>
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

  if(editId){
    // Bewerken
    const entry = (DB.uren||[]).find(u=>u.id===editId);
    if(!entry){ toast('Uren-entry niet gevonden.','error'); return; }
    Object.assign(entry, { datum, wie, opdrachtgever: tarief.opdrachtgever, eenheid, tariefLabel, tariefBedrag, uren, bedrag, notitie });
    localStorage.setItem(storageKey(), JSON.stringify(DB));
    if(checkOnline()){
      toonSyncStatus('opslaan');
      fbAanroep(fb=>fb.updateUrenItem(huidigBedrijf, editId, JSON.stringify({ datum, wie, opdrachtgever: tarief.opdrachtgever, eenheid, tariefLabel, tariefBedrag, uren, bedrag, notitie })))
        .then(()=>toonSyncStatus('opgeslagen'))
        .catch(()=>{ toonSyncStatus('fout'); toast('Opslaan mislukt — probeer opnieuw.','error'); });
    }
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
  if(!confirm(`Uren van ${u.wie} op ${u.datum} verwijderen?`)) return;
  DB.uren = (DB.uren||[]).filter(x=>x.id!==id);
  localStorage.setItem(storageKey(), JSON.stringify(DB));
  if(checkOnline()){
    toonSyncStatus('opslaan');
    fbAanroep(fb=>fb.verwijderUrenItem(huidigBedrijf, id))
      .then(()=>toonSyncStatus('opgeslagen'))
      .catch(()=>{ toonSyncStatus('fout'); toast('Verwijderen mislukt — probeer opnieuw.','error'); });
  }
  renderUrenoverzicht();
  toast('Uren verwijderd.','success');
}

function urenKeur(id, status){
  const u = (DB.uren||[]).find(x=>x.id===id);
  if(!u) return;
  u.status = status;
  // Lokaal cachen en alleen deze ene status in de cloud bijwerken
  localStorage.setItem(storageKey(), JSON.stringify(DB));
  if(checkOnline()){
    toonSyncStatus('opslaan');
    fbAanroep(fb=>fb.updateUrenStatus(huidigBedrijf, id, status))
      .then(()=>toonSyncStatus('opgeslagen'))
      .catch(()=>{ toonSyncStatus('fout'); toast('Bijwerken mislukt — probeer opnieuw.','error'); });
  }
  renderUrenoverzicht();
}

async function maakUrenFactuur(opdrEnc){
  const opdr = decodeURIComponent(opdrEnc);
  const maand = _urenMaandFilter();
  const items = _urenVanMaand()
    .filter(u=>u.opdrachtgever===opdr && u.status!=='afgewezen')
    .sort((a,b)=>(a.datum||'').localeCompare(b.datum||''));
  if(!items.length){ toast('Geen factureerbare uren voor deze opdrachtgever.','warning'); return; }

  const p = DB.profiel || {};
  const bedrijf = p.naam || huidigBedrijf;

  // Opdrachtgever-object opzoeken uit centraal register
  const opdrObj = (DB.profiel?.opdrachtgevers||[]).find(o=>o.naam===opdr) || {};

  // Valideer verplichte factuurvelden
  const ontbrekend = [];
  if(!p.straat)      ontbrekend.push('Bedrijfsadres (Instellingen → Bedrijfsprofiel)');
  if(!p.btw && !p.urenZonderBtw) ontbrekend.push('BTW-nummer (Instellingen → Bedrijfsprofiel)');
  if(!p.kvk)         ontbrekend.push('KvK-nummer (Instellingen → Bedrijfsprofiel)');
  if(!p.iban)        ontbrekend.push('IBAN (Instellingen → Bedrijfsprofiel)');
  if(!opdrObj.straat && !opdrObj.adres) ontbrekend.push(`Adres van opdrachtgever "${opdr}" (Instellingen → Opdrachtgevers)`);
  if(ontbrekend.length){
    const ok = await bevestig(
      `Waarschuwing: de factuur is mogelijk ongeldig.\n\nOntbrekende verplichte velden:\n• ${ontbrekend.join('\n• ')}\n\nToch doorgaan?`,
      'Toch aanmaken', 'Annuleer'
    );
    if(!ok) return;
  }

  // Factuurnummer - eigen teller in profiel, losgekoppeld van verkooplijst
  const factuurNr = nextFactuurNummer('uren');
  const datumISO = new Date().toISOString().slice(0,10);
  const vandaagFmt = new Date().toLocaleDateString('nl-NL',{day:'numeric',month:'long',year:'numeric'});
  const betaaldatumISO = (()=>{ const d=new Date(); d.setDate(d.getDate()+30); return d.toISOString().slice(0,10); })();
  const betaaldatumFmt = new Date(betaaldatumISO).toLocaleDateString('nl-NL',{day:'numeric',month:'long',year:'numeric'});

  const maandLabel = (()=>{ const [j,m]=maand.split('-'); return new Date(j,parseInt(m)-1,1).toLocaleDateString('nl-NL',{month:'long',year:'numeric'}); })();

  // Eenheid van deze opdrachtgever (uur/dag) — bepaalt de factuurregels.
  // Uit de ingaves zelf, met het opdrachtgever-register als fallback.
  const opdrEenheid = items.find(u=>u.eenheid)?.eenheid || eenheidVanOpdrachtgever(opdr);
  const eInfo = eenheidInfo(opdrEenheid);

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
  const regelLijst = Object.values(groepen);

  const zonderBtw = !!p.urenZonderBtw;
  const btwPct = 21;
  const subtotaalExcl = regelLijst.reduce((a,r)=>a+r.bedrag,0);
  const btwBedrag = zonderBtw ? 0 : Math.round(subtotaalExcl * btwPct) / 100;
  const totaalIncl = subtotaalExcl + btwBedrag;

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
    termijnLabel: '30 dagen',
    kolommen: ['Omschrijving','Periode','Aantal',eInfo.tariefLabel,'Bedrag'],
    rijen: regelLijst.map(r=>[
      `${eInfo.gewerkt} — ${r.label}`,
      maandLabel,
      String(Math.round(r.uren*100)/100).replace('.',','),
      '€ '+r.tarief.toFixed(2)+eInfo.per,
      '€ '+r.bedrag.toFixed(2)
    ]),
    subtotaalExcl,
    btwRegels: zonderBtw ? [] : [{label:`BTW ${btwPct}%`, bedrag:btwBedrag}],
    totaalIncl,
    zonderBtw
  });

  // Sla op als verkoop-entry zodat factuurnummer-teller klopt en factuur in dashboard verschijnt
  if(!DB.verkoop) DB.verkoop=[];
  DB.verkoop.push({
    id: uid(),
    nummer: factuurNr,
    datum: datumISO,
    vervaldatum: betaaldatumISO,
    klant: opdr,
    totaalExcl: subtotaalExcl,
    totaalIncl: totaalIncl,
    totaal: totaalIncl,
    btwBedrag: btwBedrag,
    status: 'verstuurd',
    type: 'uren'
  });

  // Grootboekboekingen (factuurstelsel): Debiteuren D / Omzet C / BTW te betalen C
  if(!DB.grootboek) DB.grootboek = [];
  // Zorg dat benodigde rekeningen bestaan — voeg toe uit DEFAULT_GB als ze ontbreken
  [
    {nummer:'1300', naam:'Debiteuren',              type:'activa'},
    {nummer:'4000', naam:'Omzet diensten',           type:'omzet'},
    {nummer:'1510', naam:'BTW te betalen (verkoop)', type:'passiva'},
  ].forEach(def => {
    const bestaat = DB.grootboek.find(g=>g.nummer===def.nummer);
    if(!bestaat) DB.grootboek.push({id:'gb_auto_'+def.nummer, ...def, saldo:0});
  });

  const gbDebiteuren = DB.grootboek.find(g=>g.nummer==='1300')
                    || DB.grootboek.find(g=>(g.naam||'').toLowerCase().includes('debiteuren'));
  if(gbDebiteuren) gbDebiteuren.saldo = (parseFloat(gbDebiteuren.saldo)||0) + totaalIncl;

  const gbOmzet = DB.grootboek.find(g=>g.type==='omzet')
               || DB.grootboek.find(g=>(g.naam||'').toLowerCase().includes('omzet'));
  if(gbOmzet) gbOmzet.saldo = (parseFloat(gbOmzet.saldo)||0) + subtotaalExcl;

  if(!zonderBtw && btwBedrag > 0.01){
    const gbBtw = DB.grootboek.find(g=>g.nummer==='1510')
               || DB.grootboek.find(g=>g.nummer==='1530')
               || DB.grootboek.find(g=>(g.naam||'').toLowerCase().includes('btw te betalen'));
    if(gbBtw) gbBtw.saldo = (parseFloat(gbBtw.saldo)||0) + btwBedrag;
  }

  save();

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
    tarief: parseInt(k.btwTarief ?? DB.profiel?.btwStandaard ?? '21'),
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
    || DB.grootboek.find(g=>g.naam.toLowerCase().includes('btw te betalen'));
  if(!btwRek && maakBtwAan && btwBedrag > 0){
    btwRek = { id:uid(), nummer:'2300', naam:'BTW te betalen', type:'schuld', saldo:0 };
    DB.grootboek.push(btwRek);
  }
  const verschilRek = DB.grootboek.find(g=>g.naam.toLowerCase().includes('kassaverschil'))
    || DB.grootboek.find(g=>g.nummer==='8900');
  return { kasRek, omzetRek, btwRek, verschilRek };
}

// mult = 1 boekt de kassalijst, mult = -1 draait exact dezelfde mutaties terug.
function _boekKassalijst(k, mult){
  const b = _kassaBedragen(k);
  const r = _kassaRekeningen(b.btw, mult > 0);
  const muteer = (g, bedrag)=>{ if(g) g.saldo = (parseFloat(g.saldo)||0) + mult*bedrag; };
  muteer(r.kasRek,   b.kasMutatie);   // debet kas — fysiek geld, dus incl BTW
  muteer(r.omzetRek, b.excl);         // credit omzet — alleen excl BTW
  if(b.btw > 0) muteer(r.btwRek, b.btw);
  if(Math.abs(b.verschil) > 0.01) muteer(r.verschilRek, b.verschil);
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
  save();
  renderKassaoverzicht();
  toast(`Kassalijst ${k.datum} goedgekeurd — €${fmt(k.totaalOmzet)} geboekt.`, 'success');
}

async function wijsKassaAf(id){
  const k = DB.kassalijsten.find(k=>k.id===id);
  if(!k) return;
  const ok = await bevestig(`Kassalijst van ${k.datum} afwijzen?`, 'Afwijzen', 'Afwijzen');
  if(!ok) return;
  k.status = 'afgewezen';
  k.afgewezenOp = new Date().toISOString();
  save();
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
  save();
  renderKassaoverzicht();
  toast(`Kassalijst ${k.datum} verwijderd${wasGoedgekeurd?' — boeking teruggedraaid':''}.`, 'info');
}

async function trekKassaGBTerug(id){
  if(!DB.kassalijsten) DB.kassalijsten = [];
  if(!DB.grootboek) DB.grootboek = [];
  const k = DB.kassalijsten.find(k=>k.id===id);
  if(!k) return;
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
  if(DB.memoriaal){
    const idx = DB.memoriaal.findIndex(m=>m.kassaId===k.id);
    if(idx !== -1) DB.memoriaal.splice(idx, 1);
  }
  k.status = 'ingediend';
  save();
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

