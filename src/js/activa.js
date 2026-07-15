// ===== VASTE ACTIVA =====

// ===== TOPBAR NAVIGATIE =====
var _navGroepMap = {
  verkoop:'facturen', inkoop:'facturen',
  bank:'financieel', grootboek:'financieel', regels:'financieel',
  memoriaal:'financieel', vasteactiva:'financieel',
  mutaties:'rapportages', openposten:'rapportages',
  balans:'rapportages', pl:'rapportages', btwaangifte:'rapportages',
};

var _tabGroepen = {
  dashboard: null,
  facturen: ['verkoop','inkoop'],
  financieel: ['bank','grootboek','regels','memoriaal','vasteactiva'],
  rapportages: ['mutaties','openposten','balans','pl','btwaangifte','jaaropgave','kassaoverzicht'],
};

function navTo(pagina){
  // Sluit alle dropdowns
  sluitAllDrops();
  // Activeer pagina
  showPage(pagina);
  // Update tab highlighting
  updateNavState(pagina);
}

function updateNavState(pagina){
  // Reset alle tabs
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active','has-active'));
  // Reset dropdown items
  document.querySelectorAll('.nav-dropdown-item').forEach(t=>t.classList.remove('active'));

  if(pagina==='dashboard'){
    document.getElementById('nav-tab-dashboard')?.classList.add('active');
    return;
  }
  const groep = _navGroepMap[pagina];
  if(groep){
    document.getElementById('nav-tab-'+groep)?.classList.add('has-active');
    document.getElementById('nav-item-'+pagina)?.classList.add('active');
  }
}

function toggleDrop(naam){
  const menu = document.getElementById('nav-drop-'+naam);
  const tab  = document.getElementById('nav-tab-'+naam);
  if(!menu||!tab) return;
  const wasOpen = menu.classList.contains('open');
  sluitAllDrops();
  if(!wasOpen){
    menu.classList.add('open');
    tab.classList.add('open');
  }
}

function sluitAllDrops(){
  ['facturen','financieel','rapportages'].forEach(n=>{
    document.getElementById('nav-drop-'+n)?.classList.remove('open');
    document.getElementById('nav-tab-'+n)?.classList.remove('open');
  });
}

// Sluit dropdowns bij klik buiten — wacht op DOM

// PWA install prompt opslaan voor later
let _pwaInstallPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  _pwaInstallPrompt = e;
  // Toon "Installeer app" knop als die beschikbaar is
  const btn = document.getElementById('pwa-install-btn');
  if(btn) btn.style.display = 'block';
});

window.addEventListener('appinstalled', () => {
  _pwaInstallPrompt = null;
  const btn = document.getElementById('pwa-install-btn');
  if(btn) btn.style.display = 'none';
  toast('App geïnstalleerd op je telefoon! 📱','success');
});

function installPWA(){
  if(_pwaInstallPrompt){
    _pwaInstallPrompt.prompt();
    _pwaInstallPrompt.userChoice.then(()=>{ _pwaInstallPrompt=null; });
  }
}

document.addEventListener('DOMContentLoaded', function(){
  window.addEventListener('click', function(e){
    if(!e.target.closest('.nav-dropdown')&&!e.target.closest('.nav-tab')){
      sluitAllDrops();
    }
  }, true);
});

// Legacy wrappers zodat bestaande showPage calls blijven werken
function toggleNavGroep(n){ toggleDrop(n); }
function openNavGroep(n){ updateNavState(n); }


let _dqFactuur=null; let _dqGb=null;

function openDeprVraagModal(factuur, gb){
  _dqFactuur=factuur; _dqGb=gb;
  // Info blok
  document.getElementById('depr-vraag-info').innerHTML=`
    <div style="margin-bottom:4px;"><strong>${factuur.klant}</strong> &nbsp;·&nbsp; ${factuur.nummer}</div>
    <div style="color:var(--text-dim);">Rekening: <strong style="color:var(--text);">${gb.nummer} — ${gb.naam}</strong></div>
    <div style="color:var(--text-dim);">Aanschafwaarde excl. BTW: <strong style="color:var(--accent);font-family:var(--mono);">${fmt(factuur.totaalExcl)}</strong></div>`;
  // Vul rekeningen
  const gbOpts=DB.grootboek.map(g=>`<option value="${g.id}">${g.nummer} — ${g.naam}</option>`).join('');
  ['dq-gb-kosten','dq-gb-accum'].forEach(id=>{ const el=document.getElementById(id); if(el) el.innerHTML='<option value="">— Kies —</option>'+gbOpts; });
  const kostenRek=DB.grootboek.find(g=>g.id==='gb14'||g.naam.toLowerCase().includes('afschr')&&g.type==='kosten');
  const accumRek=DB.grootboek.find(g=>g.id==='gb15'||g.naam.toLowerCase().includes('accum'));
  if(kostenRek) document.getElementById('dq-gb-kosten').value=kostenRek.id;
  if(accumRek) document.getElementById('dq-gb-accum').value=accumRek.id;
  // Reset form
  document.getElementById('depr-vraag-form').style.display='none';
  document.getElementById('dq-btn-ja').style.display='block';
  document.getElementById('dq-btn-opslaan').style.display='none';
  document.getElementById('dq-duur').value='60';
  document.getElementById('dq-rest').value='0';
  openModal('modal-depr-vraag');
  dqHerbereken();
}

function dqToonForm(){
  document.getElementById('depr-vraag-form').style.display='block';
  document.getElementById('dq-btn-ja').style.display='none';
  document.getElementById('dq-btn-opslaan').style.display='block';
  dqHerbereken();
}

function dqHerbereken(){
  const aanschaf=_dqFactuur?parseFloat(_dqFactuur.totaalExcl):0;
  const rest=parseFloat(document.getElementById('dq-rest')?.value)||0;
  const duur=parseInt(document.getElementById('dq-duur')?.value)||0;
  const methode=document.getElementById('dq-methode')?.value||'lineair';
  const el=document.getElementById('dq-preview');
  if(!el||!duur) return;
  const afschrijfbaar=Math.max(0,aanschaf-rest);
  const maandBedrag=methode==='lineair'?afschrijfbaar/duur:0;
  const jaarPerc=methode==='degressief'&&rest>0?(1-Math.pow(rest/aanschaf,1/(duur/12)))*100:0;
  el.innerHTML=methode==='lineair'
    ? `Maandelijkse afschrijving: <strong style="color:var(--accent);font-family:var(--mono);">${fmt(maandBedrag)}</strong> &nbsp;·&nbsp; Looptijd: <strong>${duur} maanden</strong> &nbsp;·&nbsp; Restwaarde: <strong>${fmt(rest)}</strong>`
    : `Jaarlijks: <strong style="color:var(--accent);">${jaarPerc.toFixed(2)}%</strong> &nbsp;·&nbsp; Eerste maand: <strong style="font-family:var(--mono);">${fmt(aanschaf*jaarPerc/100/12)}</strong> &nbsp;·&nbsp; Restwaarde: <strong>${fmt(rest)}</strong>`;
}

function dqOpslaan(){
  if(!_dqFactuur||!_dqGb) return;
  const duur=parseInt(document.getElementById('dq-duur').value)||0;
  const rest=parseFloat(document.getElementById('dq-rest').value)||0;
  const methode=document.getElementById('dq-methode').value;
  const gbKostenId=document.getElementById('dq-gb-kosten').value;
  const gbAccumId=document.getElementById('dq-gb-accum').value;
  if(!duur){toast('Vul een looptijd in.','error');return;}
  if(!gbKostenId||!gbAccumId){toast('Kies afschrijvingskosten en accumuleerde afschrijvingen rekening.','error');return;}
  if(!DB.vasteActiva) DB.vasteActiva=[];
  DB.vasteActiva.push({
    id:uid(),
    naam:_dqFactuur.klant+' — '+(_dqFactuur.regels[0]?.omschrijving||_dqGb.naam),
    aanschafdatum:_dqFactuur.datum,
    aanschafwaarde:parseFloat(_dqFactuur.totaalExcl),
    restwaarde:rest,
    duurMaanden:duur,
    methode,
    gbActivaId:_dqGb.id,
    gbKostenId,
    gbAccumId,
    verwerkteMaanden:[],
    factuurId:_dqFactuur.id,
    factuurNummer:_dqFactuur.nummer
  });
  save();
  closeModal('modal-depr-vraag');
  toast(`Afschrijvingsschema aangemaakt voor ${_dqFactuur.regels[0]?.omschrijving||_dqGb.naam}.`,'success');
}

