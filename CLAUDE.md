# YS Boekhouding — Project Context

## Wat is dit project
Boekhoud- + kassa(POS)-webapp met Firebase/Firestore als backend.
Gehost op GitHub Pages (`yschaken27.github.io/Ysboekhouding`) als PWA.
Doelgroep: zzp-beveiligers en multi-user bedrijven.

De app was oorspronkelijk één grote `index.html` (~11.500 regels) en is gesliced naar losse bestanden.
`index.html` is nu de shell (~1.170 regels): laadt CSS/JS in en bevat de vaste HTML-structuur
(topbar, sidebar) plus ALLE modals — die modals zijn het leeuwendeel van de regels.
**Werk altijd in de `src/`-bestanden, nooit in de backup of de root-`index.html` van de parent-map.**

## Bestandskaart — wat staat waar

### Voordeur
| Bestand | Inhoud |
|---|---|
| `index.html` | HTML-shell: laadt CSS + JS in, bevat topbar, sidebar, navigatie en ALLE modals |

### CSS — `src/css/`
| Bestand | Inhoud |
|---|---|
| `base.css` | CSS-variabelen, reset, layout |
| `components.css` | Knoppen, modals, tabellen, badges |
| `pages.css` | Mobiel kassier-scherm, media queries |
| `branding.css` | YS navy/blue kleurschema |

### JavaScript — `src/js/`
| Bestand | Inhoud |
|---|---|
| `state.js` | `DB`-object, `save()`, `load()`, helpers (`fmt`, `uid`, `esc`, `rond`, `toast`, `bevestig`, `badge`), **`openModal`/`closeModal`**, `fbAanroep`, `wisselBedrijf`, factuurnummers, bedrijfsprofiel, opdrachtgever-register (centraal) |
| `ui.js` | Klein (~86 regels): service-worker-registratie, `heeftToegang`, `showPage`, `laadAllePaginas`. Let op: `navTo` staat in `activa.js`, de modal-helpers in `state.js` |
| `auth.js` | Inloggen, rolbepaling, kassier-beheer (CRUD), gebruiker-detail modal, opdrachtgever-koppeling per kassier |
| `facturen.js` | Dashboard, verkoop/inkoop CRUD, BTW-helpers, grootboek |
| `bank.js` | Banktransacties, CSV-import, reconciliatie |
| `btw-rapport.js` | BTW-aangifte, grootboek, balans, P&L |
| `activa.js` | Vaste activa, afschrijvingsschema's, mobiele interface (uploads, facturen-tab) |
| `kassier.js` | Desktop kassa, kassaoverzicht, urenoverzicht (eigenaar), `maakUrenFactuur()`, mobiele uren-invoer |
| `firebase-config.js` | **Staat in `src/`, niet in `src/js/`.** Firebase init, `window.FB`/`window.FBAuth` (alle Firestore/Storage-aanroepen). De wrapper `fbAanroep` zelf staat in `state.js` |

### Pagina-HTML — `src/pages/`
| Bestand | Inhoud |
|---|---|
| `dashboard.html` | Dashboard-pagina (stats, charts, top klanten) |
| `facturen.html` | Verkoop- en inkoopfacturen pagina |
| `bank.html` | Banktransacties pagina |
| `btw-rapport.html` | BTW-rapport pagina |
| `activa-uren.html` | Vaste activa + urenoverzicht + jaaropgave pagina's |

### Modals — zitten in `index.html`
Alle modals staan in `index.html`. Zoek op `<!-- ... MODAL -->` commentaar.
Bekende modals: `modal-bedrijf`, `modal-opdrachtgevers`, `modal-gebruiker-detail`, `modal-factuur`,
`modal-handmatig`, `modal-grootboekkaart`, `modal-eigenaar-uren`, `modal-gb`, `modal-depr-vraag`.
(Er is géén `modal-inkoop`.)

## Hoe we werken
- Informeel Nederlands. Typfouten → gewoon doorwerken.
- Eerst de hele flow + plan van aanpak laten zien, akkoord vragen, pas dán code aanraken.
- Geen aannames, geen code voordat ik ja zeg.
- Stap voor stap, met JS-syntaxcheck na elke wijziging (Node + `new Function()`).
- Geen dode of dubbele code.
- Code echt lezen voordat je conclusies trekt — niet gokken.
- Firebase is de single source of truth. localStorage mag nooit winnen, geen merging.
- Verwijderingen op één apparaat moeten na refresh doorzetten.
- **Na elk opgelost issue: zelf committen én pushen, zonder te vragen.** Deze repo
  (`Ysboekhouding/`) heeft een remote (`origin` → GitHub) en we werken direct op `main`.
  Let op: de bovenliggende map `Bookkeeping/` is GEEN repo — check dus altijd
  `Ysboekhouding/` zelf. Commit alleen de bestanden van de fix, niet losse
  rommel als `_backup/` of ongerelateerde `.claude/`-wijzigingen.
  Commit-messages met aanhalingstekens erin gaan mis in PowerShell → gebruik
  `git commit -F <bestand>` met de message in een tijdelijk bestand.

## Architectuur
- Firebase 10.12.0 (compat SDK: app, firestore, storage, auth)
- Storage is geïnitialiseerd en in gebruik
- `slaAllesOp()` shardt de bedrijfsdata over **zes** documenten onder `bedrijven/{bedrijf}/data/`:
  `main` (profiel, grootboek, memoriaal, vasteActiva, kassiers, imports, btwNotities) plus
  `verkoop`, `inkoop`, `transacties`, `kassalijsten` en `uren` — die laatste vijf als `{items:[]}`.
  Elk doc wordt met `.set()` **zonder merge** geschreven; het #22-risico geldt dus per document.
- Kassalijsten en uren hebben daarnaast directe cloud-writes (`voegKassalijstToe`/`voegUrenToe`)
  voor losse toevoegingen; `save()` schrijft diezelfde docs óók vanuit `_bouwSaveData()`.
- Bonnen gaan als base64 naar `bedrijven/{bedrijf}/uploads/{id}` (Firestore, ~1 MB-limiet);
  factuurbijlagen gaan wél naar Storage via `uploadBijlage`.

