// ===== NAV =====
// Pagina's die alleen eigenaar mag zien
const EIGENAAR_PAGINAS = ['verkoop','inkoop','bank','grootboek','memoriaal','balans','pl',
  'mutaties','openposten','btwaangifte','jaaropgave','kassaoverzicht','vasteactiva','regels'];

function heeftToegang(pagina){
  if(!_loginRol) return false;
  if(_loginRol === 'eigenaar') return true;
  // Kassier mag alleen dashboard en kassalijst zien
  return ['dashboard','kassalijst'].includes(pagina);
}

function showPage(name){
  // Toegangscontrole op functieniveau — niet alleen UI
  if(!heeftToegang(name)){
    console.warn(`Toegang geweigerd tot pagina: ${name} voor rol: ${_loginRol}`);
    return;
  }
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  const page = document.getElementById('page-'+name);
  if(page) page.classList.add('active');
  updateNavState(name);
  if(name==='dashboard') renderDashboard();
  if(name==='verkoop') renderFacturen('verkoop');
  if(name==='inkoop') renderFacturen('inkoop');
  if(name==='bank') { updateBankHeader(); switchBankTab('koppelen'); updateBankStats(); renderImports(); }
  if(name==='grootboek') renderGB();
  if(name==='regels') renderRegels();
  if(name==='memoriaal') initMemoriaal();
  if(name==='vasteactiva') renderVasteActiva();
  if(name==='mutaties') renderMutaties(true);
  if(name==='openposten') renderOpenPosten();
  if(name==='balans'){ vulJaarDropdowns(); renderBalans(); }
  if(name==='pl'){ vulJaarDropdowns(); renderPL(); }
  if(name==='btwaangifte') renderBTWAangifte();
  if(name==='jaaropgave') renderJaaropgave();
  if(name==='kassalijst') initKassalijst();
  if(name==='kassaoverzicht') renderKassaoverzicht();
  if(name==='urenoverzicht'){ initUrenoverzichtMaand(); renderUrenoverzicht(); }
  if(name==='bonnen') laadBonnenPagina();
}

async function laadAllePaginas() {
  const container = document.getElementById('pages-container');
  const bestanden = [
    'src/pages/dashboard.html',
    'src/pages/facturen.html',
    'src/pages/bank.html',
    'src/pages/btw-rapport.html',
    'src/pages/activa-uren.html'
  ];
  for (const bestand of bestanden) {
    const resp = await fetch(bestand);
    const html = await resp.text();
    container.insertAdjacentHTML('beforeend', html);
  }
}

document.addEventListener('DOMContentLoaded', function() {
  laadAllePaginas();
});
