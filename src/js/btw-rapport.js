// ===== GROOTBOEK =====
let gbEditId=null;

function openGBModal(editId){
  gbEditId=editId||null; // null = nieuw, string = bewerken
  if(editId){
    const g=DB.grootboek.find(g=>g.id===editId);
    if(!g) return;
    document.getElementById('gb-nr').value=g.nummer;
    document.getElementById('gb-naam').value=g.naam;
    document.getElementById('gb-type').value=g.type;
    document.getElementById('gb-saldo').value=parseFloat(g.saldo||0).toFixed(2);
    document.querySelector('#modal-gb .modal-header h3').textContent='Rekening bewerken';
  } else {
    ['gb-nr','gb-naam','gb-saldo'].forEach(i=>document.getElementById(i).value='');
    document.getElementById('gb-type').value='activa';
    document.querySelector('#modal-gb .modal-header h3').textContent='Nieuwe Grootboekrekening';
  }
  openModal('modal-gb');
}

function slaGBOp(){
  const nr=document.getElementById('gb-nr').value.trim();
  const naam=document.getElementById('gb-naam').value.trim();
  const type=document.getElementById('gb-type').value;

  // Blokkeer dubbele rekeningnummers
  const bestaandNr = DB.grootboek.find(g=>g.nummer===nr && g.id!==gbEditId);
  if(bestaandNr){ toast(`Rekeningnummer ${nr} bestaat al — ${bestaandNr.naam}.`,'error'); return; }
  const saldo=parseFloat(document.getElementById('gb-saldo').value)||0;
  if(!nr||!naam){toast('Vul nummer en naam in.','error');return;}
  if(gbEditId){
    const g=DB.grootboek.find(g=>g.id===gbEditId);
    if(g){
      const oudSaldo = parseFloat(g.saldo)||0;
      const saldoVerschil = saldo - oudSaldo;
      g.nummer=nr; g.naam=naam; g.type=type; g.saldo=saldo;

      // Maak memoriaalboeking als saldo veranderd is — audit trail
      if(Math.abs(saldoVerschil) > 0.005){
        if(!DB.memoriaal) DB.memoriaal=[];
        // Gebruik eigen vermogen als tegenrekening voor opening saldi
        const evRek = DB.grootboek.find(r=>r.nummer==='3000'&&r.id!==gbEditId)
                   || DB.grootboek.find(r=>r.type==='eigen_vermogen'&&r.id!==gbEditId);
        if(evRek){
          const isDebet = ['vaste_activa','vlottende_activa','activa','kosten'].includes(g.type);
          evRek.saldo = (parseFloat(evRek.saldo)||0) - saldoVerschil;
          DB.memoriaal.push({
            id:uid(),
            datum:today(),
            oms:`Opening saldo aanpassing — ${g.naam}`,
            type:'opening_saldo',
            relatie:'',
            regels:[
              {dc:isDebet?'debet':'credit', gbId:g.id,     oms:`Opening saldo ${g.naam}`,         bedrag:Math.abs(saldoVerschil)},
              {dc:isDebet?'credit':'debet', gbId:evRek.id, oms:`Tegenrekening eigen vermogen`,    bedrag:Math.abs(saldoVerschil)},
            ],
            debet:Math.abs(saldoVerschil),
            aangemaakt:new Date().toISOString()
          });
        }
      }
    } else {
      DB.grootboek.push({id:uid(),nummer:nr,naam:naam,type,saldo});
    }
  } else {
    // Nieuwe rekening met opening saldo
    const nieuwId = uid();
    DB.grootboek.push({id:nieuwId,nummer:nr,naam:naam,type,saldo});
    if(Math.abs(saldo) > 0.005){
      if(!DB.memoriaal) DB.memoriaal=[];
      const evRek = DB.grootboek.find(r=>r.type==='eigen_vermogen'&&r.id!==nieuwId);
      if(evRek){
        const isDebet = ['vaste_activa','vlottende_activa','activa','kosten'].includes(type);
        evRek.saldo = (parseFloat(evRek.saldo)||0) - saldo;
        DB.memoriaal.push({
          id:uid(),
          datum:today(),
          oms:`Opening saldo — ${naam}`,
          type:'opening_saldo',
          relatie:'',
          regels:[
            {dc:isDebet?'debet':'credit', gbId:nieuwId,   oms:`Opening saldo ${naam}`,         bedrag:Math.abs(saldo)},
            {dc:isDebet?'credit':'debet', gbId:evRek.id,  oms:`Tegenrekening eigen vermogen`,  bedrag:Math.abs(saldo)},
          ],
          debet:Math.abs(saldo),
          aangemaakt:new Date().toISOString()
        });
      }
    }
  }
  gbEditId=null;
  DB.grootboek.sort((a,b)=>a.nummer.localeCompare(b.nummer));
  save();closeModal('modal-gb');renderGB();toast('Grootboekrekening opgeslagen.');
}

async function verwijderGB(id){
  const g = DB.grootboek.find(g=>g.id===id);
  if(!g) return;

  // Blokkeer als rekening nog in gebruik is bij facturen of transacties
  const inGebruikVerkoop = DB.verkoop.some(f=>(f.regels||[]).some(r=>r.gbId===id));
  const inGebruikInkoop  = DB.inkoop.some(f=>(f.regels||[]).some(r=>r.gbId===id));
  const inGebruikT = DB.transacties.some(t=>t.bankGbId===id);
  const inGebruikVA = (DB.vasteActiva||[]).some(a=>a.gbActivaId===id||a.gbKostenId===id||a.gbAccumId===id);

  if(inGebruikVerkoop||inGebruikInkoop||inGebruikT||inGebruikVA){
    toast(`Rekening "${g.naam}" kan niet worden verwijderd — nog in gebruik bij facturen, transacties of vaste activa.`,'error');
    return;
  }

  const saldo = parseFloat(g.saldo)||0;
  if(Math.abs(saldo) > 0.01){
    toast(`Rekening "${g.naam}" heeft nog een saldo van ${fmt(saldo)} en kan niet worden verwijderd.`,'error');
    return;
  }

  const ok=await bevestig(`Grootboekrekening "${g.naam}" permanent verwijderen?`,'Rekening verwijderen','Verwijderen');
  if(!ok) return;
  DB.grootboek=DB.grootboek.filter(g=>g.id!==id);
  save();renderGB();toast('Rekening verwijderd.','info');
}

function renderGB(){
  const tl={vaste_activa:'Vaste activa',vlottende_activa:'Vlottende activa',activa:'Activa',passiva:'Passiva',eigen_vermogen:'Eigen vermogen',omzet:'Omzet',kosten:'Kosten'};
  const tb={vaste_activa:'badge-blue',vlottende_activa:'badge-gray',activa:'badge-blue',passiva:'badge-orange',eigen_vermogen:'badge-gray',omzet:'badge-green',kosten:'badge-red'};
  document.getElementById('tbody-gb').innerHTML=[...DB.grootboek].sort((a,b)=>a.nummer.localeCompare(b.nummer,undefined,{numeric:true})).map(g=>`<tr>
    <td class="mono">${g.nummer}</td>
    <td>${g.naam}</td>
    <td><span class="badge ${tb[g.type]||'badge-gray'}">${tl[g.type]||g.type}</span></td>
    <td class="mono ${parseFloat(g.saldo)<0?'amount-neg':''}">${fmt(g.saldo)}</td>
    <td style="white-space:nowrap;">
      <button class="btn btn-secondary btn-sm" onclick="openGrootboekkaart('${g.id}')">Kaart</button>
      <button class="btn btn-secondary btn-sm" onclick="openGBModal('${g.id}')">Bewerk</button>
      <button class="btn btn-danger btn-sm" onclick="verwijderGB('${g.id}')">✕</button>
    </td>
  </tr>`).join('');
}

// ===== MUTATIES =====
let mutFilter={zoek:'',type:'',gb:'',van:'',tm:''};
let mutPagina=1;
const MUT_PER_PAGINA=50;

function bouwMutatiesLijst(){
  // Bouw een gecombineerde lijst van alle boekingen uit transacties + facturen
  const lijst=[];

  // 1. Alle gekoppelde transacties
  DB.transacties.filter(t=>t.status==='gekoppeld').forEach(t=>{
    const bedrag=parseFloat(t.bedrag);
    lijst.push({
      datum:t.datum,
      type:t.gekoppeldType,
      omschrijving:t.omschrijving,
      gekoppeldAan:t.gekoppeldAan||'—',
      debet:bedrag>0?bedrag:0,
      credit:bedrag<0?Math.abs(bedrag):0,
      effect:bedrag,
      id:t.id
    });
  });

  // 2. Alle ongekoppelde transacties (ook tonen, maar als concept)
  DB.transacties.filter(t=>t.status==='ongekoppeld').forEach(t=>{
    const bedrag=parseFloat(t.bedrag);
    lijst.push({
      datum:t.datum,
      type:'ongekoppeld',
      omschrijving:t.omschrijving,
      gekoppeldAan:'—',
      debet:bedrag>0?bedrag:0,
      credit:bedrag<0?Math.abs(bedrag):0,
      effect:bedrag,
      id:t.id
    });
  });

  // Sorteer nieuwste eerst
  return lijst.sort((a,b)=>b.datum.localeCompare(a.datum));
}

function renderMutaties(reset){
  if(reset) mutPagina=1;

  // Vul GB filter
  const gbSel=document.getElementById('mut-gb-filter');
  if(gbSel&&gbSel.options.length<=1){
    DB.grootboek.forEach(g=>{
      const opt=document.createElement('option');
      opt.value=g.naam; opt.textContent=g.nummer+' — '+g.naam;
      gbSel.appendChild(opt);
    });
  }

  let lijst=bouwMutatiesLijst();

  // Filters
  if(mutFilter.zoek) lijst=lijst.filter(m=>m.omschrijving.toLowerCase().includes(mutFilter.zoek.toLowerCase())||m.gekoppeldAan.toLowerCase().includes(mutFilter.zoek.toLowerCase()));
  if(mutFilter.type) lijst=lijst.filter(m=>m.type===mutFilter.type);
  if(mutFilter.gb) lijst=lijst.filter(m=>m.gekoppeldAan.includes(mutFilter.gb));
  if(mutFilter.van) lijst=lijst.filter(m=>m.datum>=mutFilter.van);
  if(mutFilter.tm) lijst=lijst.filter(m=>m.datum<=mutFilter.tm);

  const totaal=lijst.length;
  const totaalPag=Math.max(1,Math.ceil(totaal/MUT_PER_PAGINA));
  if(mutPagina>totaalPag) mutPagina=totaalPag;
  const start=(mutPagina-1)*MUT_PER_PAGINA;
  const pagina=lijst.slice(start,start+MUT_PER_PAGINA);

  const typeBadge={
    verkoop:`<span class="badge badge-green">Verkoop</span>`,
    inkoop:`<span class="badge badge-orange">Inkoop</span>`,
    grootboek:`<span class="badge badge-blue">Grootboek</span>`,
    ongekoppeld:`<span class="badge badge-gray">Ongekoppeld</span>`
  };

  const tbody=document.getElementById('mut-tbody');
  if(!totaal){
    tbody.innerHTML='<tr><td colspan="7"><div class="empty"><p>Geen mutaties gevonden</p></div></td></tr>';
    document.getElementById('mut-paginering').innerHTML='';
    return;
  }

  tbody.innerHTML=pagina.map(m=>`<tr>
    <td>${m.datum}</td>
    <td>${typeBadge[m.type]||'<span class="badge badge-gray">'+m.type+'</span>'}</td>
    <td style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${m.omschrijving}">${m.omschrijving}</td>
    <td style="font-size:12px;color:var(--text-dim);">${m.gekoppeldAan}</td>
    <td class="mono amount-pos">${m.debet>0?fmt(m.debet):'—'}</td>
    <td class="mono amount-neg">${m.credit>0?fmt(m.credit):'—'}</td>
    <td class="mono ${m.effect>=0?'amount-pos':'amount-neg'}">${fmt(m.effect)}</td>
  </tr>`).join('');

  // Paginering
  const van=start+1; const tot=Math.min(start+MUT_PER_PAGINA,totaal);
  let pagNav=`<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;margin-top:8px;border-top:1px solid var(--border);">
    <span style="font-size:12px;color:var(--text-dim);font-family:var(--mono);">${van}–${tot} van ${totaal}</span>
    <div style="display:flex;gap:6px;">
      <button class="btn btn-secondary btn-sm" onclick="mutGaPagina(1)" ${mutPagina===1?'disabled':''}>«</button>
      <button class="btn btn-secondary btn-sm" onclick="mutGaPagina(${mutPagina-1})" ${mutPagina===1?'disabled':''}>‹</button>`;
  const sp=Math.max(1,mutPagina-2); const ep=Math.min(totaalPag,sp+4);
  for(let p=sp;p<=ep;p++) pagNav+=`<button class="btn btn-sm ${p===mutPagina?'btn-primary':'btn-secondary'}" onclick="mutGaPagina(${p})">${p}</button>`;
  pagNav+=`<button class="btn btn-secondary btn-sm" onclick="mutGaPagina(${mutPagina+1})" ${mutPagina===totaalPag?'disabled':''}>›</button>
      <button class="btn btn-secondary btn-sm" onclick="mutGaPagina(${totaalPag})" ${mutPagina===totaalPag?'disabled':''}>»</button>
    </div></div>`;
  document.getElementById('mut-paginering').innerHTML=pagNav;
}

function mutGaPagina(p){ mutPagina=p; renderMutaties(false); }

// ===== OPEN POSTEN =====
let opTab='vk';

function switchOPTab(tab){
  opTab=tab;
  document.getElementById('op-tab-vk').classList.toggle('active',tab==='vk');
  document.getElementById('op-tab-ik').classList.toggle('active',tab==='ik');
  document.getElementById('op-vk-wrap').style.display=tab==='vk'?'':'none';
  document.getElementById('op-ik-wrap').style.display=tab==='ik'?'':'none';
}

function dagenOpen(vervaldatum){
  if(!vervaldatum) return null;
  const nu=new Date();
  const vd=new Date(vervaldatum.split('/').reverse().join('-')||vervaldatum);
  if(isNaN(vd)) return null;
  return Math.floor((nu-vd)/(1000*60*60*24));
}