// ===== VASTE ACTIVA MODAL (bewerken) =====
function openVAModal(editId){
  if(!DB.vasteActiva||!editId) return;
  const a=DB.vasteActiva.find(a=>a.id===editId); if(!a) return;
  // Reuse depr vraag modal fields for editing
  // Open a simple edit via prompt for now — full modal in va-modal
  const gbOpts=DB.grootboek.map(g=>`<option value="${g.id}">${g.nummer} — ${g.naam}</option>`).join('');
  ['dq-gb-kosten','dq-gb-accum'].forEach(id=>{ const el=document.getElementById(id); if(el) el.innerHTML='<option value="">— Kies —</option>'+gbOpts; });
  document.getElementById('depr-vraag-info').innerHTML=`
    <div style="margin-bottom:6px;"><strong>${a.naam}</strong></div>
    <div style="color:var(--text-dim);">Aanschafwaarde: <strong style="color:var(--text);font-family:var(--mono);">${fmt(a.aanschafwaarde)}</strong> &nbsp;·&nbsp; Aanschaf: ${a.aanschafdatum}</div>`;
  document.getElementById('dq-duur').value=a.duurMaanden;
  document.getElementById('dq-rest').value=a.restwaarde;
  document.getElementById('dq-methode').value=a.methode;
  if(a.gbKostenId) document.getElementById('dq-gb-kosten').value=a.gbKostenId;
  if(a.gbAccumId) document.getElementById('dq-gb-accum').value=a.gbAccumId;
  document.getElementById('depr-vraag-form').style.display='block';
  document.getElementById('dq-btn-ja').style.display='none';
  document.getElementById('dq-btn-opslaan').style.display='none';
  // Override save button
  const footer=document.querySelector('#modal-depr-vraag .modal-footer');
  footer.innerHTML=`
    <button class="btn btn-secondary" onclick="closeModal('modal-depr-vraag')">Annuleren</button>
    <button class="btn btn-primary" onclick="dqUpdate('${editId}')">Opslaan</button>`;
  _dqFactuur={totaalExcl:a.aanschafwaarde,datum:a.aanschafdatum,regels:[{omschrijving:a.naam}],id:a.factuurId||'',nummer:a.factuurNummer||''};
  _dqGb=DB.grootboek.find(g=>g.id===a.gbActivaId)||{id:'',nummer:'',naam:''};
  openModal('modal-depr-vraag');
  dqHerbereken();
}

function dqUpdate(editId){
  const a=DB.vasteActiva.find(a=>a.id===editId); if(!a) return;
  a.duurMaanden=parseInt(document.getElementById('dq-duur').value)||a.duurMaanden;
  a.restwaarde=parseFloat(document.getElementById('dq-rest').value)||0;
  a.methode=document.getElementById('dq-methode').value;
  a.gbKostenId=document.getElementById('dq-gb-kosten').value||a.gbKostenId;
  a.gbAccumId=document.getElementById('dq-gb-accum').value||a.gbAccumId;
  // Reset footer
  document.querySelector('#modal-depr-vraag .modal-footer').innerHTML=`
    <button class="btn btn-secondary" onclick="closeModal('modal-depr-vraag')">Nee, niet afschrijven</button>
    <button class="btn btn-secondary" id="dq-btn-ja" onclick="dqToonForm()" style="display:block;">Ja, schema instellen ▸</button>
    <button class="btn btn-primary" id="dq-btn-opslaan" onclick="dqOpslaan()" style="display:none;">Schema opslaan</button>`;
  save(); closeModal('modal-depr-vraag'); renderVasteActiva();
  toast('Activum bijgewerkt.','success');
}

// ===== VASTE ACTIVA RENDER =====

function vaHerbereken(){
  const aanschaf=parseFloat(document.getElementById('va-aanschaf')?.value)||0;
  const rest=parseFloat(document.getElementById('va-restwaarde')?.value)||0;
  const duur=parseInt(document.getElementById('va-duur')?.value)||0;
  const methode=document.getElementById('va-methode')?.value||'lineair';
  const preview=document.getElementById('va-preview');
  const inhoud=document.getElementById('va-preview-inhoud');
  if(!aanschaf||!duur){ if(preview) preview.style.display='none'; return; }
  const afschrijfbaar=Math.max(0,aanschaf-rest);
  preview.style.display='block';
  if(methode==='lineair'){
    const maandBedrag=afschrijfbaar/duur;
    inhoud.innerHTML=`<div>Afschrijfbaar: <strong>${fmt(afschrijfbaar)}</strong> &nbsp;·&nbsp; Maandelijks: <strong style="color:var(--accent);">${fmt(maandBedrag)}</strong> &nbsp;·&nbsp; Looptijd: <strong>${duur} mnd</strong> &nbsp;·&nbsp; Restwaarde: <strong>${fmt(rest)}</strong></div>`;
  } else {
    const jaarPerc=rest>0&&aanschaf>0?(1-Math.pow(rest/aanschaf,1/(duur/12)))*100:0;
    const eersteAfschr=aanschaf*jaarPerc/100/12;
    inhoud.innerHTML=`<div>Afschrijving%: <strong>${jaarPerc.toFixed(2)}% per jaar</strong> &nbsp;·&nbsp; Eerste maand: <strong style="color:var(--accent);">${fmt(eersteAfschr)}</strong> &nbsp;·&nbsp; Restwaarde: <strong>${fmt(rest)}</strong></div>`;
  }
}

function berekenSchema(a){
  const schema=[];
  const d=new Date(a.aanschafdatum);
  let boekwaarde=parseFloat(a.aanschafwaarde);
  const rest=parseFloat(a.restwaarde);
  const duur=parseInt(a.duurMaanden);
  const afschrijfbaar=Math.max(0,boekwaarde-rest);
  const maandLineair=a.methode==='lineair'?afschrijfbaar/duur:0;
  const jaarPerc=a.methode==='degressief'&&rest>0&&boekwaarde>0?(1-Math.pow(rest/boekwaarde,1/(duur/12))):0;

  for(let i=0;i<duur;i++){
    const md=new Date(d.getFullYear(),d.getMonth()+i+1,1);
    const opening=boekwaarde;
    let afschr=0;
    if(a.methode==='lineair'){
      afschr=i<duur-1?maandLineair:Math.max(0,boekwaarde-rest);
    } else {
      afschr=Math.min(boekwaarde*jaarPerc/12,Math.max(0,boekwaarde-rest));
    }
    afschr=Math.max(0,Math.round(afschr*100)/100);
    boekwaarde=Math.max(rest,Math.round((boekwaarde-afschr)*100)/100);
    const mk=`${md.getFullYear()}-${String(md.getMonth()+1).padStart(2,'0')}`;
    schema.push({
      nr:i+1,jaar:md.getFullYear(),maand:md.getMonth()+1,
      maandNaam:md.toLocaleString('nl-NL',{month:'short'})+' '+md.getFullYear(),
      maandKey:mk,opening,afschr,sluiting:boekwaarde,
      verwerkt:(a.verwerkteMaanden||[]).includes(mk)
    });
  }
  return schema;
}

