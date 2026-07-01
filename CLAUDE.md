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

### 10. Kassier kan bedrijvenlijst niet lezen — weergavenamen laden aparte stap
`laadBedrijfNamenUitFirebase()` loopt over `getBedrijven()` (de eigenaar-lijst). Kassiers mogen de
volledige `bedrijven`-collectie niet lezen in Firestore, dus `_bedrijfNamen[sleutel]` wordt nooit
gevuld voor kassier-bedrijven → kassier ziet de interne aanmaak-sleutel i.p.v. de weergavenaam.
Fix: in `toonBedrijfsKiezer()` (auth.js) ontbrekende namen alsnog laden via `fbAanroep(fb=>fb.laadAlles(b))`
voor elk bedrijf uit `res.bedrijven` dat nog niet in `getBedrijfProfielNamen()` staat.
Pas `toonBedrijfsKiezer()` nooit aan zonder dit laadblok intact te houden.

### 11. `DB.uren` is een platte array — gebruik nooit `.items`
`laadAlles()` en `luisterAlles()` in `firebase-config.js` retourneren `uren` al als array
(`urSnap.data().items||[]`). Lokaal wordt `DB.uren` ook als array bijgehouden (`DB.uren.push(ingave)`).
Gebruik dus altijd `DB.uren||[]`, nooit `DB.uren?.items||[]` of `DB.uren.items` — `.items` is altijd `undefined`.

## Losse eindjes (geen risico)
- Regel ~3976: stuurt nog ongebruikt `kassiers: DB.kassiers` mee
- Regel ~1751: maakt nog leeg `kassiers: []` bij nieuw bedrijf
