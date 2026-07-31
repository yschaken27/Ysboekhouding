# YS Boekhouding — Project Context

## Wat is dit project
Boekhoud- + kassa(POS)-webapp met Firebase/Firestore als backend.
Gehost op GitHub Pages (`yschaken27.github.io/Ysboekhouding`) als PWA.
Doelgroep: zzp-beveiligers en multi-user bedrijven.

De app was oorspronkelijk één grote `index.html` (~11.500 regels) en is gesliced naar losse bestanden.
`index.html` is nu een dunne shell (~150 regels) die alleen CSS/JS inlaadt en de vaste HTML-structuur (topbar, modals) bevat.
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
| `state.js` | `DB`-object, `save()`, `load()`, helpers (`fmt`, `uid`, `esc`, `toast`, `badge`), factuurnummers, bedrijfsprofiel, opdrachtgever-register (centraal) |
| `ui.js` | Navigatie (`navTo`, `showPage`), modals (`openModal`, `closeModal`), sidebar, PWA-installatie |
| `auth.js` | Inloggen, rolbepaling, kassier-beheer (CRUD), gebruiker-detail modal, opdrachtgever-koppeling per kassier |
| `facturen.js` | Dashboard, verkoop/inkoop CRUD, BTW-helpers, grootboek |
| `bank.js` | Banktransacties, CSV-import, reconciliatie |
| `btw-rapport.js` | BTW-aangifte, grootboek, balans, P&L |
| `activa.js` | Vaste activa, afschrijvingsschema's, mobiele interface (uploads, facturen-tab) |
| `kassier.js` | Desktop kassa, kassaoverzicht, urenoverzicht (eigenaar), `maakUrenFactuur()`, mobiele uren-invoer |
| `firebase-config.js` | Firebase init, `fbAPI` (alle Firestore/Storage-aanroepen) |

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
Bekende modals: `modal-bedrijf`, `modal-opdrachtgevers`, `modal-gebruiker-detail`, `modal-factuur`, `modal-inkoop`, `modal-depr-vraag`.

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
- Boekhoeddata per bedrijf in `data/main` via generieke `save()`
- Kassalijsten en uren hebben eigen Firestore-docs met directe cloud-writes (los van `save()`)

## Gebruikers
- Gebruikers (kassiers) staan in centrale top-level collectie `gebruikers`
- Één doc per persoon, doc-id = user-id, met een `bedrijven`-array
- Wrappers: `laadGebruikers`, `slaGebruikerOp`, `verwijderGebruiker`
- Client-helper: `laadGebruikersInDB`

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