function slaVAOp(editId){
  const naam=document.getElementById('va-naam').value.trim();
  const aanschaf=parseFloat(document.getElementById('va-aanschaf').value)||0;
  const rest=parseFloat(document.getElementById('va-restwaarde').value)||0;
  const duur=parseInt(document.getElementById('va-duur').value)||0;
  const methode=document.getElementById('va-methode').value;
  const datum=document.getElementById('va-datum').value;
  const gbActivaId=document.getElementById('va-gb-activa').value;
  const gbKostenId=document.getElementById('va-gb-kosten').value;
  const gbAccumId=document.getElementById('va-gb-accum').value;
  if(!naam||!aanschaf||!duur||!datum){toast('Vul naam, datum, aanschafwaarde en looptijd in.','error');return;}
  if(!DB.vasteActiva) DB.vasteActiva=[];
  if(editId){
    const a=DB.vasteActiva.find(a=>a.id===editId);
    if(a) Object.assign(a,{naam,aanschafwaarde:aanschaf,restwaarde:rest,duurMaanden:duur,methode,aanschafdatum:datum,gbActivaId,gbKostenId,gbAccumId});
  } else {
    DB.vasteActiva.push({id:uid(),naam,aanschafwaarde:aanschaf,restwaarde:rest,duurMaanden:duur,methode,aanschafdatum:datum,gbActivaId,gbKostenId,gbAccumId,verwerkteMaanden:[]});
  }
  save(); closeModal('modal-va'); renderVasteActiva();
  toast(`${naam} opgeslagen.`,'success');
}

function verwerkAfschrijving(activumId, maandKey, afschrBedrag){
  const a=DB.vasteActiva.find(a=>a.id===activumId); if(!a) return;
  if((a.verwerkteMaanden||[]).includes(maandKey)){toast('Deze maand is al verwerkt.','warning');return;}
  const kostenRek=DB.grootboek.find(g=>g.id===a.gbKostenId);
  const accumRek=DB.grootboek.find(g=>g.id===a.gbAccumId);
  if(!kostenRek||!accumRek){toast('Koppel eerst de afschrijvingsrekeningen aan het activum.','error');return;}
  if(!DB.memoriaal) DB.memoriaal=[];
  const [jaar,maand]=maandKey.split('-');
  const datum=`${jaar}-${maand}-28`;
  kostenRek.saldo=rond((parseFloat(kostenRek.saldo)||0)+afschrBedrag);
  accumRek.saldo=rond((parseFloat(accumRek.saldo)||0)+afschrBedrag); // passiva verhoogt via credit
  DB.memoriaal.push({
    id:uid(),datum,
    oms:`Afschrijving ${a.naam} — ${maandKey}`,
    type:'afschrijving',
    relatie:'',
    regels:[
      {dc:'debet',gbId:a.gbKostenId,oms:`Afschrijving ${a.naam}`,bedrag:afschrBedrag},
      {dc:'credit',gbId:a.gbAccumId,oms:`Accum. afschr. ${a.naam}`,bedrag:afschrBedrag}
    ],
    debet:afschrBedrag,
    aangemaakt:new Date().toISOString()
  });
  if(!a.verwerkteMaanden) a.verwerkteMaanden=[];
  a.verwerkteMaanden.push(maandKey);
  save(); renderVasteActiva();
  toast(`Afschrijving ${fmt(afschrBedrag)} verwerkt voor ${a.naam}.`,'success');
}

function renderVasteActiva(){
  if(!DB.vasteActiva) DB.vasteActiva=[];
  const lijst=DB.vasteActiva;

  // Stats
  let totAanschaf=0,totBoek=0,totAfschr=0,totMaand=0;
  lijst.forEach(a=>{
    const schema=berekenSchema(a);
    const boekwaarde=schema.filter(s=>s.verwerkt).reduce((v,s)=>v-s.afschr,parseFloat(a.aanschafwaarde));
    const volgend=schema.find(s=>!s.verwerkt);
    totAanschaf+=parseFloat(a.aanschafwaarde);
    totBoek+=boekwaarde;
    totAfschr+=(parseFloat(a.aanschafwaarde)-boekwaarde);
    totMaand+=volgend?.afschr||0;
  });
  const statIds=['va-stat-aanschaf','va-stat-boekwaarde','va-stat-afgeschreven','va-stat-maand'];
  [totAanschaf,totBoek,totAfschr,totMaand].forEach((v,i)=>{ const el=document.getElementById(statIds[i]); if(el) el.textContent=fmt(v); });

  const el=document.getElementById('va-lijst');
  if(!el) return;
  if(!lijst.length){
    el.innerHTML='<div class="empty"><span class="icon">⬛</span><p>Geen vaste activa geregistreerd</p><p style="font-size:12px;margin-top:6px;color:var(--text-dim);">Maak een inkoopfactuur aan op een activa rekening (200–2999) om automatisch een afschrijvingsschema te starten</p></div>';
    return;
  }

  el.innerHTML=lijst.map(a=>{
    const schema=berekenSchema(a);
    const aantalVerwerkt=a.verwerkteMaanden?.length||0;
    const volledig=aantalVerwerkt>=a.duurMaanden;
    const boekwaarde=schema.filter(s=>s.verwerkt).reduce((v,s)=>v-s.afschr,parseFloat(a.aanschafwaarde));
    const pct=Math.round((aantalVerwerkt/a.duurMaanden)*100);
    const volgend=schema.find(s=>!s.verwerkt);

    const schemaHTML=schema.map(s=>`<tr style="${s.verwerkt?'opacity:.45;':''}">
      <td class="mono" style="font-size:11px;">${s.maandNaam}</td>
      <td class="mono" style="font-size:11px;text-align:right;">${fmt(s.opening)}</td>
      <td class="mono amount-neg" style="font-size:11px;text-align:right;">${fmt(s.afschr)}</td>
      <td class="mono" style="font-size:11px;text-align:right;color:${s.sluiting<=parseFloat(a.restwaarde)+0.01?'var(--warning)':'var(--text)'};">${fmt(s.sluiting)}</td>
      <td style="text-align:center;">
        ${s.verwerkt
          ? '<span class="badge badge-green" style="font-size:9px;">✓</span>'
          : s.nr===aantalVerwerkt+1
            ? `<button class="btn btn-primary btn-sm" style="padding:3px 8px;font-size:11px;" onclick="verwerkAfschrijving('${a.id}','${s.maandKey}',${s.afschr})">Verwerk</button>`
            : '<span style="font-size:11px;color:var(--text-dim);">–</span>'
        }
      </td>
    </tr>`).join('');

    return `<div class="card">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px;gap:12px;">
        <div>
          <div style="font-size:15px;font-weight:600;margin-bottom:4px;">${a.naam}</div>
          <div style="font-size:12px;color:var(--text-dim);">Aanschaf: ${a.aanschafdatum} &nbsp;·&nbsp; ${a.methode==='lineair'?'Lineair':'Degressief'} &nbsp;·&nbsp; ${a.duurMaanden} maanden${a.factuurNummer?` &nbsp;·&nbsp; <span style="font-family:var(--mono);color:var(--accent2);">${a.factuurNummer}</span>`:''}</div>
        </div>
        <div style="display:flex;gap:8px;flex-shrink:0;">
          <button class="btn btn-secondary btn-sm" onclick="openVAModal('${a.id}')">Bewerk</button>
          <button class="btn btn-danger btn-sm" onclick="verwijderVA('${a.id}')">✕</button>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px;">
        <div><div style="font-size:10px;color:var(--text-dim);font-family:var(--mono);text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px;">Aanschafwaarde</div><div style="font-size:14px;font-family:var(--mono);font-weight:600;">${fmt(a.aanschafwaarde)}</div></div>
        <div><div style="font-size:10px;color:var(--text-dim);font-family:var(--mono);text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px;">Boekwaarde</div><div style="font-size:14px;font-family:var(--mono);font-weight:600;color:var(--accent);">${fmt(boekwaarde)}</div></div>
        <div><div style="font-size:10px;color:var(--text-dim);font-family:var(--mono);text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px;">Afgeschreven</div><div style="font-size:14px;font-family:var(--mono);font-weight:600;color:var(--danger);">${fmt(parseFloat(a.aanschafwaarde)-boekwaarde)}</div></div>
        <div>
          <div style="font-size:10px;color:var(--text-dim);font-family:var(--mono);text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px;">Voortgang</div>
          <div style="height:5px;background:var(--surface2);border-radius:3px;overflow:hidden;">
            <div style="height:100%;width:${pct}%;background:${volledig?'var(--warning)':'var(--accent)'};border-radius:3px;transition:width .4s;"></div>
          </div>
          <div style="font-size:11px;color:var(--text-dim);margin-top:4px;font-family:var(--mono);">${aantalVerwerkt}/${a.duurMaanden}${volledig?' — volledig':''}</div>
        </div>
      </div>

      ${!volledig&&volgend?`
      <div style="background:var(--accent-dim);border:1px solid rgba(0,230,118,.25);border-radius:var(--radius);padding:10px 16px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
        <span style="font-size:13px;">Volgende: <strong>${volgend.maandNaam}</strong> &nbsp;·&nbsp; <span style="font-family:var(--mono);color:var(--accent);">${fmt(volgend.afschr)}</span></span>
        <button class="btn btn-primary btn-sm" onclick="verwerkAfschrijving('${a.id}','${volgend.maandKey}',${volgend.afschr})">▶ Verwerk volgende maand</button>
      </div>`:volledig?`<div style="background:var(--warning-dim);border:1px solid rgba(255,193,7,.25);border-radius:var(--radius);padding:10px 16px;margin-bottom:14px;font-size:12px;color:var(--warning);">✓ Volledig afgeschreven — restwaarde ${fmt(a.restwaarde)}</div>`:''}

      <details>
        <summary style="cursor:pointer;font-size:12px;color:var(--text-dim);padding:4px 0;list-style:none;display:flex;align-items:center;gap:6px;user-select:none;">
          <span>▸</span> Volledig afschrijvingsschema (${schema.length} maanden)
        </summary>
        <div style="margin-top:10px;max-height:300px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius);">
          <table>
            <thead><tr><th>Maand</th><th style="text-align:right;">Opening</th><th style="text-align:right;">Afschrijving</th><th style="text-align:right;">Boekwaarde</th><th style="text-align:center;">Status</th></tr></thead>
            <tbody>${schemaHTML}</tbody>
          </table>
        </div>
      </details>
    </div>`;
  }).join('');
}