function dagenBadge(dagen){
  if(dagen===null) return '<span class="badge badge-gray">—</span>';
  if(dagen<0) return `<span class="badge badge-green">${Math.abs(dagen)}d resterend</span>`;
  if(dagen===0) return '<span class="badge badge-orange">Vandaag</span>';
  return `<span class="badge badge-red">${dagen}d verlopen</span>`;
}

function renderOpenPosten(){
  const nu=new Date();

  // Verkoop — niet betaald
  const openVK=DB.verkoop.filter(f=>f.status!=='betaald');
  const openIK=DB.inkoop.filter(f=>f.status!=='betaald');

  // Stats
  const teOntvangen=openVK.reduce((a,f)=>a+parseFloat(f.totaalIncl||0),0);
  const teBetalen=openIK.reduce((a,f)=>a+parseFloat(f.totaalIncl||0),0);
  const vervallenVK=openVK.filter(f=>{ const d=dagenOpen(f.vervaldatum); return d!==null&&d>0; }).length;
  const vervallenIK=openIK.filter(f=>{ const d=dagenOpen(f.vervaldatum); return d!==null&&d>0; }).length;

  document.getElementById('op-te-ontvangen').textContent=fmt(teOntvangen);
  document.getElementById('op-te-betalen').textContent=fmt(teBetalen);
  document.getElementById('op-vervallen-vk').textContent=vervallenVK;
  document.getElementById('op-vervallen-ik').textContent=vervallenIK;

  // Sorteer op vervaldatum oplopend (oudste eerst)
  const sorteer=(arr)=>[...arr].sort((a,b)=>{
    const da=new Date(a.vervaldatum); const db=new Date(b.vervaldatum);
    return da-db;
  });

  // Verkoop tabel
  const vkBody=document.getElementById('op-vk-tbody');
  const sortedVK=sorteer(openVK);
  if(!sortedVK.length){
    vkBody.innerHTML='<tr><td colspan="8"><div class="empty"><p>Geen openstaande verkoopfacturen</p></div></td></tr>';
  } else {
    vkBody.innerHTML=sortedVK.map(f=>{
      const dagen=dagenOpen(f.vervaldatum);
      const rowStyle=dagen!==null&&dagen>0?'background:rgba(255,68,68,.04);':'';
      return `<tr style="${rowStyle}">
        <td class="mono">${f.nummer}</td>
        <td>${f.klant}</td>
        <td>${f.datum}</td>
        <td>${f.vervaldatum||'—'}</td>
        <td class="mono amount-pos"><strong>${fmt(f.totaalIncl)}</strong></td>
        <td class="mono" style="font-size:11px;color:var(--text-mid);">${f.restBedrag>0?'Rest: '+fmt(f.restBedrag):''}</td>
        <td>${badge(f.status)}</td>
        <td>${dagenBadge(dagen)}</td>
        <td><button class="btn btn-secondary btn-sm" onclick="showPage('verkoop')">Bekijk</button></td>
      </tr>`;
    }).join('');
  }

  // Inkoop tabel
  const ikBody=document.getElementById('op-ik-tbody');
  const sortedIK=sorteer(openIK);
  if(!sortedIK.length){
    ikBody.innerHTML='<tr><td colspan="8"><div class="empty"><p>Geen openstaande inkoopfacturen</p></div></td></tr>';
  } else {
    ikBody.innerHTML=sortedIK.map(f=>{
      const dagen=dagenOpen(f.vervaldatum);
      const rowStyle=dagen!==null&&dagen>0?'background:rgba(255,68,68,.04);':'';
      return `<tr style="${rowStyle}">
        <td class="mono">${f.nummer}</td>
        <td>${f.klant}</td>
        <td>${f.datum}</td>
        <td>${f.vervaldatum||'—'}</td>
        <td class="mono amount-neg"><strong>${fmt(f.totaalIncl)}</strong></td>
        <td>${badge(f.status)}</td>
        <td>${dagenBadge(dagen)}</td>
        <td><button class="btn btn-secondary btn-sm" onclick="showPage('inkoop')">Bekijk</button></td>
      </tr>`;
    }).join('');
  }
}

// ===== BALANS =====
function renderBalans(){
  const vlottendeActiva = DB.grootboek.filter(g=>g.type==='vlottende_activa');
  const overigeActiva   = DB.grootboek.filter(g=>g.type==='activa');
  const passiva         = DB.grootboek.filter(g=>g.type==='passiva'&&
    !g.naam?.toLowerCase().includes('accum')&&
    !g.naam?.toLowerCase().includes('afschr')
  );
  const eigenVermogen   = DB.grootboek.filter(g=>g.type==='eigen_vermogen');

  // Koppel elk vaste activa rekening aan zijn accumuleerde afschrijving
  // via vasteActiva DB (factuurId -> gbActivaId, gbAccumId)
  const vasteActivaRek = DB.grootboek.filter(g=>g.type==='vaste_activa');

  // Bouw een map: gbActivaId -> gbAccumId (via vasteActiva lijst)
  const activaAccumMap = {}; // gbActivaId -> [accumRekening, ...]
  (DB.vasteActiva||[]).forEach(a=>{
    if(a.gbActivaId && a.gbAccumId){
      if(!activaAccumMap[a.gbActivaId]) activaAccumMap[a.gbActivaId] = new Set();
      activaAccumMap[a.gbActivaId].add(a.gbAccumId);
    }
  });

  // Alle accum rekeningen die al gekoppeld zijn via activaAccumMap
  const gekoppeldeAccumIds = new Set(
    Object.values(activaAccumMap).flatMap(s=>[...s])
  );

  // Ongekoppelde accum rekeningen (globaal, niet per activum)
  const ongekoppeldeAccum = DB.grootboek.filter(g=>
    !gekoppeldeAccumIds.has(g.id) &&
    (g.naam?.toLowerCase().includes('accum') ||
    (g.naam?.toLowerCase().includes('afschr') && g.type==='passiva'))
  );

  // Bereken totalen
  let totVasteActiva = 0;
  vasteActivaRek.forEach(g=>{
    const accumIds = activaAccumMap[g.id]||new Set();
    const accumTot = [...accumIds].reduce((a,id)=>{
      const ar = DB.grootboek.find(r=>r.id===id);
      return a + Math.abs(parseFloat(ar?.saldo||0));
    }, 0);
    totVasteActiva += parseFloat(g.saldo||0) - accumTot;
  });
  // Ongekoppelde accum ook aftrekken van totaal
  const ongekoppeldeAccumTot = ongekoppeldeAccum.reduce((a,g)=>a+Math.abs(parseFloat(g.saldo||0)),0);
  totVasteActiva -= ongekoppeldeAccumTot;

  const vlottendTotaal = vlottendeActiva.reduce((a,g)=>a+parseFloat(g.saldo||0),0);
  const overigeActivaTotaal = overigeActiva.reduce((a,g)=>a+parseFloat(g.saldo||0),0);
  const totActiva = totVasteActiva + vlottendTotaal + overigeActivaTotaal;
  const totPassiva = passiva.reduce((a,g)=>a+parseFloat(g.saldo||0),0);
  const totEV = eigenVermogen.reduce((a,g)=>a+parseFloat(g.saldo||0),0);
  // Resultaat boekjaar (winst/verlies) hoort bij het eigen vermogen op de
  // passiva-kant. Omzet- en kostenrekeningen staan niet los op de balans, maar
  // hun saldo (omzet − kosten) moet wél meetellen — anders lijkt de balans
  // scheef ter grootte van de nog niet naar EV verwerkte winst.
  const totOmzet = DB.grootboek.filter(g=>g.type==='omzet').reduce((a,g)=>a+parseFloat(g.saldo||0),0);
  const totKosten = DB.grootboek.filter(g=>g.type==='kosten').reduce((a,g)=>a+parseFloat(g.saldo||0),0);
  const resultaat = totOmzet - totKosten;

  // ── ACTIVA HTML ──
  let activaHTML = '';

  if(vasteActivaRek.length){
    activaHTML += `<div class="report-row subtotal" style="margin-top:4px;"><span>Vaste activa</span><span></span></div>`;

    vasteActivaRek.forEach(g=>{
      const aanschaf = parseFloat(g.saldo||0);
      const accumIds = activaAccumMap[g.id]||new Set();
      let accumTot = 0;

      // Toon het actief
      activaHTML += `<div class="report-row" style="cursor:pointer;" onclick="openGrootboekkaart('${g.id}')" title="Bekijk grootboekkaart">
        <span class="indent" style="font-weight:500;">${g.nummer} — ${g.naam}</span>
        <span class="mono">${fmt(aanschaf)}</span>
      </div>`;

      // Toon elke bijbehorende accumuleerde afschrijving eronder
      [...accumIds].forEach(accumId=>{
        const ar = DB.grootboek.find(r=>r.id===accumId);
        if(!ar) return;
        const bedrag = Math.abs(parseFloat(ar.saldo||0));
        accumTot += bedrag;
        activaHTML += `<div class="report-row" style="padding-left:8px;">
          <span class="indent" style="color:var(--danger);font-size:12px;">
            ${ar.nummer} — ${ar.naam}
            <span style="font-size:10px;color:var(--text-dim);margin-left:4px;">(contra-activa)</span>
          </span>
          <span class="mono" style="color:var(--danger);">- ${fmt(bedrag)}</span>
        </div>`;
      });

      // Boekwaarde regel als er afschrijvingen zijn
      if(accumTot > 0){
        activaHTML += `<div class="report-row" style="border-top:1px dashed var(--border);margin-left:16px;padding-top:5px;margin-bottom:8px;">
          <span class="indent" style="font-weight:600;font-size:12px;">Boekwaarde ${g.naam}</span>
          <span class="mono" style="font-weight:600;">${fmt(aanschaf - accumTot)}</span>
        </div>`;
      }
    });

    // Ongekoppelde accum rekeningen onderaan vaste activa
    if(ongekoppeldeAccum.length){
      ongekoppeldeAccum.forEach(g=>{
        activaHTML += `<div class="report-row">
          <span class="indent" style="color:var(--danger);font-size:12px;">
            ${g.nummer} — ${g.naam}
            <span style="font-size:10px;color:var(--text-dim);margin-left:4px;">(contra-activa)</span>
          </span>
          <span class="mono" style="color:var(--danger);">- ${fmt(Math.abs(parseFloat(g.saldo||0)))}</span>
        </div>`;
      });
    }

    activaHTML += `<div class="report-row subtotal" style="margin-top:4px;">
      <span>Totaal vaste activa (boekwaarde)</span>
      <span class="mono">${fmt(totVasteActiva)}</span>
    </div>`;
  }

  if(vlottendeActiva.length){
    activaHTML += `<div class="report-row subtotal" style="margin-top:12px;"><span>Vlottende activa</span><span></span></div>`;
    vlottendeActiva.forEach(g=>{
      activaHTML += `<div class="report-row" style="cursor:pointer;" onclick="openGrootboekkaart('${g.id}')" title="Bekijk grootboekkaart"><span class="indent">${g.nummer} — ${g.naam}</span><span class="mono">${fmt(parseFloat(g.saldo||0))}</span></div>`;
    });
  }

  if(overigeActiva.length){
    activaHTML += `<div class="report-row subtotal" style="margin-top:12px;"><span>Overige activa</span><span></span></div>`;
    overigeActiva.forEach(g=>{
      activaHTML += `<div class="report-row" style="cursor:pointer;" onclick="openGrootboekkaart('${g.id}')" title="Bekijk grootboekkaart"><span class="indent">${g.nummer} — ${g.naam}</span><span class="mono">${fmt(parseFloat(g.saldo||0))}</span></div>`;
    });
  }

  activaHTML += `<div class="report-row total"><span>Totaal activa</span><span class="mono">${fmt(totActiva)}</span></div>`;

  // ── PASSIVA HTML ──
  let passivaHTML = '';
  if(passiva.length){
    passivaHTML += `<div class="report-row subtotal" style="margin-top:4px;"><span>Vreemd vermogen</span><span></span></div>`;
    passiva.forEach(g=>{
      passivaHTML += `<div class="report-row" style="cursor:pointer;" onclick="openGrootboekkaart('${g.id}')" title="Bekijk grootboekkaart"><span class="indent">${g.nummer} — ${g.naam}</span><span class="mono">${fmt(parseFloat(g.saldo||0))}</span></div>`;
    });
  }
  if(eigenVermogen.length || Math.abs(resultaat) > 0.005){
    passivaHTML += `<div class="report-row subtotal" style="margin-top:12px;"><span>Eigen vermogen</span><span></span></div>`;
    eigenVermogen.forEach(g=>{
      passivaHTML += `<div class="report-row" style="cursor:pointer;" onclick="openGrootboekkaart('${g.id}')" title="Bekijk grootboekkaart"><span class="indent">${g.nummer} — ${g.naam}</span><span class="mono">${fmt(parseFloat(g.saldo||0))}</span></div>`;
    });
    passivaHTML += `<div class="report-row"><span class="indent">Resultaat boekjaar (winst/verlies)</span><span class="mono">${fmt(resultaat)}</span></div>`;
  }
  passivaHTML += `<div class="report-row total"><span>Totaal passiva</span><span class="mono">${fmt(totPassiva+totEV+resultaat)}</span></div>`;

  document.getElementById('balans-activa').innerHTML = activaHTML;
  document.getElementById('balans-passiva').innerHTML = passivaHTML;
}

// ===== P&L =====
function vulJaarDropdowns(){
  // Vul jaar dropdowns voor balans, P&L en vergelijking
  const jaren = [...new Set([
    ...DB.verkoop.map(f=>f.datum?.substring(0,4)),
    ...DB.inkoop.map(f=>f.datum?.substring(0,4)),
    ...DB.transacties.map(t=>t.datum?.substring(0,4)),
  ].filter(Boolean))].sort().reverse();
  if(!jaren.length) jaren.push(new Date().getFullYear().toString());

  ['balans-jaar','pl-jaar','pl-vergelijk-jaar'].forEach(id=>{
    const sel = document.getElementById(id);
    if(!sel || sel.options.length > 1) return;
    const isVergelijk = id === 'pl-vergelijk-jaar';
    if(isVergelijk) sel.innerHTML = '<option value="">—</option>';
    jaren.forEach(j=>{
      const opt = document.createElement('option');
      opt.value = j; opt.textContent = j;
      if(!isVergelijk && j === new Date().getFullYear().toString()) opt.selected = true;
      sel.appendChild(opt);
    });
  });
}