## Gebruikers
- Er is **géén** top-level `gebruikers`-collectie (die stond hier ooit gepland, maar is er nooit gekomen).
- Kassiers staan per bedrijf in het veld `kassiers` van `data/main`, geschreven via `slaKassiersOp`.
- Wie welk bedrijf mag zien: `bedrijven/{bedrijf}/toegang/lijst` (`getGastenlijst`/`setGastenlijst`)
  plus de top-level collectie `bedrijven_toegang`.
- Inloggen gaat via Firebase Authentication (wachtwoord) — een aparte laag dan de kassierlijst.

## Rolbepaling
- Hoofdeigenaar = `ymeraldo@hotmail.com` (ziet alles)
- Anderen zijn kassier via `getGastenlijst`
- `_actieveKassier` wordt verrijkt via `verrijkActieveKassier()`

## Uren-module (af)
- Per-bedrijf toggle: `DB.profiel.urenAan`
- Mobiel invoerscherm, goedkeuren/afwijzen door eigenaar, factuurgeneratie
- Hulpfuncties: `nextFactuurNummer(type)`, factuurmodal, `uploadBijlage`
- `uploadBijlage` zet bestand in Storage onder `${bedrijf}/facturen/${factuurId}/${naam}`, geeft downloadURL terug
- `updateUrenStatus`

### Instellingen per opdrachtgever (centraal register, `DB.profiel.opdrachtgevers`)
Beheerd in twee schermen die dezelfde `_cpOpdrachtgevers`-state delen (state.js):
`_tekenCentraalOpdrachtgevers` (Bedrijven-modal) en `_tekenOpdrachtgeversModal` (⚙ Opdrachtgevers).
**Wijzig je een veld, doe het in ALLEBEI** — en neem het mee in beide `sla*Op`-functies én in
beide `voeg*Toe` (default-waarde), anders verdwijnt het bij opslaan.
- `eenheid` — 'uur' of 'dag' (bepaalt labels en tariefweergave, zie `eenheidInfo`)
- `tarieven[]` — vaste tarieven (`naam` + `bedrag`)
- `flexibelTarief` — kassier mag zélf het tarief invullen bij het schrijven van uren.
  Voorinvulling = het vaste tarief; wijkt het ingevulde bedrag af, dan krijgt de regel
  het label 'Eigen tarief'. Zichtbaar in het mobiele urenscherm én in de eigenaar-urenmodal.
- `regelPerDienst` — factuur krijgt een regel per ingave (notitie + medewerker, datum, aantal,
  tarief, bedrag) i.p.v. de standaard groepering per tarieftype. Lege notitie valt terug op
  het tarieflabel, zodat de factuur altijd geldig blijft.

### Decimale invoer: komma én punt
Nederlandse gebruikers typen `7,5`, maar een `<input type="number">` weigert de komma op
mobiel. Invoervelden voor uren en tarieven zijn daarom `type="text"` met `inputmode="decimal"`,
en worden uitgelezen via **`parseDecimaalInvoer()`** (kassier.js). Voorinvulling toont het
getal in komma-notatie. Gebruik dit patroon voor elk nieuw bedrag-/aantalveld.

## Planning
1. **Maandfacturen-mailflow** — goedgekeurde uren per beveiliger groeperen per opdrachtgever, per opdrachtgever een factuur (PDF) maken, als bijlage mailen én in Storage archiveren. Mailen via Firebase Trigger Email-extensie (schrijf doc naar `mail`-collectie; die collectie bestaat nog niet). Vereist Blaze-plan + SMTP-provider + geverifieerd afzenderdomein. PDF-library moet nog toegevoegd worden.
2. **Firestore security rules** voor `bedrijven`, `bedrijven_toegang` en (later) de `mail`-collectie (eigenaar doet dit zelf in Firebase Console).

**Af sinds aug 2026:** wachtwoord-login (`inloggenMetWachtwoord`, `registrerenMetWachtwoord`,
`wachtwoordResetten` in firebase-config.js) — magic-link is volledig verwijderd.

## Veelgemaakte fouten — NOOIT HERHALEN

### 1. `function` / `async` keyword valt weg bij PowerShell-vervanging
Bij elke string replace in PowerShell moet je de volledige regel inclusief `function` of `async function` in zowel `$old` als `$new` zetten. Controleer altijd daarna met `grep -n "^ function \|^ async "` of er regels zijn met een spatie voor `function`.

### 2. Mixed line endings in index.html
Het bestand heeft gemengde CRLF/LF-regels. Verifieer altijd met `cat -A` of `Format-Hex` welk einde de doelregel gebruikt vóór je een replace doet. Gebruik de juiste `$nl`.

### 3. Functies die verdwijnen tijdens edits
Bij een grote string-replace kan een omliggende functie per ongeluk meegenomen worden. Altijd na elke edit `grep -n "function naam"` draaien om te bevestigen dat de definitie nog bestaat.

### 4. Nooit dubbele Service Worker registraties
Er mag maar één `navigator.serviceWorker.register()` in de codebase staan — staat in `src/js/ui.js` bovenaan. Check altijd met `grep -rn "serviceWorker.register"` voor én na een SW-edit. De registratie bevat ook een `controllerchange`-listener die de pagina automatisch herlaadt als een nieuwe SW activeert.

### 5. Syntaxcheck na elke JS-wijziging
Na elke edit altijd de code-check agent aanroepen (`Agent: code-check`) om syntax errors te vangen vóór push.
De code-check agent delegeert verplicht naar `js-checker` (voor JS) en `css-checker` (voor CSS) — hij doet de checks nooit zelf inline.

### 7. Sessie altijd starten vanuit de juiste map
Open Claude Code altijd met `Ysboekhouding/` als werkmap, niet de bovenliggende map.
De hooks in `.claude/settings.json` (automatische js-checker en css-checker na elke edit) zijn alleen actief als de CWD exact `Ysboekhouding/` is.
Start je vanuit de parent-map, dan vuren de hooks niet en worden wijzigingen niet automatisch gecheckt.

### 8. `verrijkActieveKassier()` — altijd `.email` als lookup-sleutel, nooit `.naam`
Na de eerste aanroep van `verrijkActieveKassier()` is `_actieveKassier.naam` de weergavenaam (bijv. "Jan"), NIET het e-mailadres. Elke volgende lookup op `.naam` zoekt dan op "Jan" in `DB.kassiers`, vindt niets, en retourneert `false` → module-wijzigingen propageren nooit naar de ingelogde kassier op andere apparaten of browsers.
Gebruik altijd: `const email = String(_actieveKassier.email || _actieveKassier.naam || '').toLowerCase();`
en zoek op `x.email`, nooit op `x.naam`.