async function verwijderVA(id){
  const a = (DB.vasteActiva||[]).find(a=>a.id===id);
  if(!a) return;
  const aantalVerwerkt = (a.verwerkteMaanden||[]).length;
  const bevestigTekst = aantalVerwerkt > 0
    ? `Activum "${a.naam}" verwijderen?\n\n${aantalVerwerkt} verwerkte afschrijving(en) worden teruggedraaid.`
    : `Activum "${a.naam}" en afschrijvingsschema verwijderen?`;
  const ok = await bevestig(bevestigTekst, 'Activum verwijderen', 'Verwijderen');
  if(!ok) return;
  // Draai verwerkte afschrijvingen terug
  if(aantalVerwerkt > 0){
    const kostenRek = DB.grootboek.find(g=>g.id===a.gbKostenId);
    const accumRek  = DB.grootboek.find(g=>g.id===a.gbAccumId);
    const verwerkt  = (DB.memoriaal||[]).filter(m=>m.type==='afschrijving'&&m.oms?.includes(a.naam));
    verwerkt.forEach(m=>{
      if(kostenRek) kostenRek.saldo = (parseFloat(kostenRek.saldo)||0) - parseFloat(m.debet||0);
      if(accumRek)  accumRek.saldo  = (parseFloat(accumRek.saldo)||0)  - parseFloat(m.debet||0);
    });
    DB.memoriaal = (DB.memoriaal||[]).filter(m=>!(m.type==='afschrijving'&&m.oms?.includes(a.naam)));
  }
  DB.vasteActiva = (DB.vasteActiva||[]).filter(x=>x.id!==id);
  save(); renderVasteActiva();
  toast(`Activum "${a.naam}" verwijderd${aantalVerwerkt>0?' — afschrijvingen teruggedraaid':''}.`,'info');
}

// ============================================================
// MOBIELE KASSIER INTERFACE — JavaScript
// ============================================================

function isMobiel(){
  return window.innerWidth < 768;
}

// State
let _mobPeriode = 'vandaag';
let _mobFilter  = '';
let _mobActieveCat = null; // welke categorie numpad open
let _mobNumpadWaarde = '';
let _mobCatWaarden = {}; // { catNaam: bedrag }

// ---- Navigatie ----
function mobGetModules(){
  return _actieveKassier?.modules || ['dashboard','kassa','uploads'];
}

function mobBouwNav(){
  const modules = mobGetModules();
  const nav = document.querySelector('.mob-bottom-nav');
  if(!nav) return;
  const tabs = [
    { id:'dashboard',   icon:'📊', label:'Dashboard' },
    { id:'kassa',       icon:'💰', label:'Kassa' },
    { id:'uren',        icon:'⏱', label:'Uren' },
    { id:'facturen',    icon:'🧾', label:'Facturen' },
    { id:'uploads',     icon:'📎', label:'Bonnen' },
    { id:'overzichten', icon:'📋', label:'Lijsten' },
  ];
  // Uren-tab: zichtbaar als uren-registratie aan staat voor dit bedrijf én module 'uren' is aangevinkt.
  const urenZichtbaar = isUrenAan() && modules.includes('uren');
  // Overzichten altijd tonen als kassa actief is
  const zichtbaar = tabs.filter(t=>
    (t.id==='uren' ? urenZichtbaar : modules.includes(t.id)) ||
    (t.id==='overzichten' && modules.includes('kassa'))
  );
  nav.innerHTML = zichtbaar.map(t=>
    `<button class="mob-nav-btn" id="mob-btn-${t.id}" onclick="mobNav('${t.id}')">
      <span class="mob-nav-icon">${t.icon}</span>${t.label}
    </button>`
  ).join('');
}

function mobNav(tab){
  const allTabs = ['dashboard','kassa','uren','facturen','uploads','overzichten'];
  allTabs.forEach(t=>{
    const btn = document.getElementById('mob-btn-'+t);
    const page = document.getElementById('mob-page-'+t);
    if(btn) btn.classList.toggle('active', t===tab);
    if(page) page.classList.toggle('active', t===tab);
  });
  const titels = { dashboard:'Dashboard', kassa:'Kassa', uren:'Uren', facturen:'Facturen', uploads:'Bonnen', overzichten:'Lijsten' };
  const titEl = document.getElementById('mob-topbar-naam');
  if(titEl) titEl.textContent = titels[tab]||'';
  if(tab==='dashboard')   renderMobDashboard();
  if(tab==='kassa')       initMobKassa();
  if(tab==='uren')        initMobUren();
  if(tab==='overzichten') renderMobOverzichten();
  if(tab==='facturen')    renderMobFacturen();
  if(tab==='uploads')     initMobUploads();
}

// ---- Periode filter ----
function mobSetPeriode(p){
  _mobPeriode = p;
  // Pills
  const pillVandaag = document.getElementById('mob-pill-vandaag');
  const pillWeek = document.getElementById('mob-pill-week');
  if(pillVandaag) pillVandaag.classList.toggle('active', p==='vandaag');
  if(pillWeek) pillWeek.classList.toggle('active', p==='week');
  // Dropdown
  const sel = document.getElementById('mob-maand-select');
  if(sel) sel.value = p.startsWith('m') ? p : '';
  renderMobDashboard();
}

function mobSetPeriodeDropdown(p){
  if(!p) return;
  mobSetPeriode(p);
}

function _inMobPeriode(datum){
  if(!datum) return false;
  const nu = new Date();
  const d = new Date(datum);
  if(_mobPeriode==='vandaag') return datum.slice(0,10)===nu.toISOString().slice(0,10);
  if(_mobPeriode==='week'){
    const diff = (nu - d)/(1000*60*60*24);
    return diff>=0 && diff<7;
  }
  if(_mobPeriode.startsWith('m')){
    const maand = parseInt(_mobPeriode.slice(1),10)-1;
    return d.getMonth()===maand && d.getFullYear()===nu.getFullYear();
  }
  return false;
}