function berekenPLVoorPeriode(maand, jaar){
  // Bereken omzet en kosten voor een specifieke maand/jaar combinatie
  // maand: 1-12 of '' voor heel jaar, jaar: '2025' of ''
  // Bij kasstelsel: datum = betaaldatum via getBtwDatum()
  // Bij factuurstelsel: datum = factuurdatum
  const ks = isKasstelsel();

  function inPeriode(datumStr){
    if(!datumStr) return false;
    const d = new Date(datumStr);
    const jaarMatch = !jaar || d.getFullYear().toString() === jaar.toString();
    const maandMatch = !maand || (d.getMonth()+1).toString() === maand.toString();
    return jaarMatch && maandMatch;
  }

  // Kasstelsel: filter op betaaldatum, factuurstelsel: op factuurdatum
  const verkoop = DB.verkoop.filter(f=>{
    const d = ks ? getBtwDatum(f) : f.datum;
    return d && inPeriode(d);
  });
  const inkoop = DB.inkoop.filter(f=>{
    const d = ks ? getBtwDatum(f) : f.datum;
    return d && inPeriode(d);
  });

  // Directe bankkosten: alleen gekoppeldType=grootboek op een kostenrekening
  // Privé-opnames en transfers zijn geen bedrijfskosten en worden uitgesloten
  const transacties = DB.transacties.filter(t=>inPeriode(t.datum));
  const bankKosten = transacties
    .filter(t=>
      parseFloat(t.bedrag) < 0 &&
      t.gekoppeldType === 'grootboek' &&
      t.gekoppeldType !== 'prive' &&
      t.gekoppeldType !== 'transfer'
    )
    .filter(t=>{
      // Controleer of de gekoppelde grootboekrekening een kostenrekening is
      const g = DB.grootboek.find(g=>(g.nummer+' — '+g.naam)===t.gekoppeldAan);
      return g && g.type === 'kosten';
    })
    .reduce((a,t)=>{
      // Trek BTW eraf als die aanwezig is — P&L werkt excl BTW
      const bedrag = Math.abs(parseFloat(t.bedrag)||0);
      const btwTarief = (window.inlineBTW||{})[t.id]||0;
      return a + (btwTarief > 0 ? bedrag / ((100 + btwTarief) / 100) : bedrag);
    }, 0);

  // Kasstelsel: omzet proportioneel op betaald bedrag
  const factuurOmzet = ks
    ? verkoop.reduce((a,f)=>a+getOmzetKas(f), 0)
    : verkoop.reduce((a,f)=>a+parseFloat(f.totaalExcl||0), 0);

  const inkoopKosten = ks
    ? inkoop.reduce((a,f)=>a+getInkoopKas(f), 0)
    : inkoop.reduce((a,f)=>a+parseFloat(f.totaalExcl||0), 0);

  // Omzet per grootboekrekening
  const omzetPerRek = {};
  verkoop.forEach(f=>{
    const ratio = _getBetaaldRatio(f);
    (f.regels||[]).forEach(r=>{
      const excl = (parseFloat(r.aantal)||0)*(parseFloat(r.prijs)||0) * ratio;
      const rekId = r.gbId || 'overig';
      omzetPerRek[rekId] = (omzetPerRek[rekId]||0) + excl;
    });
  });

  // Kosten per grootboekrekening
  const kostenPerRek = {};
  inkoop.forEach(f=>{
    const ratio = _getBetaaldRatio(f);
    (f.regels||[]).forEach(r=>{
      const excl = (parseFloat(r.aantal)||0)*(parseFloat(r.prijs)||0) * ratio;
      const rekId = r.gbId || 'overig';
      kostenPerRek[rekId] = (kostenPerRek[rekId]||0) + excl;
    });
  });

  const totOmzet = factuurOmzet;
  const totKosten = inkoopKosten + bankKosten;

  return { omzetPerRek, kostenPerRek, totOmzet, totKosten, factuurOmzet, inkoopKosten, bankKosten };
}

function renderPL(){
  vulJaarDropdowns();

  const maand = document.getElementById('pl-maand')?.value||'';
  const jaar  = document.getElementById('pl-jaar')?.value||'';
  const vMaand = document.getElementById('pl-vergelijk-maand')?.value||'';
  const vJaar  = document.getElementById('pl-vergelijk-jaar')?.value||'';
  const heeftVergelijk = vJaar !== '';

  const huidig = berekenPLVoorPeriode(maand, jaar);
  const vergelijk = heeftVergelijk ? berekenPLVoorPeriode(vMaand, vJaar) : null;

  const maandNamen = ['','Jan','Feb','Mrt','Apr','Mei','Jun','Jul','Aug','Sep','Okt','Nov','Dec'];
  const periodeLabel = (m,j) => (m ? maandNamen[parseInt(m)]+' ' : '') + (j||'Alle jaren');
  const huidigLabel = periodeLabel(maand, jaar);
  const vergelijkLabel = vergelijk ? periodeLabel(vMaand, vJaar) : '';

  // Vergelijkingskolom stijl
  const col2 = heeftVergelijk
    ? `<span class="mono" style="color:var(--text-mid);min-width:100px;text-align:right;">` 
    : '';

  function rij(naam, hBedrag, vBedrag, cls='', gbId=null){
    const diff = vergelijk ? hBedrag - vBedrag : null;
    const diffKleur = diff === null ? '' : diff > 0 ? 'color:#16a34a' : diff < 0 ? 'color:#dc2626' : '';
    const klikAttr = gbId ? `onclick="openGrootboekkaart('${gbId}')" title="Bekijk grootboekkaart"` : '';
    const cursor = gbId ? 'cursor:pointer;' : '';
    return `<div class="report-row ${cls}" style="gap:8px;${cursor}" ${klikAttr}>
      <span class="indent" style="flex:1">${naam}</span>
      <span class="mono" style="min-width:110px;text-align:right;">${fmt(hBedrag)}</span>
      ${heeftVergelijk ? `<span class="mono" style="min-width:110px;text-align:right;color:var(--text-mid);">${fmt(vBedrag)}</span>` : ''}
      ${heeftVergelijk ? `<span class="mono" style="min-width:80px;text-align:right;${diffKleur}">${diff>=0?'+':''}${fmt(diff)}</span>` : ''}
    </div>`;
  }

  // Header met kolomlabels
  const header = heeftVergelijk ? `
    <div class="report-row" style="font-size:11px;color:var(--text-dim);font-weight:600;gap:8px;margin-bottom:4px;">
      <span style="flex:1"></span>
      <span style="min-width:110px;text-align:right;">${huidigLabel}</span>
      <span style="min-width:110px;text-align:right;">${vergelijkLabel}</span>
      <span style="min-width:80px;text-align:right;">Verschil</span>
    </div>` : '';

  // Omzet rijen — per grootboekrekening (klikbaar naar de grootboekkaart)
  let oHTML = header;
  const omzetIds = Object.keys(huidig.omzetPerRek||{});
  if(omzetIds.length){
    omzetIds.forEach(rekId=>{
      const g = DB.grootboek.find(x=>x.id===rekId);
      const naam = g ? (g.nummer+' — '+g.naam) : 'Overige omzet';
      oHTML += rij(naam, huidig.omzetPerRek[rekId]||0, vergelijk?.omzetPerRek?.[rekId]||0, '', g?rekId:null);
    });
  } else {
    oHTML += rij('Verkoopfacturen', huidig.factuurOmzet, vergelijk?.factuurOmzet||0);
  }
  const totO_v = vergelijk?.totOmzet||0;

  // Kosten rijen — per grootboekrekening (klikbaar), plus directe bankuitgaven
  let kHTML = '';
  Object.keys(huidig.kostenPerRek||{}).forEach(rekId=>{
    const g = DB.grootboek.find(x=>x.id===rekId);
    const naam = g ? (g.nummer+' — '+g.naam) : 'Overige kosten';
    kHTML += rij(naam, huidig.kostenPerRek[rekId]||0, vergelijk?.kostenPerRek?.[rekId]||0, '', g?rekId:null);
  });
  if(huidig.bankKosten > 0 || (vergelijk?.bankKosten||0) > 0){
    kHTML += rij('Bankuitgaven (direct)', huidig.bankKosten, vergelijk?.bankKosten||0);
  }
  if(!kHTML) kHTML = rij('Inkoopfacturen', huidig.inkoopKosten, vergelijk?.inkoopKosten||0);
  const totK_v = vergelijk?.totKosten||0;

  // Resultaat
  const res  = huidig.totOmzet - huidig.totKosten;
  const resV = vergelijk ? (vergelijk.totOmzet - vergelijk.totKosten) : 0;
  const resDiff = vergelijk ? res - resV : null;

  document.getElementById('pl-omzet').innerHTML =
    (oHTML||'<div class="report-row"><span class="indent" style="color:var(--text-dim)">Geen omzet</span></div>') +
    rij('Totaal omzet', huidig.totOmzet, totO_v, 'subtotal');

  document.getElementById('pl-kosten').innerHTML =
    (kHTML||'<div class="report-row"><span class="indent" style="color:var(--text-dim)">Geen kosten</span></div>') +
    rij('Totaal kosten', huidig.totKosten, totK_v, 'subtotal');

  const resKleur = res>=0 ? 'var(--accent)' : 'var(--danger)';
  document.getElementById('pl-resultaat').innerHTML = `
    <div class="report-row total" style="color:${resKleur};gap:8px;">
      <span style="flex:1">${res>=0?'Nettowinst':'Nettoverlies'}</span>
      <span class="mono" style="min-width:110px;text-align:right;">${fmt(Math.abs(res))}</span>
      ${heeftVergelijk ? `<span class="mono" style="min-width:110px;text-align:right;color:var(--text-mid);">${fmt(Math.abs(resV))}</span>` : ''}
      ${heeftVergelijk && resDiff!==null ? `<span class="mono" style="min-width:80px;text-align:right;${resDiff>=0?'color:#16a34a':'color:#dc2626'}">${resDiff>=0?'+':''}${fmt(resDiff)}</span>` : ''}
    </div>`;
}

// ===== GROOTBOEKKAART (drill-down vanuit Balans / P&L / Grootboek) =====
// Read-only: reconstrueert alle boekingen op één grootboekrekening uit de bestaande
// data (facturen, banktransacties, memoriaal). Een sluitregel "Niet-toegewezen" vangt
// wat niet exact te herleiden is (gesplitste/BTW-bankregels, betalingsverschillen,
// transfers), zodat de kaart ALTIJD eindigt op het echte rekeningsaldo (g.saldo blijft
// de bron van waarheid). `effect` = de ondertekende mutatie op het saldo van deze rekening.
function bouwGrootboekkaart(gbId){
  const g = DB.grootboek.find(x=>x.id===gbId);
  if(!g) return null;
  const nr = String(g.nummer||'');
  const creditNorm = ['omzet','passiva','eigen_vermogen'].includes(g.type);
  const btwTeBetalen = (nr==='1510'||nr==='1530');
  const btwTeVorderen = (nr==='1500'||nr==='1520');
  const posten = [];

  (DB.verkoop||[]).forEach(f=>{
    const d=f.datum||'';
    (f.regels||[]).forEach(r=>{
      if(String(r.gbId||'')===gbId){
        const excl=rond((parseFloat(r.aantal)||0)*(parseFloat(r.prijs)||0));
        if(Math.abs(excl)>0.005) posten.push({datum:d,bron:'Verkoopfactuur '+(f.nummer||''),oms:f.klant||r.omschrijving||'',effect:excl,ref:{p:'verkoop',id:f.id}});
      }
    });
    if(nr==='1300'){ const v=rond(parseFloat(f.totaalIncl||0)); if(Math.abs(v)>0.005) posten.push({datum:d,bron:'Verkoopfactuur '+(f.nummer||''),oms:'Debiteur — '+(f.klant||''),effect:v,ref:{p:'verkoop',id:f.id}}); }
    if(btwTeBetalen){ const v=rond(parseFloat(f.btwBedrag||0)); if(v>0.005) posten.push({datum:d,bron:'Verkoopfactuur '+(f.nummer||''),oms:'BTW te betalen',effect:v,ref:{p:'verkoop',id:f.id}}); }
  });
  (DB.inkoop||[]).forEach(f=>{
    const d=f.datum||'';
    (f.regels||[]).forEach(r=>{
      if(String(r.gbId||'')===gbId){
        const excl=rond((parseFloat(r.aantal)||0)*(parseFloat(r.prijs)||0));
        if(Math.abs(excl)>0.005) posten.push({datum:d,bron:'Inkoopfactuur '+(f.nummer||''),oms:f.klant||r.omschrijving||'',effect:excl,ref:{p:'inkoop',id:f.id}});
      }
    });
    if(nr==='2100'){ const v=rond(parseFloat(f.totaalIncl||0)); if(Math.abs(v)>0.005) posten.push({datum:d,bron:'Inkoopfactuur '+(f.nummer||''),oms:'Crediteur — '+(f.klant||''),effect:v,ref:{p:'inkoop',id:f.id}}); }
    if(btwTeVorderen){ const v=rond(parseFloat(f.btwBedrag||0)); if(v>0.005) posten.push({datum:d,bron:'Inkoopfactuur '+(f.nummer||''),oms:'BTW te vorderen',effect:v,ref:{p:'inkoop',id:f.id}}); }
  });
  (DB.transacties||[]).forEach(t=>{
    const d=t.datum||''; const bedrag=rond(parseFloat(t.bedrag)||0);
    if(String(t.bankGbId||'')===gbId && Math.abs(bedrag)>0.005){
      posten.push({datum:d,bron:'Bank',oms:t.omschrijving||'',effect:bedrag,ref:{p:'bank'}});
    }
    if(t.status!=='gekoppeld') return;
    const koppelStr = typeof t.gekoppeldAan==='string' ? t.gekoppeldAan : '';
    if(t.gekoppeldType==='grootboek' && koppelStr.startsWith(nr+' — ')){
      const eff = creditNorm ? bedrag : -bedrag; // excl. onbekend bij BTW → sluitregel vangt de rest
      if(Math.abs(eff)>0.005) posten.push({datum:d,bron:'Bankkoppeling',oms:t.omschrijving||'',effect:eff,ref:{p:'bank'}});
    }
    if(t.gekoppeldType==='verkoop' && nr==='1300' && Math.abs(bedrag)>0.005){
      posten.push({datum:d,bron:'Bankbetaling',oms:'Ontvangst — '+(koppelStr||t.omschrijving||''),effect:-Math.abs(bedrag),ref:{p:'bank'}});
    }
    if(t.gekoppeldType==='inkoop' && nr==='2100' && Math.abs(bedrag)>0.005){
      posten.push({datum:d,bron:'Bankbetaling',oms:'Betaling — '+(koppelStr||t.omschrijving||''),effect:-Math.abs(bedrag),ref:{p:'bank'}});
    }
  });
  (DB.memoriaal||[]).forEach(m=>{
    (m.regels||[]).forEach(r=>{
      if(String(r.gbId||'')===gbId){
        const eff = (r.effect!==undefined) ? rond(r.effect) : rond(r.dc==='debet'?r.bedrag:-r.bedrag);
        if(Math.abs(eff)>0.005) posten.push({datum:m.datum||'',bron:m.oms||'Memoriaalboeking',oms:r.oms||'',effect:eff,ref:{p:'memoriaal'}});
      }
    });
  });

  posten.sort((a,b)=>String(a.datum).localeCompare(String(b.datum)));
  let som=0;
  posten.forEach(p=>{ som=rond(som+p.effect); p.saldo=som; });
  const werkelijk=rond(parseFloat(g.saldo)||0);
  const verschil=rond(werkelijk-som);
  if(Math.abs(verschil)>0.005){
    posten.push({datum:'',bron:'Niet-toegewezen / correctie',oms:'o.a. gesplitste of BTW-bankregels, betalingsverschillen, transfers',effect:verschil,saldo:werkelijk,ref:null});
  }
  return { g, nr, naam:g.naam, saldo:werkelijk, posten };
}