## Planning
1. **Maandfacturen-mailflow** — goedgekeurde uren per beveiliger groeperen per opdrachtgever, per opdrachtgever een factuur (PDF) maken, als bijlage mailen én in Storage archiveren. Mailen via Firebase Trigger Email-extensie (schrijf doc naar `mail`-collectie). Vereist Blaze-plan + SMTP-provider + geverifieerd afzenderdomein. PDF-library moet nog toegevoegd worden.
2. **Wachtwoord-login** i.p.v. magic-link (magic-link opent op iPhone in Safari i.p.v. de PWA). Let op: Firebase Authentication is een aparte laag dan de `gebruikers`-collectie — die koppeling eerst lezen vóór er code komt.
3. **Firestore security rules** voor `gebruikers`- en `mail`-collecties (eigenaar doet dit zelf in Firebase Console).

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
- **Credit BTW te betalen (1530)** += btwBedrag (alleen als `!zonderBtw && btwBedrag > 0.01`)
Boekingen gaan via `DB.grootboek` saldo-updates, daarna `save()`.
`btwBedrag` moet ook opgeslagen worden in de `DB.verkoop`-entry (voor terugdraaien bij verwijderen).

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
- `wisselBedrijf()` doet `await flushSave()` als ALLEREERSTE statement, vóór listeners stoppen / DB legen / `huidigBedrijf` wisselen. Deze `await` mag nooit weg.
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
Elke koppeling van een banktransactie aan een grootboekrekening in `bank.js` (`inlineBevestig` enkel + split, `snelKoppelGB`, `koppelBevestig`, `bevestigBulkKoppeling`) MOET `_boekTegenrekening(g, bedrag, btwTarief)` gebruiken — nooit met de hand `g.saldo += bedrag` + losse BTW-boeking. Die losse varianten liepen mis met drie fouten tegelijk:
- BTW-bedrag met een haakjesfout (`...))*100)/100` → gaf voor €15 @ 9% −13,61 i.p.v. +1,24;
- BTW altijd naar de eerste BTW-rekening (1500, activa) i.p.v. richting-afhankelijk: ontvangst → 1510 'te betalen' (passiva), uitgave → 1500 'te vorderen' (activa);
- vol bedrag i.p.v. excl. op de rekening, én geen teken op rekeningtype → een uitgave op een kostenrekening werd negatief → balans ~2× scheef.
`_boekTegenrekening` doet: excl. op de rekening met teken via type (credit-normaal = omzet/passiva/eigen_vermogen → +excl; anders −excl), en het BTW-deel op de richting-juiste BTW-rekening. Bij een gesplitste koppeling moeten de deelbedragen samen exact het bankbedrag dekken vóór er geboekt wordt. Controleer met `node` dat elke variant op €0 balansverschil uitkomt. Zie boekhoud-checker Check 9 en [[project-save-sync-model]] (conventie #17).
**Terugdraaien MOET spiegelen:** ontkoppelen/verwijderen (`draaiBoekingTerug` in bank.js) draait een grootboek-koppeling terug via `_boekTegenrekening(g, bedrag, btwTarief, -1)` (de `mult=-1` variant) — nooit met `g.saldo -= bedrag` (vol bedrag, geen BTW). Dat laatste liet bij verwijderen een verschil staan (excl + BTW) waardoor de balanscontrole de verwijdering blokkeerde. De BTW-richting blijft op het originele `bedrag` bepaald, zodat terugdraaien dezelfde BTW-rekening raakt. Oude boekingen zonder `t.tegenrekeningId`/`t.btwTarief` vallen terug op `g.saldo -= bedrag` (zo zijn ze destijds geboekt).

### 19. Grootboekkaart = read-only reconstructie, sluit altijd op `g.saldo`
De grootboekkaart (drill-down vanuit Balans, P&L en de Grootboek-tab) is een READ-ONLY weergave in `btw-rapport.js` — hij muteert NOOIT saldi. `bouwGrootboekkaart(gbId)` reconstrueert de boekingen per rekening uit de bestaande data:
- **Facturen** (`DB.verkoop`/`DB.inkoop`): omzet/kosten via `r.gbId` (excl. = aantal×prijs), debiteuren 1300 / crediteuren 2100 = totaalIncl, BTW naar 1510/1530 (verkoop) of 1500/1520 (inkoop) = btwBedrag.
- **Banktransacties**: de bankrekening zelf (`t.bankGbId`) = bedrag; directe grootboek-koppeling (tegenrekening via `t.tegenrekeningId`, anders `t.gekoppeldAan` startsWith `nr — `) excl. BTW via `t.btwTarief`, met teken op rekeningtype; factuurbetaling boekt 1300/2100 af. Gesplitste koppelingen belanden in de sluitregel (kaart blijft kloppen via `g.saldo`).
- **Memoriaal**: `r.gbId` met `r.effect` (exacte mutatie); fallback via `_memSaldoEffect(g, r.dc, r.bedrag)` — NOOIT naïef `dc?bedrag:-bedrag`, want dat geeft credit-normale rekeningen (omzet/passiva/EV) het verkeerde teken.

`effect` = de ondertekende mutatie op het saldo van díe rekening (credit-normale rekening → +excl, anders −excl). Omdat niet alles exact te herleiden is (gesplitste bankregels, BTW-excl van bankkoppelingen, betalingsverschillen, transfers), wordt een **sluitregel "Niet-toegewezen / correctie"** = `g.saldo − som(effecten)` toegevoegd, zodat de kaart ALTIJD eindigt op het echte rekeningsaldo. `g.saldo` blijft de bron van waarheid; de kaart mag daar nooit overheen schrijven.
Ingangen: `openGrootboekkaart(gbId)` (modal `#modal-grootboekkaart` in index.html) vanuit klikbare Balans-regels, per-rekening P&L-rijen (`rij(...,gbId)`) en de "Kaart"-knop in `renderGB`. Regels zijn doorklikbaar via `gbkOpenBron()` naar de factuur/bank/memoriaal. Wil je ooit exacte cent-precisie (ook splitsingen), vervang dit door een echt grootboek-logboek (aanpak B) — dat raakt wél alle boekingscode.

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

## Losse eindjes (geen risico)
- (Verwijderd 2026-07-22: de twee oude "regel ~3976 / ~1751"-notities verwezen naar de
  inmiddels opgesliste monoliet-`index.html` en klopten niet meer met de `src/`-structuur.)
