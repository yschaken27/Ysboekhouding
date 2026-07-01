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
  if(sel){
    sel.innerHTML = tarieven.map((t,i)=>
      `<option value="${i}">${esc(t.naam||'Tarief')} — €${(t.bedrag||0).toFixed(2)}/u</option>`
    ).join('');
  }
  if(wrap) wrap.style.display = tarieven.length > 1 ? 'block' : 'none';
  mobUrenHerbereken();
}

function _mobUrenGekozenTarief(){
  const oi = parseInt(document.getElementById('mob-uren-opdrachtgever')?.value);
  const opdr = _mobUrenOpdrachtgevers()[oi];
  const tarieven = opdr?.tarieven || [];
  if(!tarieven.length) return null;
  const ti = tarieven.length > 1 ? parseInt(document.getElementById('mob-uren-tarief')?.value||'0') : 0;
  const t = tarieven[ti] || tarieven[0];
  return { opdrachtgever: opdr.naam, tarief: { label: t.naam || 'Uren', bedrag: t.bedrag || 0 } };
}

function mobUrenHerbereken(){
  const aantal = parseFloat(document.getElementById('mob-uren-aantal')?.value) || 0;
  const g = _mobUrenGekozenTarief();
  const el = document.getElementById('mob-uren-bedrag-val');
  if(!el) return;
  if(!g || !aantal){ el.textContent = '—'; return; }
  const bedrag = aantal * (g.tarief.bedrag || 0);
  el.textContent = '€ ' + bedrag.toFixed(2);
}

