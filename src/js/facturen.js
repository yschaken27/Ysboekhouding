// ===== DASHBOARD =====
function renderDashboard(){
  const jaar = new Date().getFullYear();
  const periode = window._dashPeriode || 'ytd';
  const vandaag = new Date();

  function inPeriode(datum){
    if(!datum) return false;
    const d = new Date(datum);
    const y = d.getFullYear();
    if(periode==='all') return true;
    if(periode==='ytd') return y===jaar;
    if(periode==='q1') return y===jaar&&d.getMonth()<3;
    if(periode==='q2') return y===jaar&&d.getMonth()>=3&&d.getMonth()<6;
    if(periode==='q3') return y===jaar&&d.getMonth()>=6&&d.getMonth()<9;
    if(periode==='q4') return y===jaar&&d.getMonth()>=9;
    if(periode.startsWith('m')){
      const maand = parseInt(periode.slice(1),10)-1;
      return y===jaar && d.getMonth()===maand;
    }
    return true;
  }

  // Bij kasstelsel: filter op betaaldatum, bij factuurstelsel op factuurdatum
  const _ks = isKasstelsel();
  const vkPeriode = _ks
    ? DB.verkoop.filter(f=>{ const d=getBtwDatum(f); return d&&inPeriode(d); })
    : DB.verkoop.filter(f=>inPeriode(f.datum));
  const ikPeriode = _ks
    ? DB.inkoop.filter(f=>{ const d=getBtwDatum(f); return d&&inPeriode(d); })
    : DB.inkoop.filter(f=>inPeriode(f.datum));

  // Kassaomzet altijd op kassadatum (inherent kasstelsel), altijd excl BTW
  const _kassaOmzetDash = (DB.kassalijsten||[])
    .filter(k=>k.status==='goedgekeurd'&&inPeriode(k.datum))
    .reduce((a,k)=>a+parseFloat(k.totaalOmzet||0), 0);
  const omzet = (_ks
    ? vkPeriode.reduce((a,f)=>a+getOmzetKas(f),0)
    : vkPeriode.reduce((a,f)=>a+parseFloat(f.totaalExcl||0),0))
    + _kassaOmzetDash;
  const inkoopTot = ikPeriode.reduce((a,f)=>a+getInkoopKas(f),0);
  const marge = omzet - inkoopTot;
  const margePct = omzet>0?((marge/omzet)*100).toFixed(1):0;
  const openstaand = DB.verkoop.filter(f=>f.status!=='betaald').reduce((a,f)=>a+parseFloat(f.totaalIncl||0),0);
  const crediteuren = DB.inkoop.filter(f=>f.status!=='betaald').reduce((a,f)=>a+parseFloat(f.totaalIncl||0),0);
  const bankRek = DB.grootboek.find(g=>g.nummer==='1100'||g.naam?.toLowerCase().includes('bank'));
  const banksaldo = parseFloat(bankRek?.saldo||0);
  const openVK = DB.verkoop.filter(f=>f.status==='verstuurd'||f.status==='concept').length;
  const openIK = DB.inkoop.filter(f=>f.status==='ontvangen'||f.status==='te betalen').length;

  // Bedrijfsnaam in subtitle
  const sub = document.getElementById('dash-bedrijf-sub');
  const _mndNamen = {m01:'Januari',m02:'Februari',m03:'Maart',m04:'April',m05:'Mei',m06:'Juni',m07:'Juli',m08:'Augustus',m09:'September',m10:'Oktober',m11:'November',m12:'December'};
  const _periodeLabel = {ytd:'Huidig jaar',q1:'Q1',q2:'Q2',q3:'Q3',q4:'Q4',all:'Alle periodes',..._mndNamen};
  if(sub) sub.textContent = (DB.profiel?.bedrijfsnaam||huidigBedrijf) + ' — ' + (_periodeLabel[periode]||periode) + (_ks?' · Kasstelsel':'');

  // Stats vullen
  document.getElementById('s-omzet').textContent = fmt(omzet);
  document.getElementById('s-omzet-sub').textContent = vkPeriode.length + ' facturen';
  document.getElementById('s-inkoop').textContent = fmt(inkoopTot);
  document.getElementById('s-inkoop-sub').textContent = ikPeriode.length + ' facturen';
  const mel = document.getElementById('s-marge');
  mel.textContent = fmt(marge);
  mel.className = 'value ' + (marge>=0?'green':'red');
  document.getElementById('s-marge-pct').textContent = margePct + '% marge';
  document.getElementById('s-openstaand').textContent = fmt(openstaand);
  document.getElementById('s-openstaand-sub').textContent = openVK + ' open';
  document.getElementById('s-crediteuren').textContent = fmt(crediteuren);
  document.getElementById('s-banksaldo').textContent = fmt(banksaldo);

  // Privé-opnames stats
  const prive = getPriveTotalen();
  const snpo = document.getElementById('s-prive-opnames');
  const snps = document.getElementById('s-prive-stortingen');
  const snpn = document.getElementById('s-prive-netto');
  if(snpo) snpo.textContent = fmt(prive.opnames);
  if(snps) snps.textContent = fmt(prive.stortingen);
  if(snpn){ snpn.textContent = fmt(Math.abs(prive.netto)); snpn.style.color=prive.netto>=0?'#059669':'#7c3aed'; }

  // Maandelijks chart — bij kasstelsel op betaaldatum, bij factuurstelsel op factuurdatum
  const maanden = ['Jan','Feb','Mrt','Apr','Mei','Jun','Jul','Aug','Sep','Okt','Nov','Dec'];
  const omzetPerMaand = Array(12).fill(0);
  const kostenPerMaand = Array(12).fill(0);
  DB.verkoop.forEach(f=>{
    const d = _ks ? getBtwDatum(f) : f.datum;
    if(!d || new Date(d).getFullYear()!==jaar) return;
    omzetPerMaand[new Date(d).getMonth()] += _ks ? getOmzetKas(f) : parseFloat(f.totaalExcl||0);
  });
  // Kassaomzet in maandgrafiek
  (DB.kassalijsten||[]).filter(k=>k.status==='goedgekeurd'&&new Date(k.datum||'').getFullYear()===jaar).forEach(k=>{
    omzetPerMaand[new Date(k.datum).getMonth()] += parseFloat(k.totaalOmzet||0);
  });
  DB.inkoop.forEach(f=>{
    const d = _ks ? getBtwDatum(f) : f.datum;
    if(!d || new Date(d).getFullYear()!==jaar) return;
    kostenPerMaand[new Date(d).getMonth()] += _ks ? getInkoopKas(f) : parseFloat(f.totaalExcl||0);
  });
  const ctx = document.getElementById('dash-chart-maand');
  if(ctx){
    if(window._dashChart) window._dashChart.destroy();
    window._dashChart = new Chart(ctx, {
      type:'bar',
      data:{
        labels: maanden,
        datasets:[
          {label:'Omzet', data:omzetPerMaand, backgroundColor:'rgba(0,230,118,.7)', borderRadius:4},
          {label:'Kosten', data:kostenPerMaand, backgroundColor:'rgba(255,82,82,.5)', borderRadius:4},
        ]
      },
      options:{
        responsive:true, maintainAspectRatio:false,
        plugins:{legend:{labels:{color:'#8a8a96',font:{size:11}}}},
        scales:{
          x:{ticks:{color:'#5a5a62',font:{size:10}},grid:{color:'rgba(255,255,255,.04)'}},
          y:{ticks:{color:'#5a5a62',font:{size:10},callback:v=>'€'+Math.round(v/1000)+'k'},grid:{color:'rgba(255,255,255,.04)'}}
        }
      }
    });
  }

  // Top klanten — gebruik vkPeriode (al gefilterd op stelsel en periode)
  const klantMap = {};
  vkPeriode.forEach(f=>{
    const val = _ks ? getOmzetKas(f) : parseFloat(f.totaalExcl||0);
    klantMap[f.klant||'Onbekend'] = (klantMap[f.klant||'Onbekend']||0) + val;
  });
  const topKlanten = Object.entries(klantMap).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const maxVal = topKlanten[0]?.[1]||1;
  const tkEl = document.getElementById('dash-top-klanten');
  if(tkEl){
    if(!topKlanten.length){ tkEl.innerHTML='<div class="empty" style="padding:20px;"><p>Geen data</p></div>'; }
    else tkEl.innerHTML = topKlanten.map(([naam,val])=>`
      <div style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60%;">${naam}</span>
          <span style="font-family:var(--mono);color:var(--accent);">${fmt(val)}</span>
        </div>
        <div style="height:4px;background:var(--surface2);border-radius:2px;">
          <div style="height:100%;width:${(val/maxVal*100).toFixed(0)}%;background:var(--accent);border-radius:2px;"></div>
        </div>
      </div>`).join('');
  }

  // Recente facturen
  const recent = [...DB.verkoop,...DB.inkoop].filter(f=>f.id).sort((a,b)=>(b.datum||'').localeCompare(a.datum||'')).slice(0,5);
  const rEl = document.getElementById('dash-recent');
  if(rEl){
    if(!recent.length){ rEl.innerHTML='<div class="empty"><p>Geen facturen</p></div>'; }
    else rEl.innerHTML=`<table style="font-size:12px;">
      <thead><tr><th>Nr</th><th>Partij</th><th>Bedrag</th><th>Status</th></tr></thead>
      <tbody>${recent.map(f=>`<tr>
        <td class="mono" style="font-size:11px;">${f.nummer||''}</td>
        <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${f.klant||''}</td>
        <td class="mono">${fmt(f.totaalIncl||0)}</td>
        <td>${badge(f.status||'')}</td>
      </tr>`).join('')}</tbody></table>`;
  }

  // Vervallen facturen
  const nu = new Date();
  const binnenkort = new Date(); binnenkort.setDate(binnenkort.getDate()+7);
  const vervallen = DB.verkoop.filter(f=>f.status!=='betaald'&&f.vervaldatum&&new Date(f.vervaldatum)<binnenkort)
    .sort((a,b)=>a.vervaldatum.localeCompare(b.vervaldatum)).slice(0,5);
  const vEl = document.getElementById('dash-vervallen');
  if(vEl){
    if(!vervallen.length){ vEl.innerHTML='<div class="empty"><p style="color:var(--accent);">✓ Geen vervallen facturen</p></div>'; }
    else vEl.innerHTML=`<table style="font-size:12px;">
      <thead><tr><th>Nr</th><th>Klant</th><th>Bedrag</th><th>Vervalt</th></tr></thead>
      <tbody>${vervallen.map(f=>{
        const verv = new Date(f.vervaldatum);
        const verlopen = verv < nu;
        return `<tr style="${verlopen?'background:rgba(255,82,82,.06);':''}">
          <td class="mono" style="font-size:11px;">${f.nummer||''}</td>
          <td style="max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${f.klant||''}</td>
          <td class="mono">${fmt(f.totaalIncl||0)}</td>
          <td style="color:${verlopen?'var(--danger)':'var(--warning)'};font-family:var(--mono);font-size:11px;">${verlopen?'Verlopen':f.vervaldatum}</td>
        </tr>`;
      }).join('')}</tbody></table>`;
  }
}