### 9. PWA blijft in geheugen — Firestore listener vuurt niet opnieuw
iOS en Android houden een PWA in het geheugen wanneer de gebruiker wisselt van app. De pagina wordt NIET herladen, dus `onAuthStateChanged` en `kiesBedrijfNaLogin()` worden niet opnieuw aangeroepen. De Firestore realtime listener herstart WEL, maar vuurt niet opnieuw als er ondertussen niets veranderd is in Firebase — waardoor de kassier verouderde data ziet.
Oplossing: gebruik altijd een `visibilitychange`-listener voor acties die vers moeten zijn bij foreground-switch (bijv. kassier-modules herladen). Nooit vertrouwen op de Firestore-listener alleen voor PWA-correctheid.
Zie: `kassier.js` → `document.addEventListener('visibilitychange', ...)`.
Bij elke nieuwe feature die data toont die een ander apparaat kan wijzigen: controleer of er een `visibilitychange` handler nodig is.

### 6. Browser cache ≠ server cache
`<meta http-equiv="Cache-Control">` tags werken niet als de browser al een gecachte versie heeft. De echte oplossing is `sw.js` (Service Worker). Nooit zeggen "hard refresh lost het op" voor klanten — zij weten dat niet.

### 10. Na elke boekhoudkundige actie altijd code-check + boekhoud-checker aanroepen
Elke functie die een factuur aanmaakt, grootboeksaldi wijzigt, BTW berekent of verkoop/inkoop opslaat
MOET gecontroleerd worden door zowel `js-checker` als `boekhoud-checker`.
Dit geldt voor: `facturen.js`, `btw-rapport.js`, `bank.js`, `state.js` én **`kassier.js`**
(want `maakUrenFactuur()` doet grootboekboekingen).
De verplichte combinaties staan in `.claude/agents/code-check.md`.

### 11. `maakUrenFactuur()` — factuurstelsel vereist drie grootboekboekingen
Bij het aanmaken van een uren-factuur MOETEN de volgende boekingen plaatsvinden:
- **Debet Debiteuren (1300)** += totaalIncl
- **Credit Omzet** (type='omzet') += subtotaalExcl
- **Credit BTW te betalen (1510**, fallback 1530) += btwBedrag (alleen als `!zonderBtw && btwBedrag > 0.01`)
Boekingen gaan via `DB.grootboek` saldo-updates, daarna `save()`.
`btwBedrag` **en `btwTarief`** moeten ook opgeslagen worden in de `DB.verkoop`-entry: `btwBedrag`
voor het terugdraaien bij verwijderen, `btwTarief` omdat de BTW-aangifte een uren-factuur anders
niet kan indelen in rubriek 1a/1b (die facturen hebben geen `regels`, alleen `totaalExcl`).

### 13. Kassier kan bedrijvenlijst niet lezen — weergavenamen laden aparte stap
`laadBedrijfNamenUitFirebase()` loopt over `getBedrijven()` (de eigenaar-lijst). Kassiers mogen de
volledige `bedrijven`-collectie niet lezen in Firestore, dus `_bedrijfNamen[sleutel]` wordt nooit
gevuld voor kassier-bedrijven → kassier ziet de interne aanmaak-sleutel i.p.v. de weergavenaam.
Fix: in `toonBedrijfsKiezer()` (auth.js) ontbrekende namen alsnog laden via `fbAanroep(fb=>fb.laadAlles(b))`
voor elk bedrijf uit `res.bedrijven` dat nog niet in `getBedrijfProfielNamen()` staat.
Pas `toonBedrijfsKiezer()` nooit aan zonder dit laadblok intact te houden.

### 14. `DB.uren` is een platte array — gebruik nooit `.items`
`laadAlles()` en `luisterAlles()` in `firebase-config.js` retourneren `uren` al als array
(`urSnap.data().items||[]`). Lokaal wordt `DB.uren` ook als array bijgehouden (`DB.uren.push(ingave)`).
Gebruik dus altijd `DB.uren||[]`, nooit `DB.uren?.items||[]` of `DB.uren.items` — `.items` is altijd `undefined`.

### 15. Opslaan mag NOOIT verdwijnen bij bedrijf wisselen (bevestigde seriële cloud-save)
De cloud-save in `state.js` is bewust bevestigd en serieel. Deze garanties mogen nooit teruggedraaid worden (bug juli 2026: "verwerk bankregels → wissel bedrijf → wijziging weg, en later dook een oudere versie weer op"):
- `saveCloud()` pint bedrijf + data VAST bij het inplannen (`_pendingSaveData = { bedrijf: huidigBedrijf, data: _bouwSaveData() }`) — nooit pas bij het afvuren van de timer.
- `_kickSave()` schrijft serieel via `_saveInFlight` (één write tegelijk; nieuwere versie erachteraan; bij faal terug in de wachtrij, geen auto-retry-lus).
- De bedrijfswissel doet `await flushSave()` als ALLEREERSTE statement, vóór listeners stoppen / DB legen / `huidigBedrijf` wisselen. Deze `await` mag nooit weg. (Staat sinds de refactor in `_wisselBedrijfKern()`; `wisselBedrijf()` is de try/finally-wrapper eromheen.)
- `flushSave()` draait ook op `visibilitychange` (hidden) en best-effort op `beforeunload`.
- `verwerkCloudData()` negeert inkomende Firebase-snapshots zolang `_heeftOnbevestigdeSave()` true is. De oude tijd-gok `_recentlySaved`/`_syncBezig`/`_pendingSave`/`_doSaveCloud` is verwijderd en mag NIET terugkeren.
- `_bouwSaveData()` stuurt `imports` mee (anders wist `slaAllesOp()` de afschriftgeschiedenis, want die `.set()` overschrijft het hele doc).
Controleer dit met de `sync-checker` agent (punt 8) na elke wijziging aan de save/load-flow.

