// ===== CSV MAPPER =====
let csvParsed=[];

function dragOver(e){e.preventDefault();document.getElementById('upload-zone').classList.add('drag');}
function dragLeave(){document.getElementById('upload-zone').classList.remove('drag');}
function dropCSV(e){e.preventDefault();dragLeave();if(e.dataTransfer.files[0])parseCSVFile(e.dataTransfer.files[0]);}
function loadCSV(e){if(e.target.files[0])parseCSVFile(e.target.files[0]);}

function parseCSVFile(file){
  const reader=new FileReader();
  reader.onload=function(e){
    const text=e.target.result;
    const lines=text.trim().split(/\r?\n/).filter(l=>l.trim());
    const sep=lines[0].includes(';')?';':lines[0].includes('\t')?'\t':',';
    const rows=lines.map(l=>l.split(sep).map(c=>c.trim().replace(/^["']|["']$/g,'')));
    DB.csvRaw=rows;
    // detect header row
    const firstRow=rows[0];
    const hasHeader=isNaN(parseFloat(firstRow[0].replace(',','.')));
    DB.csvHeaders=hasHeader?firstRow:firstRow.map((_,i)=>'Kolom '+(i+1));
    const dataRows=hasHeader?rows.slice(1):rows;
    csvParsed=dataRows;
    buildMapper();
    document.getElementById('bank-stap2').style.display='';
  };
  reader.readAsText(file);
}

function buildMapper(){
  const headers=DB.csvHeaders;
  const options=headers.map((h,i)=>`<option value="${i}">${h}</option>`).join('');
  const noneOpt='<option value="-1">— niet gebruiken —</option>';

  const guessIdx=(keywords)=>{
    const i=headers.findIndex(h=>keywords.some(k=>h.toLowerCase().includes(k)));
    return i>=0?i:-1;
  };
  const datumIdx=guessIdx(['transactiedatum','datum','date','dag']);
  const omsIdx=guessIdx(['tegenrekeninghouder','naam','name','omschrijving','description','memo']);
  let detailIdx=guessIdx(['omschrijving','mededeling','description','memo','betalingskenmerk','kenmerk','opmerking']);
  if(detailIdx===omsIdx) detailIdx=-1; // niet dezelfde kolom twee keer als titel én detail
  const bedragIdx=guessIdx(['bedrag','amount']);
  const tekenIdx=guessIdx(['creditdebet','cd','sign','teken','dc']);
  const creditIdx=-1;
  const debetIdx=-1;

  document.getElementById('mapper-grid').innerHTML=`
    <div class="mapper-col">
      <label>Datum kolom</label>
      <select id="map-datum" onchange="updatePreview()">${options}</select>
      <div class="col-sample" id="samp-datum"></div>
    </div>
    <div class="mapper-col">
      <label>Naam / tegenrekeninghouder kolom</label>
      <select id="map-oms" onchange="updatePreview()">${options}</select>
      <div class="col-sample" id="samp-oms"></div>
    </div>
    <div class="mapper-col">
      <label>Omschrijving / mededelingen kolom <span style="color:var(--text-dim);font-size:10px;">(optioneel)</span></label>
      <select id="map-detail" onchange="updatePreview()">${noneOpt}${options}</select>
      <div class="col-sample" id="samp-detail"></div>
    </div>
    <div class="mapper-col">
      <label>Bedrag kolom</label>
      <select id="map-bedrag" onchange="updatePreview()">${noneOpt}${options}</select>
      <div class="col-sample" id="samp-bedrag"></div>
    </div>
    <div class="mapper-col">
      <label>Teken kolom <span style="color:var(--text-dim);font-size:10px;">C/D of Credit/Debit</span></label>
      <select id="map-teken" onchange="updatePreview()">${noneOpt}${options}</select>
      <div class="col-sample" id="samp-teken"></div>
      <div style="font-size:10px;color:var(--text-dim);margin-top:4px;">C = geld binnen (positief) · D = geld weg (negatief)</div>
    </div>
    <div class="mapper-col">
      <label>Credit kolom <span style="color:var(--text-dim);font-size:10px;">(optioneel, apart bedrag)</span></label>
      <select id="map-credit" onchange="updatePreview()">${noneOpt}${options}</select>
      <div class="col-sample" id="samp-credit"></div>
    </div>
    <div class="mapper-col">
      <label>Debet kolom <span style="color:var(--text-dim);font-size:10px;">(optioneel, apart bedrag)</span></label>
      <select id="map-debet" onchange="updatePreview()">${noneOpt}${options}</select>
      <div class="col-sample" id="samp-debet"></div>
    </div>
    <div class="mapper-col">
      <label>Decimaalscheiding</label>
      <select id="map-dec" onchange="updatePreview()">
        <option value="auto">Automatisch detecteren</option>
        <option value=".">Punt ( 1234.56 )</option>
        <option value=",">Komma ( 1234,56 )</option>
      </select>
      <div class="col-sample" style="color:var(--text-dim);font-size:10px;">Gebruik 'komma' voor KNAB / Nederlandse banken</div>
    </div>
  `;
  document.getElementById('map-datum').value=datumIdx>=0?datumIdx:0;
  document.getElementById('map-oms').value=omsIdx>=0?omsIdx:0;
  document.getElementById('map-detail').value=detailIdx>=0?detailIdx:-1;
  document.getElementById('map-bedrag').value=bedragIdx>=0?bedragIdx:-1;
  document.getElementById('map-teken').value=tekenIdx>=0?tekenIdx:-1;
  document.getElementById('map-credit').value=-1;
  document.getElementById('map-debet').value=-1;
  updatePreview();
}

function parseBedrag(str,dec){
  if(!str) return NaN;
  str=str.trim().replace(/[€$£\s]/g,'');
  if(dec==='auto'){
    // If both . and , present, last one is decimal
    const hasDot=str.includes('.');
    const hasComma=str.includes(',');
    if(hasDot&&hasComma){
      // whichever comes last is decimal
      const lastDot=str.lastIndexOf('.');
      const lastComma=str.lastIndexOf(',');
      if(lastComma>lastDot) str=str.replace(/\./g,'').replace(',','.');
      else str=str.replace(/,/g,'');
    } else if(hasComma){
      // Could be thousands OR decimal — if only one comma and <=2 digits after, it's decimal
      const parts=str.split(',');
      if(parts.length===2&&parts[1].length<=2) str=str.replace(',','.');
      else str=str.replace(/,/g,'');
    }
  } else if(dec===','){
    str=str.replace(/\./g,'').replace(',','.');
  } else {
    str=str.replace(/,/g,'');
  }
  return parseFloat(str);
}

function getMappedRow(row){
  const dIdx=parseInt(document.getElementById('map-datum').value);
  const oIdx=parseInt(document.getElementById('map-oms').value);
  const detIdx=parseInt(document.getElementById('map-detail')?.value ?? '-1');
  const bIdx=parseInt(document.getElementById('map-bedrag').value);
  const tIdx=parseInt(document.getElementById('map-teken').value);
  const cIdx=parseInt(document.getElementById('map-credit').value);
  const dIdxD=parseInt(document.getElementById('map-debet').value);
  const dec=document.getElementById('map-dec').value;

  const datum=row[dIdx]||'';
  const oms=row[oIdx]||'';
  const detail=detIdx>=0?(row[detIdx]||''):'';
  let bedrag=NaN;

  if(cIdx>=0||dIdxD>=0){
    // Aparte credit en debet kolommen (bijv. ING)
    const credit=cIdx>=0?parseBedrag(row[cIdx],dec):0;
    const debet=dIdxD>=0?parseBedrag(row[dIdxD],dec):0;
    bedrag=(isNaN(credit)?0:credit)-(isNaN(debet)?0:debet);
  } else if(bIdx>=0){
    // Één bedragkolom
    bedrag=parseBedrag(row[bIdx],dec);
    if(!isNaN(bedrag)&&tIdx>=0){
      // Teken kolom aanwezig (bijv. KNAB CreditDebet = C of D)
      const teken=(row[tIdx]||'').trim().toUpperCase();
      if(teken==='D'||teken==='DEBIT'||teken==='DEBET'){
        bedrag=Math.abs(bedrag)*-1; // geld weg = negatief
      } else if(teken==='C'||teken==='CREDIT'){
        bedrag=Math.abs(bedrag); // geld binnen = positief
      }
    }
  }
  return {datum,oms,detail,bedrag};
}

function updatePreview(){
  const dIdx=parseInt(document.getElementById('map-datum').value);
  const oIdx=parseInt(document.getElementById('map-oms').value);
  const bIdx=parseInt(document.getElementById('map-bedrag').value);
  const tIdx=parseInt(document.getElementById('map-teken').value);
  const cIdx=parseInt(document.getElementById('map-credit').value);
  const dIdxD=parseInt(document.getElementById('map-debet').value);
  const detIdx=parseInt(document.getElementById('map-detail')?.value ?? '-1');
  const first=csvParsed[0]||[];
  document.getElementById('samp-datum').textContent=first[dIdx]||'—';
  document.getElementById('samp-oms').textContent=first[oIdx]||'—';
  const sd=document.getElementById('samp-detail'); if(sd) sd.textContent=detIdx>=0?(first[detIdx]||'—'):'—';
  document.getElementById('samp-bedrag').textContent=bIdx>=0?(first[bIdx]||'—'):'—';
  document.getElementById('samp-teken').textContent=tIdx>=0?(first[tIdx]||'—'):'—';
  document.getElementById('samp-credit').textContent=cIdx>=0?(first[cIdx]||'—'):'—';
  document.getElementById('samp-debet').textContent=dIdxD>=0?(first[dIdxD]||'—'):'—';

  const preview=csvParsed.slice(0,5);
  document.getElementById('preview-mapped-tbody').innerHTML=preview.map(row=>{
    const m=getMappedRow(row);
    const bedragOK=!isNaN(m.bedrag);
    const cls=bedragOK?(m.bedrag>=0?'amount-pos':'amount-neg'):'';
    const tekenVal=tIdx>=0?(row[tIdx]||''):'';
    return `<tr>
      <td>${m.datum}</td>
      <td>${m.oms}${tekenVal?` <span style="font-size:10px;color:var(--text-dim);">[${tekenVal}]</span>`:''}${m.detail?`<div style="font-size:10px;color:var(--text-dim);">${m.detail}</div>`:''}</td>
      <td class="mono ${cls}">${bedragOK?fmt(m.bedrag):'<span style="color:var(--danger)">⚠ niet herkend</span>'}</td>
    </tr>`;
  }).join('');
  document.getElementById('import-count').textContent=csvParsed.length;
}

function bevestigImport(){
  const importId=uid();
  const importDatum=today();
  let count=0;
  let dubbel=0;
  // Duplicaat-detectie als MULTISET, niet als "bestaat er één identieke?".
  // Reden: twee ECHTE betalingen van hetzelfde bedrag op dezelfde dag met dezelfde
  // omschrijving zijn geen dubbelen — die moeten allebei geïmporteerd worden. We
  // slaan een rij alleen over als er nog een BESTAANDE identieke transactie "over"
  // is die nog niet door deze import geclaimd is (= je importeert hetzelfde bestand
  // of een overlappende periode opnieuw). Rijen binnen één en dezelfde CSV worden
  // NOOIT als duplicaat van elkaar gezien.
  const dupSleutel=(datum,bedrag,oms)=>`${datum}|${parseFloat(bedrag)}|${oms}`;
  const bestaandTeller={};
  DB.transacties.forEach(t=>{
    const k=dupSleutel(t.datum,t.bedrag,t.omschrijving);
    bestaandTeller[k]=(bestaandTeller[k]||0)+1;
  });
  csvParsed.forEach(row=>{
    const m=getMappedRow(row);
    if(isNaN(m.bedrag)){return;}
    const k=dupSleutel(m.datum,m.bedrag,m.oms);
    if(bestaandTeller[k]>0){
      // Er staat nog een ongeclaimde identieke transactie in de administratie →
      // deze rij is een her-import van een al bestaande transactie.
      bestaandTeller[k]--;
      dubbel++;
      return;
    }
    DB.transacties.push({id:uid(),datum:m.datum,omschrijving:m.oms,detail:m.detail||'',bedrag:m.bedrag,status:'ongekoppeld',gekoppeldAan:null,gekoppeldType:null,bankGbId:null,importId});
    count++;
  });
  // Sla import op in geschiedenis
  if(!DB.imports) DB.imports=[];
  DB.imports.push({id:importId,datum:importDatum,aantalTransacties:count});
  save(); resetCSV(); renderTransacties(); updateBankStats();
  renderImports();
  if(dubbel>0) toast(`${count} transacties geïmporteerd, ${dubbel} dubbele overgeslagen.`,'info');
  else toast(`${count} transacties geïmporteerd.`,'success');
}

function resetCSV(){
  csvParsed=[]; DB.csvRaw=[]; DB.csvHeaders=[];
  document.getElementById('bank-stap2').style.display='none';
  document.getElementById('csv-input').value='';
}

// ===== INLINE KOPPELEN =====
const inlineBTW={};           // tId -> tarief
const inlineBTWHandmatig={};  // tId -> true als de gebruiker zelf een BTW-knop klikte

// Standaard BTW-tarief van een rekening (Grootboek → bewerken → "Standaard BTW").
// Retourneert null als er geen standaard is ingesteld.
function _gbBtwStandaard(g){
  return (g && g.btwStandaard!=null && g.btwStandaard!=='') ? parseInt(g.btwStandaard) : null;
}

// auto=true: voorinvulling vanuit de rekening-standaard — mag een handmatige klik nooit overschrijven
function setBTW(tId, tarief, auto){
  if(!auto) inlineBTWHandmatig[tId]=true;
  inlineBTW[tId]=tarief;
  // Highlight actieve knop
  [0,9,21].forEach(t=>{
    const btn=document.getElementById(`iw-btw-${tId}-${t}`);
    if(!btn) return;
    if(t===tarief){
      btn.style.background='var(--accent2)'; btn.style.color='#fff'; btn.style.borderColor='var(--accent2)';
    } else {
      btn.style.background='var(--surface2)'; btn.style.color='var(--text-mid)'; btn.style.borderColor='var(--border)';
    }
  });
  // Toon BTW bedrag
  const t=DB.transacties.find(t=>t.id===tId);
  if(t){
    const bedrag=Math.abs(parseFloat(t.bedrag));
    const btwBedrag=tarief>0?bedrag-(bedrag/((100+tarief)/100)):0;
    const el=document.getElementById(`iw-btw-bedrag-${tId}`);
    if(el) el.textContent=tarief>0?`BTW: ${fmt(btwBedrag)}`:'';
  }
}

// Bij het kiezen van een grootboekrekening in het inline-formulier: standaard BTW voorzetten
function iwGbGekozen(tId){
  if(inlineBTWHandmatig[tId]) return; // handmatige keuze wint altijd
  const val=document.getElementById(`iw-gb-${tId}`)?.value||'';
  if(!val.startsWith('gb:')) return;
  const g=DB.grootboek.find(g=>g.id===val.slice(3));
  const std=_gbBtwStandaard(g);
  if(std!=null) setBTW(tId, std, true);
}

function toggleSplits(tId){
  const el=document.getElementById(`iw-splits-${tId}`);
  if(!el) return;
  const open=el.style.display==='none';
  el.style.display=open?'':'none';
  if(open){
    // Voeg eerste rij toe als er nog geen zijn
    const rows=document.getElementById(`iw-splits-rows-${tId}`);
    if(rows&&rows.children.length===0) addSplitsRow(tId);
    herbereken(tId);
  }
}

function addSplitsRow(tId){
  const container=document.getElementById(`iw-splits-rows-${tId}`);
  if(!container) return;
  const gbOpts=DB.grootboek.map(g=>`<option value="gb:${g.id}">${g.nummer} — ${g.naam}</option>`).join('');
  const rowId=`sr-${tId}-${Date.now()}`;
  const div=document.createElement('div');
  div.className='splits-row';
  div.id=rowId;
  div.style.cssText='background:var(--surface2);border:1px solid var(--border);border-radius:5px;padding:8px;margin-bottom:6px;';
  div.innerHTML=`
    <div style="display:grid;grid-template-columns:1fr 90px 24px;gap:6px;margin-bottom:6px;">
      <select style="font-size:12px;" onchange="splitsGbGekozen('${rowId}')"><option value="">— Rekening —</option>${gbOpts}</select>
      <input type="number" placeholder="Bedrag" step="0.01" style="font-size:12px;" oninput="herbereken('${tId}')">
      <button class="btn-icon" onclick="document.getElementById('${rowId}').remove();herbereken('${tId}')" style="color:var(--danger);">✕</button>
    </div>
    <div style="display:flex;align-items:center;gap:4px;">
      <span style="font-size:10px;color:var(--text-dim);font-family:var(--mono);text-transform:uppercase;margin-right:2px;">BTW</span>
      <button onclick="setSplitsBTW('${rowId}',0)" data-btw="0" style="padding:2px 7px;border-radius:3px;font-size:11px;font-family:var(--mono);background:var(--surface);border:1px solid var(--border);color:var(--text-mid);cursor:pointer;">0%</button>
      <button onclick="setSplitsBTW('${rowId}',9)" data-btw="9" style="padding:2px 7px;border-radius:3px;font-size:11px;font-family:var(--mono);background:var(--surface);border:1px solid var(--border);color:var(--text-mid);cursor:pointer;">9%</button>
      <button onclick="setSplitsBTW('${rowId}',21)" data-btw="21" style="padding:2px 7px;border-radius:3px;font-size:11px;font-family:var(--mono);background:var(--surface);border:1px solid var(--border);color:var(--text-mid);cursor:pointer;">21%</button>
      <span class="splits-btw-bedrag" style="font-size:11px;color:var(--text-dim);font-family:var(--mono);margin-left:4px;"></span>
    </div>`;
  container.appendChild(div);
}

// Bij het kiezen van een rekening in een splitsregel: standaard BTW voorzetten
function splitsGbGekozen(rowId){
  const row=document.getElementById(rowId);
  if(!row || row.dataset.btwHandmatig==='1') return; // handmatige keuze wint altijd
  const val=row.querySelector('select')?.value||'';
  if(!val.startsWith('gb:')) return;
  const g=DB.grootboek.find(g=>g.id===val.slice(3));
  const std=_gbBtwStandaard(g);
  if(std!=null) setSplitsBTW(rowId, std, true);
}

// auto=true: voorinvulling vanuit de rekening-standaard — mag een handmatige klik nooit overschrijven
function setSplitsBTW(rowId, tarief, auto){
  const row=document.getElementById(rowId);
  if(!row) return;
  if(!auto) row.dataset.btwHandmatig='1';
  // Highlight knoppen
  row.querySelectorAll('[data-btw]').forEach(btn=>{
    const t=parseInt(btn.dataset.btw);
    if(t===tarief){ btn.style.background='var(--accent2)'; btn.style.color='#fff'; btn.style.borderColor='var(--accent2)'; }
    else { btn.style.background='var(--surface)'; btn.style.color='var(--text-mid)'; btn.style.borderColor='var(--border)'; }
  });
  row.dataset.btwTarief=tarief;
  // Bereken BTW bedrag
  const inp=row.querySelector('input[type="number"]');
  const bedrag=parseFloat(inp?.value)||0;
  const btwBedrag=tarief>0?bedrag-(bedrag/((100+tarief)/100)):0;
  const label=row.querySelector('.splits-btw-bedrag');
  if(label) label.textContent=tarief>0?`BTW: ${fmt(btwBedrag)}`:'';
}

function herbereken(tId){
  const t=DB.transacties.find(t=>t.id===tId);
  if(!t) return;
  const totaal=Math.abs(parseFloat(t.bedrag));
  const rows=document.querySelectorAll(`#iw-splits-rows-${tId} .splits-row`);
  let gebruikt=0;
  rows.forEach(r=>{
    const inp=r.querySelector('input[type="number"]');
    if(inp&&inp.value) gebruikt+=parseFloat(inp.value)||0;
    // Update BTW bedrag label als tarief al gekozen
    const tarief=parseInt(r.dataset.btwTarief||0);
    if(tarief>0){
      const bedrag=parseFloat(inp?.value)||0;
      const btwBedrag=bedrag-(bedrag/((100+tarief)/100));
      const label=r.querySelector('.splits-btw-bedrag');
      if(label) label.textContent=`BTW: ${fmt(btwBedrag)}`;
    }
  });
  const rest=totaal-gebruikt;
  const el=document.getElementById(`iw-splits-rest-${tId}`);
  if(el){
    el.textContent=`Restant: ${fmt(rest)}`;
    el.style.color=Math.abs(rest)<0.01?'var(--accent)':'var(--warning)';
  }
}

async function inlineBevestig(tId, totalBedrag){
  const t=DB.transacties.find(t=>t.id===tId); if(!t) return;
  const bedrag=parseFloat(t.bedrag);
  const splitsWrap=document.getElementById(`iw-splits-${tId}`);
  const splitsOpen=splitsWrap&&splitsWrap.style.display!=='none';
  const contact=document.getElementById(`iw-contact-${tId}`)?.value||'';
  const why=document.getElementById(`iw-why-${tId}`)?.value||t.omschrijving;
  const btwTarief=inlineBTW[tId]||0;

  if(splitsOpen){
    const rows=document.querySelectorAll(`#iw-splits-rows-${tId} .splits-row`);
    // Verzamel eerst de geldige gesplitste regels. Boek pas als ze samen exact het
    // bankbedrag dekken — anders wordt de bank voor het volle bedrag geboekt terwijl
    // er minder op de grootboekrekeningen komt (stille disbalans).
    const splitsRegels=[];
    rows.forEach(r=>{
      const sel=r.querySelector('select'); const inp=r.querySelector('input[type="number"]');
      if(!sel||!inp||!sel.value||!inp.value) return;
      const [prefix,id]=sel.value.split(':');
      if(prefix!=='gb') return;
      const g=DB.grootboek.find(g=>g.id===id); if(!g) return;
      const deel=parseFloat(inp.value)||0;
      if(deel<=0) return;
      splitsRegels.push({g, deel, rowTarief:parseInt(r.dataset.btwTarief||0)});
    });
    if(!splitsRegels.length){toast('Voeg minstens één gesplitste regel toe.','error');return;}
    const somDeel=rond(splitsRegels.reduce((a,x)=>a+x.deel,0));
    if(Math.abs(somDeel - Math.abs(bedrag)) > 0.01){
      toast(`De gesplitste regels (${fmt(somDeel)}) moeten samen precies het bankbedrag (${fmt(Math.abs(bedrag))}) dekken.`,'error');
      return;
    }
    // `deel` is een positief deelbedrag; teken volgt uit de banktransactie.
    splitsRegels.forEach(x=>_boekTegenrekening(x.g, (bedrag>=0?x.deel:-x.deel), x.rowTarief));
    boekBank(t,bedrag);
    t.gekoppeldAan=`Gesplitst (${splitsRegels.length} regels)`+(contact?' — '+contact:'');
    t.gekoppeldType='grootboek'; t.status='gekoppeld';
    // Bewaar de deelregels zodat de P&L/grootboekkaart de omzet/kosten per categorie ziet.
    t.splitsRegels = splitsRegels.map(x=>({gbId:x.g.id, bedrag:(bedrag>=0?x.deel:-x.deel), btwTarief:x.rowTarief||0}));
  } else {
    const selVal=document.getElementById(`iw-gb-${tId}`)?.value;
    if(!selVal){toast('Kies een rekening of factuur.','error');return;}
    const [prefix,id]=selVal.split(':');
    if(prefix==='vk'){
      const f=DB.verkoop.find(f=>f.id===id); if(!f) return;
      // Bedragvalidatie: banktransactie moet overeenkomen met factuurbedrag (±1 cent marge)
      const verschilVK = Math.abs(Math.abs(bedrag) - parseFloat(f.totaalIncl||0));
      if(verschilVK > 0.02){
        const bevestigd = await bevestig(
          `Het bankbedrag (${fmt(Math.abs(bedrag))}) wijkt af van de factuur (${fmt(f.totaalIncl)}).

Verschil: ${fmt(verschilVK)}

Wil je toch koppelen?`,
          'Bedrag komt niet overeen',
          'Toch koppelen'
        );
        if(!bevestigd) return;
      }
      t.gekoppeldAan=f.nummer+' — '+f.klant; t.gekoppeldType='verkoop'; t.status='gekoppeld'; t.factuurId=f.id;
      if(bedrag>0){
        const totaal = parseFloat(f.totaalIncl||0);
        const reedsBetaald = parseFloat(f.betaald||0);
        const nieuwBetaald = rond(reedsBetaald + Math.abs(bedrag));
        f.betaald = nieuwBetaald;
        f.restBedrag = rond(Math.max(0, totaal - nieuwBetaald));
        f.status = f.restBedrag < 0.02 ? 'betaald' : 'gedeeltelijk';
      }
      boekBank(t,bedrag); boekFactuurTegenboeking(t,'verkoop','boek');
      boekBetalingsverschil(bedrag, f.totaalIncl);
    } else if(prefix==='ik'){
      const f=DB.inkoop.find(f=>f.id===id); if(!f) return;
      // Bedragvalidatie
      const verschilIK = Math.abs(Math.abs(bedrag) - parseFloat(f.totaalIncl||0));
      if(verschilIK > 0.02){
        const bevestigd = await bevestig(
          `Het bankbedrag (${fmt(Math.abs(bedrag))}) wijkt af van de factuur (${fmt(f.totaalIncl)}).

Verschil: ${fmt(verschilIK)}

Wil je toch koppelen?`,
          'Bedrag komt niet overeen',
          'Toch koppelen'
        );
        if(!bevestigd) return;
      }
      t.gekoppeldAan=f.nummer+' — '+f.klant; t.gekoppeldType='inkoop'; t.status='gekoppeld'; t.factuurId=f.id;
      if(bedrag<0){
        const totaal = parseFloat(f.totaalIncl||0);
        const reedsBetaald = parseFloat(f.betaald||0);
        const nieuwBetaald = rond(reedsBetaald + Math.abs(bedrag));
        f.betaald = nieuwBetaald;
        f.restBedrag = rond(Math.max(0, totaal - nieuwBetaald));
        f.status = f.restBedrag < 0.02 ? 'betaald' : 'gedeeltelijk';
      }
      boekBank(t,bedrag); boekFactuurTegenboeking(t,'inkoop','boek');
      boekBetalingsverschil(bedrag, f.totaalIncl);
    } else {
      const g=DB.grootboek.find(g=>g.id===id); if(!g) return;
      _boekTegenrekening(g, bedrag, btwTarief);
      boekBank(t,bedrag);
      t.gekoppeldAan=g.nummer+' — '+g.naam; t.gekoppeldType='grootboek'; t.status='gekoppeld';
      t.tegenrekeningId=g.id; t.btwTarief=btwTarief; // voor exacte P&L/grootboekkaart (excl. BTW)
      // Vaste activa detectie via directe bank koppeling (geen factuur)
      if(g.type==='vaste_activa'){
        const alBestaand=(DB.vasteActiva||[]).some(a=>a.factuurId===t.id);
        if(!alBestaand){
          const fakeFactuur={id:t.id,datum:t.datum,klant:t.omschrijving,
            nummer:'BANK-'+t.id.slice(-6),totaalExcl:Math.abs(bedrag),
            regels:[{omschrijving:t.omschrijving}]};
          setTimeout(()=>openDeprVraagModal(fakeFactuur,g),400);
        }
      }
    }
    if(contact) t.omschrijving=contact+(why&&why!==t.omschrijving?' — '+why:'');
  }
  save(); updateBankStats(); toast('Gekoppeld.','success'); renderTransacties(false);
}

// ===== DUBBELE BOEKING HELPERS =====

function boekBetalingsverschil(bankBedrag, factuurBedrag){
  // Boek het verschil tussen bank en factuur naar 8900 Betalingsverschillen
  const bank = Math.abs(parseFloat(bankBedrag)||0);
  const factuur = Math.abs(parseFloat(factuurBedrag)||0);
  const verschil = bank - factuur; // positief = bank meer, negatief = bank minder
  if(Math.abs(verschil) < 0.02) return; // geen verschil
  const rek = DB.grootboek.find(g=>g.nummer==='8900'||g.naam==='Betalingsverschillen');
  if(!rek) return;
  // Verschil naar betalingsverschillen boeken
  rek.saldo = (parseFloat(rek.saldo)||0) + verschil;
}

// Zoek de bankrekening (1100 of eerste activa met 'bank' in naam)
function getBankRekening(){
  // Gebruik geselecteerde bank, anders eerste beschikbare
  if(DB.huidigeBankId){
    const gevonden = DB.grootboek.find(g=>g.id===DB.huidigeBankId);
    if(gevonden) return gevonden;
  }
  return DB.grootboek.find(g=>g.subtype==='bank')||
         DB.grootboek.find(g=>g.nummer==='1100')||
         DB.grootboek.find(g=>(g.naam||'').toLowerCase().includes('bank'))||
         // Kas is het laatste échte liquide alternatief. NOOIT terugvallen op
         // "de eerste activa-rekening": dat kan Debiteuren of BTW te vorderen
         // opleveren, en dan boekt een betaling zichzelf weg op dezelfde
         // rekening als de tegenboeking — saldo blijft staan, balans klopt,
         // geen foutmelding. Liever niets teruggeven; elke aanroeper vangt dat af.
         DB.grootboek.find(g=>g.nummer==='1000')||
         null;
}

// Boekt een bankbedrag op een tegen-grootboekrekening volgens de juiste
// boekhoudkundige conventie, zodat de balans ALTIJD klopt:
//   - het bedrag EXCL. BTW komt op de gekozen rekening;
//   - het teken volgt uit het rekeningtype: credit-normaal (omzet/passiva/eigen
//     vermogen) boekt +excl, debet-normaal (kosten/activa) boekt −excl. Zo krijgt
//     een uitgave op een kostenrekening een POSITIEF saldo (kosten stijgen) i.p.v.
//     negatief, waardoor de balans niet meer 2× scheef loopt;
//   - het BTW-deel gaat naar de RICHTING-juiste BTW-rekening: bij een ontvangst
//     naar 1510 'BTW te betalen' (passiva), bij een uitgave naar 1500 'BTW te
//     vorderen' (activa) — net als de factuurboekingen in facturen.js.
// `bedrag` is het ONDERTEKENDE bankbedrag (ontvangst +, uitgave −).
// `mult` = +1 om te boeken (standaard), −1 om exact terug te draaien (ontkoppelen).
// De BTW-RICHTING blijft altijd op het originele `bedrag` bepaald, zodat terugdraaien
// dezelfde BTW-rekening raakt als de oorspronkelijke boeking.
function _boekTegenrekening(g, bedrag, btwTarief, mult){
  bedrag = parseFloat(bedrag)||0;
  btwTarief = parseFloat(btwTarief)||0;
  mult = (mult===-1) ? -1 : 1;
  const creditNorm = x => ['omzet','passiva','eigen_vermogen'].includes(x.type);
  const exclSigned = rond(btwTarief>0 ? bedrag/((100+btwTarief)/100) : bedrag);
  const btwSigned  = rond(bedrag - exclSigned);
  g.saldo = rond((parseFloat(g.saldo)||0) + mult*(creditNorm(g) ? exclSigned : -exclSigned));
  if(btwTarief>0 && Math.abs(btwSigned) > 0.001){
    const isInkomst = bedrag >= 0;
    const btwRek = isInkomst
      ? (DB.grootboek.find(x=>x.nummer==='1510') || DB.grootboek.find(x=>x.nummer==='1530') || DB.grootboek.find(x=>x.naam?.toLowerCase().includes('btw te betalen')))
      : (DB.grootboek.find(x=>x.nummer==='1500') || DB.grootboek.find(x=>x.nummer==='1520') || DB.grootboek.find(x=>x.naam?.toLowerCase().includes('btw te vorderen')));
    if(btwRek) btwRek.saldo = rond((parseFloat(btwRek.saldo)||0) + mult*(creditNorm(btwRek) ? btwSigned : -btwSigned));
  }
}

// Pas bankrekening saldo aan en sla referentie op in transactie
function boekBank(t, bedrag){
  const bank=getBankRekening();
  if(!bank) return;
  bank.saldo=rond((parseFloat(bank.saldo)||0)+(parseFloat(bedrag)||0));
  t.bankGbId=bank.id;
}

// Pas tegenboeking aan op factuur (debiteuren/crediteuren)
function boekFactuurTegenboeking(t, factuurType, actie){
  // Wordt aangeroepen bij KOPPELEN van bankbetaling aan factuur
  // Op dit punt is omzet/kosten al geboekt bij aanmaken factuur
  // Hier boeken we alleen: Bank ↔ Debiteuren/Crediteuren
  const mult = actie==='draai' ? -1 : 1;
  const bedrag = Math.abs(parseFloat(t.bedrag)||0);

  if(factuurType==='verkoop'){
    // Debet Bank (al gedaan via boekBank)
    // Credit Debiteuren (1300) — openstaande post wegboeken
    const deb = DB.grootboek.find(g=>g.nummer==='1300')
             || DB.grootboek.find(g=>g.naam.toLowerCase().includes('debiteuren'));
    if(deb) deb.saldo = (parseFloat(deb.saldo)||0) - (bedrag * mult);
  } else {
    // Credit Bank (al gedaan via boekBank — negatief bedrag)
    // Debet Crediteuren (4000) — openstaande post wegboeken.
    // Aanmaak van een inkoopfactuur doet saldo += incl (schuld ontstaat),
    // betaling moet dus -= doen. Stond hier eerst op +=, waardoor de
    // crediteurenschuld verdubbelde bij elke gekoppelde inkoopbetaling.
    const cred = DB.grootboek.find(g=>g.nummer==='2100')
              || DB.grootboek.find(g=>g.nummer==='4000')
              || DB.grootboek.find(g=>g.naam.toLowerCase().includes('crediteur'));
    if(cred) cred.saldo = (parseFloat(cred.saldo)||0) - (bedrag * mult);
  }
}

function updateBankStats(){
  // Filter op actieve bank — transacties zonder bankGbId tellen bij alle banken mee
  const bankId = DB.huidigeBankId;
  const transacties = bankId
    ? DB.transacties.filter(t=>t.bankGbId===bankId||!t.bankGbId)
    : DB.transacties;
  const ontvangen=transacties.filter(t=>parseFloat(t.bedrag)>0).reduce((a,t)=>a+parseFloat(t.bedrag),0);
  const uitgegeven=transacties.filter(t=>parseFloat(t.bedrag)<0).reduce((a,t)=>a+Math.abs(parseFloat(t.bedrag)),0);
  const bankRek = getBankRekening();
  const saldo = parseFloat(bankRek?.saldo||0);
  const ongekoppeld=transacties.filter(t=>t.status==='ongekoppeld').length;
const saldoEl = document.getElementById('bank-saldo-val');
  if(saldoEl){
    saldoEl.textContent=fmt(saldo);
    saldoEl.className='value '+(saldo>=0?'green':'red');
    document.getElementById('bank-ontvangen-val').textContent=fmt(ontvangen);
    document.getElementById('bank-uitgegeven-val').textContent=fmt(uitgegeven);
    document.getElementById('bank-ongekoppeld-val').textContent=ongekoppeld;
    const badge=document.getElementById('bank-tab-badge');
    if(badge) badge.textContent=ongekoppeld;
  }
}

// ===== BANK TABS =====
let bankTab='koppelen';
let alleTFilter='';
let allePagina=1;
const ALLE_PER_PAGINA=50;

function switchBankTab(tab){
  bankTab=tab;
  ['koppelen','alles','import','statements'].forEach(t=>{
    document.getElementById('bank-tab-'+t).classList.toggle('active',t===tab);
    document.getElementById('bank-wrap-'+t).style.display=t===tab?'':'none';
  });
  if(tab==='koppelen') renderTransacties();
  if(tab==='alles') renderAlleTransacties(true);
  if(tab==='statements') renderImports();
}

function filterAllT(v){ alleTFilter=v; renderAlleTransacties(true); }

function renderAlleTransacties(reset){
  if(reset) allePagina=1;
  let list=[...DB.transacties];
  if(alleTFilter) list=list.filter(t=>t.omschrijving.toLowerCase().includes(alleTFilter.toLowerCase()));
  list=list.slice().reverse();

  const totaal=list.length;
  const totaalPag=Math.max(1,Math.ceil(totaal/ALLE_PER_PAGINA));
  if(allePagina>totaalPag) allePagina=totaalPag;
  const start=(allePagina-1)*ALLE_PER_PAGINA;
  const pagina=list.slice(start,start+ALLE_PER_PAGINA);

  const tbody=document.getElementById('alles-tbody');
  if(!totaal){ tbody.innerHTML='<tr><td colspan="6"><div class="empty"><p>Geen transacties</p></div></td></tr>'; document.getElementById('alles-paginering').innerHTML=''; return; }

  tbody.innerHTML=pagina.map(t=>`<tr>
    <td>${t.datum}</td>
    <td style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${t.omschrijving}</td>
    <td class="mono ${parseFloat(t.bedrag)>=0?'amount-pos':'amount-neg'}">${fmt(t.bedrag)}</td>
    <td>${t.status==='gekoppeld'?'<span class="badge badge-green">Gekoppeld</span>':'<span class="badge badge-orange">Ongekoppeld</span>'}</td>
    <td style="font-size:12px;color:var(--text-dim);">${t.gekoppeldAan||'—'}</td>
    <td style="white-space:nowrap;">
      ${t.status==='ongekoppeld'?`<button class="btn btn-secondary btn-sm" onclick="openKoppelModal('${t.id}')">Koppelen</button>`:`<button class="btn btn-danger btn-sm" onclick="ontkoppel('${t.id}')">Ontkoppel</button>`}
      <button class="btn btn-danger btn-sm" onclick="verwijderT('${t.id}')">✕</button>
    </td>
  </tr>`).join('');

  const van=start+1; const tot=Math.min(start+ALLE_PER_PAGINA,totaal);
  let pag=`<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;margin-top:8px;border-top:1px solid var(--border);">
    <span style="font-size:12px;color:var(--text-dim);font-family:var(--mono);">${van}–${tot} van ${totaal}</span>
    <div style="display:flex;gap:6px;">
      <button class="btn btn-secondary btn-sm" onclick="allePaginaGa(1)" ${allePagina===1?'disabled':''}>«</button>
      <button class="btn btn-secondary btn-sm" onclick="allePaginaGa(${allePagina-1})" ${allePagina===1?'disabled':''}>‹</button>`;
  const sp=Math.max(1,allePagina-2); const ep=Math.min(totaalPag,sp+4);
  for(let p=sp;p<=ep;p++) pag+=`<button class="btn btn-sm ${p===allePagina?'btn-primary':'btn-secondary'}" onclick="allePaginaGa(${p})">${p}</button>`;
  pag+=`<button class="btn btn-secondary btn-sm" onclick="allePaginaGa(${allePagina+1})" ${allePagina===totaalPag?'disabled':''}>›</button>
      <button class="btn btn-secondary btn-sm" onclick="allePaginaGa(${totaalPag})" ${allePagina===totaalPag?'disabled':''}>»</button>
    </div></div>`;
  document.getElementById('alles-paginering').innerHTML=pag;
}

function allePaginaGa(p){ allePagina=p; renderAlleTransacties(false); }

// ===== TRANSACTIES =====
function filterT(v){DB.fT=v;renderTransacties(true);}
function filterTS(v){DB.fsT=v;renderTransacties(true);}

function getCheckedIds(){
  return [...document.querySelectorAll('.t-chk:checked')].map(c=>c.dataset.id);
}

function updateBulkBar(){
  const ids=getCheckedIds();
  const bar=document.getElementById('bulk-bar');
  if(ids.length>0){
    bar.style.display='flex';
    document.getElementById('bulk-count').textContent=ids.length+' geselecteerd';
    document.getElementById('bulk-gb-sel').innerHTML=
      '<option value="">— Selecteer grootboekrekening —</option>'+
      DB.grootboek.map(g=>`<option value="${g.id}">${g.nummer} — ${g.naam}</option>`).join('');
  } else {
    bar.style.display='none';
  }
}

function toggleAllChk(checked){
  document.querySelectorAll('.t-chk').forEach(c=>c.checked=checked);
  updateBulkBar();
}

function deselectAll(){
  document.querySelectorAll('.t-chk').forEach(c=>c.checked=false);
  const chkAll=document.getElementById('chk-all');
  if(chkAll) chkAll.checked=false;
  updateBulkBar();
}

function bevestigBulkKoppeling(){
  const ids=getCheckedIds();
  const gid=document.getElementById('bulk-gb-sel').value;
  if(!gid){toast('Selecteer eerst een grootboekrekening.','error');return;}
  if(!ids.length){toast('Selecteer eerst transacties.','error');return;}
  const g=DB.grootboek.find(g=>g.id===gid);
  if(!g) return;
  // Bulk kent geen BTW-knoppen → gebruik de standaard BTW van de rekening (anders 0)
  const bulkTarief=_gbBtwStandaard(g)??0;
  ids.forEach(id=>{
    const t=DB.transacties.find(t=>t.id===id);
    if(!t||t.status==='gekoppeld') return;
    _boekTegenrekening(g, parseFloat(t.bedrag), bulkTarief);
    // Bankboeking
    boekBank(t, t.bedrag);
    t.gekoppeldAan=g.nummer+' — '+g.naam;
    t.gekoppeldType='grootboek';
    t.tegenrekeningId=g.id; t.btwTarief=bulkTarief;
    t.status='gekoppeld';
  });
  save();
  deselectAll();
  renderTransacties();
  updateBankStats();
}

function getSuggestie(t){
  const bedrag=parseFloat(t.bedrag);
  const isPos=bedrag>=0;
  const marge=Math.abs(bedrag)*0.01;

  // 1. Factuurmatch op bedrag
  const factuurArr=isPos?DB.verkoop:DB.inkoop;
  const factuurMatch=factuurArr.find(f=>f.status!=='betaald'&&Math.abs(Math.abs(parseFloat(f.totaalIncl))-Math.abs(bedrag))<=marge);
  if(factuurMatch) return {type:'factuur',factuur:factuurMatch,factuurType:isPos?'verkoop':'inkoop'};

  // 2. Handmatige regels
  const oms=t.omschrijving.toLowerCase();
  for(const r of DB.regels){
    const kw=r.keyword.toLowerCase();
    let hit=false;
    if(r.match==='bevat') hit=oms.includes(kw);
    else if(r.match==='exact') hit=oms===kw;
    else if(r.match==='begint') hit=oms.startsWith(kw);
    if(hit){
      const g=DB.grootboek.find(g=>g.id===r.gbId);
      if(g) return {type:'regel',gb:g,regelKeyword:r.keyword,contact:r.contact||'',btw:r.btw||0,omschrijving:r.omschrijving||''};
    }
  }

  // 3. Historische patroonherkenning — zelfde omschrijving eerder op zelfde rekening
  const eerder=DB.transacties.filter(x=>x.id!==t.id&&x.status==='gekoppeld'&&x.gekoppeldType==='grootboek'&&x.omschrijving.toLowerCase()===oms);
  if(eerder.length>0){
    const gbId=eerder[eerder.length-1].gekoppeldAan;
    const g=DB.grootboek.find(g=>(g.nummer+' — '+g.naam)===gbId);
    if(g) return {type:'historisch',gb:g};
  }

  return null;
}

async function snelKoppelFactuur(tId, fId, fType){
  const t=DB.transacties.find(t=>t.id===tId); if(!t) return;
  const arr=fType==='verkoop'?DB.verkoop:DB.inkoop;
  const f=arr.find(f=>f.id===fId); if(!f) return;
  // Bedragvalidatie
  const bankBedrag = Math.abs(parseFloat(t.bedrag));
  const factuurBedrag = parseFloat(f.totaalIncl||0);
  const verschil = Math.abs(bankBedrag - factuurBedrag);
  if(verschil > 0.02){
    const ok = await bevestig(
      `Bankbedrag (${fmt(bankBedrag)}) wijkt af van factuur (${fmt(factuurBedrag)}).
Verschil: ${fmt(verschil)}

Wil je toch koppelen?`,
      'Bedrag komt niet overeen',
      'Toch koppelen'
    );
    if(!ok) return;
  }
  t.gekoppeldAan=f.nummer+' — '+f.klant;
  t.gekoppeldType=fType;
  t.status='gekoppeld';
  if(fType==='verkoop'&&parseFloat(t.bedrag)>0){
    const totaal=parseFloat(f.totaalIncl||0);
    const nieuwBetaald=rond((parseFloat(f.betaald||0))+Math.abs(parseFloat(t.bedrag)));
    f.betaald=nieuwBetaald; f.restBedrag=rond(Math.max(0,totaal-nieuwBetaald));
    f.status=f.restBedrag<0.02?'betaald':'gedeeltelijk';
  }
  if(fType==='inkoop'&&parseFloat(t.bedrag)<0){
    const totaal=parseFloat(f.totaalIncl||0);
    const nieuwBetaald=rond((parseFloat(f.betaald||0))+Math.abs(parseFloat(t.bedrag)));
    f.betaald=nieuwBetaald; f.restBedrag=rond(Math.max(0,totaal-nieuwBetaald));
    f.status=f.restBedrag<0.02?'betaald':'gedeeltelijk';
  }
  boekBank(t, t.bedrag);
  boekFactuurTegenboeking(t, fType, 'boek');
  boekBetalingsverschil(t.bedrag, f.totaalIncl);
  save(); updateBankStats();
  toast(`Gekoppeld aan ${f.nummer} — ${f.klant}`,'success');
  renderTransacties(false);
}

function snelKoppelGBSug(tId, gId){
  const suggestie=(window._sugMap||{})[tId]||null;
  snelKoppelGB(tId, gId, suggestie);
}

function snelKoppelGB(tId, gId, suggestie){
  const t=DB.transacties.find(t=>t.id===tId); if(!t) return;
  const g=DB.grootboek.find(g=>g.id===gId); if(!g) return;
  const bedrag=parseFloat(t.bedrag);
  // Pas contact en omschrijving toe als meegegeven via regel
  if(suggestie?.contact) t.omschrijving=suggestie.contact+(suggestie.omschrijving?' — '+suggestie.omschrijving:' — '+t.omschrijving);
  else if(suggestie?.omschrijving) t.omschrijving=suggestie.omschrijving;
  // BTW verwerking: expliciet tarief uit de regel-suggestie wint, anders de
  // standaard BTW van de rekening (Grootboek → bewerken), anders 0.
  const btwTarief=(suggestie&&suggestie.btw)?suggestie.btw:(_gbBtwStandaard(g)??0);
  _boekTegenrekening(g, bedrag, btwTarief);
  boekBank(t, bedrag);
  t.gekoppeldAan=g.nummer+' — '+g.naam;
  t.gekoppeldType='grootboek'; t.status='gekoppeld';
  t.tegenrekeningId=g.id; t.btwTarief=btwTarief; // voor exacte P&L/grootboekkaart (excl. BTW)
  save(); updateBankStats();
  toast(`Geboekt op ${g.nummer} — ${g.naam}`,'success');
  renderTransacties(false);
  // Vaste activa detectie via directe bank koppeling (geen factuur)
  if(g.type==='vaste_activa'){
    const alBestaand=(DB.vasteActiva||[]).some(a=>a.factuurId===t.id);
    if(!alBestaand){
      const fakeFactuur={id:t.id,datum:t.datum,klant:t.omschrijving,
        nummer:'BANK-'+t.id.slice(-6),totaalExcl:Math.abs(bedrag),
        regels:[{omschrijving:t.omschrijving}]};
      setTimeout(()=>openDeprVraagModal(fakeFactuur,g),400);
    }
  }
}

let tPagina=1;
const T_PER_PAGINA=50;

function renderTransacties(resetPagina){
  if(resetPagina) tPagina=1;
  let list=[...DB.transacties];
  // Koppelen tab toont altijd alleen ongekoppelde transacties
  list=list.filter(t=>t.status==='ongekoppeld');
  if(DB.fT) list=list.filter(t=>t.omschrijving.toLowerCase().includes(DB.fT.toLowerCase()));
  list=list.slice().reverse();

  const totaal=list.length;
  const totaalPaginas=Math.max(1,Math.ceil(totaal/T_PER_PAGINA));
  if(tPagina>totaalPaginas) tPagina=totaalPaginas;
  const start=(tPagina-1)*T_PER_PAGINA;
  const pagina=list.slice(start,start+T_PER_PAGINA);

  // Update badge
  const badge=document.getElementById('bank-tab-badge');
  if(badge) badge.textContent=totaal;

  const wrap=document.getElementById('tbody-transacties');
  if(!totaal){
    wrap.innerHTML=`<div class="empty"><span class="icon">✓</span><p style="color:var(--accent);font-size:15px;font-weight:600;">Alles gekoppeld</p><p style="font-size:12px;margin-top:6px;color:var(--text-dim);">Geen openstaande transacties</p></div>`;
    document.getElementById('t-paginering').innerHTML='';
    return;
  }

  const headerHTML=`<div style="display:grid;grid-template-columns:1fr 44px 1fr;gap:0;margin-bottom:6px;padding:0 2px;">
    <div style="font-size:10px;color:var(--text-dim);font-family:var(--mono);text-transform:uppercase;letter-spacing:.07em;">Banktransactie</div>
    <div></div>
    <div style="font-size:10px;color:var(--text-dim);font-family:var(--mono);text-transform:uppercase;letter-spacing:.07em;">Koppelen aan</div>
  </div>`;

  const html=pagina.map(t=>{
    const bedrag=parseFloat(t.bedrag);
    const isPos=bedrag>=0;
    const suggestie=t.status==='ongekoppeld'?getSuggestie(t):null;

    const leftHTML=`<div class="rec-left">
      <div class="rec-meta">${t.datum}</div>
      <div class="rec-oms" title="${t.omschrijving}">${t.omschrijving}</div>
      ${t.detail?`<div class="rec-detail" title="${esc(t.detail)}" style="font-size:11px;color:var(--text-dim);margin-top:2px;line-height:1.35;">${esc(t.detail)}</div>`:''}
      <div class="rec-bedrag-wrap" style="margin-top:6px;">
        ${isPos
          ? `<div class="rec-bedrag-col"><span>Ontvangen</span><span class="amount-pos">${fmt(bedrag)}</span></div>`
          : `<div class="rec-bedrag-col"><span>Uitgegeven</span><span class="amount-neg">${fmt(Math.abs(bedrag))}</span></div>`
        }
      </div>
    </div>`;

    let midHTML='';
    if(t.status==='gekoppeld'){
      midHTML=`<div class="rec-mid"><button class="rec-ok" style="font-size:11px;" onclick="ontkoppel('${t.id}')" title="Klik om te ontkoppelen">✓</button></div>`;
    } else if(suggestie&&suggestie.type==='factuur'){
      const f=suggestie.factuur;
      midHTML=`<div class="rec-mid"><button class="rec-ok" onclick="snelKoppelFactuur('${t.id}','${f.id}','${suggestie.factuurType}')" title="Bevestig koppeling">OK</button></div>`;
    } else if(suggestie&&(suggestie.type==='regel'||suggestie.type==='historisch')){
      const g=suggestie.gb;
      window._sugMap=window._sugMap||{}; window._sugMap[t.id]=suggestie;
      midHTML=`<div class="rec-mid"><button class="rec-ok yellow" onclick="snelKoppelGBSug('${t.id}','${g.id}')" title="Bevestig suggestie">OK</button></div>`;
    } else {
      midHTML=`<div class="rec-mid"><div style="width:32px;height:32px;border:1px dashed var(--border);border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--text-dim);font-size:18px;">·</div></div>`;
    }

    let rightHTML='';
    // Transfer match suggestie — gele suggestie als een andere bank een bijpassende transfer heeft
    if(t.status==='ongekoppeld'&&t._transferSuggestie){
      const tTegenpId = t.transferTegenpartijId;
      const tTegenp = tTegenpId ? DB.transacties.find(tx=>tx.id===tTegenpId) : null;
      const vanRek = tTegenp ? DB.grootboek.find(g=>g.id===tTegenp.bankGbId) : null;
      rightHTML=`<div class="rec-right yellow" onclick="matchTransferSuggestie('${t.id}')">
        <div class="rec-label" style="color:var(--warning);">⇄ Transfer suggestie</div>
        <div class="rec-oms">${vanRek?.naam||'Andere bank'}</div>
        <div class="rec-meta" style="margin-top:4px;">${fmt(Math.abs(parseFloat(t.bedrag)))} — klik om te matchen</div>
        <span class="badge badge-orange" style="font-size:10px;margin-top:6px;">Wacht op match</span>
      </div>`;
    } else if(t.status==='gekoppeld'&&t.gekoppeldType==='transfer'){
      // Transfer — toon tegenpartij rekening
      const tegenpartij = DB.transacties.find(tx=>tx.id===t.transferTegenpartijId);
      const tegenRek = tegenpartij ? DB.grootboek.find(g=>g.id===tegenpartij.bankGbId) : null;
      const richting = t.transferRichting==='uit' ? '→' : '←';
      rightHTML=`<div class="rec-right gekoppeld" style="background:#eff6ff;border-color:#bfdbfe;">
        <div class="rec-label" style="color:var(--accent);">⇄ Transfer</div>
        <div class="rec-oms">${richting} ${tegenRek?.naam||'Andere rekening'}</div>
        <span class="badge badge-blue" style="font-size:10px;margin-top:4px;">✓ Gematcht</span>
      </div>`;
    } else if(t.status==='gekoppeld'&&t.gekoppeldType==='prive'){
      const richting = t.priveRichting==='opname'?'Privé-opname':'Privé-storting';
      rightHTML=`<div class="rec-right gekoppeld" style="background:#f5f3ff;border-color:#c4b5fd;">
        <div class="rec-label" style="color:#7c3aed;">👤 ${richting}</div>
        <div class="rec-oms">${t.gekoppeldAan||'—'}</div>
        <span class="badge" style="background:#ede9fe;color:#7c3aed;font-size:10px;margin-top:4px;">✓ Privé</span>
      </div>`;
    } else if(t.status==='gekoppeld'){
      rightHTML=`<div class="rec-right gekoppeld">
        <div class="rec-label">Gekoppeld</div>
        <div class="rec-oms">${t.gekoppeldAan||'—'}</div>
        <span class="badge badge-green" style="font-size:10px;margin-top:4px;">✓ Verwerkt</span>
      </div>`;
    } else if(suggestie&&suggestie.type==='factuur'){
      const f=suggestie.factuur;
      rightHTML=`<div class="rec-right green" onclick="snelKoppelFactuur('${t.id}','${f.id}','${suggestie.factuurType}')">
        <div class="rec-label">⚡ Factuurmatch</div>
        <div class="rec-oms">${f.nummer} — ${f.klant}</div>
        <div class="rec-bedrag-wrap" style="margin-top:6px;">
          <div class="rec-bedrag-col"><span>Bedrag</span><span class="amount-pos">${fmt(f.totaalIncl)}</span></div>
          <div class="rec-bedrag-col"><span>Datum</span><span>${f.datum}</span></div>
        </div>
      </div>`;
    } else if(suggestie&&suggestie.type==='regel'){
      const g=suggestie.gb;
      const extraInfo=[suggestie.contact,suggestie.btw>0?`BTW ${suggestie.btw}%`:''].filter(Boolean).join(' · ');
      window._sugMap=window._sugMap||{}; window._sugMap[t.id]=suggestie;
      rightHTML=`<div class="rec-right yellow" onclick="snelKoppelGBSug('${t.id}','${g.id}')">
        <div class="rec-label">📋 Regel: "${suggestie.regelKeyword}"</div>
        <div class="rec-oms">${g.nummer} — ${g.naam}</div>
        ${extraInfo?`<div class="rec-meta" style="margin-top:3px;">${extraInfo}</div>`:''}
        <div class="rec-meta" style="margin-top:2px;">Klik om te bevestigen</div>
      </div>`;
    } else if(suggestie&&suggestie.type==='historisch'){
      const g=suggestie.gb;
      rightHTML=`<div class="rec-right yellow" onclick="snelKoppelGB('${t.id}','${g.id}')">
        <div class="rec-label">🕐 Eerder geboekt op</div>
        <div class="rec-oms">${g.nummer} — ${g.naam}</div>
        <div class="rec-meta" style="margin-top:2px;">Klik om te bevestigen</div>
      </div>`;
    } else {
      // Inline koppelformulier — geen modal, Xero-stijl
      const gbOpts=DB.grootboek.map(g=>`<option value="gb:${g.id}">${g.nummer} — ${g.naam}</option>`).join('');
      const vkOpts=DB.verkoop.filter(f=>f.status!=='betaald').map(f=>`<option value="vk:${f.id}">${f.nummer} — ${f.klant} (${fmt(f.totaalIncl)})</option>`).join('');
      const ikOpts=DB.inkoop.filter(f=>f.status!=='betaald').map(f=>`<option value="ik:${f.id}">${f.nummer} — ${f.klant} (${fmt(f.totaalIncl)})</option>`).join('');
      const contactOpts=[...new Set([...DB.verkoop.map(f=>f.klant),...DB.inkoop.map(f=>f.klant)].filter(Boolean))].map(c=>`<option value="${c}">`).join('');
      rightHTML=`<div class="rec-right empty" style="cursor:default;overflow-y:auto;max-height:300px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
          <div>
            <div class="rec-label" style="margin-bottom:4px;">Wie</div>
            <input id="iw-contact-${t.id}" type="text" list="contact-list-${t.id}" placeholder="Contact naam..." style="width:100%;font-size:12px;">
            <datalist id="contact-list-${t.id}">${contactOpts}</datalist>
          </div>
          <div>
            <div class="rec-label" style="margin-bottom:4px;">Wat</div>
            <select id="iw-gb-${t.id}" style="width:100%;font-size:12px;" onchange="iwGbGekozen('${t.id}')">
              <option value="">— Kies —</option>
              <optgroup label="Verkoopfacturen">${vkOpts||'<option disabled>Geen openstaande</option>'}</optgroup>
              <optgroup label="Inkoopfacturen">${ikOpts||'<option disabled>Geen openstaande</option>'}</optgroup>
              <optgroup label="Grootboekrekeningen">${gbOpts}</optgroup>
            </select>
          </div>
        </div>
        <div style="margin-bottom:8px;">
          <div class="rec-label" style="margin-bottom:4px;">Waarom</div>
          <input id="iw-why-${t.id}" type="text" placeholder="Omschrijving..." value="${t.omschrijving}" style="width:100%;font-size:12px;">
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <div style="display:flex;gap:4px;align-items:center;">
            <span class="rec-label" style="margin-right:4px;">BTW</span>
            <button class="btw-btn" id="iw-btw-${t.id}-0" onclick="setBTW('${t.id}',0)" style="padding:3px 8px;border-radius:3px;font-size:11px;font-family:var(--mono);background:var(--surface2);border:1px solid var(--border);color:var(--text-mid);cursor:pointer;">0%</button>
            <button class="btw-btn" id="iw-btw-${t.id}-9" onclick="setBTW('${t.id}',9)" style="padding:3px 8px;border-radius:3px;font-size:11px;font-family:var(--mono);background:var(--surface2);border:1px solid var(--border);color:var(--text-mid);cursor:pointer;">9%</button>
            <button class="btw-btn" id="iw-btw-${t.id}-21" onclick="setBTW('${t.id}',21)" style="padding:3px 8px;border-radius:3px;font-size:11px;font-family:var(--mono);background:var(--surface2);border:1px solid var(--border);color:var(--text-mid);cursor:pointer;">21%</button>
            <span id="iw-btw-bedrag-${t.id}" style="font-size:11px;color:var(--text-dim);font-family:var(--mono);margin-left:6px;"></span>
          </div>
          <button onclick="toggleSplits('${t.id}')" style="font-size:11px;color:var(--accent2);background:none;border:none;cursor:pointer;font-family:var(--sans);">+ Splits bedrag</button>
        </div>
        <div id="iw-splits-${t.id}" style="display:none;margin-bottom:8px;border:1px solid var(--border);border-radius:5px;padding:8px;">
          <div class="rec-label" style="margin-bottom:6px;">Splits over meerdere rekeningen</div>
          <div id="iw-splits-rows-${t.id}"></div>
          <button class="btn btn-secondary btn-sm" style="width:100%;margin-top:4px;" onclick="addSplitsRow('${t.id}')">+ Regel toevoegen</button>
          <div id="iw-splits-rest-${t.id}" style="font-size:11px;color:var(--text-dim);margin-top:6px;font-family:var(--mono);"></div>
        </div>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-primary btn-sm" style="flex:1;" onclick="inlineBevestig('${t.id}',${bedrag})">Koppelen</button>
          <button class="btn btn-secondary btn-sm" onclick="inlineTransfer('${t.id}',${bedrag})" style="white-space:nowrap;">⇄ Transfer</button>
          <button class="btn btn-secondary btn-sm" onclick="inlinePrive('${t.id}',${bedrag})" style="white-space:nowrap;color:#7c3aed;border-color:#c4b5fd;">Privé</button>
          <button class="btn btn-danger btn-sm" onclick="verwijderT('${t.id}')">✕</button>
        </div>
        <!-- Privé sectie -->
        <div id="iw-prive-${t.id}" style="display:none;margin-top:8px;padding:10px;background:#f5f3ff;border:1px solid #c4b5fd;border-radius:6px;">
          <div class="rec-label" style="margin-bottom:6px;color:#7c3aed;">Privé-opname / storting</div>
          <select id="iw-prive-type-${t.id}" style="width:100%;font-size:12px;margin-bottom:8px;">
            <option value="opname">Privé-opname (geld uit zaak)</option>
            <option value="storting">Privé-storting (geld in zaak)</option>
          </select>
          <input type="text" id="iw-prive-oms-${t.id}" placeholder="Omschrijving..." value="${t.omschrijving}" style="width:100%;font-size:12px;margin-bottom:8px;">
          <button class="btn btn-primary btn-sm" style="width:100%;background:#7c3aed;border-color:#7c3aed;" onclick="inlineBevestigPrive('${t.id}',${bedrag})">Verwerken als privé</button>
        </div>
        <!-- Transfer sectie (verborgen) -->
        <div id="iw-transfer-${t.id}" style="display:none;margin-top:8px;padding:8px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;">
          <div class="rec-label" style="margin-bottom:6px;color:var(--accent);">⇄ Transfer naar andere bank</div>
          <select id="iw-transfer-naar-${t.id}" style="width:100%;font-size:12px;margin-bottom:8px;">
            <option value="">— Kies doelrekening —</option>
            ${getBanken().filter(b=>b.id!==DB.huidigeBankId).map(b=>`<option value="${b.id}">${b.naam}${b.iban?' — '+b.iban:''}</option>`).join('')}
          </select>
          <button class="btn btn-primary btn-sm" style="width:100%;" onclick="inlineBevestigTransfer('${t.id}',${bedrag})">Transfer verwerken</button>
        </div>
      </div>`;
    }

    const chkHTML=t.status==='ongekoppeld'
      ?`<input type="checkbox" class="t-chk" data-id="${t.id}" onchange="updateBulkBar()" style="position:absolute;top:50%;left:-22px;transform:translateY(-50%);cursor:pointer;">`
      :'';

    return `<div class="rec-row" style="position:relative;margin-left:${t.status==='ongekoppeld'?'24px':'0'};">
      ${chkHTML}
      ${leftHTML}
      ${midHTML}
      ${rightHTML}
    </div>`;
  }).join('');

  wrap.innerHTML=headerHTML+html;

  const van=start+1;
  const tot=Math.min(start+T_PER_PAGINA,totaal);
  let pagNav=`<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;margin-top:8px;border-top:1px solid var(--border);">
    <span style="font-size:12px;color:var(--text-dim);font-family:var(--mono);">${van}–${tot} van ${totaal}</span>
    <div style="display:flex;gap:6px;align-items:center;">
      <button class="btn btn-secondary btn-sm" onclick="gaPagina(1)" ${tPagina===1?'disabled':''}>«</button>
      <button class="btn btn-secondary btn-sm" onclick="gaPagina(${tPagina-1})" ${tPagina===1?'disabled':''}>‹</button>`;
  const start_p=Math.max(1,tPagina-2);
  const end_p=Math.min(totaalPaginas,start_p+4);
  for(let p=start_p;p<=end_p;p++){
    pagNav+=`<button class="btn btn-sm ${p===tPagina?'btn-primary':'btn-secondary'}" onclick="gaPagina(${p})">${p}</button>`;
  }
  pagNav+=`<button class="btn btn-secondary btn-sm" onclick="gaPagina(${tPagina+1})" ${tPagina===totaalPaginas?'disabled':''}>›</button>
      <button class="btn btn-secondary btn-sm" onclick="gaPagina(${totaalPaginas})" ${tPagina===totaalPaginas?'disabled':''}>»</button>
    </div></div>`;
  document.getElementById('t-paginering').innerHTML=pagNav;
}

function gaPagina(p){
  tPagina=p;
  renderTransacties();
  document.getElementById('tbody-transacties').scrollIntoView({behavior:'smooth',block:'start'});
}

async function verwijderT(id){
  const ok=await bevestig('Transactie permanent verwijderen?','Verwijderen','Verwijderen');
  if(!ok) return;
  const t=DB.transacties.find(t=>t.id===id);
  if(t&&t.status==='gekoppeld') draaiBoekingTerug(t);
  DB.transacties=DB.transacties.filter(t=>t.id!==id);
  save(); updateBankStats(); renderTransacties(false);
  toast('Transactie verwijderd.','info');
}

function ontkoppel(id){
  const t=DB.transacties.find(t=>t.id===id); if(!t) return;

  // Transfer: verwijder beide transacties en draai saldo's terug
  if(t.gekoppeldType==='transfer'&&t.transferTegenpartijId){
    const tegp = DB.transacties.find(tx=>tx.id===t.transferTegenpartijId);
    if(tegp){
      const bedrag = Math.abs(parseFloat(t.bedrag));
      const vanId = t.transferRichting==='uit' ? t.bankGbId : tegp.bankGbId;
      const naarId = t.transferRichting==='in' ? t.bankGbId : tegp.bankGbId;
      const vanRek = DB.grootboek.find(g=>g.id===vanId);
      const naarRek = DB.grootboek.find(g=>g.id===naarId);
      if(vanRek) vanRek.saldo=(parseFloat(vanRek.saldo)||0)+bedrag;
      if(naarRek) naarRek.saldo=(parseFloat(naarRek.saldo)||0)-bedrag;
      DB.transacties = DB.transacties.filter(tx=>tx.id!==tegp.id);
    }
    DB.transacties = DB.transacties.filter(tx=>tx.id!==t.id);
    save(); updateBankHeader(); renderTransacties(true); updateBankStats();
    toast('Transfer verwijderd — beide transacties teruggedraaid.','info');
    return;
  }

  draaiBoekingTerug(t); // heeft factuurId/tegenrekeningId/btwTarief/splitsRegels nog nodig
  t.status='ongekoppeld'; t.gekoppeldAan=null; t.gekoppeldType=null; t.bankGbId=null;
  // Ook de koppeling-specifieke velden wissen. Bleven die staan, dan bleef de
  // transactie via _getBetalingen() gelden als betaling van de oude factuur
  // (waardoor die factuur niet meer handmatig op betaald te zetten was), en
  // draaide een volgende ontkoppeling terug op de oude tegenrekening — precies
  // het soort restpost dat na "alles ontkoppelen" bleef staan.
  t.factuurId=null;
  delete t.tegenrekeningId; delete t.btwTarief; delete t.splitsRegels;
  save(); renderTransacties(true); updateBankStats(); toast('Transactie ontkoppeld.','info'); switchBankTab('koppelen');
}

function draaiBoekingTerug(t){
  const bedrag=parseFloat(t.bedrag);
  // Draai bankboeking terug
  const bank=t.bankGbId?DB.grootboek.find(g=>g.id===t.bankGbId):getBankRekening();
  if(bank) bank.saldo=(parseFloat(bank.saldo)||0)-bedrag;
  // Draai tegenboeking terug
  if(t.gekoppeldType==='verkoop'||t.gekoppeldType==='inkoop'){
    // Draai debiteuren/crediteuren koppeling terug
    boekFactuurTegenboeking(t, t.gekoppeldType, 'draai');
    // Factuurstatus terugzetten
    const arr=t.gekoppeldType==='verkoop'?DB.verkoop:DB.inkoop;
    const f=arr.find(f=>(f.nummer+' — '+f.klant)===t.gekoppeldAan||f.id===t.factuurId);
    if(f&&f.status==='betaald') f.status=t.gekoppeldType==='verkoop'?'verstuurd':'te betalen';
  } else if(t.gekoppeldType==='grootboek'){
    // Draai de tegenboeking EXACT terug zoals _boekTegenrekening hem maakte
    // (excl. op de rekening + BTW apart), via mult=-1.
    if(Array.isArray(t.splitsRegels) && t.splitsRegels.length){
      t.splitsRegels.forEach(d=>{
        const g=DB.grootboek.find(x=>x.id===d.gbId);
        if(g) _boekTegenrekening(g, parseFloat(d.bedrag)||0, parseFloat(d.btwTarief)||0, -1);
      });
    } else if(t.tegenrekeningId!==undefined || t.btwTarief!==undefined){
      const g = (t.tegenrekeningId && DB.grootboek.find(x=>x.id===t.tegenrekeningId))
             || DB.grootboek.find(x=>(x.nummer+' — '+x.naam)===t.gekoppeldAan);
      if(g) _boekTegenrekening(g, bedrag, parseFloat(t.btwTarief)||0, -1);
    } else {
      // Oude boeking (vóór _boekTegenrekening): destijds stond het VOLLE bedrag op
      // de rekening, dus draai dat op dezelfde manier terug.
      const g=DB.grootboek.find(x=>(x.nummer+' — '+x.naam)===t.gekoppeldAan);
      if(g) g.saldo=rond((parseFloat(g.saldo)||0)-bedrag);
    }
  } else if(t.gekoppeldType==='prive'){
    // Privéboeking terugdraaien wordt al gedaan via inlineBevestigPrive flow
    // Bank is al teruggedraaid hierboven, privérekening nog:
    const priveRek = DB.grootboek.find(g=>g.nummer==='3000')||DB.grootboek.find(g=>g.nummer==='3100');
    if(priveRek){
      const abs=Math.abs(bedrag);
      if(t.priveRichting==='opname') priveRek.saldo=(parseFloat(priveRek.saldo)||0)-abs;
      else priveRek.saldo=(parseFloat(priveRek.saldo)||0)+abs;
    }
  }
}

function openHandmatigModal(){
  document.getElementById('ht-datum').value=today();
  document.getElementById('ht-bedrag').value='';
  document.getElementById('ht-oms').value='';
  openModal('modal-handmatig');
}
function slaHandmatigOp(){
  DB.transacties.push({id:uid(),datum:document.getElementById('ht-datum').value,omschrijving:document.getElementById('ht-oms').value,bedrag:parseFloat(document.getElementById('ht-bedrag').value)||0,status:'ongekoppeld',gekoppeldAan:null,gekoppeldType:null});
  save();closeModal('modal-handmatig');renderTransacties();
}

function openKoppelModal(id){
  DB.koppelId=id;
  const t=DB.transacties.find(t=>t.id===id);
  const bedrag=parseFloat(t.bedrag);
  const isPos=bedrag>=0;

  document.getElementById('koppel-info').innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <span style="font-size:12px;color:var(--text-dim);">${t.datum}</span>
      <span class="mono ${isPos?'amount-pos':'amount-neg'}" style="font-weight:600;font-size:16px;">${fmt(t.bedrag)}</span>
    </div>
    <div style="margin-top:6px;font-size:13px;">${esc(t.omschrijving)}</div>`;

  // AUTO-MATCH: zoek facturen met zelfde bedrag (±1% marge)
  const marge=Math.abs(bedrag)*0.01;
  const matchesVK=DB.verkoop.filter(f=>f.status!=='betaald'&&Math.abs(Math.abs(parseFloat(f.totaalIncl))-Math.abs(bedrag))<=marge);
  const matchesIK=DB.inkoop.filter(f=>f.status!=='betaald'&&Math.abs(Math.abs(parseFloat(f.totaalIncl))-Math.abs(bedrag))<=marge);
  const allMatches=[...matchesVK.map(f=>({...f,_mtype:'verkoop'})),...matchesIK.map(f=>({...f,_mtype:'inkoop'}))];

  const matchWrap=document.getElementById('koppel-matches-wrap');
  const matchDiv=document.getElementById('koppel-matches');
  if(allMatches.length>0){
    matchWrap.style.display='';
    matchDiv.innerHTML=allMatches.map(f=>`
      <div style="display:flex;align-items:center;justify-content:space-between;background:var(--surface);border:1px solid var(--border);border-radius:5px;padding:10px 12px;margin-bottom:8px;">
        <div>
          <span class="badge ${f._mtype==='verkoop'?'badge-green':'badge-orange'}" style="margin-right:8px;">${f._mtype}</span>
          <span style="font-size:13px;">${f.nummer} — ${f.klant}</span>
          <span style="font-size:11px;color:var(--text-dim);margin-left:8px;">${f.datum}</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <span class="mono" style="font-weight:600;">${fmt(f.totaalIncl)}</span>
          <button class="btn btn-primary btn-sm" onclick="koppelAanMatch('${f.id}','${f._mtype}')">Koppel</button>
        </div>
      </div>`).join('');
  } else {
    matchWrap.style.display='none';
  }

  document.getElementById('koppel-oms').value=t.omschrijving;
  // Zet standaard type op basis van richting bedrag
  document.getElementById('koppel-type').value=isPos?'verkoop':'inkoop';
  updateKoppelOpties();
  openModal('modal-koppel');
}

function koppelAanMatch(factuurId, type){
  const t=DB.transacties.find(t=>t.id===DB.koppelId);
  if(!t) return;
  const arr=type==='verkoop'?DB.verkoop:DB.inkoop;
  const f=arr.find(f=>f.id===factuurId);
  if(!f) return;
  t.gekoppeldAan=f.nummer+' — '+f.klant;
  t.gekoppeldType=type;
  t.factuurId=f.id; // expliciete koppeling; zonder dit valt _getBetalingen terug op tekstmatch
  t.status='gekoppeld';
  if(type==='verkoop'&&parseFloat(t.bedrag)>0){
    const totaal=parseFloat(f.totaalIncl||0);
    const nieuwBetaald=rond((parseFloat(f.betaald||0))+Math.abs(parseFloat(t.bedrag)));
    f.betaald=nieuwBetaald; f.restBedrag=rond(Math.max(0,totaal-nieuwBetaald));
    f.status=f.restBedrag<0.02?'betaald':'gedeeltelijk';
  }
  if(type==='inkoop'&&parseFloat(t.bedrag)<0){
    const totaal=parseFloat(f.totaalIncl||0);
    const nieuwBetaald=rond((parseFloat(f.betaald||0))+Math.abs(parseFloat(t.bedrag)));
    f.betaald=nieuwBetaald; f.restBedrag=rond(Math.max(0,totaal-nieuwBetaald));
    f.status=f.restBedrag<0.02?'betaald':'gedeeltelijk';
  }
  boekBank(t, t.bedrag);
  boekFactuurTegenboeking(t, type, 'boek');
  save();
  closeModal('modal-koppel');
  renderTransacties();
  updateBankStats();
}

function updateKoppelOpties(){
  const type=document.getElementById('koppel-type').value;
  document.getElementById('kg-factuur-vk').style.display=type==='verkoop'?'':'none';
  document.getElementById('kg-factuur-ik').style.display=type==='inkoop'?'':'none';
  document.getElementById('kg-grootboek').style.display=type==='grootboek'?'':'none';
  if(type==='verkoop') document.getElementById('koppel-vk-sel').innerHTML=DB.verkoop.map(f=>`<option value="${esc(f.id)}">${esc(f.nummer)} — ${esc(f.klant)} — ${fmt(f.totaalIncl)}</option>`).join('');
  if(type==='inkoop') document.getElementById('koppel-ik-sel').innerHTML=DB.inkoop.map(f=>`<option value="${esc(f.id)}">${esc(f.nummer)} — ${esc(f.klant)} — ${fmt(f.totaalIncl)}</option>`).join('');
  if(type==='grootboek') document.getElementById('koppel-gb-sel').innerHTML=DB.grootboek.map(g=>`<option value="${g.id}">${g.nummer} — ${g.naam}</option>`).join('');
}

function bevestigKoppeling(){
  const t=DB.transacties.find(t=>t.id===DB.koppelId);
  if(!t) return;
  const type=document.getElementById('koppel-type').value;
  if(type==='verkoop'){
    const f=DB.verkoop.find(f=>f.id===document.getElementById('koppel-vk-sel').value);
    if(f){
      t.gekoppeldAan=f.nummer+' — '+f.klant; t.gekoppeldType='verkoop';
      if(parseFloat(t.bedrag)>0){
        const totaal=parseFloat(f.totaalIncl||0);
        const nieuwBetaald=rond((parseFloat(f.betaald||0))+Math.abs(parseFloat(t.bedrag)));
        f.betaald=nieuwBetaald; f.restBedrag=rond(Math.max(0,totaal-nieuwBetaald));
        f.status=f.restBedrag<0.02?'betaald':'gedeeltelijk';
      }
      boekBank(t, t.bedrag);
      boekFactuurTegenboeking(t,'verkoop','boek');
    }
  } else if(type==='inkoop'){
    const f=DB.inkoop.find(f=>f.id===document.getElementById('koppel-ik-sel').value);
    if(f){
      t.gekoppeldAan=f.nummer+' — '+f.klant; t.gekoppeldType='inkoop';
      if(parseFloat(t.bedrag)<0){
        const totaal=parseFloat(f.totaalIncl||0);
        const nieuwBetaald=rond((parseFloat(f.betaald||0))+Math.abs(parseFloat(t.bedrag)));
        f.betaald=nieuwBetaald; f.restBedrag=rond(Math.max(0,totaal-nieuwBetaald));
        f.status=f.restBedrag<0.02?'betaald':'gedeeltelijk';
      }
      boekBank(t, t.bedrag);
      boekFactuurTegenboeking(t,'inkoop','boek');
    }
  } else {
    const g=DB.grootboek.find(g=>g.id===document.getElementById('koppel-gb-sel').value);
    if(g){
      // Geen expliciete BTW-keuze in deze modal → standaard BTW van de rekening als fallback
      const kopTarief=inlineBTW[t.id]??(_gbBtwStandaard(g)??0);
      _boekTegenrekening(g, parseFloat(t.bedrag), kopTarief);
      boekBank(t, t.bedrag);
      t.gekoppeldAan=g.nummer+' — '+g.naam; t.gekoppeldType='grootboek';
      t.tegenrekeningId=g.id; t.btwTarief=kopTarief; // voor exacte P&L/grootboekkaart
    }
  }
  t.status='gekoppeld';
  save(); closeModal('modal-koppel'); updateBankStats(); toast('Gekoppeld.','success'); renderTransacties(false);
}

// ---- Koppel betaling vanuit inkoopfactuur ----
function openKoppelVanafFactuur(factuurId){
  const f = DB.inkoop.find(x=>x.id===factuurId);
  if(!f) return;

  // Zoek ongekoppelde transacties die qua bedrag matchen
  const bedrag = parseFloat(f.totaalIncl||0);
  const marge = Math.max(bedrag * 0.02, 0.05); // 2% of €0.05
  const matches = DB.transacties.filter(t=>
    t.status==='ongekoppeld' &&
    Math.abs(Math.abs(parseFloat(t.bedrag)) - bedrag) <= marge
  ).sort((a,b)=> Math.abs(Math.abs(parseFloat(a.bedrag))-bedrag) - Math.abs(Math.abs(parseFloat(b.bedrag))-bedrag));

  if(!matches.length){
    // Geen automatische match — open standaard koppel modal met inkoop voorgeselecteerd
    // Zoek een ongekoppelde transactie om te starten
    const ongekoppeld = DB.transacties.filter(t=>t.status==='ongekoppeld');
    if(!ongekoppeld.length){
      toast('Geen ongekoppelde transacties gevonden. Importeer eerst een bankafschrift.','warning');
      return;
    }
    // Open vanuit de beste match of eerste ongekoppeld
    const t = ongekoppeld[0];
    DB.koppelId = t.id;
    document.getElementById('koppel-type').value = 'inkoop';
    updateKoppelOpties();
    document.getElementById('koppel-ik-sel').value = factuurId;
    openModal('modal-koppel');
    return;
  }

  // Er is een match — gebruik de beste
  const besteMatch = matches[0];
  DB.koppelId = besteMatch.id;
  document.getElementById('koppel-type').value = 'inkoop';
  updateKoppelOpties();
  document.getElementById('koppel-ik-sel').value = factuurId;

  // Toon match info in modal
  const t = besteMatch;
  const isPos = parseFloat(t.bedrag) >= 0;
  document.getElementById('koppel-info').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <span style="font-size:12px;color:var(--text-dim);">${t.datum}</span>
      <span class="mono ${isPos?'amount-pos':'amount-neg'}" style="font-weight:600;font-size:16px;">${fmt(t.bedrag)}</span>
    </div>
    <div style="margin-top:6px;font-size:13px;">${esc(t.omschrijving)}</div>
    ${matches.length>1?`<div style="margin-top:8px;font-size:11px;color:var(--accent);">+${matches.length-1} andere mogelijke matches</div>`:''}`;

  // Toon ook andere mogelijke matches
  const matchWrap = document.getElementById('koppel-matches-wrap');
  const matchDiv  = document.getElementById('koppel-matches');
  if(matches.length > 1){
    matchWrap.style.display = '';
    matchDiv.innerHTML = matches.slice(1,4).map(m=>`
      <div style="display:flex;align-items:center;justify-content:space-between;background:var(--surface);border:1px solid var(--border);border-radius:5px;padding:10px 12px;margin-bottom:8px;">
        <div>
          <span style="font-size:13px;">${m.datum} — ${esc(m.omschrijving)}</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <span class="mono" style="font-weight:600;">${fmt(m.bedrag)}</span>
          <button class="btn btn-primary btn-sm" onclick="wisselKoppelTransactie('${m.id}','${factuurId}')">Gebruik</button>
        </div>
      </div>`).join('');
  } else {
    matchWrap.style.display = 'none';
  }

  document.getElementById('koppel-oms').value = t.omschrijving;
  openModal('modal-koppel');
}

function wisselKoppelTransactie(transactieId, factuurId){
  DB.koppelId = transactieId;
  const t = DB.transacties.find(x=>x.id===transactieId);
  if(!t) return;
  document.getElementById('koppel-info').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <span style="font-size:12px;color:var(--text-dim);">${t.datum}</span>
      <span class="mono" style="font-weight:600;font-size:16px;">${fmt(t.bedrag)}</span>
    </div>
    <div style="margin-top:6px;font-size:13px;">${esc(t.omschrijving)}</div>`;
  document.getElementById('koppel-oms').value = t.omschrijving;
  document.getElementById('koppel-type').value = 'inkoop';
  updateKoppelOpties();
  document.getElementById('koppel-ik-sel').value = factuurId;
  document.getElementById('koppel-matches-wrap').style.display = 'none';
  toast('Transactie gewisseld.','success');
}

// ---- Bonnen pagina (desktop eigenaar) ----
let _bonnenFilter = '';
let _bonnenData = [];
// Volgnummer per laadpoging. Zonder dit kan een nog lopende laadUploads(A) landen
// NADAT er naar bedrijf B is gewisseld, waardoor de bonnen van A onder de kop van B
// verschijnen — en een bon van A als inkoopfactuur van B verwerkt zou kunnen worden.
let _bonnenLaadToken = 0;

function setBonnenFilter(filter){
  _bonnenFilter = filter;
  ['alle','nieuw','verwerkt','afgekeurd'].forEach(f=>{
    const el = document.getElementById('bonnen-filter-'+f);
    if(!el) return;
    const isActive = f === (filter||'alle');
    el.style.background = isActive ? 'var(--accent)' : '';
    el.style.color = isActive ? '#000' : '';
    el.style.borderColor = isActive ? 'var(--accent)' : '';
    el.className = 'btn btn-sm' + (isActive ? '' : ' btn-secondary');
  });
  renderBonnenLijst();
}

function laadBonnenPagina(){
  const el = document.getElementById('bonnen-lijst');
  if(!el) return;

  // Vul bedrijf-selector in
  const bedrijven = getBedrijven();
  const selectorWrap = document.getElementById('bonnen-bedrijf-selector');
  const selector = document.getElementById('bonnen-bedrijf-keuze');
  if(selector && bedrijven.length > 1){
    selector.innerHTML = bedrijven.map(b=>`<option value="${b}" ${b===huidigBedrijf?'selected':''}>${b}</option>`).join('');
    if(selectorWrap) selectorWrap.style.display = 'flex';
  } else {
    if(selectorWrap) selectorWrap.style.display = 'none';
  }

  el.innerHTML = '<div style="padding:24px 0;text-align:center;color:var(--text-dim);">Laden van <strong>'+huidigBedrijf+'</strong>...</div>';
  const token = ++_bonnenLaadToken;
  fbAanroep(fb=>fb.laadUploads(huidigBedrijf))
    .then(json=>{
      // Er is intussen opnieuw geladen (of van bedrijf gewisseld) — deze uitkomst is stale.
      if(token !== _bonnenLaadToken) return;
      try{
        _bonnenData = JSON.parse(json||'[]');
        console.log('[Bonnen] Eigenaar ziet '+_bonnenData.length+' uploads voor bedrijf: '+huidigBedrijf);
      }
      catch(e){ _bonnenData = []; console.error('[Bonnen] Parse fout:', e); }
      renderBonnenLijst();
    })
    .catch(err=>{
      if(token !== _bonnenLaadToken) return;
      console.error('[Bonnen] Laad fout:', err);
      if(el) el.innerHTML = '<div style="padding:24px 0;text-align:center;color:var(--danger);">Laden mislukt van <strong>'+huidigBedrijf+'</strong>: '+err+'<br><small style=\"color:var(--text-dim);\">Controleer de Firestore beveiligingsregels</small></div>';
    });
}

async function bonnenWisselBedrijf(bedrijf){
  // Via _wisselBedrijfKern(), niet met de hand huidigBedrijf zetten: die kern doet de
  // await flushSave() en de DB-reset. Zonder dat ging een wijziging die nog in de
  // save-wachtrij stond verloren, en bleef data van het vorige bedrijf in DB staan
  // (loadLokaal() merget de blob over DB heen) — zie punt 15.
  await _wisselBedrijfKern(bedrijf);
  // Anders dan wisselBedrijf() blijven we hier op de bonnen-pagina staan.
  // laadBonnenPagina() leest de uploads rechtstreeks uit Firestore en heeft alleen
  // huidigBedrijf nodig, dus de oude setTimeout-gok van 800ms is niet meer nodig.
  laadBonnenPagina();
}

function renderBonnenLijst(){
  const el = document.getElementById('bonnen-lijst');
  if(!el) return;
  let lijst = _bonnenData;
  if(_bonnenFilter) lijst = lijst.filter(u=>(u.status||'nieuw')===_bonnenFilter);
  if(!lijst.length){
    const filterTekst = _bonnenFilter ? ' met status "'+_bonnenFilter+'"' : '';
    el.innerHTML = `<div style="padding:24px 0;text-align:center;color:var(--text-dim);">
      <div style="font-size:24px;margin-bottom:8px;">📭</div>
      <div>Geen bonnen gevonden voor <strong>${huidigBedrijf}</strong>${filterTekst}.</div>
      <div style="font-size:11px;margin-top:6px;color:var(--text-dim);">
        Firestore-pad: bedrijven/${huidigBedrijf}/uploads
      </div>
    </div>`;
    return;
  }

  try {
    const rijen = lijst.map((u,i)=>{
      try {
        const status = u.status||'nieuw';
        const badgeKleur = status==='verwerkt'?'badge-green':status==='afgekeurd'?'badge-red':'badge-blue';
        const statusLabel = {nieuw:'Nieuw',verwerkt:'Verwerkt',afgekeurd:'Afgekeurd'}[status]||status;
        const datum = u.uploadedAt ? new Date(u.uploadedAt).toLocaleDateString('nl-NL',{day:'numeric',month:'short',year:'numeric'}) : '-';
        const isAfb = (u.type||'').startsWith('image/');
        const heeftBestand = !!(u.bestandData||u.viewUrl);
        const veiligId = String(u.id||'').replace(/['"]/g,'');
        const veiligOmschr = String(u.omschrijving||'').replace(/['"]/g,'');
        const veiligDatum = String(u.uploadedAt||'').replace(/['"]/g,'');
        return `<tr>
          <td>
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:18px;">${isAfb?'🖼️':'📄'}</span>
              <div>
                <div style="font-weight:500;font-size:12px;">${esc(u.naam||'Onbekend')}</div>
                <div style="font-size:11px;color:var(--text-dim);">${esc(u.uploadedBy||'')}</div>
              </div>
            </div>
          </td>
          <td style="font-size:12px;">${esc(u.uploadedBy||'-')}</td>
          <td style="font-size:12px;">${datum}</td>
          <td style="font-size:12px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(u.omschrijving||'-')}</td>
          <td><span class="badge ${badgeKleur}">${statusLabel}</span></td>
          <td>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              ${heeftBestand?`<button class="btn btn-secondary btn-sm" onclick="toonBonPreview('${veiligId}')">↗ Bekijk</button>`:''}
              ${status==='nieuw'?`<button class="btn btn-primary btn-sm" onclick="bonMaakFactuur('${veiligId}','${veiligOmschr}','${veiligDatum}')">+ Inkoopfactuur</button>`:''}
              ${status==='nieuw'?`<button class="btn btn-danger btn-sm" onclick="bonAfkeuren('${veiligId}')">Afkeuren</button>`:''}
            </div>
          </td>
        </tr>`;
      } catch(rijErr){
        console.error('[Bonnen] Fout bij rij '+i+':', rijErr, u);
        return `<tr><td colspan="6" style="color:var(--danger);font-size:12px;">Rij ${i} kon niet geladen worden: ${rijErr.message}</td></tr>`;
      }
    });

    el.innerHTML = `<div style="overflow-x:auto;-webkit-overflow-scrolling:touch;width:100%;"><table class="table" style="min-width:600px;">
      <thead><tr>
        <th>Bestand</th><th>Door</th><th>Datum</th><th>Omschrijving</th><th>Status</th><th></th>
      </tr></thead>
      <tbody>${rijen.join('')}</tbody>
    </table></div>`;
    console.log('[Bonnen] Tabel gerenderd: '+lijst.length+' rijen');
  } catch(renderErr) {
    console.error('[Bonnen] Render crash:', renderErr);
    el.innerHTML = '<div style="color:var(--danger);padding:16px;">Render fout: '+renderErr.message+'</div>';
  }
}

function toonBonPreview(uploadId){
  const u = _bonnenData.find(x=>x.id===uploadId);
  if(!u){ console.error('[Bonnen] ID niet gevonden:', uploadId); return; }
  const data = u.bestandData || u.viewUrl || '';
  if(!data){ toast('Geen bestandsdata beschikbaar.','error'); return; }

  // Converteer base64 naar Blob URL (werkt ook bij file:// openen)
  try {
    const [header, b64] = data.split(',');
    const mimeMatch = header.match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : (u.type||'application/octet-stream');
    const binStr = atob(b64);
    const bytes = new Uint8Array(binStr.length);
    for(let i=0;i<binStr.length;i++) bytes[i]=binStr.charCodeAt(i);
    const blob = new Blob([bytes],{type:mime});
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  } catch(e){
    console.error('[Bonnen] Preview fout:', e);
    toast('Kan bestand niet openen: '+e.message,'error');
  }
}

function bonMaakFactuur(uploadId, omschrijving, uploadDatum){
  // Open de factuur modal voor inkoop, pre-filled
  DB.editId = null;
  DB.editType = 'inkoop';
  openFactuurModal('inkoop');

  // Pre-fill zodra modal open is
  requestAnimationFrame(()=>{
    const datumEl = document.getElementById('f-datum');
    if(datumEl) datumEl.value = uploadDatum ? uploadDatum.slice(0,10) : today();

    const notitiesEl = document.getElementById('f-notities');
    if(notitiesEl) notitiesEl.value = omschrijving ? 'Bon: '+omschrijving : '';

    // Zet eerste regel met omschrijving
    const regels = document.querySelectorAll('#f-regels .invoice-line input');
    if(regels.length > 0) regels[0].value = omschrijving||'Bon kassier';

    // Sla uploadId op zodat we na opslaan de status kunnen updaten
    window._pendingBonUploadId = uploadId;

    // Koppel het bonbestand automatisch als bijlage aan de nieuwe factuur.
    // openFactuurModal() heeft _bijlagenBuffer al geleegd; hier zetten we het
    // bonbestand erin zodat de bestaande opslag-flow (slaaBijlagenOp) het uploadt.
    const bon = _bonnenData.find(x=>x.id===uploadId);
    const bonData = bon && (bon.bestandData || bon.viewUrl);
    if(bonData){
      _bijlagenBuffer.push({
        naam: bon.naam || (omschrijving ? 'Bon '+omschrijving : 'Bon kassier'),
        type: bon.type || 'application/octet-stream',
        data: bonData,
        datum: bon.uploadedAt || new Date().toISOString(),
        isNew: true
      });
      renderBijlagenBuffer();
    }
  });

  toast('Factuurmodal geopend — vul leverancier en bedrag in.','success');
}

function bonAfkeuren(uploadId){
  if(!checkOnline()) return;
  fbAanroep(fb=>fb.updateUploadStatus(huidigBedrijf, uploadId, 'afgekeurd'))
    .then(()=>{
      toast('Bon afgekeurd.','success');
      const u = _bonnenData.find(x=>x.id===uploadId);
      if(u) u.status = 'afgekeurd';
      renderBonnenLijst();
    })
    .catch(()=>toast('Status bijwerken mislukt.','error'));
}

function renderImports(){
  const el=document.getElementById('imports-list');
  if(!el) return;
  const imports=(DB.imports||[]).slice();

  // Reconstrueer imports waarvan het record ontbreekt terwijl de transacties er nog
  // zijn. Dit komt voor bij data van vóór de imports-sync-fix in state.js: een
  // apparaat dat de importgeschiedenis niet had ingelezen schreef imports:[] naar de
  // cloud, terwijl elke transactie zijn importId gewoon behield. Zonder deze
  // reconstructie is zo'n import op géén enkel apparaat meer in één keer te
  // verwijderen. We tonen ze alleen — er wordt niets teruggeschreven of gewist.
  const bekend=new Set(imports.map(i=>i.id));
  const wees={};
  (DB.transacties||[]).forEach(t=>{
    if(!t.importId||bekend.has(t.importId)) return;
    const w=wees[t.importId]||(wees[t.importId]={aantal:0,datums:[]});
    w.aantal++;
    if(t.datum) w.datums.push(t.datum);
  });
  Object.keys(wees).forEach(id=>{
    const w=wees[id];
    w.datums.sort();
    // Geen importdatum bekend — val terug op de vroegste transactiedatum.
    imports.push({id,datum:w.datums[0]||'onbekend',aantalTransacties:w.aantal,hersteld:true});
  });

  if(!imports.length){el.innerHTML='<div class="empty" style="padding:20px;"><p>Geen imports</p></div>';return;}
  el.innerHTML=imports.slice().reverse().map(imp=>{
    const transacties=DB.transacties.filter(t=>t.importId===imp.id);
    const gekoppeld=transacties.filter(t=>t.status==='gekoppeld').length;
    const ongekoppeld=transacties.filter(t=>t.status==='ongekoppeld').length;
    const totaal=transacties.length;
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border);">
      <div>
        <div style="font-size:13px;font-weight:500;">Import ${imp.datum}${imp.hersteld?` <span class="badge badge-orange" title="Importrecord ontbrak — afgeleid uit de transacties. Datum is de vroegste transactiedatum, niet de importdatum.">hersteld</span>`:''}</div>
        <div style="font-size:12px;color:var(--text-dim);margin-top:3px;">
          ${totaal} transacties
          ${gekoppeld>0?`· <span style="color:var(--accent);">${gekoppeld} gekoppeld</span>`:''}
          ${ongekoppeld>0?`· <span style="color:var(--warning);">${ongekoppeld} ongekoppeld</span>`:''}
        </div>
      </div>
      <button class="btn btn-danger btn-sm" onclick="verwijderImport('${imp.id}')">Verwijder import</button>
    </div>`;
  }).join('');
}

async function verwijderImport(importId){
  const transacties=DB.transacties.filter(t=>t.importId===importId);
  const gekoppeld=transacties.filter(t=>t.status==='gekoppeld').length;
  const msg=gekoppeld>0
    ?`Deze import heeft ${gekoppeld} gekoppelde transactie(s). Als je de import verwijdert worden alle boekingen teruggedraaid. Doorgaan?`
    :`Verwijder deze import (${transacties.length} transacties)?`;
  const ok=await bevestig(msg,'Import verwijderen','Verwijderen');
  if(!ok) return;
  // Draai alle gekoppelde boekingen terug
  transacties.forEach(t=>{
    if(t.status==='gekoppeld') draaiBoekingTerug(t);
  });
  // Verwijder transacties
  DB.transacties=DB.transacties.filter(t=>t.importId!==importId);
  // Verwijder import record
  DB.imports=(DB.imports||[]).filter(i=>i.id!==importId);
  save(); renderTransacties(); renderImports(); updateBankStats();
}
let regelBTW=0;

function setRegelBTW(tarief){
  regelBTW=tarief;
  document.querySelectorAll('.regel-btw-btn').forEach(btn=>{
    const t=parseInt(btn.dataset.tarief);
    if(t===tarief){ btn.style.background='var(--accent2)'; btn.style.color='#fff'; btn.style.borderColor='var(--accent2)'; }
    else { btn.style.background='var(--surface2)'; btn.style.color='var(--text-mid)'; btn.style.borderColor='var(--border)'; }
  });
}

function openRegelModal(){
  regelBTW=0;
  document.getElementById('regel-keyword').value='';
  document.getElementById('regel-match').value='bevat';
  document.getElementById('regel-contact').value='';
  document.getElementById('regel-omschrijving').value='';
  document.getElementById('regel-gb-sel').innerHTML=DB.grootboek.map(g=>`<option value="${g.id}">${g.nummer} — ${g.naam}</option>`).join('');
  const contacten=[...new Set([...DB.verkoop.map(f=>f.klant),...DB.inkoop.map(f=>f.klant)].filter(Boolean))];
  document.getElementById('regel-contact-list').innerHTML=contacten.map(c=>`<option value="${c}">`).join('');
  document.querySelectorAll('.regel-btw-btn').forEach(btn=>{ btn.style.background='var(--surface2)'; btn.style.color='var(--text-mid)'; btn.style.borderColor='var(--border)'; });
  openModal('modal-regel');
}

function slaRegelOp(){
  const kw=document.getElementById('regel-keyword').value.trim();
  const gbId=document.getElementById('regel-gb-sel').value;
  const match=document.getElementById('regel-match').value;
  const contact=document.getElementById('regel-contact').value.trim();
  const omschrijving=document.getElementById('regel-omschrijving').value.trim();
  if(!kw||!gbId){toast('Vul omschrijving en grootboekrekening in.','error');return;}
  DB.regels.push({id:uid(),keyword:kw,gbId,match,contact,omschrijving,btw:regelBTW});
  save();closeModal('modal-regel');renderRegels();toast('Boekingsregel opgeslagen.');
}

async function verwijderRegel(id){
  const ok=await bevestig('Boekingsregel verwijderen?','Regel verwijderen','Verwijderen');
  if(!ok) return;
  DB.regels=DB.regels.filter(r=>r.id!==id);
  save();renderRegels();toast('Regel verwijderd.','info');
}

function renderRegels(){
  const el=document.getElementById('regels-list');
  if(!el) return;
  if(!DB.regels.length){el.innerHTML='<div class="empty"><span class="icon">⚙️</span><p>Geen boekingsregels ingesteld</p><p style="font-size:12px;margin-top:6px;">Regels matchen transacties automatisch aan grootboekrekeningen</p></div>';return;}
  const matchLabel={bevat:'bevat',exact:'is exact',begint:'begint met'};
  el.innerHTML=DB.regels.map(r=>{
    const g=DB.grootboek.find(g=>g.id===r.gbId);
    const extras=[];
    if(r.contact) extras.push(`<span class="badge badge-blue" style="font-size:10px;">Wie: ${r.contact}</span>`);
    if(r.btw>0) extras.push(`<span class="badge badge-orange" style="font-size:10px;">BTW ${r.btw}%</span>`);
    if(r.omschrijving) extras.push(`<span style="font-size:11px;color:var(--text-dim);">"${esc(r.omschrijving)}"</span>`);
    return `<div class="regel-row" style="flex-wrap:wrap;gap:8px;">
      <span style="font-family:var(--mono);font-size:12px;background:var(--surface2);padding:4px 8px;border-radius:3px;border:1px solid var(--border);">${r.keyword}</span>
      <span style="font-size:12px;color:var(--text-dim);">${matchLabel[r.match]||r.match}</span>
      <span style="font-size:12px;">→</span>
      <span style="font-size:13px;font-weight:500;">${g?g.nummer+' — '+g.naam:'(rekening verwijderd)'}</span>
      ${extras.join(' ')}
      <button class="btn btn-danger btn-sm" style="margin-left:auto;" onclick="verwijderRegel('${r.id}')">✕</button>
    </div>`;
  }).join('');
}