let _gbkPosten = [];
function openGrootboekkaart(gbId){
  const data = bouwGrootboekkaart(gbId);
  if(!data){ toast('Rekening niet gevonden.','error'); return; }
  _gbkPosten = data.posten;
  const tEl=document.getElementById('gbk-titel'); if(tEl) tEl.textContent='Grootboekkaart — '+data.nr+' '+data.naam;
  const kop = `<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px;">
      <span style="font-size:12px;color:var(--text-dim);">${data.posten.length} boeking(en)</span>
      <span style="font-size:13px;">Eindsaldo: <strong class="mono ${data.saldo<0?'amount-neg':''}">${fmt(data.saldo)}</strong></span>
    </div>`;
  let body;
  if(!data.posten.length){
    body = kop + `<div class="empty"><p>Nog geen boekingen op deze rekening.</p></div>`;
  } else {
    const thStyle='style="text-align:left;padding:7px 8px;border-bottom:1px solid var(--border);font-size:11px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.05em;"';
    const tdStyle='padding:7px 8px;border-bottom:1px solid var(--border);vertical-align:top;';
    body = kop + `<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr>
        <th ${thStyle}>Datum</th><th ${thStyle}>Boeking</th>
        <th ${thStyle} style="text-align:right;padding:7px 8px;border-bottom:1px solid var(--border);">Bedrag</th>
        <th ${thStyle} style="text-align:right;padding:7px 8px;border-bottom:1px solid var(--border);">Saldo</th>
      </tr></thead>
      <tbody>${data.posten.map((p,i)=>`<tr ${p.ref?`onclick="gbkOpenBron(${i})" style="cursor:pointer;"`:''}>
        <td class="mono" style="${tdStyle}white-space:nowrap;">${p.datum||'—'}</td>
        <td style="${tdStyle}"><div style="font-weight:500;">${esc(p.bron)}</div>${p.oms?`<div style="font-size:11px;color:var(--text-dim);margin-top:1px;">${esc(p.oms)}</div>`:''}</td>
        <td class="mono ${p.effect>=0?'amount-pos':'amount-neg'}" style="${tdStyle}text-align:right;white-space:nowrap;">${p.effect>=0?'+':''}${fmt(p.effect)}</td>
        <td class="mono" style="${tdStyle}text-align:right;white-space:nowrap;">${fmt(p.saldo)}</td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  }
  const bEl=document.getElementById('gbk-body'); if(bEl) bEl.innerHTML=body;
  openModal('modal-grootboekkaart');
}

function gbkOpenBron(i){
  const p = _gbkPosten[i]; if(!p||!p.ref) return;
  closeModal('modal-grootboekkaart');
  const r = p.ref;
  if((r.p==='verkoop'||r.p==='inkoop') && typeof openFactuurModal==='function') openFactuurModal(r.p, r.id);
  else if(r.p==='bank' && typeof showPage==='function') showPage('bank');
  else if(r.p==='memoriaal' && typeof showPage==='function') showPage('memoriaal');
}

// ===== MEMORIAAL =====
let memoriaalDB = [];

function initMemoriaal(){
  // Vul datum
  const d=document.getElementById('mem-datum');
  if(d&&!d.value) d.value=today();
  // Contacten autocomplete
  const contacten=[...new Set([...DB.verkoop.map(f=>f.klant),...DB.inkoop.map(f=>f.klant)].filter(Boolean))];
  const dl=document.getElementById('mem-relatie-list');
  if(dl) dl.innerHTML=contacten.map(c=>`<option value="${c}">`).join('');
  // Zorg voor minimaal 2 regels
  const container=document.getElementById('mem-regels');
  if(container&&container.children.length===0){ addMemRegel('debet'); addMemRegel('credit'); }
  renderMemLijst();
}

function addMemRegel(dcType){
  const container=document.getElementById('mem-regels');
  const gbOpts=DB.grootboek.map(g=>`<option value="${g.id}">${g.nummer} — ${g.naam}</option>`).join('');
  const rowId=`mr-${Date.now()}-${Math.random().toString(36).slice(2,5)}`;
  const div=document.createElement('div');
  div.className='mem-regel'; div.id=rowId;
  div.innerHTML=`
    <select style="font-size:11px;" onchange="memHerbereken()">
      <option value="debet" ${dcType==='debet'?'selected':''}>Debet</option>
      <option value="credit" ${dcType==='credit'?'selected':''}>Credit</option>
    </select>
    <select style="font-size:12px;" onchange="memHerbereken()">
      <option value="">— Rekening —</option>${gbOpts}
    </select>
    <input type="text" placeholder="Omschrijving" style="font-size:12px;">
    <input type="number" placeholder="0.00" step="0.01" style="font-size:12px;" oninput="memHerbereken()">
    <button onclick="document.getElementById('${rowId}').remove();memHerbereken()" style="color:var(--danger);background:none;border:none;cursor:pointer;">✕</button>`;
  container.appendChild(div);
}

function memHerbereken(){
  const rows=document.querySelectorAll('.mem-regel');
  let debet=0; let credit=0;
  rows.forEach(r=>{
    const dc=r.querySelector('select')?.value;
    const bedrag=parseFloat(r.querySelectorAll('input')[1]?.value)||0;
    if(dc==='debet') debet+=bedrag;
    else credit+=bedrag;
  });
  const el=document.getElementById('mem-saldo-check');
  if(!el) return;
  const diff=Math.abs(debet-credit);
  el.style.display='block';
  if(diff<0.01){
    el.style.background='rgba(0,255,135,.08)'; el.style.border='1px solid rgba(0,255,135,.2)'; el.style.color='var(--accent)';
    el.textContent=`✓ Gebalanceerd — Debet: ${fmt(debet)} = Credit: ${fmt(credit)}`;
  } else {
    el.style.background='rgba(255,68,68,.08)'; el.style.border='1px solid rgba(255,68,68,.2)'; el.style.color='var(--danger)';
    el.textContent=`✗ Niet gebalanceerd — Debet: ${fmt(debet)} | Credit: ${fmt(credit)} | Verschil: ${fmt(diff)}`;
  }
}

// Bepaalt hoe een debet/credit-regel het grootboeksaldo muteert. Debet-normale
// rekeningen (activa, kosten) stijgen bij DEBET; credit-normale rekeningen
// (passiva, eigen vermogen, omzet) worden in deze app POSITIEF bewaard en stijgen
// dus bij CREDIT. Zonder dit onderscheid werd een credit op bv. eigen vermogen als
// negatief bedrag opgeslagen — dan toont de balans een minbedrag en klopt hij niet.
function _memSaldoEffect(g, dc, bedrag){
  const creditNormaal = ['passiva','eigen_vermogen','omzet'].includes(g.type);
  if(creditNormaal) return dc==='credit' ? bedrag : -bedrag;
  return dc==='debet' ? bedrag : -bedrag;
}

function slaMemoriaalOp(){
  const datum=document.getElementById('mem-datum').value;
  const oms=document.getElementById('mem-oms').value.trim();
  const relatie=document.getElementById('mem-relatie').value.trim();
  if(!datum){toast('Vul een datum in.','error');return;}

  const rows=document.querySelectorAll('.mem-regel');
  const regels=[];
  let debet=0; let credit=0;
  rows.forEach(r=>{
    const dc=r.querySelector('select')?.value;
    const gbId=r.querySelectorAll('select')[1]?.value;
    const regelOms=r.querySelector('input[type="text"]')?.value.trim();
    const bedrag=parseFloat(r.querySelectorAll('input')[1]?.value)||0;
    if(!gbId||bedrag===0) return;
    regels.push({dc,gbId,oms:regelOms||oms,bedrag});
    if(dc==='debet') debet+=bedrag; else credit+=bedrag;
  });

  if(regels.length<2){toast('Voeg minstens twee boekingsregels toe.','error');return;}
  if(Math.abs(debet-credit)>0.01){alert(`Boeking is niet gebalanceerd.\nDebet: ${fmt(debet)}\nCredit: ${fmt(credit)}\nVerschil: ${fmt(Math.abs(debet-credit))}`);return;}

  // Verwerk boekingen op grootboekrekeningen
  regels.forEach(r=>{
    const g=DB.grootboek.find(g=>g.id===r.gbId); if(!g) return;
    const effect=_memSaldoEffect(g, r.dc, r.bedrag);
    r.effect=effect; // bewaar de exact toegepaste mutatie zodat verwijderen altijd correct terugdraait
    g.saldo=(parseFloat(g.saldo)||0)+effect;
  });

  // Sla op in memoriaal geschiedenis
  if(!DB.memoriaal) DB.memoriaal=[];
  DB.memoriaal.push({id:uid(),datum,oms:oms||'Memoriaalboeking',relatie,regels,debet,aangemaakt:new Date().toISOString()});
  save();
  resetMemoriaal();
  renderMemLijst();
  toast('Memoriaalboeking opgeslagen.');
}

function resetMemoriaal(){
  document.getElementById('mem-oms').value='';
  document.getElementById('mem-relatie').value='';
  document.getElementById('mem-regels').innerHTML='';
  const el=document.getElementById('mem-saldo-check');
  if(el) el.style.display='none';
  addMemRegel('debet'); addMemRegel('credit');
}

function renderMemLijst(){
  const el=document.getElementById('mem-lijst');
  if(!el) return;
  const lijst=(DB.memoriaal||[]).slice().reverse();
  if(!lijst.length){el.innerHTML='<div class="empty"><p>Geen memoriaalboeking</p></div>';return;}
  el.innerHTML=lijst.map(m=>`
    <div style="padding:12px 0;border-bottom:1px solid var(--border);">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
        <div>
          <div style="font-size:13px;font-weight:500;">${m.oms}</div>
          <div style="font-size:11px;color:var(--text-dim);margin-top:2px;">${m.datum}${m.relatie?' · '+m.relatie:''}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="mono" style="font-size:12px;color:var(--accent);">${fmt(m.debet)}</span>
          <button class="btn btn-danger btn-sm" onclick="verwijderMemoriaal('${m.id}')">✕</button>
        </div>
      </div>
      <div style="font-size:11px;color:var(--text-dim);">
        ${m.regels.map(r=>{
          const g=DB.grootboek.find(g=>g.id===r.gbId);
          return `<span style="margin-right:12px;">${r.dc==='debet'?'D':'C'} ${g?g.nummer+' '+g.naam:'?'} ${fmt(r.bedrag)}</span>`;
        }).join('')}
      </div>
    </div>`).join('');
}

async function verwijderMemoriaal(id){
  const mem = (DB.memoriaal||[]).find(m=>m.id===id);
  if(!mem) return;

  // Bescherm systeemboekingen
  if(mem.type==='jaarafsluiting'){
    toast('Jaarafsluitingsboekingen kunnen niet worden verwijderd. Gebruik de heropen-functie.','error');
    return;
  }
  if(mem.type==='afschrijving'){
    toast('Afschrijvingsboekingen kunnen alleen worden verwijderd via Vaste Activa.','error');
    return;
  }

  const ok=await bevestig('Memoriaalboeking verwijderen? De grootboeksaldi worden teruggedraaid.','Verwijderen','Verwijderen');
  if(!ok) return;
  const m=mem;
  // Draai boekingen terug. Gebruik de exact opgeslagen mutatie (`r.effect`); oudere
  // boekingen van vóór de tekenfix hebben dat veld niet en vallen terug op de
  // oorspronkelijke formule waarmee ze destijds geboekt zijn — zo klopt het
  // terugdraaien altijd, ook voor bestaande boekingen.
  m.regels.forEach(r=>{
    const g=DB.grootboek.find(g=>g.id===r.gbId); if(!g) return;
    const effect=(r.effect!==undefined)?r.effect:(r.dc==='debet'?r.bedrag:-r.bedrag);
    g.saldo=(parseFloat(g.saldo)||0)-effect;
  });
  DB.memoriaal=DB.memoriaal.filter(m=>m.id!==id);
  save(); renderMemLijst();
}