### 16. CSV-import duplicaatdetectie is een MULTISET, geen "bestaat er één identieke?"
In `bank.js` → `bevestigImport()`: twee ECHTE betalingen van hetzelfde bedrag op dezelfde dag met dezelfde omschrijving zijn GEEN dubbelen en moeten allebei geïmporteerd worden. Sla een rij alleen over als er nog een BESTAANDE identieke transactie "over" is (her-import van hetzelfde bestand). Gebruik een telling (`bestaandTeller[sleutel]--`), nooit `DB.transacties.some(...)` — dat laatste gooit legitieme dubbele betalingen binnen dezelfde import weg. Rijen binnen één CSV mogen elkaar nooit als duplicaat zien.

### 17. Grootboeksaldo-conventie: credit-normale rekeningen worden POSITIEF bewaard
De hele app (`renderBalans`, `checkBalansEvenwicht`, factuurboekingen) bewaart passiva, eigen_vermogen en omzet als POSITIEVE credit-saldi; activa en kosten als positieve debet-saldi. De balansvergelijking is `totActiva == totPassiva + totEV + totOmzet − totKosten` (kale som van `g.saldo`, geen sign-flip).
Elke boeking die grootboeksaldi muteert via debet/credit MOET het teken op rekeningtype baseren — nooit blind `debet? +bedrag : −bedrag` voor álle rekeningen (dan wordt een credit op eigen vermogen/passiva/omzet als minbedrag opgeslagen en klopt de balans niet). Gebruik `_memSaldoEffect(g, dc, bedrag)` in `btw-rapport.js`. Memoriaalboekingen slaan de toegepaste mutatie op als `r.effect`; `verwijderMemoriaal()` draait terug met `r.effect` en valt terug op de oude formule voor pre-fix boekingen (die fallback NOOIT verwijderen als "dode code" — bestaande gebruikersdata heeft boekingen zonder `.effect`). Contra-activa (accum afschrijving, type passiva) wordt in `renderBalans` via `Math.abs` getoond.