function mobGetPeriodeLijsten(){
  return (DB.kassalijsten||[]).filter(l=>_inMobPeriode(l.datum||''));
}

function mobFmtEur(val){
  return '€ ' + parseFloat(val||0).toFixed(2).replace('.',',');
}

function mobPeriodeLabel(){
  const mndNamen = ['Januari','Februari','Maart','April','Mei','Juni','Juli','Augustus','September','Oktober','November','December'];
  if(_mobPeriode==='vandaag') return 'Vandaag';
  if(_mobPeriode==='week') return 'Afgelopen 7 dagen';
  if(_mobPeriode.startsWith('m')){
    return mndNamen[parseInt(_mobPeriode.slice(1),10)-1] || '';
  }
  return '';
}

// ---- Dashboard render ----
function renderMobDashboard(){
  const lijsten = mobGetPeriodeLijsten();
  // Toon incl BTW op dashboard — dat is wat kassier fysiek heeft ontvangen
  const omzetLijsten = lijsten.reduce((s,l)=>s+(parseFloat(l.totaalOmzetIncl||l.totaalOmzet||0)),0);
  const kosten = lijsten.reduce((s,l)=>s+(parseFloat(l.totUitgaven||0)),0);

  // Uren-facturen (type='uren') ook meenemen in omzet en openstaand
  const urenFacturen = (DB.verkoop||[]).filter(f=>f.type==='uren');
  const urenOmzetInPeriode = urenFacturen
    .filter(f=>_inMobPeriode(f.datum||''))
    .reduce((s,f)=>s+(parseFloat(f.totaalIncl||f.totaal||0)),0);
  const omzet = omzetLijsten + urenOmzetInPeriode;
  const netto = omzet - kosten;

  const openstaandLijsten = (DB.kassalijsten||[]).filter(l=>l.status==='ingediend'||l.status==='open').length;
  const openstaandFacturen = urenFacturen.filter(f=>f.status!=='betaald').length;
  const openstaand = openstaandLijsten + openstaandFacturen;

  const set = (id,val)=>{ const el=document.getElementById(id); if(el) el.textContent=val; };
  set('mob-omzet', mobFmtEur(omzet));
  set('mob-kosten', mobFmtEur(kosten));
  set('mob-netto', mobFmtEur(netto));
  set('mob-aantal-lijsten', lijsten.length);
  set('mob-openstaand', openstaand);
  set('mob-periode-label', mobPeriodeLabel());

  // Netto kleur
  const nettoEl = document.getElementById('mob-netto');
  if(nettoEl){
    nettoEl.className = 'mob-stat-val ' + (netto>=0?'green':'red');
  }

  // Topbar sub
  const subEl = document.getElementById('mob-topbar-sub');
  if(subEl) subEl.textContent = _actieveKassier?.naam||'';

  // Uren-sectie: toon als kassier uren-module heeft
  const urenSectie = document.getElementById('mob-uren-dashboard-sectie');
  if(urenSectie){
    const heeftUren = (mobGetModules()||[]).includes('uren') && isUrenAan();
    urenSectie.style.display = heeftUren ? '' : 'none';
    if(heeftUren){
      const kassierNaam = _actieveKassier?.naam || '';
      const mijnUren = (DB.uren||[]).filter(u=>u.wie===kassierNaam && _inMobPeriode(u.datum||''));
      const urenOmzet = mijnUren.reduce((s,u)=>s+(parseFloat(u.bedrag)||0),0);
      const urenGoedgekeurd = mijnUren.filter(u=>u.status==='goedgekeurd').length;
      const set2 = (id,val)=>{ const el=document.getElementById(id); if(el) el.textContent=val; };
      set2('mob-uren-omzet', mobFmtEur(urenOmzet));
      set2('mob-uren-ingediend', mijnUren.length);
      set2('mob-uren-goedgekeurd', urenGoedgekeurd);
    }
  }

  // Recente lijsten (5 meest recent)
  const recentEl = document.getElementById('mob-recente-lijsten');
  if(!recentEl) return;
  const alle = [...(DB.kassalijsten||[])].sort((a,b)=>(b.datum||'').localeCompare(a.datum||'')).slice(0,5);
  if(!alle.length){
    recentEl.innerHTML = '<div style="color:rgba(255,255,255,0.25);font-size:14px;text-align:center;padding:32px 0">Nog geen kassalijsten.</div>';
    return;
  }
  recentEl.innerHTML = alle.map(l=>{
    const statusClass = l.status==='goedgekeurd'?'goed':l.status==='afgekeurd'?'afgekeurd':l.status==='ingediend'?'ingediend':'open';
    const statusLabel = {goedgekeurd:'Goedgekeurd',afgekeurd:'Afgekeurd',ingediend:'Ingediend',open:'Openstaand'}[l.status]||l.status;
    const datum = l.datum?new Date(l.datum).toLocaleDateString('nl-NL',{day:'numeric',month:'short'}):'-';
    return '<div class="mob-lijst-item" onclick="mobOpenDetail(\''+l.id+'\')"><div><div class="mob-lijst-datum">'+datum+'</div><div class="mob-lijst-bedrag">'+mobFmtEur(l.totaalOmzet||0)+'</div></div><span class="mob-lijst-status '+statusClass+'">'+statusLabel+'</span></div>';
  }).join('');
}

// ---- Kassa ----
function initMobKassa(){
  _mobCatWaarden = {};
  const datumEl = document.getElementById('mob-kassa-datum');
  if(datumEl) datumEl.value = today();

  // Beginsaldo uit vorige dag
  const vorigeSaldo = berekenVorigEindsaldo();
  const beginEl = document.getElementById('mob-beginsaldo');
  if(beginEl) beginEl.value = vorigeSaldo>0 ? vorigeSaldo.toFixed(2) : '';

  const eindsaldoEl = document.getElementById('mob-eindsaldo');
  if(eindsaldoEl) eindsaldoEl.value = '';
  const notitiesEl = document.getElementById('mob-notities');
  if(notitiesEl) notitiesEl.value = '';

  mobHerbereken();
}

function bouwMobCatGrid(){
  const grid = document.getElementById('mob-cat-grid');
  if(!grid) return;
  grid.innerHTML = KASSA_CATEGORIEEN.map(cat=>{
    return '<button class="mob-cat-btn" id="mob-cat-'+cat.replace(/[^a-z0-9]/gi,'_')+'" onclick="mobOpenCat(\''+cat+'\')"><div class="mob-cat-naam">'+cat+'</div><div class="mob-cat-bedrag leeg" id="mob-cat-bedrag-'+cat.replace(/[^a-z0-9]/gi,'_')+'">€ 0</div></button>';
  }).join('');
}

function mobUpdateCatBtn(cat){
  const safeId = cat.replace(/[^a-z0-9]/gi,'_');
  const btn = document.getElementById('mob-cat-'+safeId);
  const bedragEl = document.getElementById('mob-cat-bedrag-'+safeId);
  const val = parseFloat(_mobCatWaarden[cat]||0);
  if(btn) btn.classList.toggle('heeft-waarde', val>0);
  if(bedragEl){
    bedragEl.className = 'mob-cat-bedrag'+(val>0?'':' leeg');
    bedragEl.textContent = '€ '+val.toFixed(0);
  }
}

function mobHerbereken(){
  const begin = parseFloat(document.getElementById('mob-beginsaldo')?.value)||0;
  const eind = parseFloat(document.getElementById('mob-eindsaldo')?.value)||0;
  const verschilEl = document.getElementById('mob-kassa-verschil-val');
  if(verschilEl){
    const v = eind - begin;
    const isNul = !document.getElementById('mob-eindsaldo')?.value;
    verschilEl.textContent = isNul ? '—' : (v>=0?'+':'')+mobFmtEur(v);
    verschilEl.style.color = isNul ? 'var(--text-mid)' : v>=0 ? '#059669' : '#dc2626';
  }
}