// ===== BTW AANGIFTE =====
function renderBTWAangifte(){
  // Vul jaar dropdown
  const jaarSel=document.getElementById('btw-jaar');
  if(jaarSel&&jaarSel.options.length===0){
    const huidigJaar=new Date().getFullYear();
    for(let j=huidigJaar;j>=huidigJaar-4;j--){
      const opt=document.createElement('option');
      opt.value=j; opt.textContent=j;
      jaarSel.appendChild(opt);
    }
  }
  if(!jaarSel) return;
  const jaar=parseInt(jaarSel.value)||new Date().getFullYear();
  const periode=document.getElementById('btw-periode')?.value||'Q1';
  const maanden={Q1:[0,1,2],Q2:[3,4,5],Q3:[6,7,8],Q4:[9,10,11]}[periode];

  function inPeriode(datumStr){
    if(!datumStr) return false;
    const d=new Date(datumStr);
    return d.getFullYear()===jaar && maanden.includes(d.getMonth());
  }

  // RUBRIEK 1a — omzet 21%, 1b — omzet 9%, 1d — omzet 0% (per factuurregel)
  // Bij kasstelsel: datum = betaaldatum via getBtwDatum(), onbetaalde facturen tellen niet mee
  // Bij factuurstelsel: datum = factuurdatum
  let gs1a=0; let btw1a=0;
  let gs1b=0; let btw1b=0;
  let gs1d=0; // 0% BTW omzet (vrijgesteld of nultarief)
  const kasstelsel = isKasstelsel();
  const stelselLabel = kasstelsel ? 'kasstelsel — betaaldatum' : 'factuurstelsel — factuurdatum';
  DB.verkoop.forEach(f=>{
    const btwDatum = getBtwDatum(f);
    if(!btwDatum || !inPeriode(btwDatum)) return;
    const ratio = _getBetaaldRatio(f);
    (f.regels||[]).forEach(r=>{
      const exclVolledig=(parseFloat(r.aantal)||0)*(parseFloat(r.prijs)||0);
      const excl = exclVolledig * ratio;
      const pct=parseInt(r.btw||f.btwTarief||21);
      if(pct===21){ gs1a+=excl; btw1a+=Math.round(excl*21)/100; }
      else if(pct===9){ gs1b+=excl; btw1b+=Math.round(excl*9)/100; }
      else if(pct===0){ gs1d+=excl; }
    });
  });

  // RUBRIEK 5b — voorbelasting inkoop (per factuurregel)
  // Bij kasstelsel: alleen betaalde inkopen, proportioneel op betaald bedrag
  let gs5b=0; let btw5b=0;
  DB.inkoop.forEach(f=>{
    const btwDatum = getBtwDatum(f);
    if(!btwDatum || !inPeriode(btwDatum)) return;
    // Gebruik centrale helper — voorkomt dubbele ratio toepassing
    const ratio = _getBetaaldRatio(f);
    (f.regels||[]).forEach(r=>{
      const exclVolledig=(parseFloat(r.aantal)||0)*(parseFloat(r.prijs)||0);
      const exclBetaald = exclVolledig * ratio;
      const pct=parseInt(r.btw||f.btwTarief||21);
      if(pct>0){
        gs5b += exclBetaald;
        btw5b += Math.round(exclBetaald * pct) / 100; // correct: ratio al verwerkt in exclBetaald
      }
    });
  });

  // KASSALIJSTEN — goedgekeurde kassalijsten tellen mee in BTW aangifte
  // Dit is de primaire omzetbron voor kappers, horeca etc die geen facturen maken
  (DB.kassalijsten||[]).filter(k=>k.status==='goedgekeurd'&&inPeriode(k.datum)).forEach(k=>{
    const tarief = parseInt(k.btwTarief ?? DB.profiel?.btwStandaard ?? '9');
    const omzetExcl = parseFloat(k.totaalOmzet||0);
    const btwBedrag = parseFloat(k.omzetBtw || omzetExcl * tarief / 100 || 0);
    if(tarief===21){ gs1a+=omzetExcl; btw1a+=btwBedrag; }
    else if(tarief===9){ gs1b+=omzetExcl; btw1b+=btwBedrag; }
    else if(tarief===0){ gs1d+=omzetExcl; }
  });

  // Banktransacties met BTW die niet via factuur lopen — tellen mee in 5b
  DB.transacties.filter(t=>inPeriode(t.datum)&&t.status==='gekoppeld'&&t.gekoppeldType==='grootboek').forEach(t=>{
    const bedrag = parseFloat(t.bedrag)||0;
    const btwTarief = (window.inlineBTW||{})[t.id]||0;
    if(btwTarief>0 && bedrag<0){
      const abs = Math.abs(bedrag);
      const exclBTW = abs/((100+btwTarief)/100);
      gs5b += exclBTW;
      btw5b += abs - exclBTW;
    }
  });

  // Update rubrieken
  const set=(id,val)=>{ const el=document.getElementById(id); if(el) el.textContent=fmt(val); };
  set('btw-1a-gs',gs1a); set('btw-1a-btw',btw1a);
  set('btw-1b-gs',gs1b); set('btw-1b-btw',btw1b);
  set('btw-1d-gs',gs1d); set('btw-1d-btw',0); // 0% omzet geen BTW
  set('btw-5b-gs',gs5b); set('btw-5b-btw',btw5b);

  // Saldo
  const totaalVerkoop=btw1a+btw1b;
  const saldo=totaalVerkoop-btw5b;
  const saldoEl=document.getElementById('btw-saldo');
  if(saldoEl){
    saldoEl.textContent=fmt(Math.abs(saldo));
    saldoEl.style.color=saldo>=0?'var(--danger)':'var(--accent)';
  }
  const labelEl=document.getElementById('btw-saldo-label');
  if(labelEl) labelEl.textContent=saldo>=0?'Te betalen aan Belastingdienst':'Te ontvangen van Belastingdienst';

  // Samenvatting
  const samen=document.getElementById('btw-samenvatting');
  if(samen) samen.innerHTML=`
    <div style="display:flex;justify-content:space-between;padding:4px 0;"><span>Periode</span><strong>${periode} ${jaar}</strong></div>
    <div style="display:flex;justify-content:space-between;padding:4px 0;"><span>Stelsel</span><strong style="color:var(--accent);font-size:11px;">${kasstelsel?'Kasstelsel':'Factuurstelsel'}</strong></div>
    <div style="display:flex;justify-content:space-between;padding:4px 0;"><span>Omzet 21%</span><strong>${fmt(gs1a)}</strong></div>
    <div style="display:flex;justify-content:space-between;padding:4px 0;"><span>Omzet 9%</span><strong>${fmt(gs1b)}</strong></div>
    ${gs1d>0?`<div style="display:flex;justify-content:space-between;padding:4px 0;"><span>Omzet 0%</span><strong>${fmt(gs1d)}</strong></div>`:''}
    <div style="display:flex;justify-content:space-between;padding:4px 0;border-top:1px solid var(--border);margin-top:4px;padding-top:8px;"><span>BTW omzet totaal</span><strong style="color:var(--text);">${fmt(totaalVerkoop)}</strong></div>
    <div style="display:flex;justify-content:space-between;padding:4px 0;"><span>Voorbelasting inkoop</span><strong style="color:var(--accent);">${fmt(btw5b)}</strong></div>
    <div style="display:flex;justify-content:space-between;padding:8px 0 0;border-top:2px solid var(--border);margin-top:4px;"><span style="font-weight:600;">${saldo>=0?'Te betalen':'Te ontvangen'}</span><strong style="color:${saldo>=0?'var(--danger)':'var(--accent)'};">${fmt(Math.abs(saldo))}</strong></div>`;

  // Laad notities
  const periodeKey=`btw_notities_${jaar}_${periode}`;
  const notities=(DB.btwNotities||{})[periodeKey]||'';
  const notEl=document.getElementById('btw-notities');
  if(notEl) notEl.value=notities;
}

function slaBANotitiesOp(){
  const jaar=document.getElementById('btw-jaar')?.value||new Date().getFullYear();
  const periode=document.getElementById('btw-periode')?.value||'Q1';
  const periodeKey=`btw_notities_${jaar}_${periode}`;
  if(!DB.btwNotities) DB.btwNotities={};
  DB.btwNotities[periodeKey]=document.getElementById('btw-notities')?.value||'';
  save();
  toast('Notities opgeslagen.');
}
// Herstel laatste actieve bedrijf
const _lastBedrijf=localStorage.getItem('ledger_actief_bedrijf');
if(_lastBedrijf){
  const _lijst=getBedrijven();
  if(_lijst.includes(_lastBedrijf)) huidigBedrijf=_lastBedrijf;
}
// ===== JAAROPGAVE =====

function renderJaaropgave(){
  const huidigJaar = new Date().getFullYear();

  // Vul jaar dropdown
  const sel = document.getElementById('jaar-select');
  if(sel && !sel.children.length){
    const jaren = [...new Set([
      ...DB.verkoop.map(f=>new Date(f.datum||'').getFullYear()),
      ...DB.inkoop.map(f=>new Date(f.datum||'').getFullYear()),
      huidigJaar
    ])].filter(j=>j>2000).sort((a,b)=>b-a);
    sel.innerHTML = jaren.map(j=>`<option value="${j}" ${j===huidigJaar?'selected':''}>${j}</option>`).join('');
  }
  const jaar = parseInt(sel?.value||huidigJaar);

  function inJaar(datum){ return new Date(datum||'').getFullYear()===jaar; }

  // Winst berekening — alleen op basis van facturen en memoriaal van het geselecteerde jaar
  // Bij kasstelsel: omzet en kosten op betaaldatum, niet factuurdatum
  const _kasstelsel = isKasstelsel();
  // Factuuromzet
  const factuurOmzetJaar = DB.verkoop.reduce((a,f)=>{
    const d = _kasstelsel ? getBtwDatum(f) : f.datum;
    if(!d || !inJaar(d)) return a;
    return a + (_kasstelsel ? getOmzetKas(f) : parseFloat(f.totaalExcl||0));
  }, 0);
  // Kassaomzet — altijd op kassadatum (inherent kasstelsel)
  const kassaOmzetJaar = (DB.kassalijsten||[])
    .filter(k=>k.status==='goedgekeurd'&&inJaar(k.datum))
    .reduce((a,k)=>a+parseFloat(k.totaalOmzet||0), 0);
  const omzet = factuurOmzetJaar + kassaOmzetJaar;
  const inkoopKosten = DB.inkoop.reduce((a,f)=>{
    const d = _kasstelsel ? getBtwDatum(f) : f.datum;
    if(!d || !inJaar(d)) return a;
    return a + getInkoopKas(f); // gebruikt _getBetaaldRatio intern
  }, 0);
  // Afschrijvingen uit memoriaal van dit jaar — niet uit grootboeksaldo (dat is cumulatief)
  const afschrijvingen = (DB.memoriaal||[]).filter(m=>inJaar(m.datum)&&m.type==='afschrijving').reduce((a,m)=>a+parseFloat(m.debet||0),0);
  // Directe kostenboekingen via bank die niet via factuur lopen (grootboektype=kosten, dit jaar)
  const directeKosten = DB.transacties
    .filter(t=>inJaar(t.datum)&&t.status==='gekoppeld'&&t.gekoppeldType==='grootboek'&&parseFloat(t.bedrag)<0)
    .filter(t=>{
      const g = DB.grootboek.find(g=>(g.nummer+' — '+g.naam)===t.gekoppeldAan);
      return g && g.type==='kosten';
    })
    .reduce((a,t)=>{
      const bedrag = Math.abs(parseFloat(t.bedrag)||0);
      const btwTarief = (window.inlineBTW||{})[t.id]||0;
      // Trek BTW eraf om excl. bedrag te krijgen
      return a + (btwTarief>0 ? bedrag/((100+btwTarief)/100) : bedrag);
    }, 0);
  const totaalKosten = inkoopKosten + afschrijvingen + directeKosten;
  const winstVoorAftrek = omzet - totaalKosten;

  // Aftrekposten ophalen uit velden
  const urencriterium = document.getElementById('jaar-urencriterium')?.value==='ja';
  const zelfstandigeAftrek = urencriterium ? (parseFloat(document.getElementById('jaar-zelfstandige-aftrek')?.value)||5030) : 0;
  const startersAftrek = urencriterium ? (parseFloat(document.getElementById('jaar-starters-aftrek')?.value)||0) : 0;
  const totaalOndernAftrek = zelfstandigeAftrek + startersAftrek;

  // MKB-winstvrijstelling — over winst NA ondernemersaftrek
  const winstNaOndernAftrek = Math.max(0, winstVoorAftrek - totaalOndernAftrek);
  const mkbPct = parseFloat(document.getElementById('jaar-mkb-pct')?.value)||13.31;
  const mkbVrijstelling = winstNaOndernAftrek * (mkbPct/100);

  // Belastbaar inkomen
  const belastbaarInkomen = Math.max(0, winstNaOndernAftrek - mkbVrijstelling);

  // Indicatieve belasting (box 1 schijven 2025)
  let belasting = 0;
  if(belastbaarInkomen > 0){
    const schijf1 = Math.min(belastbaarInkomen, 75624); // 36.97%
    const schijf2 = Math.max(0, belastbaarInkomen - 75624); // 49.50%
    belasting = schijf1 * 0.3697 + schijf2 * 0.495;
  }

  // Privé mutaties
  const priveMutaties = DB.transacties.filter(t=>t.gekoppeldType==='prive'&&inJaar(t.datum));
  const priveOpnames = priveMutaties.filter(t=>t.priveRichting==='opname').reduce((a,t)=>a+Math.abs(parseFloat(t.bedrag)),0);
  const priveStortingen = priveMutaties.filter(t=>t.priveRichting==='storting').reduce((a,t)=>a+Math.abs(parseFloat(t.bedrag)),0);

  // Render winst detail
  const winstEl = document.getElementById('jaar-winst-detail');
  if(winstEl) winstEl.innerHTML = `
    ${factuurOmzetJaar>0?`<div class="report-row"><span class="indent">Omzet facturen (excl. BTW)</span><span class="mono amount-pos">${fmt(factuurOmzetJaar)}</span></div>`:''}
    ${kassaOmzetJaar>0?`<div class="report-row"><span class="indent">Omzet kassalijsten (excl. BTW)</span><span class="mono amount-pos">${fmt(kassaOmzetJaar)}</span></div>`:''}
    ${factuurOmzetJaar===0&&kassaOmzetJaar===0?`<div class="report-row"><span class="indent">Omzet (excl. BTW)</span><span class="mono amount-pos">${fmt(omzet)}</span></div>`:''}
    <div class="report-row"><span class="indent">Inkoopkosten (facturen)</span><span class="mono amount-neg">- ${fmt(inkoopKosten)}</span></div>
    ${directeKosten>0?`<div class="report-row"><span class="indent">Directe kostenboekingen (bank)</span><span class="mono amount-neg">- ${fmt(directeKosten)}</span></div>`:''}
    ${afschrijvingen>0?`<div class="report-row"><span class="indent">Afschrijvingen</span><span class="mono amount-neg">- ${fmt(afschrijvingen)}</span></div>`:''}
    <div class="report-row subtotal"><span>Winst uit onderneming</span><span class="mono" style="color:${winstVoorAftrek>=0?'#16a34a':'#dc2626'};font-weight:700;font-size:15px;">${fmt(winstVoorAftrek)}</span></div>`;

  // Render aftrekposten
  const aftrekEl = document.getElementById('jaar-aftrekposten');
  if(aftrekEl) aftrekEl.innerHTML = `
    <div class="report-row">
      <span class="indent" style="display:flex;align-items:center;gap:6px;">
        Zelfstandigenaftrek
        ${!urencriterium?'<span class="badge badge-orange" style="font-size:9px;">Urencriterium niet gehaald</span>':''}
      </span>
      <span class="mono" style="color:#7c3aed;">- ${fmt(zelfstandigeAftrek)}</span>
    </div>
    ${startersAftrek>0?`<div class="report-row"><span class="indent">Startersaftrek</span><span class="mono" style="color:#7c3aed;">- ${fmt(startersAftrek)}</span></div>`:''}
    <div class="report-row"><span class="indent">Winst na ondernemersaftrek</span><span class="mono">${fmt(winstNaOndernAftrek)}</span></div>
    <div class="report-row">
      <span class="indent">MKB-winstvrijstelling (${mkbPct}%)</span>
      <span class="mono" style="color:#7c3aed;">- ${fmt(mkbVrijstelling)}</span>
    </div>
    <div class="report-row subtotal"><span>Totaal aftrek</span><span class="mono" style="color:#7c3aed;font-weight:700;">- ${fmt(totaalOndernAftrek+mkbVrijstelling)}</span></div>`;

  // Render belastbaar
  const belastEl = document.getElementById('jaar-belastbaar');
  if(belastEl) belastEl.innerHTML = `
    <div class="report-row total" style="font-size:18px;"><span>Belastbaar inkomen</span><span class="mono" style="color:var(--accent);">${fmt(belastbaarInkomen)}</span></div>
    <div class="report-row" style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border);">
      <span style="font-size:12px;color:var(--text-mid);">Indicatieve inkomstenbelasting (box 1)</span>
      <span class="mono" style="color:#dc2626;">${fmt(belasting)}</span>
    </div>
    <div style="font-size:10px;color:var(--text-dim);margin-top:6px;">⚠ Indicatief — geen rekening gehouden met heffingskorting, toeslagen of andere aftrekposten. Raadpleeg een boekhouder voor de definitieve aangifte.</div>`;

  // Toelichting
  const toelEl = document.getElementById('jaar-toelichting');
  if(toelEl) toelEl.innerHTML = `
    <div style="margin-bottom:8px;"><strong>Zelfstandigenaftrek</strong> — €${zelfstandigeAftrek.toLocaleString('nl-NL')} vast bedrag als je minimaal 1.225 uur per jaar aan je onderneming besteedt. Wordt jaarlijks afgebouwd richting €900 in 2027.</div>
    <div style="margin-bottom:8px;"><strong>MKB-winstvrijstelling</strong> — ${mkbPct}% van de winst na ondernemersaftrek. Geen urencriterium nodig, geldt automatisch voor alle ondernemers in IB.</div>
    ${startersAftrek>0?'<div style="margin-bottom:8px;"><strong>Startersaftrek</strong> — extra aftrek van €2.123 bovenop de zelfstandigenaftrek. Maximaal 3x in de eerste 5 jaar.</div>':''}
    <div style="color:#dc2626;font-size:11px;">Let op: de belastingberekening is indicatief. Gebruik dit als richtlijn voor je aangifte.</div>`;

  // Privé mutaties tabel
  const priveEl = document.getElementById('jaar-prive-mutaties');
  if(priveEl){
    if(!priveMutaties.length){
      priveEl.innerHTML='<div class="empty"><p>Geen privé-mutaties dit jaar</p></div>';
    } else {
      priveEl.innerHTML=`
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:12px;">
          <div style="padding:12px;background:#f5f3ff;border-radius:var(--radius);">
            <div style="font-size:11px;color:#7c3aed;font-family:var(--mono);text-transform:uppercase;letter-spacing:.08em;">Totaal opnames</div>
            <div style="font-size:18px;font-family:var(--mono);font-weight:700;color:#7c3aed;margin-top:4px;">${fmt(priveOpnames)}</div>
          </div>
          <div style="padding:12px;background:#f0fdf4;border-radius:var(--radius);">
            <div style="font-size:11px;color:#16a34a;font-family:var(--mono);text-transform:uppercase;letter-spacing:.08em;">Totaal stortingen</div>
            <div style="font-size:18px;font-family:var(--mono);font-weight:700;color:#16a34a;margin-top:4px;">${fmt(priveStortingen)}</div>
          </div>
        </div>
        <table style="font-size:12px;">
          <thead><tr><th>Datum</th><th>Omschrijving</th><th>Type</th><th style="text-align:right;">Bedrag</th></tr></thead>
          <tbody>${priveMutaties.sort((a,b)=>(a.datum||'').localeCompare(b.datum||'')).map(t=>`
            <tr>
              <td class="mono">${t.datum||''}</td>
              <td>${t.omschrijving||''}</td>
              <td><span class="badge" style="${t.priveRichting==='opname'?'background:#ede9fe;color:#7c3aed':'background:#dcfce7;color:#16a34a'}">${t.priveRichting==='opname'?'Opname':'Storting'}</span></td>
              <td class="mono" style="text-align:right;${t.priveRichting==='opname'?'color:#7c3aed':'color:#16a34a'}">${fmt(Math.abs(parseFloat(t.bedrag)))}</td>
            </tr>`).join('')}
          </tbody>
        </table>`;
    }
  }
}