### 18. Bankkoppeling boekt ALTIJD via `_boekTegenrekening()` — BTW-richting + teken
Elke koppeling van een banktransactie aan een grootboekrekening in `bank.js` (`inlineBevestig` enkel + split, `snelKoppelGB`, `bevestigKoppeling`, `bevestigBulkKoppeling`) MOET `_boekTegenrekening(g, bedrag, btwTarief)` gebruiken — nooit met de hand `g.saldo += bedrag` + losse BTW-boeking. Die losse varianten liepen mis met drie fouten tegelijk:
- BTW-bedrag met een haakjesfout (`...))*100)/100` → gaf voor €15 @ 9% −13,61 i.p.v. +1,24;
- BTW altijd naar de eerste BTW-rekening (1500, activa) i.p.v. richting-afhankelijk: ontvangst → 1510 'te betalen' (passiva), uitgave → 1500 'te vorderen' (activa);
- vol bedrag i.p.v. excl. op de rekening, én geen teken op rekeningtype → een uitgave op een kostenrekening werd negatief → balans ~2× scheef.
`_boekTegenrekening` doet: excl. op de rekening met teken via type (credit-normaal = omzet/passiva/eigen_vermogen → +excl; anders −excl), en het BTW-deel op de richting-juiste BTW-rekening. Bij een gesplitste koppeling moeten de deelbedragen samen exact het bankbedrag dekken vóór er geboekt wordt. Controleer met `node` dat elke variant op €0 balansverschil uitkomt. Zie boekhoud-checker Check 9 en [[project-save-sync-model]] (conventie #17).
**Terugdraaien MOET spiegelen:** ontkoppelen/verwijderen (`draaiBoekingTerug` in bank.js) draait een grootboek-koppeling terug via `_boekTegenrekening(g, bedrag, btwTarief, -1)` (de `mult=-1` variant) — nooit met `g.saldo -= bedrag` (vol bedrag, geen BTW). Dat laatste liet bij verwijderen een verschil staan (excl + BTW) waardoor de balanscontrole de verwijdering blokkeerde. De BTW-richting blijft op het originele `bedrag` bepaald, zodat terugdraaien dezelfde BTW-rekening raakt. Oude boekingen zonder `t.tegenrekeningId`/`t.btwTarief` vallen terug op `g.saldo -= bedrag` (zo zijn ze destijds geboekt).

### 19. Grootboekkaart = read-only reconstructie, sluit altijd op `g.saldo`
De grootboekkaart (drill-down vanuit Balans, P&L en de Grootboek-tab) is een READ-ONLY weergave in `btw-rapport.js` — de wéérgave muteert NOOIT saldi.
**Eén uitzondering: `gbkVerwijderPost()`** (aug 2026). Zie #19b hieronder; alle andere code in de kaart blijft read-only. `bouwGrootboekkaart(gbId)` reconstrueert de boekingen per rekening uit de bestaande data:
- **Facturen** (`DB.verkoop`/`DB.inkoop`): omzet/kosten via `r.gbId` (excl. = aantal×prijs), debiteuren 1300 / crediteuren 2100 = totaalIncl, BTW naar 1510/1530 (verkoop) of 1500/1520 (inkoop) = btwBedrag.
- **Banktransacties**: de bankrekening zelf (`t.bankGbId`) = bedrag; directe grootboek-koppeling (tegenrekening via `t.tegenrekeningId`, anders `t.gekoppeldAan` startsWith `nr — `) excl. BTW via `t.btwTarief`, met teken op rekeningtype; factuurbetaling boekt 1300/2100 af. Gesplitste koppelingen belanden in de sluitregel (kaart blijft kloppen via `g.saldo`).
- **Memoriaal**: `r.gbId` met `r.effect` (exacte mutatie); fallback via `_memSaldoEffect(g, r.dc, r.bedrag)` — NOOIT naïef `dc?bedrag:-bedrag`, want dat geeft credit-normale rekeningen (omzet/passiva/EV) het verkeerde teken.

`effect` = de ondertekende mutatie op het saldo van díe rekening (credit-normale rekening → +excl, anders −excl). Omdat niet alles exact te herleiden is (gesplitste bankregels, BTW-excl van bankkoppelingen, betalingsverschillen, transfers), wordt een **sluitregel "Niet-toegewezen / correctie"** = `g.saldo − som(effecten)` toegevoegd, zodat de kaart ALTIJD eindigt op het echte rekeningsaldo. `g.saldo` blijft de bron van waarheid; de kaart mag daar nooit overheen schrijven.
Ingangen: `openGrootboekkaart(gbId)` (modal `#modal-grootboekkaart` in index.html) vanuit klikbare Balans-regels, per-rekening P&L-rijen (`rij(...,gbId)`) en de "Kaart"-knop in `renderGB`. Regels zijn doorklikbaar via `gbkOpenBron()` naar de factuur/bank/memoriaal. Wil je ooit exacte cent-precisie (ook splitsingen), vervang dit door een echt grootboek-logboek (aanpak B) — dat raakt wél alle boekingscode.

### 19b. `gbkVerwijderPost()` — de enige toegestane eenzijdige saldocorrectie
De sluitregel "Niet-toegewezen / correctie" op een grootboekkaart is geen boeking maar een
restpost: `g.saldo − som(herleidbare effecten)`. Staat daar een bedrag dat uit geen enkele
factuur, bankregel of memoriaalboeking komt, dan staat de balans dáármee scheef en is dat met
een normale boeking niet te repareren — een sluitende tegenboeking verandert debet en credit
even veel en verschuift het verschil alleen. Alleen een eenzijdige correctie op de rekening
waar de restpost op staat haalt hem weg.

`gbkVerwijderPost(i)` doet dat, met de balans zelf als enige poortwachter:
1. Alleen posten **zonder `ref`** (geen bron). Posten mét bron krijgen "Naar bron" — daar
   verwijder je ze, zodat de tegenboeking meegaat. Het saldo-effect losweken van een nog
   bestaand brondocument lost niets op: bij de volgende reconstructie staat er gewoon weer
   een sluitregel van hetzelfde bedrag.
2. **Simuleer eerst**: `g.saldo -= effect`, `_balansVerschil()` opnieuw, en het saldo
   ALTIJD terugzetten — ook bij annuleren. Alleen doorlaten als het verschil daarna
   ≤ €0,005 is; anders staat er nog een andere fout open en gaat het niet door.
3. `effect` zit al in `g.saldo`-eenheden (het komt uit `werkelijk − som`), dus er is géén
   type-vertaling nodig zoals bij `_memSaldoEffect`. `g.saldo -= effect` klopt voor zowel
   debet- als credit-normale rekeningen. Gebruik hier nooit alsnog `_memSaldoEffect`.
4. Auditspoor in `DB.memoriaal` met **`type:'saldocorrectie'`**, regel zonder `effect`-veld.

**`saldocorrectie` MOET overal uitgesloten worden waar `DB.memoriaal` gereconstrueerd wordt**,
want de mutatie zit al in `g.saldo`; meetellen laat hem dubbel wegen en geeft direct een nieuwe
sluitregel van hetzelfde bedrag. Nu uitgesloten in `balansAudit`, de P&L-reconstructie en
`bouwGrootboekkaart`. Voeg je een nieuwe memoriaal-doorloop toe, sluit dit type dan ook uit.
(Niet nodig in `voerJaarafsluitingUit` — die telt rechtstreeks `g.saldo` op, waar de correctie
al in verwerkt zit — en in de BTW-aangifte en het mutatie-overzicht, die geen memoriaal lezen.)

`verwijderMemoriaal()` **blokkeert** dit type, net als `jaarafsluiting` en `afschrijving`. De
regel heeft bewust geen `effect`, en de terugdraai-fallback gaat ervan uit dat de vooruit-boeking
optélde — terugdraaien zou de aftrekking dus een tweede keer toepassen. Die blokkade nooit weghalen.

Dit doorbreekt bewust "elke boeking raakt minstens twee rekeningen" (#21.1). Dat mag hier omdat
de invariant die het écht moet bewaken — `Activa = Passiva + EV + (Omzet − Kosten)` — vooraf
wordt gecontroleerd en de ingreep die invariant juist herstelt.

### 20. P&L is categorie-gebaseerd uit ALLE bronnen (niet alleen facturen)
`berekenPLVoorPeriode` (btw-rapport.js) bouwt `omzetPerRek` en `kostenPerRek` per grootboekrekening uit drie bronnen samen — nooit meer alleen verkoop-/inkoopfacturen:
1. **Facturen**: per regel via `r.gbId`, met kasstelsel-ratio `_getBetaaldRatio(f)`.
2. **Directe bankkoppelingen** (`t.gekoppeldType==='grootboek'`): rekening via `t.tegenrekeningId` (of `t.splitsRegels` bij een gesplitste koppeling), anders fallback op de `gekoppeldAan`-tekst; bedrag EXCL. BTW via `t.btwTarief` (0% voor oude data). Alleen `type==='omzet' && bedrag>0` → omzet, `type==='kosten' && bedrag<0` → kosten. Balansrekeningen tellen niet mee.
3. **Memoriaal** (`m.type!=='jaarafsluiting'`): per regel via `r.gbId`.
`totOmzet`/`totKosten` = som van de maps. `renderPL` toont elke rekening als eigen klikbare regel (→ grootboekkaart, #19).

Nieuw opgeslagen bij het koppelen (bank.js): `t.tegenrekeningId` + `t.btwTarief` (enkel-rekening) en `t.splitsRegels` (gesplitst). Nodig voor exacte, BTW-vrije P&L én grootboekkaart. Voeg dit toe bij ELKE nieuwe grootboek-koppeling.

**KRITIEK — memoriaal-fallback**: waar `r.effect` ontbreekt (o.a. `kassalijst`-boekingen uit `keurKassaGoed`, `opening_saldo` uit `slaGBOp`) MOET de reconstructie het teken via `_memSaldoEffect(g, r.dc, r.bedrag)` bepalen, nooit via het naïeve `r.dc==='debet'?bedrag:-bedrag`. Anders krijgt een credit op een omzet-/passiva-/eigen-vermogenrekening het verkeerde teken (kassa-omzet gaat dan omlaag i.p.v. omhoog). Zet bij voorkeur `r.effect` al bij het aanmaken van memoriaalregels (zoals `slaMemoriaalOp` doet). Zie boekhoud-checker Check 10.

### 21. Het boekhoudmodel — kerninvarianten (overzicht)
Elke boeking/terugdraai/rapportage moet hieraan voldoen. Wijkt code hiervan af, ook als het "toevallig" balanceert, dan is dat fout. Laat de `boekhoud-checker` dit verifiëren na elke wijziging aan `bank.js`, `facturen.js`, `btw-rapport.js`, `kassier.js`, `activa.js` of `state.js`.
1. **Dubbel boekhouden**: som debet = som credit → `Activa = Passiva + EV + (Omzet − Kosten)` klopt altijd; `checkBalansEvenwicht()` bewaakt en blokkeert.
2. **Saldo-conventie** (#17): debet-normaal (activa, kosten) stijgt bij debet; credit-normaal (passiva, eigen_vermogen, omzet) stijgt bij credit; teken altijd op rekeningtype.
3. **Alleen excl. BTW = omzet/kosten (P&L)**; BTW is een balanspost. Uitgave: Debet kosten (excl.) + Debet 1500 BTW te vorderen / Credit bank (incl.). Ontvangst: Debet bank (incl.) / Credit omzet (excl.) + Credit 1510 BTW te betalen. Omzet-BTW→1510, kosten-BTW→1500 (#18).
4. **Terugdraaien = exacte spiegel** (#18): boeken + verwijderen = netto €0 op ELKE geraakte rekening. Bank-grootboek via `_boekTegenrekening(...,-1)`; factuur via `boekFactuurTegenboeking(...,'draai')`; memoriaal via omgekeerde `r.effect`. Nooit het volle bedrag i.p.v. excl. terugdraaien, en de BTW-rekening MOET mee.
5. **Balans ↔ P&L ↔ grootboek gelijk**: het P&L-resultaat (reconstructie, excl. BTW) moet gelijk zijn aan de resultaat-beweging in het grootboek (balans). Wijken ze af, dan is er een booking-/terugdraai-bug of vervuilde data — dit is de belangrijkste stille-fout-detector, want een verkeerde BTW-/tekensplitsing valt bij één boeking niet op maar stapelt op. Het excl.-bedrag op de rekening moet identiek zijn aan wat de P&L uit `t.btwTarief` afleidt.

### 22. Elk veld dat `save()` wegschrijft MOET `verwerkCloudData()` ook inlezen
De schrijf-set (`_bouwSaveData()` in state.js → `slaAllesOp()` in firebase-config.js) en de
lees-set (`laadAlles()`/`luisterAlles()` → `verwerkCloudData()`) moeten veld voor veld identiek
zijn. Voeg je een veld aan `DB` toe dat gepersisteerd moet worden, dan raak je **zes** plekken:
`_bouwSaveData`, `slaAllesOp`, `laadAlles`, `luisterAlles`, `verwerkCloudData` én `maakBedrijf`
(initiële waarde), plus de resets in de initiële `DB`-declaratie, `loadLokaal()` en `wisselBedrijf()`.

Een veld dat wél geschreven maar niet gelezen wordt, geeft **actief dataverlies**, niet alleen
stale data: `slaAllesOp()` doet `.set()` zonder merge op `data/main`, dus een apparaat dat het veld
niet kent schrijft de lege standaardwaarde over de echte data van een ander apparaat heen. Zo ging
`imports` verloren (juli 2026: importgeschiedenis weg op laptop 2 → geen "Verwijder import"-knop,
en de eerstvolgende save wiste de geschiedenis ook voor laptop 1).
Andersom — geschreven naar localStorage maar nooit naar Firebase — geeft stille apparaat-lokale
opslag (`btwNotities`, zelfde ronde gefixt). Let op het juiste type-default: `{}` voor objecten
zoals `btwNotities`, `[]` voor arrays. Laat de `sync-checker` de lijst na elke uitbreiding
opnieuw veld-voor-veld vergelijken.

### 23. De `profiel`-guard in `verwerkCloudData()` is OPZETTELIJK — niet "opruimen"
```js
if(d.profiel && Object.keys(d.profiel).length) DB.profiel=d.profiel;
```
Dit ziet eruit als een schending van "cloud wint altijd" (#15) en is al eens als zodanig
aangemerkt, maar de asymmetrie is correct en moet blijven. Voor `profiel` is "leeg" nooit een
geldige waarheid: `maakBedrijf()` schrijft altijd 4 keys, `slaBedrijfProfielOp()` altijd ~18 keys —
ook als de gebruiker elk veld leegmaakt blijven de keys bestaan. Een leeg `d.profiel` betekent dus
"main-doc ontbreekt of is legacy", niet "de eigenaar heeft het profiel gewist".
Maak je dit onvoorwaardelijk, dan wist de eerstvolgende snapshot het lokale profiel, schrijft dat
naar localStorage, en pusht de volgende `save()` een leeg profiel via `.set()` zonder merge →
definitief weg op alle apparaten. Met de guard heelt zo'n bedrijf juist vanzelf bij de volgende save.
`kiesBedrijfNaLogin()` (auth.js) heeft dezelfde guard — die twee moeten gelijk blijven.
Voor `kassiers` geldt het omgekeerde: daar is een lege cloud-lijst wél de waarheid, dus daar is de
onvoorwaardelijke overschrijving terecht (#15).

### 24. Balansfout bij een correcte boeking = verkeerd `type` op een grootboekrekening (DATA, niet code)
Boekingen zoeken rekeningen op **nummer** (`find(g=>g.nummer==='1300')`), maar `checkBalansEvenwicht()`
(state.js) en `renderBalans` groeperen op **`g.type`**. Die twee zijn niet aan elkaar gekoppeld: een
rekening met het juiste nummer maar een verkeerd `type` laat een correcte boeking aan de verkeerde
kant van de balans landen → "Boekhoudkundige fout" terwijl de code niets fout doet. `slaGBOp()` laat
elk type op elk nummer toe en valideert die combinatie niet.

**Zoek dus eerst in de data, niet in de code.** Diagnose vanuit de alert-tekst zelf:
1. **Tel beide kanten op.** Is `Activa + (Passiva+EV+Resultaat)` gelijk aan de som van alle bedragen
   die de boeking zou maken, dan zijn álle boekingen gedaan en staat er alleen iets aan de verkeerde
   kant. Ontbreekt er juist een bedrag in het totaal, dan is een rekening niet gevonden (lookup faalt,
   nummer bestaat niet) — dát is wél een codeprobleem.
2. **Een bedrag X aan de verkeerde kant telt dubbel door**: `verschil = 2 × Σ(verkeerd geplaatste bedragen, getekend)`.
   Deel het verschil door 2 en zoek welke boekingsbedragen daarop uitkomen.
3. Bevestig met `console.table(DB.grootboek.map(g=>({nr:g.nummer,naam:g.naam,type:g.type,saldo:g.saldo})))`.

Praktijkgeval (aug 2026) — verkoopfactuur €75 excl. + 21% BTW: alert gaf Activa €15,75,
Passiva+EV+Resultaat €165,75, verschil €150,00. Som = €181,50 = 90,75 + 75 + 15,75 → alle drie de
boekingen gedaan. `2 × (90,75 − 15,75) = 150` → Debiteuren (1300, €90,75) stond aan de credit-kant en
BTW te betalen (1510, €15,75) aan de activa-kant: hun `type` was in de bedrijfsdata verwisseld.
`DEFAULT_GB` in state.js was correct (1300 = `activa`, 1510 = `passiva`); de types waren via
Grootboek → bewerken verkeerd gezet. Fix = types goedzetten, niet de boekingscode aanpassen.

Zie boekhoud-checker Check 11 voor de verplichte nummer↔type-koppeling.

### 25. Standaard BTW per grootboekrekening (`g.btwStandaard`) is een VOORINVULLING, geen boekregel
Elke grootboekrekening kan een standaard BTW-tarief hebben voor het bank verwerken (aug 2026,
gebouwd omdat de eigenaar de BTW-knop bij omzet vergat aan te klikken):
- **Veld**: `g.btwStandaard` = `null`/afwezig (geen standaard) of `0`/`9`/`21`. Ingesteld via
  Grootboek → rekening bewerken (`#gb-btw-standaard` in index.html, gelezen/geschreven in
  `openGBModal`/`slaGBOp`, btw-rapport.js). Zit ín de grootboek-objecten, dus synct automatisch
  mee met `DB.grootboek` — géén aparte sync-uitbreiding nodig (#22 geldt hier niet).
- **Toepassing in bank.js** via helper `_gbBtwStandaard(g)` (null = geen standaard) op:
  het inline-koppelformulier (`iwGbGekozen` → `setBTW(tId,std,true)` zodra een rekening
  gekozen wordt), splitsregels (`splitsGbGekozen` → `setSplitsBTW(rowId,std,true)`),
  `snelKoppelGB` (suggestie-kliks: expliciete regel-BTW > 0 wint, anders rekening-standaard,
  anders 0), `bevestigBulkKoppeling` en `bevestigKoppeling` (fallback als er geen
  inlineBTW-keuze is).
- **Handmatige keuze wint ALTIJD**: `setBTW`/`setSplitsBTW` hebben een derde parameter `auto`.
  Zonder `auto` (knop-klik) wordt de keuze gemarkeerd (`inlineBTWHandmatig[tId]` /
  `row.dataset.btwHandmatig='1'`) en de auto-toepassing slaat gemarkeerde transacties/regels
  over. Die volgorde nooit omdraaien — de standaard mag een bewuste klik niet overschrijven.
- **Boeken blijft altijd via `_boekTegenrekening()`** (#18). `btwStandaard` verandert alleen
  wélk tarief wordt doorgegeven, nooit de boekingslogica. `t.btwTarief` moet het wérkelijk
  geboekte tarief bevatten, ook als dat uit de standaard kwam (voor P&L/grootboekkaart #19/#20).
- **Nieuwe grootboek-koppel-flows in bank.js** moeten `_gbBtwStandaard(g)` als fallback
  toepassen i.p.v. stilzwijgend 0 — zie boekhoud-checker Check 12.

### 26. Rapportages moeten ELKE boekingsbron kennen — anders stille fiscale fouten
Uit de volledige boekhoudaudit (aug 2026) kwamen acht fouten; de zwaarste waren onzichtbaar,
want ze gaven geen balansfout maar een te lage BTW-aangifte. Bij elke nieuwe boekings- of
factuurflow moet je vijf reconstructies langs: `balansAudit`, `berekenPLVoorPeriode`,
`bouwGrootboekkaart`, `renderBTWAangifte` en `renderJaaropgave` (boekhoud-checker Check 14).

Concreet gerepareerd, en dus nooit opnieuw introduceren:
- **`window.inlineBTW` bestaat niet.** `inlineBTW` is een `const` op scriptniveau in bank.js;
  `(window.inlineBTW||{})[t.id]` gaf dus altijd 0 → voorbelasting uit bankuitgaven werd nooit
  teruggevraagd (rubriek 5b) en de jaaropgave telde bankkosten inclusief BTW. Het persistente,
  juiste veld is `t.btwTarief` (of `d.btwTarief` per splitsregel).
- **Regel-loze facturen.** Uren-facturen hebben geen `regels`, alleen `totaalExcl`. Elke
  factuur-doorloop heeft een fallback nodig (`_factuurBtwPct(f)` bepaalt het tarief uit
  `f.btwTarief`, anders afgeleid uit `btwBedrag/totaalExcl`), anders verdwijnt die omzet
  uit de aangifte terwijl 1510 de BTW wél bevat.
- **Directe bank-omzet.** Een ontvangst rechtstreeks op een omzetrekening (bv. Sum Up) boekt
  BTW op 1510 en hoort dus in rubriek 1a/1b — niet alleen facturen en kassalijsten tellen mee.
- **Gedeelde helpers.** `_bankGbDelen(t)` (splitsregels of één regel uit de transactie) en
  `_bankGbRekening(d,t)` (rekening via `gbId`, anders via de `gekoppeldAan`-tekst) staan in
  btw-rapport.js en worden door P&L, aangifte én jaaropgave gebruikt. Nieuwe code die zelf
  `t.splitsRegels`/`t.tegenrekeningId` uitpluist, loopt gegarandeerd uit de pas.

Aansluitcontrole om dit type fout te vangen: rubriek 1a+1b moet aansluiten op wat er in
dezelfde periode op 1510 geboekt is, en 5b op 1500.

### 27. Eenzijdige saldo-mutaties zijn ALTIJD fout (behalve #19b)
Vier features lagen stil doordat ze een saldo aan één kant muteerden; de balanscontrole
blokkeerde ze allemaal met een cryptische "boekhoudkundige fout" die op een codebug leek.
Elke saldo-mutatie hoort een tegenboeking te hebben:
- **`boekBetalingsverschil`** boekt het verschil tussen betaald en factuurtotaal nu dubbelzijdig:
  debiteuren/crediteuren tegen 8900. Te veel betaald wordt altijd afgeboekt; een tekort alleen
  onder `AFBOEKGRENS_BETALINGSVERSCHIL` (€2) — daarboven is het een deelbetaling die open blijft
  staan. `t.betalingsverschil` bewaart het bedrag, zodat `draaiBoekingTerug` exact spiegelt.
- **Privé-opname/storting** (`inlineBevestigPrive`): privérekeningen zijn `eigen_vermogen` en dus
  credit-normaal (#17) — een opname VERLAAGT het saldo (`-= abs`), een storting verhoogt het.
  De terugdraai in `draaiBoekingTerug` moet die tekens exact spiegelen én dezelfde rekening
  kiezen (opname → 3000, storting → 3100).
- **Openingssaldi** (`slaGBOp`, `voegBankToe`): de EV-tegenboeking krijgt haar teken van het
  rekeningtype — debet-normaal (activa/kosten) → EV `+= saldo`, credit-normaal → EV `-= saldo`.
  Eén vast teken werkt maar voor de helft van de rekeningen.

### 28. Factuur-koppelingen: betaalstand herberekenen en ALLE betalingen meenemen
- **Ontkoppelen** (`draaiBoekingTerug`) moet `f.betaald`/`f.restBedrag`/`f.status` herberekenen,
  niet alleen de status. Bleef `f.betaald` staan, dan telde een nieuwe koppeling erbovenop en
  stond de factuur te vroeg op 'betaald'.
- **Factuur verwijderen** (`verwijderFactuur`) gebruikt `filter`, geen `find`: een factuur kan
  méérdere gekoppelde deelbetalingen hebben en die moeten allemaal teruggedraaid worden.
- **Elke factuur-koppelflow zet `t.factuurId`** (`inlineBevestig`, `snelKoppelFactuur`,
  `bevestigKoppeling`, `koppelAanMatch`). Zonder dat veld leunt de kasstelsel-ratio op tekstmatch.
- **Vast activum via bankkoppeling**: de `fakeFactuur.totaalExcl` moet EXCL. BTW zijn
  (`bedrag/((100+btwTarief)/100)`), anders schrijft het schema af over de BTW heen.

### 29. Nooit GOKKEN welk document de gebruiker bedoelt — laat hem kiezen
Bij het opnieuw genereren van een uren-factuur (aug 2026) zocht `_zoekBestaandeUrenFactuur()`
zelf uit wélke bestaande factuur bij de gekozen periode hoorde. Facturen van vóór die wijziging
hebben geen `periodeVan`/`periodeTot`, dus viel de code terug op de maand van de **factuurdatum**,
met een maand speling "omdat je meestal ná afloop factureert". Gevolg: een factuur over juni die
begin juli verstuurd was, viel binnen het venster [juli t/m augustus] en werd aangeboden om
overschreven te worden — inclusief het overnemen van háár factuurnummer en factuurdatum. Eén klik
verder was een al verstuurde factuur weg.

De regel: zodra een heuristiek kan aanwijzen wélk bestaand document overschreven/vervangen wordt,
mag hij niet gokken. Alleen een exacte, expliciet vastgelegde sleutel telt (hier `periodeVan` +
`periodeTot`); geen match = geen match, en dan een nieuw document. Wil de gebruiker tóch een
bestaand document raken, dan wijst hij het zelf aan.
- `_zoekBestaandeUrenFactuur()` matcht daarom alleen exact. Bouw daar nooit een terugval in
  op datum, naam-gelijkenis of bedrag.
- De keuze ligt in de dialoog `modal-uren-factuurnr` (index.html) + `vraagUrenFactuurGegevens()`
  / `_ufnControleer()` (kassier.js): factuurnummer, factuurdatum en vervaldatum, voorgevuld maar
  vrij te wijzigen. `_ufnControleer()` geeft live terug wat het ingetypte nummer betekent —
  onbekend = nieuwe factuur, bestaande uren-factuur = expliciete waarschuwing dát die vervangen
  wordt, nummer van een handmatige verkoopfactuur of een al betaalde factuur = knop geblokkeerd.
- Een Promise-dialoog moet ALTIJD resolven. De globale Escape-handler in `state.js` sluit elke
  open modal maar kent je Promise niet; zonder eigen Escape-afhandeling blijft de aanroeper
  eeuwig hangen. Zie de keydown-listener bij `_ufnAnnuleer()`.

### 30. Een nieuwe boekingsflow moet de rekenformules van `slaFactuurOp()` kopiëren
Terugdraaien is alleen een exacte spiegel (#21.4) als het terugdraaien dezelfde som maakt als het
boeken. `draaiFactuurGBTerug()` (facturen.js) herberekent het excl.-bedrag uit de opgeslagen regels
als **ongeronde** `aantal × prijs`. Boek je zelf iets anders op de omzetrekening, dan blijft er na
elke terugdraai een restje staan. `maakUrenFactuur()` rondde het regelbedrag eerst per regel af:
gemeten restje tot €0,065 bij 30 regels — ruim boven de balanstolerantie van 0,005.

Neem dus letterlijk de twee formules uit `slaFactuurOp()` (facturen.js) over:
- `totaalExcl` = **ongeronde** som van `aantal × prijs`;
- `btwBedrag`  = som van **per regel** afgeronde BTW (`Math.round(excl*pct)/100` per regel).

Die tweede is niet cosmetisch: `renderBTWAangifte` rondt de BTW óók per regel af, dus rond je het
totaal in één keer af, dan wijkt rubriek 1a af van wat er op 1510 staat — een stille fout die de
aansluitcontrole van #26 pas boven de €0,02 ziet.

Sla `aantal` wél afgerond op (2 decimalen): dat getal staat op de factuur én in de regel, en moet
overal hetzelfde zijn.

**En controleer `save()`.** Die draait bij een scheve balans de héle handeling terug
(`herstelNaLaatsteGoedeStand()`) en geeft `false`. `maakUrenFactuur()` negeerde dat en meldde
"Factuur vervangen" plus een geopend factuurvenster terwijl er niets bewaard was en de oude
factuur nog stond. Altijd `if(!save()){ toast(...); return; }` vóór elke succesmelding, render
of vervolgactie — precies zoals `slaFactuurOp()` het doet.

## Losse eindjes (geen risico)
- (Verwijderd 2026-07-22: de twee oude "regel ~3976 / ~1751"-notities verwezen naar de
  inmiddels opgesliste monoliet-`index.html` en klopten niet meer met de `src/`-structuur.)