// ---- Numpad ----
function mobOpenCat(cat){
  _mobActieveCat = cat;
  _mobNumpadWaarde = String(parseFloat(_mobCatWaarden[cat]||0)||'');
  document.getElementById('mob-input-titel').textContent = cat;
  mobNumpadDisplay();
  document.getElementById('mob-input-overlay').classList.add('open');
}

function mobNumpadDisplay(){
  const displayEl = document.getElementById('mob-input-display');
  if(displayEl){
    const val = parseFloat(_mobNumpadWaarde)||0;
    displayEl.textContent = '€ '+(_mobNumpadWaarde===''?'0':_mobNumpadWaarde);
  }
}

function mobNumpad(key){
  if(key==='cancel'){
    document.getElementById('mob-input-overlay').classList.remove('open');
    return;
  }
  if(key==='ok'){
    if(_mobActieveCat){
      const val = parseFloat(_mobNumpadWaarde)||0;
      if(val>0) _mobCatWaarden[_mobActieveCat]=val;
      else delete _mobCatWaarden[_mobActieveCat];
      mobUpdateCatBtn(_mobActieveCat);
      mobHerbereken();
    }
    document.getElementById('mob-input-overlay').classList.remove('open');
    return;
  }
  if(key==='del'){
    _mobNumpadWaarde = _mobNumpadWaarde.slice(0,-1);
  } else if(key==='.'){
    if(!_mobNumpadWaarde.includes('.')) _mobNumpadWaarde += '.';
  } else {
    // Max 2 decimalen
    if(_mobNumpadWaarde.includes('.')){
      const parts = _mobNumpadWaarde.split('.');
      if(parts[1].length >= 2) return;
    }
    _mobNumpadWaarde += key;
  }
  mobNumpadDisplay();
}

function mobSlaKassaOp(){
  if(!checkOnline()) return;
  const datum = document.getElementById('mob-kassa-datum')?.value;
  if(!datum){ toast('Selecteer een datum.','error'); return; }

  const begin = parseFloat(document.getElementById('mob-beginsaldo')?.value)||0;
  const eindsaldo = parseFloat(document.getElementById('mob-eindsaldo')?.value)||0;
  const notities = document.getElementById('mob-notities')?.value||'';
  const naam = _actieveKassier?.naam||'Kassier';

  // BTW berekening — identiek aan slaKassaOp desktop
  const kassaBtwTarief = parseInt(DB.profiel?.btwStandaard||'9');
  const omzetIncl = eindsaldo - begin;
  const omzetExcl = kassaBtwTarief > 0 ? omzetIncl / (1 + kassaBtwTarief / 100) : omzetIncl;
  const omzetBtw  = omzetIncl - omzetExcl;

  if(omzetIncl <= 0){ toast('Eindsaldo moet hoger zijn dan beginsaldo.','error'); return; }

  const nieuw = {
    id: 'kassa_'+Date.now(),
    datum,
    ingevoerdDoor: naam,
    ingevoerdOp: new Date().toISOString(),
    status: 'ingediend',
    beginsaldo: begin,
    eindsaldo: eindsaldo||0,
    verwacht: begin,
    verschil: eindsaldo ? eindsaldo-begin : 0,
    totContant: 0,
    totPin: 0,
    totUitgaven: 0,
    totaalOmzet: omzetExcl,      // excl BTW
    totaalOmzetIncl: omzetIncl,  // incl BTW
    omzetBtw,
    btwTarief: kassaBtwTarief,
    categorieen: [],
    uitgaven: [],
    notities,
  };

  if(!DB.kassalijsten) DB.kassalijsten=[];
  DB.kassalijsten.push(nieuw);
  slaKassalijstOpCloud(nieuw);
  localStorage.setItem(storageKey(), JSON.stringify(DB));
  toast('Kassalijst van '+datum+' ingediend. ✓','success');
  initMobKassa();
  mobNav('overzichten');
}

// ---- Facturen ----
function renderMobFacturen(){
  // Herlaad data vers uit Firebase voor actuele factuurinformatie
  if(window.FB && huidigBedrijf){
    fbAanroep(fb=>fb.laadAlles(huidigBedrijf)).then(json=>{
      try{
        const d = JSON.parse(json||'{}');
        if(d.verkoop) DB.verkoop = d.verkoop;
        if(d.inkoop) DB.inkoop = d.inkoop;
      }catch(e){}
      _renderMobFacturenIntern();
    }).catch(()=>_renderMobFacturenIntern());
  } else {
    _renderMobFacturenIntern();
  }
}

function _renderMobFacturenIntern(){
  const facturen = DB.verkoop||[];
  const nu = new Date();

  // Top klanten (op totaal betaald)
  const klantTotaal = {};
  facturen.forEach(f=>{
    const naam = f.klant||'Onbekend';
    klantTotaal[naam] = (klantTotaal[naam]||0) + (parseFloat(f.totaal)||0);
  });
  const topKlanten = Object.entries(klantTotaal)
    .sort((a,b)=>b[1]-a[1]).slice(0,5);

  const topEl = document.getElementById('mob-top-klanten');
  if(topEl){
    if(!topKlanten.length){
      topEl.innerHTML = '<div style="color:rgba(255,255,255,0.25);font-size:14px;padding:16px 0">Geen facturen gevonden.</div>';
    } else {
      topEl.innerHTML = topKlanten.map(([naam,totaal],i)=>`
        <div class="mob-lijst-item" style="cursor:default;">
          <div>
            <div class="mob-lijst-datum">#${i+1}</div>
            <div class="mob-lijst-bedrag" style="font-size:15px;">${naam}</div>
          </div>
          <span style="font-size:16px;font-weight:700;color:#34d399;">${mobFmtEur(totaal)}</span>
        </div>`).join('');
    }
  }

  // Vervallen facturen
  const vervallen = facturen.filter(f=>{
    if(!f.vervaldatum || f.status==='betaald') return false;
    return new Date(f.vervaldatum) < nu;
  }).sort((a,b)=>a.vervaldatum.localeCompare(b.vervaldatum));

  const vervalEl = document.getElementById('mob-vervallen');
  if(vervalEl){
    if(!vervallen.length){
      vervalEl.innerHTML = '<div style="color:rgba(255,255,255,0.25);font-size:14px;padding:16px 0">Geen vervallen facturen.</div>';
    } else {
      vervalEl.innerHTML = vervallen.slice(0,10).map(f=>{
        const dagen = Math.floor((nu - new Date(f.vervaldatum))/(1000*60*60*24));
        return `<div class="mob-lijst-item" style="cursor:default;">
          <div>
            <div class="mob-lijst-datum">${f.klant||'Onbekend'} · ${dagen} dag${dagen===1?'':'en'} over</div>
            <div class="mob-lijst-bedrag" style="font-size:15px;">${f.nummer||f.id}</div>
          </div>
          <span style="font-size:15px;font-weight:700;color:#f87171;">${mobFmtEur(f.openstaand||f.totaal||0)}</span>
        </div>`;
      }).join('');
    }
  }

  // Open facturen (niet betaald, niet vervallen)
  const open = facturen.filter(f=>{
    if(f.status==='betaald') return false;
    if(f.vervaldatum && new Date(f.vervaldatum) < nu) return false;
    return true;
  }).sort((a,b)=>(a.vervaldatum||'').localeCompare(b.vervaldatum||''));

  const openEl = document.getElementById('mob-open-facturen');
  if(openEl){
    if(!open.length){
      openEl.innerHTML = '<div style="color:rgba(255,255,255,0.25);font-size:14px;padding:16px 0">Geen openstaande facturen.</div>';
    } else {
      openEl.innerHTML = open.slice(0,10).map(f=>`
        <div class="mob-lijst-item" style="cursor:default;">
          <div>
            <div class="mob-lijst-datum">${f.klant||'Onbekend'}${f.vervaldatum?' · vervalt '+new Date(f.vervaldatum).toLocaleDateString('nl-NL',{day:'numeric',month:'short'}):''}</div>
            <div class="mob-lijst-bedrag" style="font-size:15px;">${f.nummer||f.id}</div>
          </div>
          <span style="font-size:15px;font-weight:700;color:#60a5fa;">${mobFmtEur(f.openstaand||f.totaal||0)}</span>
        </div>`).join('');
    }
  }
}

