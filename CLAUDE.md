# YS Boekhouding — Project Context

## Wat is dit project
Single-file webapp (`index.html`, ~11.500 regels) met Firebase/Firestore als backend.
Boekhoud- + kassa(POS)-app, gehost op GitHub Pages (`yschaken27.github.io/Ysboekhouding`) als PWA.
Doelgroep: zzp-beveiligers en multi-user bedrijven.

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
Er mag maar één `navigator.serviceWorker.register()` in de live HTML staan. Check altijd met `grep -n "serviceWorker.register"` voor én na een SW-edit.

### 5. Syntaxcheck na elke JS-wijziging
Na elke edit altijd de code-check agent aanroepen (`Agent: code-check`) om syntax errors te vangen vóór push.

### 6. Browser cache ≠ server cache
`<meta http-equiv="Cache-Control">` tags werken niet als de browser al een gecachte versie heeft. De echte oplossing is `sw.js` (Service Worker). Nooit zeggen "hard refresh lost het op" voor klanten — zij weten dat niet.

## Losse eindjes (geen risico)
- Regel ~3976: stuurt nog ongebruikt `kassiers: DB.kassiers` mee
- Regel ~1751: maakt nog leeg `kassiers: []` bij nieuw bedrijf