function mobSlaUrenOp(){
  const datum = document.getElementById('mob-uren-datum')?.value;
  const aantal = parseFloat(document.getElementById('mob-uren-aantal')?.value) || 0;
  const notitie = document.getElementById('mob-uren-notitie')?.value.trim() || '';
  const g = _mobUrenGekozenTarief();

  if(!datum){ toast('Kies een datum.','error'); return; }
  if(!g){ toast('Kies een opdrachtgever.','error'); return; }
  if(aantal <= 0){ toast('Vul het aantal uren in.','error'); return; }

  const bedrag = aantal * (g.tarief.bedrag || 0);
  const ingave = {
    id: uid(),
    datum,
    wie: _actieveKassier?.naam || '',
    opdrachtgever: g.opdrachtgever,
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

function renderMobUrenLijst(){
  const el = document.getElementById('mob-uren-lijst');
  if(!el) return;
  const naam = _actieveKassier?.naam || '';
  const nu = new Date();
  const maand = nu.getMonth(), jaar = nu.getFullYear();
  const mijn = (DB.uren||[])
    .filter(u=> u.wie===naam && (()=>{ const d=new Date(u.datum); return d.getMonth()===maand && d.getFullYear()===jaar; })())
    .sort((a,b)=> (b.datum||'').localeCompare(a.datum||''));

  if(!mijn.length){
    el.innerHTML = '<div style="font-size:13px;color:var(--text-dim);padding:8px 0;">Nog geen uren deze maand.</div>';
    return;
  }
  el.innerHTML = mijn.map(u=>{
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
        ${dd} · ${u.uren} u${u.tariefLabel?(' · '+esc(u.tariefLabel)):''} · ${status}
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
          <span style="font-size:12px;color:var(--text-mid);margin-left:10px;">${(Math.round(uSom*100)/100)} u · € ${bSom.toFixed(2)}</span>
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
          <th style="padding:4px 8px;text-align:right;font-size:11px;color:var(--text-dim);font-weight:600;">Uren</th>
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
    (o.tarieven||[{label:'Standaard',bedrag:o.tarief||0}]).forEach(t=>{
      opties.push({ opdrachtgever: o.naam, tariefLabel: t.label||'Standaard', tariefBedrag: parseFloat(t.bedrag||0) });
    });
  });
  if(!opties.length){ toast('Geen opdrachtgevers ingesteld. Voeg ze toe via ⚙ Opdrachtgevers.','warning'); return; }
  tarSelect.innerHTML = opties.map((o,i)=>
    `<option value="${i}">${esc(o.opdrachtgever)} — ${esc(o.tariefLabel)} (€ ${(o.tariefBedrag).toFixed(2).replace('.',',')})</option>`
  ).join('');
  tarSelect._opties = opties;

  // Pre-vullen bij bewerken
  const datumEl = document.getElementById('eu-datum');
  if(isEdit && bestaand){
    if(datumEl) datumEl.value = bestaand.datum || '';
    document.getElementById('eu-uren').value = bestaand.uren || '';
    document.getElementById('eu-notitie').value = bestaand.notitie || '';
    // Tarief-optie zoeken op opdrachtgever + label
    const matchIdx = opties.findIndex(o=>o.opdrachtgever===bestaand.opdrachtgever && o.tariefLabel===bestaand.tariefLabel);
    if(matchIdx >= 0) tarSelect.value = matchIdx;
  } else {
    if(datumEl && !datumEl.value) datumEl.value = new Date().toISOString().slice(0,10);
    document.getElementById('eu-uren').value = '';
    document.getElementById('eu-notitie').value = '';
  }
  eigenaarUrenHerbereken();
  openModal('modal-eigenaar-uren');
}

function eigenaarUrenHerbereken(){
  const tarSelect = document.getElementById('eu-tarief');
  const opties = tarSelect?._opties || [];
  const idx = parseInt(tarSelect?.value||'0');
  const tarief = opties[idx] || {};
  const uren = parseFloat(document.getElementById('eu-uren')?.value) || 0;
  const bedrag = Math.round(uren * (tarief.tariefBedrag||0) * 100) / 100;
  const el = document.getElementById('eu-bedrag-preview');
  if(el) el.textContent = '€ ' + bedrag.toFixed(2).replace('.',',');
}

function eigenaarVoegUrenToe(){
  const editId = document.getElementById('eu-edit-id')?.value || '';
  const datum = document.getElementById('eu-datum')?.value;
  const kasEl = document.getElementById('eu-kassier');
  const isEigenaarView = (typeof _loginRol !== 'undefined' && _loginRol === 'eigenaar');
  const wie = isEigenaarView
    ? (kasEl?.value || '')
    : (_actieveKassier?.naam || '');
  const uren = parseFloat(document.getElementById('eu-uren')?.value) || 0;
  const notitie = document.getElementById('eu-notitie')?.value.trim() || '';
  const tarSelect = document.getElementById('eu-tarief');
  const opties = tarSelect?._opties || [];
  const idx = parseInt(tarSelect?.value||'0');
  const tarief = opties[idx];

  if(!datum){ toast('Kies een datum.','error'); return; }
  if(!wie){ toast('Kies een medewerker.','error'); return; }
  if(uren <= 0){ toast('Vul het aantal uren in.','error'); return; }
  if(!tarief){ toast('Kies een opdrachtgever en tarief.','error'); return; }

  const bedrag = Math.round(uren * tarief.tariefBedrag * 100) / 100;

  if(editId){
    // Bewerken
    const entry = (DB.uren||[]).find(u=>u.id===editId);
    if(!entry){ toast('Uren-entry niet gevonden.','error'); return; }
    Object.assign(entry, { datum, wie, opdrachtgever: tarief.opdrachtgever, tariefLabel: tarief.tariefLabel, tariefBedrag: tarief.tariefBedrag, uren, bedrag, notitie });
    localStorage.setItem(storageKey(), JSON.stringify(DB));
    if(checkOnline()){
      toonSyncStatus('opslaan');
      fbAanroep(fb=>fb.updateUrenItem(huidigBedrijf, editId, JSON.stringify({ datum, wie, opdrachtgever: tarief.opdrachtgever, tariefLabel: tarief.tariefLabel, tariefBedrag: tarief.tariefBedrag, uren, bedrag, notitie })))
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
    tariefLabel: tarief.tariefLabel,
    tariefBedrag: tarief.tariefBedrag,
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

  // Factuurnummer — uniek oplopend UF-YYYY-NNN
  const factuurNr = nextFactuurNummer('uren');
  const datumISO = new Date().toISOString().slice(0,10);
  const vandaagFmt = new Date().toLocaleDateString('nl-NL',{day:'numeric',month:'long',year:'numeric'});
  const betaaldatumISO = (()=>{ const d=new Date(); d.setDate(d.getDate()+30); return d.toISOString().slice(0,10); })();
  const betaaldatumFmt = new Date(betaaldatumISO).toLocaleDateString('nl-NL',{day:'numeric',month:'long',year:'numeric'});

  const maandLabel = (()=>{ const [j,m]=maand.split('-'); return new Date(j,parseInt(m)-1,1).toLocaleDateString('nl-NL',{month:'long',year:'numeric'}); })();

  // Groepeer per tarieftype
  const groepen = {};
  items.forEach(u=>{
    const lbl = u.tariefLabel || 'Uren';
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

  const rijen = regelLijst.map(r=>`<tr>
    <td style="padding:7px 6px;border-bottom:1px solid #e5e7eb;">Gewerkte uren (${esc(r.label)}) — ${maandLabel}</td>
    <td style="padding:7px 6px;border-bottom:1px solid #e5e7eb;text-align:right;">${(Math.round(r.uren*100)/100).toString().replace('.',',')}</td>
    <td style="padding:7px 6px;border-bottom:1px solid #e5e7eb;text-align:right;">€ ${r.tarief.toFixed(2)}</td>
    <td style="padding:7px 6px;border-bottom:1px solid #e5e7eb;text-align:right;">€ ${r.bedrag.toFixed(2)}</td>
  </tr>`).join('');

  const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>Factuur ${factuurNr}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:Arial,Helvetica,sans-serif;color:#111;max-width:760px;margin:40px auto;padding:0 32px;font-size:13px;line-height:1.6;}
  h1{font-size:26px;font-weight:700;letter-spacing:-.5px;}
  .head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:36px;gap:24px;}
  .leverancier{flex:1;}
  .factuurmeta{text-align:right;min-width:200px;}
  .factuurmeta table{margin-left:auto;border-collapse:collapse;}
  .factuurmeta td{padding:2px 0 2px 16px;font-size:12px;}
  .factuurmeta td:first-child{color:#666;text-align:left;}
  .klantblok{background:#f8f8f8;border-left:3px solid #1e3a8a;padding:12px 16px;margin-bottom:28px;font-size:13px;}
  .klantblok .label{font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;}
  table.regels{width:100%;border-collapse:collapse;margin-bottom:0;}
  table.regels th{text-align:left;border-bottom:2px solid #1e3a8a;padding:7px 6px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#444;}
  table.regels th:not(:first-child){text-align:right;}
  .totaalblok table{margin-left:auto;border-collapse:collapse;min-width:260px;}
  .totaalblok td{padding:4px 6px;font-size:13px;}
  .totaalblok td:last-child{text-align:right;font-family:monospace;}
  .totaalblok tr.totaal td{font-weight:700;font-size:15px;border-top:2px solid #1e3a8a;padding-top:8px;}
  .muted{color:#666;font-size:12px;}
  .betaalinfo{margin-top:32px;padding:16px;border:1px solid #e5e7eb;border-radius:6px;font-size:12px;color:#444;line-height:1.8;}
  .betaalinfo strong{color:#111;}
  .print-btn{display:block;margin-top:32px;padding:10px 24px;font-size:14px;border:none;border-radius:6px;background:#1e3a8a;color:#fff;cursor:pointer;}
  @media print{.print-btn{display:none;} body{margin:0;}}
</style></head><body>

<div class="head">
  <div class="leverancier">
    <h1>${esc(bedrijf)}</h1>
    <div class="muted" style="margin-top:6px;line-height:1.8;">
      ${p.straat?esc(p.straat)+'<br>':''}
      ${(p.postcode||p.stad)?((esc(p.postcode||'')+' '+esc(p.stad||'')).trim())+'<br>':''}
      ${p.kvk?'KvK-nummer: '+esc(p.kvk)+'<br>':''}
      ${p.btw?'BTW-nummer: '+esc(p.btw)+'<br>':''}
      ${p.iban?'IBAN: '+esc(p.iban):''}
    </div>
  </div>
  <div class="factuurmeta">
    <div style="font-size:20px;font-weight:700;color:#1e3a8a;margin-bottom:10px;">FACTUUR</div>
    <table>
      <tr><td>Factuurnummer</td><td><strong>${factuurNr}</strong></td></tr>
      <tr><td>Factuurdatum</td><td>${vandaagFmt}</td></tr>
      <tr><td>Betalingstermijn</td><td>30 dagen</td></tr>
      <tr><td>Uiterste betaaldatum</td><td><strong>${betaaldatumFmt}</strong></td></tr>
    </table>
  </div>
</div>

<div class="klantblok">
  <div class="label">Factuur aan</div>
  <strong>${esc(opdr)}</strong><br>
  ${opdrObj.straat?esc(opdrObj.straat)+'<br>':''}${opdrObj.adres&&!opdrObj.straat?esc(opdrObj.adres)+'<br>':''}
  ${(opdrObj.postcode||opdrObj.stad)?((esc(opdrObj.postcode||'')+' '+esc(opdrObj.stad||'')).trim())+'<br>':''}
  ${opdrObj.btwNummer?'<span class="muted">BTW-nummer: '+esc(opdrObj.btwNummer)+'</span>':''}
</div>

<table class="regels">
  <thead><tr>
    <th>Omschrijving</th>
    <th style="text-align:right;">Aantal uren</th>
    <th style="text-align:right;">Uurtarief</th>
    <th style="text-align:right;">Bedrag</th>
  </tr></thead>
  <tbody>${rijen}</tbody>
</table>

<div class="totaalblok" style="margin-top:12px;">
  <table>
    ${zonderBtw ? `
    <tr><td colspan="2" style="font-size:11px;color:#666;padding-bottom:6px;">BTW niet van toepassing</td></tr>
    <tr class="totaal"><td>Totaal</td><td>€ ${totaalIncl.toFixed(2)}</td></tr>
    ` : `
    <tr><td>Subtotaal excl. BTW</td><td>€ ${subtotaalExcl.toFixed(2)}</td></tr>
    <tr><td>BTW ${btwPct}%</td><td>€ ${btwBedrag.toFixed(2)}</td></tr>
    <tr class="totaal"><td>Totaal incl. BTW</td><td>€ ${totaalIncl.toFixed(2)}</td></tr>
    `}
  </table>
</div>

${p.iban?`<div class="betaalinfo">
  Gelieve <strong>€ ${totaalIncl.toFixed(2)}</strong> over te maken vóór <strong>${betaaldatumFmt}</strong> op<br>
  IBAN <strong>${esc(p.iban)}</strong> t.n.v. <strong>${esc(bedrijf)}</strong><br>
  onder vermelding van factuurnummer <strong>${factuurNr}</strong>.
</div>`:''}

<button class="print-btn" onclick="window.print()">Afdrukken / opslaan als PDF</button>
</body></html>`;

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
    status: 'verstuurd',
    type: 'uren'
  });
  save();

  const w = window.open('','_blank');
  if(!w){ toast('Sta pop-ups toe om de factuur te openen.','warning'); return; }
  w.document.write(html);
  w.document.close();
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
  const totCont  = geboekt.reduce((a,k)=>a+parseFloat(k.totContant||0),0);
  const wacht    = DB.kassalijsten.filter(k=>k.status==='ingediend').length;
  const totVersc = DB.kassalijsten.reduce((a,k)=>a+Math.abs(parseFloat(k.verschil||0)),0);

  const s = id => document.getElementById(id);
  if(s('kov-omzet'))   s('kov-omzet').textContent   = fmt(totOmzet);
  if(s('kov-contant')) s('kov-contant').textContent  = fmt(totCont);
  if(s('kov-wacht'))   s('kov-wacht').textContent    = wacht;
  if(s('kov-verschil'))s('kov-verschil').textContent = fmt(totVersc);

  const el = document.getElementById('kassa-overzicht-lijst');
  if(!el) return;

  if(!lijst.length){
    el.innerHTML='<div class="empty"><span class="icon">💰</span><p>Geen kassalijsten gevonden</p></div>';
    return;
  }

  el.innerHTML = lijst.map(k=>{
    const statusKleur = {ingediend:'#d97706',goedgekeurd:'#16a34a',afgewezen:'#dc2626'}[k.status]||'#64748b';
    const statusLabel = {ingediend:'⏳ Wacht goedkeuring',goedgekeurd:'✓ Goedgekeurd',afgewezen:'✕ Afgewezen'}[k.status]||k.status;
    const verschilKleur = Math.abs(k.verschil||0)<0.01?'#16a34a':k.verschil>0?'#16a34a':'#dc2626';

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
        <div><div style="font-size:10px;color:var(--text-dim);font-family:var(--mono);text-transform:uppercase;letter-spacing:.07em;">Omzet totaal</div><div style="font-size:14px;font-family:var(--mono);font-weight:600;color:#16a34a;margin-top:3px;">${fmt(k.totaalOmzet)}</div></div>
        <div><div style="font-size:10px;color:var(--text-dim);font-family:var(--mono);text-transform:uppercase;letter-spacing:.07em;">Contant</div><div style="font-size:14px;font-family:var(--mono);font-weight:600;margin-top:3px;">${fmt(k.totContant)}</div></div>
        <div><div style="font-size:10px;color:var(--text-dim);font-family:var(--mono);text-transform:uppercase;letter-spacing:.07em;">Pin/Kaart</div><div style="font-size:14px;font-family:var(--mono);font-weight:600;margin-top:3px;">${fmt(k.totPin)}</div></div>
        <div><div style="font-size:10px;color:var(--text-dim);font-family:var(--mono);text-transform:uppercase;letter-spacing:.07em;">Uitgaven</div><div style="font-size:14px;font-family:var(--mono);font-weight:600;color:#dc2626;margin-top:3px;">-${fmt(k.totUitgaven)}</div></div>
        <div><div style="font-size:10px;color:var(--text-dim);font-family:var(--mono);text-transform:uppercase;letter-spacing:.07em;">Kassaverschil</div><div style="font-size:14px;font-family:var(--mono);font-weight:600;color:${verschilKleur};margin-top:3px;">${fmt(k.verschil||0)}</div></div>
      </div>

      <details>
        <summary style="cursor:pointer;font-size:12px;color:var(--text-dim);list-style:none;display:flex;align-items:center;gap:6px;user-select:none;">
          <span>▸</span> Details tonen
        </summary>
        <div style="margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div>
            <div style="font-size:11px;color:var(--text-dim);font-family:var(--mono);text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px;">Omzet per categorie</div>
            ${k.categorieen.map(c=>`
              <div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0;">
                <span>${c.naam}${c.aantal>0?` (${c.aantal}x)`:''}</span>
                <span class="mono">${fmt(c.contant+c.pin)}</span>
              </div>`).join('')}
          </div>
          <div>
            ${k.uitgaven.length?`<div style="font-size:11px;color:var(--text-dim);font-family:var(--mono);text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px;">Uitgaven</div>
            ${k.uitgaven.map(u=>`
              <div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0;">
                <span>${u.oms}</span>
                <span class="mono amount-neg">-${fmt(u.bedrag)}</span>
              </div>`).join('')}`:''}
            ${k.notities?`<div style="font-size:11px;color:var(--text-dim);margin-top:8px;">📝 ${k.notities}</div>`:''}
          </div>
        </div>
      </details>
    </div>`;
  }).join('');
}

async function keurKassaGoed(id){
  const k = DB.kassalijsten.find(k=>k.id===id);
  if(!k) return;
  const ok = await bevestig(
    `Kassalijst van ${k.datum} goedkeuren?\n\nOmzet ${fmt(k.totaalOmzet)} wordt geboekt op:\n• Kas: +${fmt(k.totContant)}\n• Omzet rekening: +${fmt(k.totaalOmzet)}`,
    'Kassalijst goedkeuren', 'Goedkeuren'
  );
  if(!ok) return;

  // Kassalijst bedragen — totaalOmzet is excl BTW, totaalOmzetIncl is incl BTW
  // Oudere kassalijsten zonder btwTarief veld: behandel totaalOmzet als incl voor backwards compat
  const btwTarief  = parseInt(k.btwTarief ?? DB.profiel?.btwStandaard ?? '21');
  const kasOmzetIncl = parseFloat(k.totaalOmzetIncl || k.totaalOmzet || 0);
  const kasOmzetExcl = parseFloat(k.totaalOmzet || 0);
  const kasOmzetBtw  = parseFloat(k.omzetBtw || (kasOmzetIncl - kasOmzetExcl) || 0);
  const kasContant   = parseFloat(k.totContant || 0);
  const kasUitgaven  = parseFloat(k.totUitgaven || 0);
  // Kas ontvangt incl BTW bedrag (fysiek geld in de kassa)
  const kasBoekbedrag = kasContant > 0 ? kasContant : kasOmzetIncl;

  // Boek naar grootboek
  if(!DB.grootboek) DB.grootboek = [];
  // 1. Kas saldo omhoog met incl BTW bedrag — debet kas
  const kasRek = DB.grootboek.find(g=>g.nummer==='1000') || DB.grootboek.find(g=>g.naam.toLowerCase().includes('kas'));
  if(kasRek) kasRek.saldo = (parseFloat(kasRek.saldo)||0) + kasBoekbedrag - kasUitgaven;

  // 2. Omzetrekening omhoog met excl BTW — credit omzet
  const omzetRek = DB.grootboek.find(g=>g.type==='omzet'&&g.naam.toLowerCase().includes('kap'))
    || DB.grootboek.find(g=>g.type==='omzet');
  if(omzetRek) omzetRek.saldo = (parseFloat(omzetRek.saldo)||0) + kasOmzetExcl;

  // 3. BTW afdracht rekening — credit BTW te betalen
  // Maak rekening aan als die niet bestaat — voorkomt silent fail
  let btwRek = DB.grootboek.find(g=>g.nummer==='2300') || DB.grootboek.find(g=>g.nummer==='1810') || DB.grootboek.find(g=>g.naam.toLowerCase().includes('btw te betalen'));
  if(!btwRek && kasOmzetBtw > 0){
    btwRek = { id:uid(), nummer:'2300', naam:'BTW te betalen', type:'schuld', saldo:0 };
    if(!DB.grootboek) DB.grootboek = [];
    DB.grootboek.push(btwRek);
  }
  if(btwRek && kasOmzetBtw > 0) btwRek.saldo = (parseFloat(btwRek.saldo)||0) + kasOmzetBtw;

  // 4. Kassaverschil boeken indien aanwezig
  const boekverschil = kasBoekbedrag - kasOmzetExcl - kasOmzetBtw;
  if(Math.abs(boekverschil) > 0.01){
    const verschilRek = DB.grootboek.find(g=>g.naam.toLowerCase().includes('kassaverschil'))
      || DB.grootboek.find(g=>g.nummer==='8900');
    if(verschilRek) verschilRek.saldo = (parseFloat(verschilRek.saldo)||0) + boekverschil;
  }

  // 5. Memoriaalboeking — volledig in evenwicht (debet = credit)
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
        gbId: DB.grootboek.find(g=>g.nummer==='8900')?.id||'',
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
  // Als goedgekeurd: draai grootboek eerst terug
  if(wasGoedgekeurd){
    const kasRek   = DB.grootboek.find(g=>g.nummer==='1000')||DB.grootboek.find(g=>g.naam.toLowerCase().includes('kas'));
    const omzetRek = DB.grootboek.find(g=>g.type==='omzet'&&g.naam.toLowerCase().includes('kap'))
      || DB.grootboek.find(g=>g.type==='omzet');
    const _kasBoekbedrag = (parseFloat(k.totContant)||0) > 0 ? parseFloat(k.totContant) : parseFloat(k.totaalOmzet)||0;
    if(kasRek)   kasRek.saldo   = (parseFloat(kasRek.saldo)||0)   - _kasBoekbedrag + (parseFloat(k.totUitgaven)||0);
    if(omzetRek) omzetRek.saldo = (parseFloat(omzetRek.saldo)||0) - (parseFloat(k.totaalOmzet)||0);
    // Verwijder ook de memoriaalboeking
    if(DB.memoriaal) DB.memoriaal = DB.memoriaal.filter(m=>!(m.oms&&m.oms.includes(k.datum)&&m.oms.includes('Kassalijst')));
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
  const ok = await bevestig(`Boeking van kassalijst ${k.datum} terugdraaien?`, 'Terugdraaien', 'Terugdraaien');
  if(!ok) return;

  const kasRek   = DB.grootboek.find(g=>g.nummer==='1000')||DB.grootboek.find(g=>g.naam.toLowerCase().includes('kas'));
  const omzetRek = DB.grootboek.find(g=>g.type==='omzet'&&g.naam.toLowerCase().includes('kap'))
    || DB.grootboek.find(g=>g.type==='omzet');

  const _kasBoekbedrag = (parseFloat(k.totContant)||0) > 0 ? parseFloat(k.totContant) : parseFloat(k.totaalOmzet)||0;
  if(kasRek)   kasRek.saldo   = (parseFloat(kasRek.saldo)||0)   - _kasBoekbedrag + (parseFloat(k.totUitgaven)||0);
  if(omzetRek) omzetRek.saldo = (parseFloat(omzetRek.saldo)||0) - (parseFloat(k.totaalOmzet)||0);

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
      if(!DB.kassiers) DB.kassiers = [];
      d.kassiers.forEach(k=>{
        const idx = DB.kassiers.findIndex(x=>x.id===k.id);
        if(idx === -1) DB.kassiers.push(k);
        else DB.kassiers[idx] = k;
      });
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