// ---- Uploads ----
let _mobHuidigBestand = null; // { naam, type, size, base64 }

function initMobUploads(){
  mobResetUpload();
  laadMobUploads();
}

// Max base64 grootte voor Firestore (~680KB origineel = ~900KB base64)
const UPLOAD_MAX_BASE64 = 900000;

function mobToonBestandPreview(naam, type, base64, origGrootte){
  _mobHuidigBestand = { naam, type, size: origGrootte, base64 };

  const preview = document.getElementById('mob-upload-preview');
  if(preview) preview.style.display = 'block';

  const naamEl = document.getElementById('mob-upload-bestandsnaam');
  if(naamEl) naamEl.textContent = naam;

  const groottEl = document.getElementById('mob-upload-bestandsgrootte');
  if(groottEl){
    const kb = Math.round(base64.length * 0.75 / 1024);
    const origKb = Math.round(origGrootte / 1024);
    if(kb < origKb - 10){
      groottEl.textContent = origKb+'KB → gecomprimeerd naar '+kb+'KB';
    } else {
      groottEl.textContent = kb < 1024 ? kb+'KB' : (kb/1024).toFixed(1)+'MB';
    }
  }

  const thumbEl = document.getElementById('mob-upload-thumb');
  if(thumbEl){
    if(type.startsWith('image/')){
      thumbEl.innerHTML = '<img src="'+base64+'" style="width:100%;height:100%;object-fit:cover;border-radius:10px;">';
    } else {
      thumbEl.innerHTML = '📄';
    }
  }
}

function mobComprimeerAfbeelding(dataUrl, maxBase64, kwaliteit, callback){
  const img = new Image();
  img.onload = function(){
    let breedte = img.width;
    let hoogte = img.height;
    // Verklein als te groot (max 1600px breed)
    const maxPx = 1600;
    if(breedte > maxPx){
      hoogte = Math.round(hoogte * maxPx / breedte);
      breedte = maxPx;
    }
    const canvas = document.createElement('canvas');
    canvas.width = breedte;
    canvas.height = hoogte;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, breedte, hoogte);
    let result = canvas.toDataURL('image/jpeg', kwaliteit);
    // Als nog steeds te groot: verklein verder
    if(result.length > maxBase64 && kwaliteit > 0.3){
      mobComprimeerAfbeelding(result, maxBase64, kwaliteit - 0.15, callback);
    } else {
      callback(result);
    }
  };
  img.src = dataUrl;
}

function mobFileGekozen(input){
  const file = input.files[0];
  if(!file) return;

  const maxMB = 20;
  if(file.size > maxMB * 1024 * 1024){
    toast('Bestand is te groot (max '+maxMB+'MB).','error');
    input.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e){
    const dataUrl = e.target.result;

    if(file.type.startsWith('image/')){
      // Afbeelding: automatisch comprimeren als te groot
      if(dataUrl.length > UPLOAD_MAX_BASE64){
        toast('Afbeelding wordt gecomprimeerd...', 'laden');
        mobComprimeerAfbeelding(dataUrl, UPLOAD_MAX_BASE64, 0.75, function(gecomprimeerd){
          if(gecomprimeerd.length > UPLOAD_MAX_BASE64){
            toast('Foto is na compressie nog te groot. Maak een kleinere foto.','error');
            input.value = '';
            return;
          }
          mobToonBestandPreview(file.name, file.type, gecomprimeerd, file.size);
        });
      } else {
        mobToonBestandPreview(file.name, file.type, dataUrl, file.size);
      }
    } else if(file.type === 'application/pdf'){
      // PDF: niet comprimeerbaar, check grootte
      if(dataUrl.length > UPLOAD_MAX_BASE64){
        const mb = (file.size/1024/1024).toFixed(1);
        toast('PDF is te groot ('+mb+'MB). Gebruik een kleinere PDF of comprimeer hem eerst.','error');
        input.value = '';
        return;
      }
      mobToonBestandPreview(file.name, file.type, dataUrl, file.size);
    } else {
      // Ander type: gewoon proberen
      if(dataUrl.length > UPLOAD_MAX_BASE64){
        toast('Bestand is te groot voor upload (max ~650KB).','error');
        input.value = '';
        return;
      }
      mobToonBestandPreview(file.name, file.type, dataUrl, file.size);
    }
  };
  reader.readAsDataURL(file);
}

function mobResetUpload(){
  _mobHuidigBestand = null;
  const preview = document.getElementById('mob-upload-preview');
  if(preview) preview.style.display = 'none';
  const input = document.getElementById('mob-file-input');
  if(input) input.value = '';
  const omschr = document.getElementById('mob-upload-omschrijving');
  if(omschr) omschr.value = '';
}

function mobStuurUpload(){
  if(!checkOnline()) return;
  if(!_mobHuidigBestand){ toast('Kies eerst een bestand.','error'); return; }
  const btn = document.getElementById('mob-upload-btn');

  function herstelKnop(){
    if(btn){ btn.disabled=false; btn.textContent='⬆  Uploaden'; }
  }

  // PDF waarschuwing — niet comprimeerbaar, kan te groot zijn
  if((_mobHuidigBestand.type||'').includes('pdf')){
    const kb = Math.round((_mobHuidigBestand.base64||'').length * 0.75 / 1024);
    if(kb > 600){
      toast(`PDF te groot (${kb}KB). Maak een foto van het document in plaats van PDF upload.`,'error');
      return;
    }
  }

  if(btn){ btn.disabled = true; btn.textContent = 'Bezig...'; }

  const omschr = document.getElementById('mob-upload-omschrijving')?.value||'';
  const bonData = {
    id: 'bon_'+Date.now(),
    naam: _mobHuidigBestand.naam,
    type: _mobHuidigBestand.type,
    bestand: _mobHuidigBestand.base64,
    omschrijving: omschr,
    uploadedBy: _actieveKassier?.naam||'Kassier',
    uploadedAt: new Date().toISOString()
  };

  // Timeout na 30 seconden
  const timeout = setTimeout(()=>{
    toast('Upload time-out. Probeer opnieuw.','error');
    herstelKnop();
  }, 30000);

  // Check bestandsgrootte vóór upload — Firestore limiet ~650KB
  const base64Bytes = Math.round((_mobHuidigBestand.base64||'').length * 0.75);
  const maxBytes = 650000;
  if(base64Bytes > maxBytes){
    const kb = Math.round(base64Bytes / 1024);
    toast(`Bestand te groot (${kb}KB). Maximum is 650KB. Maak een kleinere foto of gebruik JPEG.`, 'error');
    herstelKnop();
    return;
  }

  fbAanroep(fb=>fb.uploadBon(huidigBedrijf, JSON.stringify(bonData)))
    .then(json=>{
      clearTimeout(timeout);
      try{
        const r = JSON.parse(json||'{}');
        if(r.ok){
          toast('Geüpload: '+r.naam+' ✓','success');
          mobResetUpload();
          laadMobUploads();
        } else {
          toast('Upload mislukt — probeer opnieuw.','error');
        }
      }catch(e){ toast('Upload mislukt.','error'); }
      herstelKnop();
    })
    .catch(err=>{
      clearTimeout(timeout);
      const msg = err?.message||'';
      if(msg.includes('te groot') || msg.includes('size')){
        toast('Bestand te groot. Gebruik een kleinere afbeelding (max 650KB).','error');
      } else {
        toast('Geen verbinding. Verbind met internet en probeer opnieuw.','error');
      }
      herstelKnop();
    });
}