function downloadJaaropgave(){
  const jaar = parseInt(document.getElementById('jaar-select')?.value||new Date().getFullYear());
  const bedrijf = DB.profiel?.bedrijfsnaam||huidigBedrijf;
  const datum = new Date().toLocaleDateString('nl-NL');

  // Haal berekende waarden op uit de DOM
  const winstHTML = document.getElementById('jaar-winst-detail')?.innerHTML||'';
  const aftrekHTML = document.getElementById('jaar-aftrekposten')?.innerHTML||'';
  const belastHTML = document.getElementById('jaar-belastbaar')?.innerHTML||'';
  const priveHTML = document.getElementById('jaar-prive-mutaties')?.innerHTML||'';

  const html = `<!DOCTYPE html>
<html lang="nl">
<head><meta charset="UTF-8">
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
<meta http-equiv="Pragma" content="no-cache">
<meta http-equiv="Expires" content="0">
<link rel="apple-touch-icon" href="data:image/png;base64,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">
<link rel="icon" type="image/png" href="data:image/png;base64,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">

<title>Jaaropgave ${jaar} — ${bedrijf}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;} body{font-family:'Inter',sans-serif;background:#f8fafc;color:#1e2a3b;font-size:13px;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .wrap{max-width:800px;margin:0 auto;padding:40px 32px;}
  .header{background:linear-gradient(135deg,#1e3a8a,#2563eb);color:#fff;padding:28px 32px;border-radius:12px;margin-bottom:24px;display:flex;justify-content:space-between;align-items:flex-end;}
  .header h1{font-size:22px;font-weight:700;} .header p{color:rgba(255,255,255,.7);font-size:12px;margin-top:4px;}
  .header-right{text-align:right;font-family:'JetBrains Mono',monospace;color:rgba(255,255,255,.8);font-size:12px;}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;}
  .card{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:16px 18px;margin-bottom:14px;}
  .card-title{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:#64748b;font-weight:600;margin-bottom:12px;font-family:'JetBrains Mono',monospace;}
  .report-row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f1f5f9;font-size:13px;}
  .report-row.subtotal{font-weight:600;border-bottom:2px solid #e2e8f0;}
  .report-row.total{font-weight:700;font-size:16px;padding:10px 0;border-bottom:none;}
  .indent{padding-left:14px;color:#64748b;}
  .mono{font-family:'JetBrains Mono',monospace;}
  .amount-pos{color:#16a34a;} .amount-neg{color:#dc2626;}
  .badge{display:inline-flex;padding:2px 7px;border-radius:20px;font-size:10px;font-weight:600;}
  .warning{background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:10px 14px;font-size:11px;color:#92400e;margin-top:12px;}
  .footer{text-align:center;color:#94a3b8;font-size:11px;margin-top:24px;padding-top:14px;border-top:1px solid #e2e8f0;}
  .print-btn{background:#2563eb;color:#fff;border:none;padding:9px 18px;border-radius:7px;cursor:pointer;font-size:13px;font-weight:500;margin-bottom:20px;}
  @media print{.print-btn{display:none;}}
  table{width:100%;border-collapse:collapse;} th{text-align:left;padding:7px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;border-bottom:2px solid #f1f5f9;}
  td{padding:8px 10px;border-bottom:1px solid #f8fafc;font-size:12px;}
</style></head>
<body><div class="wrap">
  <button class="print-btn" onclick="window.print()">🖨️ Opslaan als PDF</button>
  <div class="header">
    <div><div style="font-size:10px;text-transform:uppercase;letter-spacing:.15em;color:rgba(255,255,255,.5);margin-bottom:6px;">Jaaropgave Eenmanszaak</div>
    <h1>${bedrijf}</h1><p>Boekjaar ${jaar}</p></div>
    <div class="header-right"><div style="font-size:10px;color:rgba(255,255,255,.5);margin-bottom:3px;">Gegenereerd op</div>${datum}</div>
  </div>
  <div class="grid">
    <div>
      <div class="card"><div class="card-title">Winst uit onderneming</div>${winstHTML}</div>
      <div class="card"><div class="card-title" style="color:#7c3aed;">Fiscale aftrekposten</div>${aftrekHTML}</div>
      <div class="card" style="border:2px solid #2563eb;"><div class="card-title">Belastbaar inkomen</div>${belastHTML}</div>
    </div>
    <div>
      <div class="card"><div class="card-title" style="color:#7c3aed;">Privé-mutaties ${jaar}</div>${priveHTML}</div>
    </div>
  </div>
  <div class="warning">⚠ Deze jaaropgave is een indicatie op basis van ingevoerde gegevens. Raadpleeg altijd een belastingadviseur voor de definitieve IB-aangifte. Bedragen zijn exclusief heffingskortingen, toeslagen en overig inkomen.</div>
  <div class="footer">Jaaropgave ${jaar} — ${bedrijf} — Gegenereerd door Ledger op ${datum}</div>
</div></body></html>`;

  const blob = new Blob([html],{type:'text/html'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href=url; a.download=`Jaaropgave_${bedrijf.replace(/\s+/g,'_')}_${jaar}.html`; a.click();
  URL.revokeObjectURL(url);
  toast('Jaaropgave gedownload — open en klik "Opslaan als PDF".','success');
}



async function voerJaarafsluitingUit(){
  const sel = document.getElementById('jaar-select');
  const jaar = parseInt(sel?.value||new Date().getFullYear());

  // Controleer of jaar al afgesloten is
  const alAfgesloten = (DB.memoriaal||[]).some(m=>
    m.type==='jaarafsluiting' && m.datum?.startsWith(jaar+'-')
  );
  if(alAfgesloten){
    toast(`Jaar ${jaar} is al afgesloten.`,'warning');
    return;
  }

  // Bereken resultaat
  const omzetRekeningen = DB.grootboek.filter(g=>g.type==='omzet');
  const kostenRekeningen = DB.grootboek.filter(g=>g.type==='kosten');
  const totOmzet  = omzetRekeningen.reduce((a,g)=>a+parseFloat(g.saldo||0),0);
  const totKosten = kostenRekeningen.reduce((a,g)=>a+parseFloat(g.saldo||0),0);
  const resultaat = totOmzet - totKosten;

  const ok = await bevestig(
    `Jaar ${jaar} afsluiten?

Omzet: ${fmt(totOmzet)}
Kosten: ${fmt(totKosten)}
Nettoresultaat: ${fmt(resultaat)}

Alle omzet en kostenrekeningen worden genulleerd.
Het resultaat wordt geboekt op Eigen Vermogen.

Deze actie kan niet ongedaan worden gemaakt.`,
    `Jaarafsluiting ${jaar}`,
    'Afsluiten'
  );
  if(!ok) return;

  // Zoek of maak resultaatrekening eigen vermogen
  let evRek = DB.grootboek.find(g=>g.nummer==='3500')||
              DB.grootboek.find(g=>g.naam.toLowerCase().includes('resultaat')&&g.type==='eigen_vermogen')||
              DB.grootboek.find(g=>g.type==='eigen_vermogen');

  if(!evRek){
    toast('Geen eigen vermogen rekening gevonden. Voeg rekening 3500 toe in het grootboek.','error');
    return;
  }

  // Bouw memoriaalboeking op
  const regels = [];

  // Nuil alle omzetrekeningen — debet om omzet (credit-saldo) te sluiten
  omzetRekeningen.forEach(g=>{
    const saldo = parseFloat(g.saldo||0);
    if(Math.abs(saldo) > 0.01){
      regels.push({dc:'debet', gbId:g.id, oms:`Afsluiting ${g.naam}`, bedrag:Math.abs(saldo)});
      g.saldo = 0;
    }
  });

  // Nuil alle kostenrekeningen — credit om kosten (debet-saldo) te sluiten
  kostenRekeningen.forEach(g=>{
    const saldo = parseFloat(g.saldo||0);
    if(Math.abs(saldo) > 0.01){
      regels.push({dc:'credit', gbId:g.id, oms:`Afsluiting ${g.naam}`, bedrag:Math.abs(saldo)});
      g.saldo = 0;
    }
  });

  // Boek nettoresultaat op eigen vermogen
  // Winst (omzet > kosten): debet was totOmzet, credit was totKosten + resultaat (credit EV)
  // Verlies (kosten > omzet): debet was totOmzet + verlies (debet EV), credit was totKosten
  if(resultaat >= 0){
    evRek.saldo = (parseFloat(evRek.saldo)||0) + resultaat;
    regels.push({dc:'credit', gbId:evRek.id, oms:`Nettoresultaat ${jaar}`, bedrag:resultaat});
  } else {
    evRek.saldo = (parseFloat(evRek.saldo)||0) + resultaat;
    regels.push({dc:'debet', gbId:evRek.id, oms:`Nettoverlies ${jaar}`, bedrag:Math.abs(resultaat)});
  }

  // Valideer: debet moet = credit in de memoriaalboeking
  const totDebet  = regels.filter(r=>r.dc==='debet').reduce((a,r)=>a+r.bedrag,0);
  const totCredit = regels.filter(r=>r.dc==='credit').reduce((a,r)=>a+r.bedrag,0);
  if(Math.abs(totDebet-totCredit) > 0.01){
    toast(`Jaarafsluiting geblokkeerd — boeking niet in evenwicht (D:${fmt(totDebet)} C:${fmt(totCredit)}).`,'error');
    return;
  }

  // Sla memoriaalboeking op als audit trail
  if(!DB.memoriaal) DB.memoriaal = [];
  DB.memoriaal.push({
    id: uid(),
    datum: `${jaar}-12-31`,
    oms: `Jaarafsluiting ${jaar}`,
    type: 'jaarafsluiting',
    relatie: '',
    regels,
    debet: totOmzet,
    aangemaakt: new Date().toISOString()
  });

  save();
  renderJaaropgave();
  toast(`Jaarafsluiting ${jaar} uitgevoerd — resultaat ${fmt(resultaat)} geboekt op eigen vermogen.`,'success');
}

function inlinePrive(tId, bedrag){
  const el = document.getElementById('iw-prive-'+tId);
  if(!el) return;
  const isOpen = el.style.display!=='none';
  // Sluit transfer sectie als die open is
  const transferEl = document.getElementById('iw-transfer-'+tId);
  if(transferEl) transferEl.style.display='none';
  el.style.display = isOpen ? 'none' : 'block';
  // Autodetect: uitgaand bedrag = opname, inkomend = storting
  const typeEl = document.getElementById('iw-prive-type-'+tId);
  if(typeEl) typeEl.value = bedrag < 0 ? 'opname' : 'storting';
}

function inlineBevestigPrive(tId, bedrag){
  const t = DB.transacties.find(t=>t.id===tId); if(!t) return;
  const type = document.getElementById('iw-prive-type-'+tId)?.value||'opname';
  const oms = document.getElementById('iw-prive-oms-'+tId)?.value||t.omschrijving;
  const abs = Math.abs(parseFloat(bedrag));

  // Zoek de juiste privé rekening
  const priveRek = DB.grootboek.find(g=>g.nummer==='3000'&&type==='opname') ||
                   DB.grootboek.find(g=>g.nummer==='3100'&&type==='storting') ||
                   DB.grootboek.find(g=>g.naam.toLowerCase().includes('privé'));

  const bankRek = getBankRekening();

  if(!priveRek){ toast('Privé rekening (3000/3100) niet gevonden. Voeg hem toe in Grootboek.','error'); return; }
  if(!bankRek){ toast('Bankrekening niet gevonden.','error'); return; }

  // Dubbele boeking:
  // Privé-opname: Debet 3000 Privé-opnames / Credit Bank
  // Privé-storting: Debet Bank / Credit 3100 Privé-stortingen
  if(type==='opname'){
    priveRek.saldo = (parseFloat(priveRek.saldo)||0) + abs;
    bankRek.saldo  = (parseFloat(bankRek.saldo)||0) - abs;
  } else {
    bankRek.saldo  = (parseFloat(bankRek.saldo)||0) + abs;
    priveRek.saldo = (parseFloat(priveRek.saldo)||0) - abs;
  }

  // Markeer transactie
  t.status       = 'gekoppeld';
  t.gekoppeldType = 'prive';
  t.gekoppeldAan  = priveRek.nummer+' — '+priveRek.naam;
  t.bankGbId      = bankRek.id;
  t.priveRichting = type;
  t.omschrijving  = oms;

  save();
  updateBankStats();
  renderTransacties(false);
  toast(`${type==='opname'?'Privé-opname':'Privé-storting'} van ${fmt(abs)} verwerkt.`,'success');
}

function getPriveTotalen(){
  // Bereken totaal privé-opnames en stortingen dit jaar
  const jaar = new Date().getFullYear();
  const priveTransacties = DB.transacties.filter(t=>
    t.gekoppeldType==='prive'&&
    new Date(t.datum||'').getFullYear()===jaar
  );
  const opnames  = priveTransacties.filter(t=>t.priveRichting==='opname').reduce((a,t)=>a+Math.abs(parseFloat(t.bedrag)),0);
  const stortingen = priveTransacties.filter(t=>t.priveRichting==='storting').reduce((a,t)=>a+Math.abs(parseFloat(t.bedrag)),0);
  return { opnames, stortingen, netto: stortingen-opnames };
}



function matchTransferSuggestie(tId){
  const t = DB.transacties.find(t=>t.id===tId); if(!t) return;
  if(!t.transferTegenpartijId){ toast('Geen tegenpartij gevonden.','error'); return; }
  const tTegenp = DB.transacties.find(tx=>tx.id===t.transferTegenpartijId);
  if(!tTegenp){ toast('Tegenpartij transactie niet meer beschikbaar.','error'); return; }

  // Match beide transacties aan elkaar
  t.status = 'gekoppeld';
  t.gekoppeldType = 'transfer';
  t.gekoppeldAan = t.transferId||tTegenp.transferId;
  t._transferSuggestie = false;

  // Saldo van deze bank aanpassen
  const dezeBank = DB.grootboek.find(g=>g.id===t.bankGbId)||getBankRekening();
  const abs = Math.abs(parseFloat(t.bedrag));
  if(dezeBank && t.transferRichting==='in'){
    // Al gedaan door inlineBevestigTransfer, niet dubbel doen
  }

  save();
  updateBankStats();
  renderTransacties(false);
  toast('Transfer gematcht — beide rekeningen zijn bijgewerkt.','success');
}

function inlineTransfer(tId, bedrag){
  const el = document.getElementById('iw-transfer-'+tId);
  if(!el) return;
  const isOpen = el.style.display!=='none';
  el.style.display = isOpen ? 'none' : 'block';
}

function inlineBevestigTransfer(tId, bedrag){
  const t = DB.transacties.find(t=>t.id===tId); if(!t) return;
  const naarId = document.getElementById('iw-transfer-naar-'+tId)?.value;
  if(!naarId){ toast('Kies een doelrekening.','error'); return; }

  const vanRek = getBankRekening();
  const naarRek = DB.grootboek.find(g=>g.id===naarId);
  if(!vanRek||!naarRek){ toast('Rekening niet gevonden.','error'); return; }

  const transferId = 'TRF-'+uid().slice(0,8).toUpperCase();
  const abs = Math.abs(bedrag);

  // Markeer de huidige transactie als transfer (uitstroom)
  t.status = 'gekoppeld';
  t.gekoppeldType = 'transfer';
  t.gekoppeldAan = transferId;
  t.transferId = transferId;
  t.transferRichting = bedrag < 0 ? 'uit' : 'in';
  t.bankGbId = vanRek.id;

  // Maak de bijpassende transactie aan op de doelrekening
  const tTegen = {
    id: uid(),
    datum: t.datum,
    omschrijving: t.omschrijving + ' (transfer)',
    bedrag: bedrag < 0 ? abs : -abs, // tegengesteld bedrag
    status: 'ongekoppeld', // verschijnt als gele suggestie op andere bank
    gekoppeldType: null,
    gekoppeldAan: null,
    bankGbId: naarId,
    transferId,
    transferRichting: bedrag < 0 ? 'in' : 'uit',
    transferTegenpartijId: t.id,
    _transferSuggestie: true, // markeer als transfer suggestie
    importId: null,
  };
  t.transferTegenpartijId = tTegen.id;

  // Pas saldo's aan — beide kanten
  if(bedrag < 0){
    // Uitstroom van vanRek, instroom naar naarRek
    vanRek.saldo  = (parseFloat(vanRek.saldo)||0)  - abs;
    naarRek.saldo = (parseFloat(naarRek.saldo)||0) + abs;
  } else {
    vanRek.saldo  = (parseFloat(vanRek.saldo)||0)  + abs;
    naarRek.saldo = (parseFloat(naarRek.saldo)||0) - abs;
  }

  DB.transacties.push(tTegen);
  save();
  updateBankHeader();
  updateBankStats();
  renderTransacties(false);
  toast(`Transfer aangemaakt — open de andere bank om te matchen.`,'success');
}

// ===== BANK TRANSFER =====

function openTransferModal(){
  const banken = getBanken();
  if(banken.length < 2){
    toast('Je hebt minimaal 2 bankrekeningen nodig voor een transfer. Voeg een rekening toe via ⚙ Banken beheren.','warning');
    return;
  }
  const opties = banken.map(b=>`<option value="${b.id}">${b.naam}${b.iban?' ('+b.iban+')':''} — ${fmt(b.saldo||0)}</option>`).join('');
  document.getElementById('transfer-van').innerHTML = opties;
  document.getElementById('transfer-naar').innerHTML = opties;
  // Standaard: actieve bank als "van", andere als "naar"
  const actief = DB.huidigeBankId||banken[0].id;
  const andere = banken.find(b=>b.id!==actief)?.id||banken[0].id;
  document.getElementById('transfer-van').value = actief;
  document.getElementById('transfer-naar').value = andere;
  document.getElementById('transfer-datum').value = today();
  document.getElementById('transfer-bedrag').value = '';
  document.getElementById('transfer-oms').value = '';
  document.getElementById('transfer-preview').style.display = 'none';

  // Preview updater — gebruik oninput attribuut om listener leaks te voorkomen
  ['transfer-van','transfer-naar','transfer-bedrag'].forEach(id=>{
    const el = document.getElementById(id);
    if(!el) return;
    el.oninput = updateTransferPreview;
    el.onchange = updateTransferPreview;
  });
  openModal('modal-transfer');
}

function updateTransferPreview(){
  const vanId = document.getElementById('transfer-van').value;
  const naarId = document.getElementById('transfer-naar').value;
  const bedrag = parseFloat(document.getElementById('transfer-bedrag').value)||0;
  const preview = document.getElementById('transfer-preview');

  if(!vanId||!naarId||!bedrag||vanId===naarId){
    preview.style.display='none'; return;
  }
  const van = DB.grootboek.find(g=>g.id===vanId);
  const naar = DB.grootboek.find(g=>g.id===naarId);
  preview.style.display='block';
  document.getElementById('transfer-prev-van').textContent = van?.naam||'';
  document.getElementById('transfer-prev-naar').textContent = naar?.naam||'';
  document.getElementById('transfer-prev-bedrag-van').textContent = '— '+fmt(bedrag);
  document.getElementById('transfer-prev-bedrag-naar').textContent = '+ '+fmt(bedrag);
}

function verwerkTransfer(){
  const vanId = document.getElementById('transfer-van').value;
  const naarId = document.getElementById('transfer-naar').value;
  const bedrag = parseFloat(document.getElementById('transfer-bedrag').value)||0;
  const datum = document.getElementById('transfer-datum').value;
  const oms = document.getElementById('transfer-oms').value.trim() || 'Bankoverschrijving';

  if(!vanId||!naarId){ toast('Selecteer beide rekeningen.','error'); return; }
  if(vanId===naarId){ toast('Van en naar rekening mogen niet hetzelfde zijn.','error'); return; }
  if(!bedrag||bedrag<=0){ toast('Vul een geldig bedrag in.','error'); return; }
  if(!datum){ toast('Selecteer een datum.','error'); return; }

  const van = DB.grootboek.find(g=>g.id===vanId);
  const naar = DB.grootboek.find(g=>g.id===naarId);
  if(!van||!naar){ toast('Rekening niet gevonden.','error'); return; }

  // Maak een uniek transfer ID zodat de twee transacties aan elkaar gelinkt zijn
  const transferId = 'TRF-'+uid().slice(0,8).toUpperCase();

  // Transactie 1: uitstroom van "van" rekening
  const tUit = {
    id: uid(),
    datum,
    omschrijving: oms+' → '+naar.naam,
    bedrag: -bedrag,
    status: 'gekoppeld',
    gekoppeldType: 'transfer',
    gekoppeldAan: transferId,
    bankGbId: vanId,
    transferId,
    transferRichting: 'uit',
    transferTegenpartijId: null, // wordt hieronder ingevuld
    importId: null,
  };

  // Transactie 2: instroom op "naar" rekening
  const tIn = {
    id: uid(),
    datum,
    omschrijving: oms+' ← '+van.naam,
    bedrag: bedrag,
    status: 'gekoppeld',
    gekoppeldType: 'transfer',
    gekoppeldAan: transferId,
    bankGbId: naarId,
    transferId,
    transferRichting: 'in',
    transferTegenpartijId: null,
    importId: null,
  };

  // Link de twee transacties aan elkaar
  tUit.transferTegenpartijId = tIn.id;
  tIn.transferTegenpartijId = tUit.id;

  // Pas saldo's aan
  van.saldo = (parseFloat(van.saldo)||0) - bedrag;
  naar.saldo = (parseFloat(naar.saldo)||0) + bedrag;

  DB.transacties.push(tUit, tIn);
  save();
  closeModal('modal-transfer');
  updateBankHeader();
  updateBankStats();
  renderTransacties(true);
  toast(`Transfer van ${fmt(bedrag)} van ${van.naam} naar ${naar.naam} verwerkt.`,'success');
}



function getBanken(){
  return DB.grootboek.filter(g=>g.subtype==='bank');
}

function wisselBankRekening(id){
  DB.huidigeBankId = id;
  save();
  updateBankHeader();
  renderTransacties(true);
  updateBankStats();
}

function updateBankHeader(){
  const banken = getBanken();
  const sel = document.getElementById('bank-rekening-select');
  const lbl = document.getElementById('bank-rekening-label');
  if(!sel) return;

  // Zorg dat er altijd een geselecteerde bank is
  if(!DB.huidigeBankId && banken.length){
    DB.huidigeBankId = banken[0].id;
  }

  sel.innerHTML = banken.map(b=>
    `<option value="${b.id}" ${b.id===DB.huidigeBankId?'selected':''}>${b.naam}${b.iban?' — '+b.iban:''}</option>`
  ).join('') || '<option value="">Geen banken — voeg toe via ⚙</option>';

  const actief = banken.find(b=>b.id===DB.huidigeBankId);
  if(lbl) lbl.textContent = actief ? (actief.iban||actief.naam) : 'Geen rekening geselecteerd';
}

function openBankBeherenModal(){
  renderBankBeherenLijst();
  // Stel standaard rekeningnummer in
  const bestaandeNummers = DB.grootboek.map(g=>parseInt(g.nummer||0)).filter(n=>n>=1100&&n<1200);
  const volgend = bestaandeNummers.length ? Math.max(...bestaandeNummers)+1 : 1100;
  const el = document.getElementById('nieuw-bank-nummer');
  if(el) el.value = volgend;
  openModal('modal-bank-beheren');
}

function renderBankBeherenLijst(){
  const banken = getBanken();
  const el = document.getElementById('bank-beheren-lijst');
  if(!el) return;
  if(!banken.length){
    el.innerHTML='<div style="color:var(--text-dim);font-size:13px;padding:8px 0;">Geen bankrekeningen — voeg er een toe hieronder.</div>';
    return;
  }
  el.innerHTML = banken.map(b=>`
    <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);margin-bottom:8px;">
      <div style="flex:1;">
        <div style="font-size:13px;font-weight:600;">${b.naam}</div>
        <div style="font-size:11px;color:var(--text-dim);font-family:var(--mono);">${b.iban||'Geen IBAN'} &nbsp;·&nbsp; ${b.nummer} &nbsp;·&nbsp; Saldo: <strong>${fmt(b.saldo||0)}</strong></div>
      </div>
      ${b.id===DB.huidigeBankId?'<span class="badge badge-blue">Actief</span>':'<button class="btn btn-secondary btn-sm" onclick="wisselBankRekening(\''+b.id+'\');renderBankBeherenLijst()">Selecteer</button>'}
      <button class="btn btn-danger btn-sm" onclick="verwijderBank('${b.id}')">✕</button>
    </div>`).join('');
}

function voegBankToe(){
  const naam = document.getElementById('nieuw-bank-naam').value.trim();
  const iban = document.getElementById('nieuw-bank-iban').value.trim();
  const nummer = document.getElementById('nieuw-bank-nummer').value.trim();
  const saldo = parseFloat(document.getElementById('nieuw-bank-saldo').value)||0;
  if(!naam){ toast('Vul een naam in.','error'); return; }
  if(!nummer){ toast('Vul een rekeningnummer in.','error'); return; }
  if(DB.grootboek.find(g=>g.nummer===nummer)){
    toast(`Rekeningnummer ${nummer} bestaat al.`,'error'); return;
  }
  const id = uid();
  DB.grootboek.push({id, nummer, naam, type:'activa', subtype:'bank', iban, saldo});
  // Eerste bank automatisch actief maken
  if(!DB.huidigeBankId) DB.huidigeBankId = id;
  save();
  renderBankBeherenLijst();
  updateBankHeader();
  renderGB();
  // Reset velden
  document.getElementById('nieuw-bank-naam').value='';
  document.getElementById('nieuw-bank-iban').value='';
  toast(`${naam} toegevoegd.`,'success');
}

async function verwijderBank(id){
  const b = DB.grootboek.find(g=>g.id===id);
  if(!b) return;
  const transacties = DB.transacties.filter(t=>t.bankGbId===id||(!t.bankGbId&&id===DB.huidigeBankId));
  if(transacties.length){
    toast(`Kan niet verwijderen — ${transacties.length} transacties zijn gekoppeld aan deze rekening.`,'error');
    return;
  }
  const ok = await bevestig(`Bankrekening "${b.naam}" verwijderen?`,'Bank verwijderen','Verwijderen');
  if(!ok) return;
  DB.grootboek = DB.grootboek.filter(g=>g.id!==id);
  if(DB.huidigeBankId===id){
    const eerste = getBanken()[0];
    DB.huidigeBankId = eerste?.id||null;
  }
  save();
  renderBankBeherenLijst();
  updateBankHeader();
  renderGB();
  toast(`${b.naam} verwijderd.`,'info');
}



// IndexedDB setup
const IDB_NAME = 'LedgerBijlagen';
const IDB_STORE = 'bijlagen';
let _idb = null;

function openIDB(){
  return new Promise((resolve, reject)=>{
    if(_idb){ resolve(_idb); return; }
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if(!db.objectStoreNames.contains(IDB_STORE)){
        db.createObjectStore(IDB_STORE, {keyPath:'id'});
      }
    };
    req.onsuccess = e => { _idb = e.target.result; resolve(_idb); };
    req.onerror = () => reject(req.error);
  });
}

async function idbSla(id, data){
  const db = await openIDB();
  return new Promise((res,rej)=>{
    const tx = db.transaction(IDB_STORE,'readwrite');
    tx.objectStore(IDB_STORE).put({id, data});
    tx.oncomplete = ()=>res();
    tx.onerror = ()=>rej(tx.error);
  });
}

async function idbHaal(id){
  const db = await openIDB();
  return new Promise((res,rej)=>{
    const tx = db.transaction(IDB_STORE,'readonly');
    const req = tx.objectStore(IDB_STORE).get(id);
    req.onsuccess = ()=>res(req.result?.data||null);
    req.onerror = ()=>rej(req.error);
  });
}

async function idbVerwijder(id){
  const db = await openIDB();
  return new Promise((res,rej)=>{
    const tx = db.transaction(IDB_STORE,'readwrite');
    tx.objectStore(IDB_STORE).delete(id);
    tx.oncomplete = ()=>res();
    tx.onerror = ()=>rej(tx.error);
  });
}

// Bijlage ID formaat: "factuur_{factuurId}_{index}"
function bijlageIdbId(factuurId, index){ return `factuur_${factuurId}_${index}`; }

// Buffer voor bestanden die nog niet opgeslagen zijn (tijdens modal open)
let _bijlagenBuffer = []; // [{naam, type, data (dataURL), datum, isNew}]

function voegBijlagesToe(input){
  const files = Array.from(input.files);
  files.forEach(file=>{
    if(file.size > 10*1024*1024){ toast(`${file.name} is te groot (max 10MB).`,'error'); return; }
    const reader = new FileReader();
    reader.onload = e => {
      _bijlagenBuffer.push({naam:file.name, type:file.type, data:e.target.result, datum:new Date().toISOString(), isNew:true});
      renderBijlagenBuffer();
    };
    reader.readAsDataURL(file);
  });
  input.value='';
}

function renderBijlagenBuffer(){
  const el = document.getElementById('f-bijlagen-lijst');
  if(!el) return;
  if(!_bijlagenBuffer.length){ el.innerHTML=''; return; }
  el.innerHTML = _bijlagenBuffer.map((b,i)=>`
    <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;margin-bottom:6px;">
      <span style="">${b.type?.includes('pdf')?'📄':'🖼️'}</span>
      <span style="flex:1;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${b.naam}">${b.naam}</span>
      <span style="font-size:10px;color:var(--text-dim);font-family:var(--mono);">${b.isNew?'Nieuw':'Opgeslagen'}</span>
      <button onclick="_bijlagenBuffer.splice(${i},1);renderBijlagenBuffer()" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:14px;padding:0;">✕</button>
    </div>`).join('');
}

// Sla bijlagen buffer op in IndexedDB na factuur opslaan
async function slaaBijlagenOp(factuurId){
  // Verwijder eerst alle oude bijlagen voor deze factuur
  const db = await openIDB();
  const alleKeys = await new Promise(res=>{
    const tx = db.transaction(IDB_STORE,'readonly');
    const req = tx.objectStore(IDB_STORE).getAllKeys();
    req.onsuccess = ()=>res(req.result);
  });
  const oudeKeys = alleKeys.filter(k=>k.startsWith(`factuur_${factuurId}_`));
  for(const k of oudeKeys) await idbVerwijder(k);

  // Sla nieuwe buffer op
  for(let i=0; i<_bijlagenBuffer.length; i++){
    const b = _bijlagenBuffer[i];
    await idbSla(bijlageIdbId(factuurId, i), {naam:b.naam, type:b.type, datum:b.datum});
    // Data apart opslaan (kan groot zijn)
    await idbSla(bijlageIdbId(factuurId, i)+'_data', b.data);
  }
  // Sla metadata (namen, types) op in DB voor snelle weergave
  const meta = _bijlagenBuffer.map(b=>({naam:b.naam, type:b.type, datum:b.datum}));
  return meta;
}

// Verwijder alle bijlagen van een factuur uit IndexedDB
async function verwijderAlleBijlagen(factuurId){
  try {
    const db = await openIDB();
    const alleKeys = await new Promise(res=>{
      const tx = db.transaction(IDB_STORE,'readonly');
      const req = tx.objectStore(IDB_STORE).getAllKeys();
      req.onsuccess = ()=>res(req.result);
    });
    const keys = alleKeys.filter(k=>k.startsWith(`factuur_${factuurId}_`));
    for(const k of keys) await idbVerwijder(k);
  } catch(e){ console.warn('verwijderAlleBijlagen error:', e); }
}

// Haal bijlage data op uit IndexedDB en open in nieuw venster
async function openBijlage(factuurId, index){
  try {
    const data = await idbHaal(bijlageIdbId(factuurId, index)+'_data');
    if(!data){ toast('Bijlage niet gevonden.','error'); return; }
    const win = window.open();
    win.document.write(`<iframe src="${data}" style="width:100%;height:100%;border:none;"></iframe>`);
  } catch(e){ toast('Fout bij openen bijlage.','error'); }
}

async function downloadBijlage(factuurId, index, naam){
  try {
    const data = await idbHaal(bijlageIdbId(factuurId, index)+'_data');
    if(!data){ toast('Bijlage niet gevonden.','error'); return; }
    const a = document.createElement('a');
    a.href = data; a.download = naam; a.click();
  } catch(e){ toast('Fout bij downloaden bijlage.','error'); }
}

// Bijlagen viewer modal (vanuit factuurlijst)
let _bijlagenModalType = null; let _bijlagenModalId = null;

async function openBijlagenModal(type, id){
  _bijlagenModalType = type; _bijlagenModalId = id;
  const arr = type==='verkoop'?DB.verkoop:DB.inkoop;
  const f = arr.find(f=>f.id===id); if(!f) return;
  document.getElementById('bijlagen-modal-titel').textContent = `Bijlagen — ${f.nummer}`;
  await renderBijlagenModalLijst(f);
  openModal('modal-bijlagen');
}

async function renderBijlagenModalLijst(f){
  const el = document.getElementById('bijlagen-lijst-modal');
  if(!el) return;
  const meta = f.bijlagenMeta||[];
  if(!meta.length){
    el.innerHTML='<div style="color:var(--text-dim);font-size:13px;grid-column:1/-1;padding:12px 0;">Geen bijlagen</div>';
    return;
  }
  // Render skeletons eerst
  el.innerHTML = meta.map((b,i)=>`
    <div id="bijlage-card-${i}" style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;">
      <div style="height:110px;display:flex;align-items:center;justify-content:center;font-size:36px;">${b.type?.includes('pdf')?'📄':'🖼️'}</div>
      <div style="padding:8px;">
        <div style="font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${b.naam}">${b.naam}</div>
        <div style="display:flex;gap:6px;margin-top:6px;">
          <button class="btn btn-secondary btn-sm" style="flex:1;" onclick="openBijlage('${f.id}',${i})">Bekijk</button>
          <button class="btn btn-secondary btn-sm" onclick="downloadBijlage('${f.id}',${i},'${b.naam}')">↓</button>
          <button class="btn btn-danger btn-sm" onclick="verwijderBijlage('${_bijlagenModalType}','${_bijlagenModalId}',${i})">✕</button>
        </div>
      </div>
    </div>`).join('');

  // Laad thumbnails asynchroon voor afbeeldingen
  for(let i=0; i<meta.length; i++){
    if(meta[i].type?.includes('image')){
      try {
        const data = await idbHaal(bijlageIdbId(f.id, i)+'_data');
        if(data){
          const card = document.getElementById(`bijlage-card-${i}`);
          if(card){
            const preview = card.querySelector('div:first-child');
            preview.innerHTML = `<img src="${data}" style="width:100%;height:110px;object-fit:cover;cursor:pointer;" onclick="openBijlage('${f.id}',${i})">`;
          }
        }
      } catch(e){}
    }
  }
}

async function voegBijlagenToeViaModal(input){
  const arr = _bijlagenModalType==='verkoop'?DB.verkoop:DB.inkoop;
  const f = arr.find(f=>f.id===_bijlagenModalId); if(!f) return;
  if(!f.bijlagenMeta) f.bijlagenMeta=[];
  const files = Array.from(input.files);
  let loaded = 0;
  for(const file of files){
    if(file.size>10*1024*1024){ toast(`${file.name} is te groot (max 10MB).`,'error'); continue; }
    const data = await new Promise(res=>{ const r=new FileReader(); r.onload=e=>res(e.target.result); r.readAsDataURL(file); });
    const idx = f.bijlagenMeta.length;
    await idbSla(bijlageIdbId(f.id, idx), {naam:file.name, type:file.type, datum:new Date().toISOString()});
    await idbSla(bijlageIdbId(f.id, idx)+'_data', data);
    f.bijlagenMeta.push({naam:file.name, type:file.type, datum:new Date().toISOString()});
    loaded++;
  }
  if(loaded>0){
    save();
    await renderBijlagenModalLijst(f);
    renderFacturen(_bijlagenModalType);
    toast(`${loaded} bijlage(n) toegevoegd.`,'success');
  }
  input.value='';
}

async function verwijderBijlage(type, id, index){
  const arr = type==='verkoop'?DB.verkoop:DB.inkoop;
  const f = arr.find(f=>f.id===id); if(!f||!f.bijlagenMeta) return;

  // Verwijder uit IDB
  await idbVerwijder(bijlageIdbId(id, index));
  await idbVerwijder(bijlageIdbId(id, index)+'_data');

  // Hernummer resterende bijlagen in IDB
  const meta = f.bijlagenMeta;
  for(let i=index+1; i<meta.length; i++){
    const metaData = await idbHaal(bijlageIdbId(id, i));
    const fileData = await idbHaal(bijlageIdbId(id, i)+'_data');
    if(metaData) await idbSla(bijlageIdbId(id, i-1), metaData);
    if(fileData) await idbSla(bijlageIdbId(id, i-1)+'_data', fileData);
    await idbVerwijder(bijlageIdbId(id, i));
    await idbVerwijder(bijlageIdbId(id, i)+'_data');
  }

  f.bijlagenMeta.splice(index, 1);
  save();
  await renderBijlagenModalLijst(f);
  renderFacturen(type);
  toast('Bijlage verwijderd.','info');
}