let _dashPeriode = 'ytd';
function setDashPeriode(p){
  window._dashPeriode = p;
  _dashPeriode = p;
  const knoppen = ['ytd','q1','q2','q3','q4','all'];
  knoppen.forEach(x=>{
    const el = document.getElementById('dash-filter-'+x);
    if(!el) return;
    el.className = x===p ? 'btn btn-sm' : 'btn btn-secondary btn-sm';
    el.style.background = x===p ? 'var(--accent)' : '';
    el.style.color = x===p ? '#fff' : '';
    el.style.fontWeight = x===p ? '600' : '';
  });
  // Reset dropdown als het geen maand is, anders toon geselecteerde maand
  const sel = document.getElementById('dash-maand-select');
  if(sel){
    if(p.startsWith('m')) sel.value = p;
    else sel.value = '';
  }
  renderDashboard();
}

function setDashPeriodeDropdown(p){
  if(!p) return;
  // Reset alle knoppen
  ['ytd','q1','q2','q3','q4','all'].forEach(x=>{
    const el = document.getElementById('dash-filter-'+x);
    if(!el) return;
    el.className = 'btn btn-secondary btn-sm';
    el.style.background = '';
    el.style.color = '';
    el.style.fontWeight = '';
  });
  setDashPeriode(p);
}