function laadMobUploads(){
  const listEl = document.getElementById('mob-uploads-lijst');
  if(!listEl) return;
  listEl.innerHTML = '<div style="color:rgba(255,255,255,0.25);font-size:14px;text-align:center;padding:24px 0;">Laden...</div>';

  fbAanroep(fb=>fb.laadUploads(huidigBedrijf))
    .then(json=>{
      try{
        const uploads = JSON.parse(json||'[]');
        console.log('[Bonnen] Kassier ziet '+uploads.length+' uploads voor bedrijf: '+huidigBedrijf);
        renderMobUploadsList(uploads);
      }catch(e){ renderMobUploadsList([]); }
    })
    .catch(()=>renderMobUploadsList([]));
}

function renderMobUploadsList(uploads){
  const listEl = document.getElementById('mob-uploads-lijst');
  if(!listEl) return;
  if(!uploads.length){
    listEl.innerHTML = '<div style="color:rgba(255,255,255,0.25);font-size:14px;text-align:center;padding:24px 0;">Nog geen uploads.</div>';
    return;
  }
  window._mobBonnenData = uploads;
  listEl.innerHTML = uploads.slice(0,20).map((u,i)=>{
    const datum = u.uploadedAt ? new Date(u.uploadedAt).toLocaleDateString('nl-NL',{day:'numeric',month:'short'}) : '-';
    const isAfb = (u.type||'').startsWith('image/');
    const icon = isAfb ? '&#128444;' : '&#128196;';
    const heeftUrl = !!(u.bestandData || u.viewUrl);
    return '<div onclick="mobOpenBon('+i+')" style="'
      +'display:flex;align-items:flex-start;gap:10px;'
      +'background:rgba(255,255,255,0.05);'
      +'border:1px solid rgba(255,255,255,0.08);'
      +'border-radius:12px;padding:14px 12px;margin-bottom:10px;'
      +'cursor:'+(heeftUrl?'pointer':'default')+';">'
      +'<div style="font-size:26px;flex-shrink:0;line-height:1.2;">'+icon+'</div>'
      +'<div style="flex:1;min-width:0;overflow:hidden;">'
        +'<div style="font-size:13px;font-weight:600;color:#fff;'
          +'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'
          +'margin-bottom:4px;">'+(u.naam||'Onbekend')+'</div>'
        +(u.omschrijving
          ? '<div style="font-size:12px;color:rgba(255,255,255,0.55);'
            +'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'
            +'margin-bottom:4px;">'+u.omschrijving+'</div>'
          : '')
        +'<div style="font-size:11px;color:rgba(255,255,255,0.3);">'
          +datum+(u.uploadedBy?' &middot; '+u.uploadedBy:'')
        +'</div>'
      +'</div>'
      +(heeftUrl ? '<div style="font-size:13px;color:rgba(255,255,255,0.3);flex-shrink:0;padding-top:3px;padding-left:6px;">&#8599;</div>' : '')
    +'</div>';
  }).join('');
}

function mobOpenBon(idx){
  const bon = (window._mobBonnenData||[])[idx];
  if(!bon) return;
  const url = bon.bestandData || bon.viewUrl || '';
  if(!url){ toast('Bestand niet beschikbaar.','warning'); return; }
  try{
    const w = window.open('','_blank');
    if((bon.type||'').startsWith('image/')){
      w.document.write('<html><body style="margin:0;background:#000;display:flex;justify-content:center;align-items:center;min-height:100vh;"><img src="'+url+'" style="max-width:100%;max-height:100vh;object-fit:contain;"></body></html>');
    } else {
      w.document.write('<html><body style="margin:0;height:100vh;"><embed src="'+url+'" width="100%" height="100%" type="application/pdf"></body></html>');
    }
    w.document.close();
  }catch(e){ toast('Kan bestand niet openen.','error'); }
}

// ---- Overzichten ----
function mobSetFilter(filter){
  _mobFilter = filter;
  document.querySelectorAll('.mob-filter-pill').forEach(el=>{
    el.classList.toggle('active', el.getAttribute('onclick')==="mobSetFilter('"+filter+"')");
  });
  renderMobOverzichten();
}

function renderMobOverzichten(){
  const listEl = document.getElementById('mob-overzicht-lijst');
  if(!listEl) return;
  let lijsten = [...(DB.kassalijsten||[])].sort((a,b)=>(b.datum||'').localeCompare(a.datum||''));
  if(_mobFilter) lijsten = lijsten.filter(l=>l.status===_mobFilter);
  if(!lijsten.length){
    listEl.innerHTML = '<div style="color:rgba(255,255,255,0.25);font-size:14px;text-align:center;padding:32px 0">Geen kassalijsten gevonden.</div>';
    return;
  }
  listEl.innerHTML = lijsten.map(l=>{
    const statusClass = l.status==='goedgekeurd'?'goed':l.status==='afgekeurd'?'afgekeurd':l.status==='ingediend'?'ingediend':'open';
    const statusLabel = {goedgekeurd:'Goedgekeurd',afgekeurd:'Afgekeurd',ingediend:'Ingediend',open:'Openstaand'}[l.status]||l.status;
    const datum = l.datum?new Date(l.datum).toLocaleDateString('nl-NL',{weekday:'short',day:'numeric',month:'short'}):'-';
    return '<div class="mob-lijst-item" onclick="mobOpenDetail(\''+l.id+'\')"><div><div class="mob-lijst-datum">'+datum+'</div><div class="mob-lijst-bedrag">'+mobFmtEur(l.totaalOmzet||0)+'</div></div><span class="mob-lijst-status '+statusClass+'">'+statusLabel+'</span></div>';
  }).join('');
}

function mobOpenDetail(id){
  const l = (DB.kassalijsten||[]).find(x=>x.id===id);
  if(!l) return;
  const overlay = document.getElementById('mob-detail-overlay');
  const contentEl = document.getElementById('mob-detail-content');
  if(!overlay||!contentEl) return;
  const datum = l.datum?new Date(l.datum).toLocaleDateString('nl-NL',{weekday:'long',day:'numeric',month:'long',year:'numeric'}):'-';
  const statusLabel = {goedgekeurd:'Goedgekeurd',afgekeurd:'Afgekeurd',ingediend:'Ingediend',open:'Openstaand'}[l.status]||l.status;
  let regelsHTML = '';
  if(l.categorieen?.length){
    regelsHTML += '<div style="margin-top:16px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:rgba(255,255,255,.35);margin-bottom:8px;">Diensten</div>';
    l.categorieen.forEach(c=>{
      if((parseFloat(c.contant)||0)+(parseFloat(c.pin)||0)>0){
        regelsHTML += '<div class="mob-detail-row"><span>'+c.naam+'</span><span>'+mobFmtEur((parseFloat(c.contant)||0)+(parseFloat(c.pin)||0))+'</span></div>';
      }
    });
  }
  contentEl.innerHTML = '<div class="mob-detail-titel">Kassalijst</div>'
    +'<div class="mob-detail-row"><span>Datum</span><span>'+datum+'</span></div>'
    +'<div class="mob-detail-row"><span>Omzet excl. BTW</span><span>'+mobFmtEur(l.totaalOmzet||0)+'</span></div>'
    +(l.totaalOmzetIncl?'<div class="mob-detail-row"><span>Omzet incl. BTW</span><span>'+mobFmtEur(l.totaalOmzetIncl)+'</span></div>':'')
    +(l.omzetBtw?'<div class="mob-detail-row"><span>BTW '+(l.btwTarief||9)+'%</span><span>'+mobFmtEur(l.omzetBtw)+'</span></div>':'')
    +'<div class="mob-detail-row"><span>Status</span><span>'+statusLabel+'</span></div>'
    +(l.ingevoerdDoor?'<div class="mob-detail-row"><span>Ingevoerd door</span><span>'+l.ingevoerdDoor+'</span></div>':'')
    +(l.notities?'<div class="mob-detail-row"><span>Notities</span><span style="max-width:180px;text-align:right;">'+l.notities+'</span></div>':'')
    +regelsHTML;
  overlay.classList.add('open');
}

function mobSluitDetail(e){
  if(e.target===document.getElementById('mob-detail-overlay')){
    document.getElementById('mob-detail-overlay').classList.remove('open');
  }
}