function downloadDashboard(){
  const bedrijf = DB.profiel?.bedrijfsnaam || huidigBedrijf;
  const datum = new Date().toLocaleDateString('nl-NL');
  const jaar = new Date().getFullYear();
  const _kassaOmzetMob = (DB.kassalijsten||[])
    .filter(k=>k.status==='goedgekeurd'&&new Date(k.datum||'').getFullYear()===jaar)
    .reduce((a,k)=>a+parseFloat(k.totaalOmzet||0), 0);
  const omzet = DB.verkoop.reduce((a,f)=>a+parseFloat(f.totaalExcl||0),0) + _kassaOmzetMob;
  const kosten = DB.inkoop.reduce((a,f)=>a+parseFloat(f.totaalExcl||0),0);
  const marge = omzet-kosten;
  const margePct = omzet>0?((marge/omzet)*100).toFixed(1):0;
  const openstaand = DB.verkoop.filter(f=>f.status!=='betaald').reduce((a,f)=>a+parseFloat(f.totaalIncl||0),0);
  const bankRek = DB.grootboek.find(g=>g.nummer==='1100'||g.naam?.toLowerCase().includes('bank'));
  const banksaldo = parseFloat(bankRek?.saldo||0);

  // Maanddata
  const maanden = ['Jan','Feb','Mrt','Apr','Mei','Jun','Jul','Aug','Sep','Okt','Nov','Dec'];
  const omzetM = Array(12).fill(0);
  const kostenM = Array(12).fill(0);
  // Maandgrafiek — bij kasstelsel op betaaldatum, bij factuurstelsel op factuurdatum
  const _mKs = isKasstelsel();
  DB.verkoop.forEach(f=>{
    const d = _mKs ? getBtwDatum(f) : f.datum;
    if(!d || new Date(d).getFullYear()!==jaar) return;
    omzetM[new Date(d).getMonth()] += _mKs ? getOmzetKas(f) : parseFloat(f.totaalExcl||0);
  });
  DB.inkoop.forEach(f=>{
    const d = _mKs ? getBtwDatum(f) : f.datum;
    if(!d || new Date(d).getFullYear()!==jaar) return;
    kostenM[new Date(d).getMonth()] += _mKs ? getInkoopKas(f) : parseFloat(f.totaalExcl||0);
  });

  // Top klanten — bij kasstelsel alleen betaalde omzet
  const klantMap = {};
  DB.verkoop.forEach(f=>{
    const d = _mKs ? getBtwDatum(f) : f.datum;
    if(!d || new Date(d).getFullYear()!==jaar) return;
    const val = _mKs ? getOmzetKas(f) : parseFloat(f.totaalExcl||0);
    klantMap[f.klant||'Onbekend'] = (klantMap[f.klant||'Onbekend']||0) + val;
  });
  const topK = Object.entries(klantMap).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const maxK = topK[0]?.[1]||1;

  // Vervallen
  const nu = new Date();
  const vervallen = DB.verkoop.filter(f=>f.status!=='betaald'&&f.vervaldatum&&new Date(f.vervaldatum)<nu);

  const html = `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
<meta http-equiv="Pragma" content="no-cache">
<meta http-equiv="Expires" content="0">
<link rel="apple-touch-icon" href="data:image/png;base64,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">
<link rel="icon" type="image/png" href="data:image/png;base64,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">


<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Financieel Rapport — ${bedrijf}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Inter',sans-serif;background:#f8f9fa;color:#1a1a2e;font-size:14px;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  @media print{body{background:white;}.no-print{display:none;}}
  .wrap{max-width:900px;margin:0 auto;padding:40px 32px;}
  .header{background:linear-gradient(135deg,#0c0c1e 0%,#1a1a3e 100%);color:white;padding:36px 40px;border-radius:16px;margin-bottom:32px;display:flex;justify-content:space-between;align-items:flex-end;}
  .header h1{font-size:28px;font-weight:700;letter-spacing:-.02em;margin-bottom:4px;}
  .header p{color:rgba(255,255,255,.6);font-size:13px;}
  .header-right{text-align:right;}
  .header-right .rapport-label{font-size:10px;text-transform:uppercase;letter-spacing:.15em;color:rgba(255,255,255,.4);margin-bottom:4px;}
  .header-right .rapport-datum{font-family:'JetBrains Mono',monospace;color:#00e676;font-size:13px;}
  .grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px;}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px;}
  .stat{background:white;border:1px solid #e8eaed;border-radius:12px;padding:16px 18px;}
  .stat .lbl{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:#9aa0a6;font-weight:500;margin-bottom:8px;}
  .stat .val{font-family:'JetBrains Mono',monospace;font-size:20px;font-weight:600;}
  .stat .val.green{color:#00c853;}
  .stat .val.red{color:#d32f2f;}
  .stat .val.blue{color:#1565c0;}
  .stat .sub{font-size:11px;color:#9aa0a6;margin-top:4px;}
  .card{background:white;border:1px solid #e8eaed;border-radius:12px;padding:20px;margin-bottom:16px;}
  .card-title{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#5f6368;font-weight:600;margin-bottom:16px;font-family:'JetBrains Mono',monospace;}
  table{width:100%;border-collapse:collapse;}
  th{text-align:left;padding:8px 12px;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#9aa0a6;border-bottom:2px solid #f1f3f4;font-weight:600;}
  td{padding:10px 12px;border-bottom:1px solid #f8f9fa;font-size:13px;}
  tr:last-child td{border-bottom:none;}
  .mono{font-family:'JetBrains Mono',monospace;}
  .badge{display:inline-flex;padding:3px 8px;border-radius:20px;font-size:11px;font-weight:500;font-family:'JetBrains Mono',monospace;}
  .badge-green{background:#e8f5e9;color:#2e7d32;}
  .badge-orange{background:#fff3e0;color:#e65100;}
  .badge-red{background:#ffebee;color:#c62828;}
  .badge-gray{background:#f5f5f5;color:#616161;}
  .bar-wrap{margin-bottom:10px;}
  .bar-row{display:flex;align-items:center;gap:12px;margin-bottom:8px;}
  .bar-label{font-size:12px;width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .bar-track{flex:1;height:6px;background:#f1f3f4;border-radius:3px;}
  .bar-fill{height:100%;background:#00c853;border-radius:3px;}
  .bar-val{font-family:'JetBrains Mono',monospace;font-size:12px;color:#1a73e8;white-space:nowrap;}
  .maand-table{width:100%;}
  .maand-table th{background:#f8f9fa;}
  .verlopen{background:#fff8f8;}
  .footer{text-align:center;color:#9aa0a6;font-size:11px;margin-top:32px;padding-top:16px;border-top:1px solid #e8eaed;}
  .print-btn{background:#1a1a2e;color:white;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:500;margin-bottom:24px;}
</style>
</head>
<body>
<div class="wrap">
  <button class="print-btn no-print" onclick="window.print()">🖨️ Afdrukken / Opslaan als PDF</button>

  <div class="header">
    <div>
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.15em;color:rgba(255,255,255,.4);margin-bottom:8px;">Financieel Rapport</div>
      <h1>${bedrijf}</h1>
      <p>${DB.profiel?.btwnr||''} ${DB.profiel?.kvk?'· KvK: '+DB.profiel.kvk:''}</p>
    </div>
    <div class="header-right">
      <div class="rapport-label">Gegenereerd op</div>
      <div class="rapport-datum">${datum}</div>
      <div style="color:rgba(255,255,255,.4);font-size:12px;margin-top:4px;">Boekjaar ${jaar}</div>
    </div>
  </div>

  <div class="grid4">
    <div class="stat"><div class="lbl">Omzet excl. BTW</div><div class="val green">${fmt(omzet)}</div><div class="sub">${DB.verkoop.length} facturen</div></div>
    <div class="stat"><div class="lbl">Inkoopkosten</div><div class="val red">${fmt(kosten)}</div><div class="sub">${DB.inkoop.length} facturen</div></div>
    <div class="stat"><div class="lbl">Bruto marge</div><div class="val ${marge>=0?'green':'red'}">${fmt(marge)}</div><div class="sub">${margePct}% van omzet</div></div>
    <div class="stat"><div class="lbl">Openstaand</div><div class="val blue">${fmt(openstaand)}</div><div class="sub">Debiteuren</div></div>
  </div>

  <div class="grid2">
    <div class="card">
      <div class="card-title">Maandoverzicht ${jaar}</div>
      <table class="maand-table">
        <thead><tr><th>Maand</th><th style="text-align:right;">Omzet</th><th style="text-align:right;">Kosten</th><th style="text-align:right;">Marge</th></tr></thead>
        <tbody>${maanden.map((m,i)=>omzetM[i]||kostenM[i]?`
          <tr>
            <td>${m}</td>
            <td class="mono" style="text-align:right;color:#2e7d32;">${fmt(omzetM[i])}</td>
            <td class="mono" style="text-align:right;color:#c62828;">${fmt(kostenM[i])}</td>
            <td class="mono" style="text-align:right;font-weight:600;">${fmt(omzetM[i]-kostenM[i])}</td>
          </tr>`:''
        ).join('')}</tbody>
        <tfoot><tr style="border-top:2px solid #e8eaed;">
          <td style="font-weight:600;">Totaal</td>
          <td class="mono" style="text-align:right;font-weight:600;color:#2e7d32;">${fmt(omzet)}</td>
          <td class="mono" style="text-align:right;font-weight:600;color:#c62828;">${fmt(kosten)}</td>
          <td class="mono" style="text-align:right;font-weight:700;font-size:15px;">${fmt(marge)}</td>
        </tr></tfoot>
      </table>
    </div>
    <div class="card">
      <div class="card-title">Top klanten (omzet)</div>
      ${topK.map(([naam,val])=>`
        <div class="bar-row">
          <div class="bar-label" title="${naam}">${naam}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${(val/maxK*100).toFixed(0)}%"></div></div>
          <div class="bar-val">${fmt(val)}</div>
        </div>`).join('')}
    </div>
  </div>

  ${vervallen.length?`<div class="card">
    <div class="card-title" style="color:#c62828;">⚠ Vervallen facturen (${vervallen.length})</div>
    <table>
      <thead><tr><th>Nummer</th><th>Klant</th><th>Bedrag</th><th>Vervaldatum</th></tr></thead>
      <tbody>${vervallen.slice(0,10).map(f=>`
        <tr class="verlopen">
          <td class="mono">${f.nummer||''}</td>
          <td>${f.klant||''}</td>
          <td class="mono">${fmt(f.totaalIncl||0)}</td>
          <td class="mono" style="color:#c62828;">${f.vervaldatum}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`:''}

  <div class="footer">
    Rapport gegenereerd door Ledger · ${bedrijf} · ${datum}
  </div>
</div>
</body>
</html>`;

  const blob = new Blob([html], {type:'text/html'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Rapport_${bedrijf.replace(/\s+/g,'_')}_${jaar}.html`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Rapport gedownload — open het bestand en druk op "Afdrukken" om het als PDF op te slaan.','success');
}


function openFactuurModal(type, id){
  DB.editType=type; DB.editId=id||null;
  const isVK=type==='verkoop';
  document.getElementById('f-modal-title').textContent=(id?'Bewerken: ':'Nieuwe ')+(isVK?'Verkoopfactuur':'Inkoopfactuur');
  document.getElementById('f-type-badge').innerHTML=isVK?'<span class="badge badge-green">↑ Verkoopfactuur</span>':'<span class="badge badge-orange">↓ Inkoopfactuur</span>';
  document.getElementById('f-partij-label').textContent=isVK?'Klant naam':'Leverancier naam';

  const statusSel=document.getElementById('f-status');
  if(isVK) statusSel.innerHTML='<option value="concept">Concept</option><option value="verstuurd">Verstuurd</option><option value="betaald">Betaald (handmatig)</option><option value="verlopen">Verlopen</option>';
  else statusSel.innerHTML='<option value="ontvangen">Ontvangen</option><option value="te betalen">Te betalen</option><option value="betaald">Betaald (handmatig)</option>';
  const arr=isVK?DB.verkoop:DB.inkoop;
  if(id){
    const f=arr.find(x=>x.id===id);
    document.getElementById('f-nummer').value=f.nummer;
    document.getElementById('f-datum').value=f.datum;
    document.getElementById('f-klant').value=f.klant;
    document.getElementById('f-vervaldatum').value=f.vervaldatum;
    document.getElementById('f-adres').value=f.adres||'';
    document.getElementById('f-kvk').value=f.kvk||'';
    document.getElementById('f-btwnr').value=f.btwnr||'';
    // BTW per regel (geen los BTW veld meer)
    document.getElementById('f-notities').value=f.notities||'';
    document.getElementById('f-status').value=f.status;
    // gbrekId per regel wordt ingeladen via addRegel(r)
    document.getElementById('f-regels').innerHTML='';
    f.regels.forEach(r=>addRegel(r));
  } else {
    const prefix=isVK?'VK-':'IK-';
    const jaar=new Date().getFullYear();
    const jaarFacturen=arr.filter(f=>f.nummer?.startsWith(prefix+jaar));
    const maxNr=jaarFacturen.reduce((max,f)=>{
      const nr=parseInt(f.nummer?.split('-').pop()||0);
      return Math.max(max,nr);
    },0);
    document.getElementById('f-nummer').value=prefix+jaar+'-'+String(maxNr+1).padStart(3,'0');
    document.getElementById('f-datum').value=today();
    const d=new Date(); d.setDate(d.getDate()+30);
    document.getElementById('f-vervaldatum').value=d.toISOString().split('T')[0];
    ['f-klant','f-adres','f-kvk','f-btwnr','f-notities'].forEach(id=>document.getElementById(id).value='');
    // BTW per regel ingesteld
    document.getElementById('f-status').value=isVK?'concept':'ontvangen';

    document.getElementById('f-regels').innerHTML='';
    addRegel();
  }
  berekenTotalen();
  // Laad bijlagen buffer met metadata (data wordt asynchroon geladen indien nodig)
  _bijlagenBuffer=[];
  if(id){
    const arr2=isVK?DB.verkoop:DB.inkoop;
    const f2=arr2.find(x=>x.id===id);
    if(f2&&f2.bijlagenMeta){
      // Laad data uit IDB voor de buffer
      (async()=>{
        for(let i=0;i<f2.bijlagenMeta.length;i++){
          const meta=f2.bijlagenMeta[i];
          const data=await idbHaal(bijlageIdbId(f2.id,i)+'_data');
          _bijlagenBuffer.push({...meta,data:data||'',isNew:false});
        }
        renderBijlagenBuffer();
      })();
    }
  }
  renderBijlagenBuffer();
  openModal('modal-factuur');
}

function addRegel(data){
  const gbOpts=DB.grootboek.map(g=>`<option value="${g.id}"${data&&data.gbId===g.id?' selected':''}>${g.nummer} — ${g.naam}</option>`).join('');
  const btwVal=data?data.btw:'21';
  const div=document.createElement('div');
  div.className='invoice-line';
  div.innerHTML=`
    <input type="text" placeholder="Omschrijving" value="${data?data.omschrijving:''}" oninput="berekenTotalen()">
    <input type="number" placeholder="1" value="${data?data.aantal:1}" min="0" step="0.01" oninput="berekenTotalen()">
    <input type="number" placeholder="0.00" value="${data?data.prijs:''}" min="0" step="0.01" oninput="berekenTotalen()">
    <select onchange="berekenTotalen()" style="font-size:12px;">
      <option value="">— Rekening —</option>${gbOpts}
    </select>
    <select onchange="berekenTotalen()" style="font-size:12px;width:auto;">
      <option value="21" ${btwVal==='21'?'selected':''}>21%</option>
      <option value="9" ${btwVal==='9'?'selected':''}>9%</option>
      <option value="0" ${btwVal==='0'?'selected':''}>0%</option>
    </select>
    <button class="btn-icon" onclick="this.closest('.invoice-line').remove();berekenTotalen()">✕</button>`;
  document.getElementById('f-regels').appendChild(div);
  berekenTotalen();
}

function berekenTotalen(){
  let sub=0; let btwTotaal=0;
  document.querySelectorAll('#f-regels .invoice-line').forEach(r=>{
    const inp=r.querySelectorAll('input');
    const sels=r.querySelectorAll('select');
    const bedrag=(parseFloat(inp[1]?.value)||0)*(parseFloat(inp[2]?.value)||0);
    const btwPct=parseInt(sels[1]?.value||'21')||0;
    sub+=bedrag;
    btwTotaal+=Math.round(bedrag*btwPct)/100;
  });
  if(isNaN(sub)) sub=0;
  if(isNaN(btwTotaal)) btwTotaal=0;
  document.getElementById('f-sub').textContent=fmt(sub);
  document.getElementById('f-btw-lbl').textContent='BTW';
  document.getElementById('f-btwbedrag').textContent=fmt(btwTotaal);
  document.getElementById('f-totaal').textContent=fmt(sub+btwTotaal);
}

async function slaFactuurOp(){
  const regels=[];
  document.querySelectorAll('#f-regels .invoice-line').forEach(r=>{
    const inp=r.querySelectorAll('input');
    const sels=r.querySelectorAll('select');
    regels.push({
      omschrijving:inp[0].value,
      aantal:parseFloat(inp[1].value)||0,
      prijs:parseFloat(inp[2].value)||0,
      gbId:sels[0]?.value||'',
      btw:sels[1]?.value||'21'
    });
  });
  const sub2=regels.reduce((a,r)=>a+(parseFloat(r.aantal)||0)*(parseFloat(r.prijs)||0),0);
  const btwTotaal=regels.reduce((a,r)=>a+Math.round((parseFloat(r.aantal)||0)*(parseFloat(r.prijs)||0)*(parseInt(r.btw)||0))/100,0);
  // Validatie: factuur mag geen bedrag van 0 hebben
  if(sub2 === 0){ toast('Factuur heeft een totaal van €0,00 — vul een bedrag in.','error'); return; }
  const isNieuw=!DB.editId;
  // Bij bewerken: sla oude factuur op voor terugdraaien
  const oudeFactuur = DB.editId
    ? (DB.editType==='verkoop' ? DB.verkoop.find(x=>x.id===DB.editId) : DB.inkoop.find(x=>x.id===DB.editId))
    : null;
  const f={
    id:DB.editId||uid(), _type:DB.editType||'inkoop',
    nummer:document.getElementById('f-nummer').value,
    datum:document.getElementById('f-datum').value,
    klant:document.getElementById('f-klant').value,
    vervaldatum:document.getElementById('f-vervaldatum').value,
    adres:document.getElementById('f-adres').value,
    kvk:document.getElementById('f-kvk').value,
    btwnr:document.getElementById('f-btwnr').value,
    notities:document.getElementById('f-notities').value,
    status:document.getElementById('f-status').value,
    regels, totaalExcl:sub2, btwBedrag:btwTotaal, totaalIncl:sub2+btwTotaal,
    bijlagenMeta: oudeFactuur?.bijlagenMeta || [] // bewaar bestaande bijlagen bij bewerken
  };
  // Gebruik directe referentie naar de juiste array
  if(DB.editType==='verkoop'){
    if(DB.editId){ const i=DB.verkoop.findIndex(x=>x.id===DB.editId); if(i>=0) DB.verkoop[i]=f; }
    else DB.verkoop.push(f);
  } else {
    if(DB.editId){ const i=DB.inkoop.findIndex(x=>x.id===DB.editId); if(i>=0) DB.inkoop[i]=f; }
    else DB.inkoop.push(f);
  }

  // Boek grootboek:
  // - Nieuw: boek direct
  // - Bewerken: draai oude boeking terug dan boek nieuwe
  if(!isNieuw && oudeFactuur){
    draaiFactuurGBTerug(oudeFactuur, DB.editType);
  }
  if(isNieuw || (!isNieuw && oudeFactuur)){
    // Signed bedragen — negatief bij creditnota, positief bij normale factuur
    const inclBedrag = parseFloat(f.totaalIncl)||0;
    const btwBedrag  = parseFloat(f.btwBedrag)||0;

    if(DB.editType==='verkoop'){
      const debRek = DB.grootboek.find(g=>g.nummer==='1300')
                  || DB.grootboek.find(g=>g.naam.toLowerCase().includes('debiteuren'));
      if(debRek) debRek.saldo = (parseFloat(debRek.saldo)||0) + inclBedrag;

      f.regels.forEach(r=>{
        const excl = (parseFloat(r.aantal)||0)*(parseFloat(r.prijs)||0);
        const omzetRek = (r.gbId ? DB.grootboek.find(g=>g.id===r.gbId) : null)
                      || DB.grootboek.find(g=>g.type==='omzet');
        if(omzetRek) omzetRek.saldo = (parseFloat(omzetRek.saldo)||0) + excl;
      });

      if(Math.abs(btwBedrag) > 0.01){
        const btwRek = DB.grootboek.find(g=>g.nummer==='1510')
                    || DB.grootboek.find(g=>g.nummer==='1530')
                    || DB.grootboek.find(g=>g.naam.toLowerCase().includes('btw te betalen'));
        if(btwRek) btwRek.saldo = (parseFloat(btwRek.saldo)||0) + btwBedrag;
      }

    } else {
      const credRek = DB.grootboek.find(g=>g.nummer==='2100')
                   || DB.grootboek.find(g=>g.naam.toLowerCase().includes('crediteur'));
      if(credRek) credRek.saldo = (parseFloat(credRek.saldo)||0) + inclBedrag;

      f.regels.forEach(r=>{
        const excl = (parseFloat(r.aantal)||0)*(parseFloat(r.prijs)||0);
        const kostenRek = (r.gbId ? DB.grootboek.find(g=>g.id===r.gbId) : null)
                       || DB.grootboek.find(g=>g.type==='kosten');
        if(kostenRek) kostenRek.saldo = (parseFloat(kostenRek.saldo)||0) + excl;
      });

      if(Math.abs(btwBedrag) > 0.01){
        const btwRek = DB.grootboek.find(g=>g.nummer==='1500')
                    || DB.grootboek.find(g=>g.nummer==='1520')
                    || DB.grootboek.find(g=>g.naam.toLowerCase().includes('btw te vorderen'))
                    || DB.grootboek.find(g=>g.naam.toLowerCase().includes('btw te ontvangen'));
        if(btwRek) btwRek.saldo = (parseFloat(btwRek.saldo)||0) + btwBedrag;
      }
    }
  }

  // Handmatige betaling consistent houden met de statuskeuze in de modal.
  // De aanmaak-boekingen hierboven raken de betaling (bank ↔ deb/cred) niet,
  // dus die wordt hier apart teruggedraaid en zo nodig opnieuw geboekt —
  // ook bij een bedragwijziging van een al betaalde factuur.
  if(isNieuw || oudeFactuur){
    const wasHandmatigBetaald = !!(oudeFactuur && oudeFactuur.handmatigBetaald);
    if(wasHandmatigBetaald) boekHandmatigeBetaling(oudeFactuur, DB.editType, -1);
    if(f.status==='betaald' && !_getBetalingen(f).length){
      boekHandmatigeBetaling(f, DB.editType, 1);
      f.betaaldOp = (wasHandmatigBetaald && oudeFactuur.betaaldOp) || today();
      f.handmatigBetaald = true;
    }
  }

  // Sla direct op zodat factuur altijd bewaard wordt
  const savedType = DB.editType; // bewaar type vóór closeModal
  save();
  closeModal('modal-factuur');
  // Navigeer EERST zodat de pagina actief is, dan pas renderen
  navTo(savedType);
  toast('Factuur opgeslagen.','success');

  // Als aangemaakt vanuit een bon — markeer upload als verwerkt
  if(window._pendingBonUploadId){
    if(!checkOnline()) return;
    const bonId = window._pendingBonUploadId;
    window._pendingBonUploadId = null;
    fbAanroep(fb=>fb.updateUploadStatus(huidigBedrijf, bonId, 'verwerkt'))
      .then(()=>{
        const u = _bonnenData.find(x=>x.id===bonId);
        if(u){ u.status='verwerkt'; renderBonnenLijst(); }
      }).catch(()=>{});
  }

  // Sla bijlagen op in IndexedDB — apart zodat een fout hier de factuur niet blokkeert
  try {
    const bijlagenMeta = await slaaBijlagenOp(f.id);
    f.bijlagenMeta = bijlagenMeta;
    const targetArr = DB.editType==='verkoop'?DB.verkoop:DB.inkoop;
    const idx2 = targetArr.findIndex(x=>x.id===f.id);
    if(idx2>=0){ targetArr[idx2] = f; save(); }
  } catch(e){
    console.warn('Bijlagen opslaan mislukt:', e);
  }
  // Detecteer vaste activa per factuurregel — alleen inkoopfacturen, alleen nieuwe
  if(isNieuw && DB.editType==='inkoop'){
    const vaRegels=f.regels.filter(r=>r.gbId&&DB.grootboek.find(g=>g.id===r.gbId&&g.type==='vaste_activa'));
    if(vaRegels.length>0){
      const alBestaand=(DB.vasteActiva||[]).some(a=>a.factuurId===f.id);
      if(!alBestaand){
        const eersteVARegel=vaRegels[0];
        const g=DB.grootboek.find(g=>g.id===eersteVARegel.gbId);
        const aanschafExcl=(parseFloat(eersteVARegel.aantal)||0)*(parseFloat(eersteVARegel.prijs)||0);
        const vaFactuur={...f,totaalExcl:aanschafExcl,regels:[eersteVARegel]};
        setTimeout(()=>openDeprVraagModal(vaFactuur,g),300);
      }
    }
  }
}

function draaiFactuurGBTerug(f, type){
  // Draait de grootboekboeking terug die werd gemaakt bij aanmaken factuur
  // Verkoop: Credit Debiteuren, Debet Omzet, Debet BTW te betalen
  // Inkoop:  Debet Crediteuren, Credit Kosten, Credit BTW te ontvangen
  if(!f) return;
  const inclBedrag = parseFloat(f.totaalIncl)||0;
  const btwBedrag  = parseFloat(f.btwBedrag)||0;

  if(type==='verkoop'){
    // Draai debiteuren terug
    const debRek = DB.grootboek.find(g=>g.nummer==='1300')
                || DB.grootboek.find(g=>g.naam.toLowerCase().includes('debiteuren'));
    if(debRek) debRek.saldo = (parseFloat(debRek.saldo)||0) - inclBedrag;

    // Draai omzet terug. Normale facturen hebben regels (per regel terugboeken).
    // Uren-/dagfacturen (type='uren') hebben GEEN regels-array — die boekten bij
    // aanmaak de volledige subtotaalExcl op de omzetrekening (type 'omzet'), dus
    // draai die hier in één keer terug. Zonder deze fallback bleef de omzet
    // (en daarmee balans + P&L) na verwijdering van een uren-/dagfactuur te hoog.
    const regels = f.regels||[];
    if(regels.length){
      regels.forEach(r=>{
        const excl = (parseFloat(r.aantal)||0)*(parseFloat(r.prijs)||0);
        const omzetRek = (r.gbId ? DB.grootboek.find(g=>g.id===r.gbId) : null)
                      || DB.grootboek.find(g=>g.type==='omzet');
        if(omzetRek) omzetRek.saldo = (parseFloat(omzetRek.saldo)||0) - excl;
      });
    } else {
      const omzetRek = DB.grootboek.find(g=>g.type==='omzet')
                    || DB.grootboek.find(g=>(g.naam||'').toLowerCase().includes('omzet'));
      if(omzetRek) omzetRek.saldo = (parseFloat(omzetRek.saldo)||0) - (parseFloat(f.totaalExcl)||0);
    }

    // Draai BTW te betalen terug
    if(btwBedrag > 0.01){
      const btwRek = DB.grootboek.find(g=>g.nummer==='1510')
                  || DB.grootboek.find(g=>g.nummer==='1530')
                  || DB.grootboek.find(g=>g.naam.toLowerCase().includes('btw te betalen'));
      if(btwRek) btwRek.saldo = (parseFloat(btwRek.saldo)||0) - btwBedrag;
    }

  } else {
    // Draai crediteuren terug
    const credRek = DB.grootboek.find(g=>g.nummer==='2100')
                 || DB.grootboek.find(g=>g.naam.toLowerCase().includes('crediteur'));
    if(credRek) credRek.saldo = (parseFloat(credRek.saldo)||0) - inclBedrag;

    // Draai kosten per regel terug
    (f.regels||[]).forEach(r=>{
      const excl = (parseFloat(r.aantal)||0)*(parseFloat(r.prijs)||0);
      const kostenRek = (r.gbId ? DB.grootboek.find(g=>g.id===r.gbId) : null)
                     || DB.grootboek.find(g=>g.type==='kosten');
      if(kostenRek) kostenRek.saldo = (parseFloat(kostenRek.saldo)||0) - excl;
    });

    // Draai BTW te ontvangen terug
    if(btwBedrag > 0.01){
      const btwRek = DB.grootboek.find(g=>g.nummer==='1500')
                  || DB.grootboek.find(g=>g.nummer==='1520')
                  || DB.grootboek.find(g=>g.naam.toLowerCase().includes('btw te vorderen'))
                  || DB.grootboek.find(g=>g.naam.toLowerCase().includes('btw te ontvangen'));
      if(btwRek) btwRek.saldo = (parseFloat(btwRek.saldo)||0) - btwBedrag;
    }
  }
}

// ===== HANDMATIG BETAALD MARKEREN =====
// Boekt de betaling in het grootboek zoals een bankkoppeling dat zou doen:
// verkoop betaald → Debet Bank, Credit Debiteuren
// inkoop betaald  → Debet Crediteuren, Credit Bank
// De P&L verandert bewust niet: omzet/kosten zijn al geboekt bij het aanmaken
// van de factuur (factuurstelsel). richting 1 = boeken, -1 = terugdraaien.
function boekHandmatigeBetaling(f, type, richting){
  const incl = (parseFloat(f.totaalIncl)||0) * richting;
  if(!incl) return;
  const bank = getBankRekening();
  if(type==='verkoop'){
    if(bank) bank.saldo = rond((parseFloat(bank.saldo)||0) + incl);
    const debRek = DB.grootboek.find(g=>g.nummer==='1300')
                || DB.grootboek.find(g=>g.naam.toLowerCase().includes('debiteuren'));
    if(debRek) debRek.saldo = rond((parseFloat(debRek.saldo)||0) - incl);
  } else {
    if(bank) bank.saldo = rond((parseFloat(bank.saldo)||0) - incl);
    const credRek = DB.grootboek.find(g=>g.nummer==='2100')
                 || DB.grootboek.find(g=>g.naam.toLowerCase().includes('crediteur'));
    if(credRek) credRek.saldo = rond((parseFloat(credRek.saldo)||0) - incl);
  }
}

function zetFactuurBetaald(type, id){
  const f = (type==='verkoop'?DB.verkoop:DB.inkoop).find(x=>x.id===id);
  if(!f || f.status==='betaald') return;
  if(_getBetalingen(f).length){
    toast('Deze factuur heeft al een gekoppelde bankbetaling — de status volgt de bank.','warning');
    return;
  }
  boekHandmatigeBetaling(f, type, 1);
  f.status = 'betaald';
  f.betaaldOp = today();
  f.handmatigBetaald = true;
  save();
  renderFacturen(type); renderDashboard(); updateBankStats();
  toast('Factuur gemarkeerd als betaald per '+f.betaaldOp+'.','success');
}

async function zetFactuurOnbetaald(type, id){
  const f = (type==='verkoop'?DB.verkoop:DB.inkoop).find(x=>x.id===id);
  if(!f || f.status!=='betaald') return;
  if(!f.handmatigBetaald){
    toast('Deze betaling loopt via een bankkoppeling — ontkoppel de banktransactie om dit terug te draaien.','warning');
    return;
  }
  const ok = await bevestig('Betaling terugdraaien? De factuur komt weer open te staan.','Betaling terugdraaien','Terugdraaien');
  if(!ok) return;
  boekHandmatigeBetaling(f, type, -1);
  f.status = type==='verkoop' ? 'verstuurd' : 'te betalen';
  delete f.betaaldOp;
  delete f.handmatigBetaald;
  save();
  renderFacturen(type); renderDashboard(); updateBankStats();
  toast('Betaling teruggedraaid — factuur staat weer open.','info');
}

async function verwijderFactuur(type,id){
  const arr = type==='verkoop' ? DB.verkoop : DB.inkoop;
  const f = arr.find(f=>f.id===id);
  if(!f) return;

  // Controleer of er een gekoppelde banktransactie is
  const gekoppeldeT = DB.transacties.find(t=>
    t.status==='gekoppeld' &&
    (t.factuurId===id || (f.nummer && t.gekoppeldAan?.includes(f.nummer)))
  );

  let bevestigTekst = 'Factuur permanent verwijderen?';
  if(gekoppeldeT){
    bevestigTekst = `Factuur permanent verwijderen?

Let op: deze factuur is gekoppeld aan een bankbetaling van ${fmt(gekoppeldeT.bedrag)} op ${gekoppeldeT.datum}. Die koppeling wordt ook ongedaan gemaakt.`;
  }

  const ok=await bevestig(bevestigTekst,'Factuur verwijderen','Verwijderen');
  if(!ok) return;

  // Ontkoppel gekoppelde transactie eerst
  if(gekoppeldeT){
    draaiBoekingTerug(gekoppeldeT);
    gekoppeldeT.status = 'ongekoppeld';
    gekoppeldeT.gekoppeldAan = null;
    gekoppeldeT.gekoppeldType = null;
    gekoppeldeT.factuurId = null;
  }

  await verwijderAlleBijlagen(id);

  // Draai factuur grootboekboeking terug
  draaiFactuurGBTerug(f, type);

  // Handmatig geboekte betaling ook terugdraaien (bank ↔ deb/cred);
  // een eventuele bankkoppeling is hierboven al ontkoppeld.
  if(f.handmatigBetaald) boekHandmatigeBetaling(f, type, -1);

  if(type==='verkoop') DB.verkoop=DB.verkoop.filter(f=>f.id!==id);
  else DB.inkoop=DB.inkoop.filter(f=>f.id!==id);

  // Verwijder ook eventuele vaste activa schema's die aan deze factuur gekoppeld zijn
  if(type==='inkoop' && DB.vasteActiva){
    const vaGekoppeld = DB.vasteActiva.filter(a=>a.factuurId===id);
    if(vaGekoppeld.length){
      // Draai reeds verwerkte afschrijvingen terug
      vaGekoppeld.forEach(a=>{
        const kostenRek = DB.grootboek.find(g=>g.id===a.gbKostenId);
        const accumRek  = DB.grootboek.find(g=>g.id===a.gbAccumId);
        const verwerkt  = (DB.memoriaal||[]).filter(m=>m.type==='afschrijving'&&m.oms?.includes(a.naam));
        verwerkt.forEach(m=>{
          if(kostenRek) kostenRek.saldo = (parseFloat(kostenRek.saldo)||0) - parseFloat(m.debet||0);
          if(accumRek)  accumRek.saldo  = (parseFloat(accumRek.saldo)||0)  - parseFloat(m.debet||0);
        });
        DB.memoriaal = (DB.memoriaal||[]).filter(m=>!(m.type==='afschrijving'&&m.oms?.includes(a.naam)));
      });
      DB.vasteActiva = DB.vasteActiva.filter(a=>a.factuurId!==id);
      toast('Vaste activa schema ook verwijderd.','info');
    }
  }

  save(); renderFacturen(type);
  updateBankStats();
  toast('Factuur verwijderd.','info');
}

function filterF(type,v){ if(type==='verkoop') DB.fVK=v; else DB.fIK=v; renderFacturen(type); }
function filterFS(type,v){ if(type==='verkoop') DB.fsVK=v; else DB.fsIK=v; renderFacturen(type); }

function renderFacturen(type){
  const isVK=type==='verkoop';
  let list=isVK?[...DB.verkoop]:[...DB.inkoop];
  const fq=isVK?DB.fVK:DB.fIK, fs=isVK?DB.fsVK:DB.fsIK;
  // Defensief filteren — velden kunnen ontbreken na cloud sync
  list=list.filter(f=>f&&f.id); // verwijder lege rijen
  if(fq) list=list.filter(f=>(f.klant||'').toLowerCase().includes(fq.toLowerCase())||(f.nummer||'').toLowerCase().includes(fq.toLowerCase()));
  if(fs) list=list.filter(f=>f.status===fs);
  const tbody=document.getElementById('tbody-'+type);
  if(!tbody) return; // pagina niet actief
  const partijLabel=isVK?'Klant':'Leverancier';
  if(!list.length){ tbody.innerHTML=`<tr><td colspan="9"><div class="empty"><div class="icon">${isVK?'↑':'↓'}</div><p>Geen ${isVK?'verkoop':'inkoop'}facturen gevonden</p></div></td></tr>`; return; }
  // Zorg dat alle facturen geldige regels hebben
  list = list.map(f=>({...f, regels: Array.isArray(f.regels)?f.regels:[]}));
  tbody.innerHTML=list.map(f=>`<tr>
    <td class="mono">${f.nummer||''}</td>
    <td>${f.klant||''}</td>
    <td>${f.datum||''}</td>
    <td>${f.vervaldatum||''}</td>
    <td class="mono">${fmt(f.totaalExcl||0)}</td>
    <td class="mono">${fmt(f.btwBedrag||0)}</td>
    <td class="mono"><strong>${fmt(f.totaalIncl||0)}</strong></td>
    <td>${badge(f.status||'')}</td>
    <td style="white-space:nowrap;">
      ${f.bijlagenMeta&&f.bijlagenMeta.length?`<span title="${f.bijlagenMeta.length} bijlage(n)" style="cursor:pointer;margin-right:6px;" onclick="openBijlagenModal('${type}','${f.id}')">📎<span style="font-size:10px;font-family:var(--mono);color:var(--accent);">${f.bijlagenMeta?.length||0}</span></span>`:''}
      ${!isVK&&f.status!=='betaald'?`<button class="btn btn-secondary btn-sm" onclick="openKoppelVanafFactuur('${f.id}')" style="background:rgba(96,165,250,.1);border-color:rgba(96,165,250,.3);color:#60a5fa;">⇄ Koppel betaling</button>`:''}
      ${f.status!=='betaald'&&!_getBetalingen(f).length?`<button class="btn btn-secondary btn-sm" onclick="zetFactuurBetaald('${type}','${f.id}')" style="background:rgba(22,163,74,.1);border-color:rgba(22,163,74,.35);color:#16a34a;" title="Markeer als betaald — boekt bank ↔ ${isVK?'debiteuren':'crediteuren'}">✓ Betaald</button>`:''}
      ${f.status==='betaald'&&f.handmatigBetaald?`<button class="btn btn-secondary btn-sm" onclick="zetFactuurOnbetaald('${type}','${f.id}')" title="Betaling terugdraaien — factuur komt weer open te staan">↩</button>`:''}
      <button class="btn btn-secondary btn-sm" onclick="openFactuurModal('${type}','${f.id}')">Bewerk</button>
      <button class="btn btn-danger btn-sm" onclick="verwijderFactuur('${type}','${f.id}')">✕</button>
    </td>
  </tr>`).join('');
}

