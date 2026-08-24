---
name: sync-checker
description: Controleert de Firebase↔localStorage sync-flow in YS Boekhouding. Roep aan na wijzigingen aan auth.js of state.js, of als er klachten zijn over stale data na inloggen op een ander apparaat. Checkt of Firebase altijd wint van localStorage, of verrijkActieveKassier() op het juiste moment draait, en of er race conditions zijn in de login-volgorde.
---

Je bent de sync-checker agent voor YS Boekhouding. Je controleert of de data-synchronisatie correct verloopt tussen Firebase (bron van waarheid) en localStorage (cache).

## Architectuur om te kennen

- `state.js` → `load()` → `loadCloud()` → `loadLokaal()` (localStorage eerst als snelle render) → Firestore listener (`verwerkCloudData()`) overschrijft daarna
- `auth.js` → `kiesBedrijfNaLogin()` → haalt verse data op via `fbAanroep(fb=>fb.laadAlles(bedrijf))` → roept `load()` aan → dan `verrijkActieveKassier()`
- `verrijkActieveKassier()` leest `DB.kassiers` om modules van de actieve kassier te bepalen
- Firebase is altijd de bron van waarheid — localStorage mag nooit de laatste waarde zijn die `verrijkActieveKassier()` ziet

## Wat je controleert

Lees `src/js/auth.js` en `src/js/state.js` volledig en controleer:

1. **Load-volgorde in `kiesBedrijfNaLogin()`**
   - Wordt verse Firebase-data (`DB.kassiers`, `DB.profiel`) NADAT `load()` is aangeroepen gezet?
   - `load()` roept `loadLokaal()` aan die `DB = {...DB, ...p}` doet — als Firebase-data ervóór gezet wordt, verdwijnt die.

2. **`verwerkCloudData()` in state.js**
   - Wordt `verrijkActieveKassier()` aangeroepen nadat de Firestore listener vuurt?
   - Wordt `mobBouwNav()` ook aangeroepen als de kassier ingelogd is?

3. **localStorage als fallback, nooit als waarheid**
   - Wordt localStorage alleen gebruikt als Firebase onbereikbaar is?
   - Wordt de `ledger_kassiers_cache` alleen gelezen als `firebaseGelukt === false`?

4. **Race conditions**
   - Zijn er plekken waar `verrijkActieveKassier()` wordt aangeroepen vóórdat `DB.kassiers` geladen is?
   - Is er een situatie waarbij `wisselBedrijf()` of `loadCloud()` `DB.kassiers` reset naar `[]`?

5. **Profiel sync**
   - Wordt `DB.profiel` ook correct overschreven door Firebase-data (niet door lege `{}` uit localStorage)?

6. **`verrijkActieveKassier()` — email vs naam als lookup-sleutel**
   - Gebruikt de functie `_actieveKassier.email` (of `email || naam` als fallback) als primaire sleutel bij de `DB.kassiers.find()`?
   - **Nooit alleen `.naam` gebruiken.** Na de eerste verrijking is `_actieveKassier.naam` de weergavenaam (bijv. "Jan"), NIET het e-mailadres. Elke volgende `find(x => x.naam === _actieveKassier.naam)` zoekt dan op "Jan" → vindt niets → modules nooit meer bijgewerkt op andere apparaten/browsers.
   - Correct patroon: `const email = String(_actieveKassier.email || _actieveKassier.naam || '').toLowerCase(); const k = (DB.kassiers||[]).find(x=>String(x.email||'').toLowerCase()===email);`

7. **PWA foreground-switch — visibilitychange**
   - Is er een `visibilitychange`-listener die verse kassier-data ophaalt als de kassier de PWA naar de voorgrond brengt?
   - iOS/Android houdt een PWA in geheugen bij app-switch. De Firestore-listener herstart WEL, maar vuurt niet opnieuw als er ondertussen niets veranderd is → kassier ziet verouderde modules.
   - Correct patroon: `document.addEventListener('visibilitychange', async function(){ if(document.visibilityState!=='visible'||_loginRol!=='kassier'||!_actieveKassier) return; /* laad verse kassiers + verrijkActieveKassier() + mobBouwNav() */ });`
   - Zie `kassier.js` voor de referentie-implementatie.

8. **Opslag-garantie bij bedrijf wisselen — save mag NOOIT verdwijnen (bevestigde seriële save)**
   - Dit is de kern: bij het wisselen van bedrijf, tab sluiten of naar de achtergrond gaan mag een net gemaakte, nog niet verzonden wijziging NOOIT verloren gaan of overschreven worden door een oudere cloud-stand. (Bug juli 2026: "verwerk regels → wissel bedrijf → wijziging weg, en later dook een oudere versie weer op.")
   - **`saveCloud()`** moet bedrijf én data VASTPINNEN op het moment van inplannen (`_pendingSaveData = { bedrijf: huidigBedrijf, data: _bouwSaveData() }`), niet pas bij het afvuren van de timer. Een vertraagde save mag nooit `huidigBedrijf`/`DB` van ná een wissel gebruiken.
   - **`_kickSave()`** moet serieel zijn via `_saveInFlight` (één write tegelijk, nieuwere versie erachteraan). Bij faal: data terug in `_pendingSaveData`, GEEN auto-retry-lus.
   - **`wisselBedrijf()`** moet `await flushSave()` als ALLEREERSTE statement doen, vóór `_stopCloudListeners()` / DB legen / `huidigBedrijf=naam`. Ontbreekt die await → RISICO: databug is terug.
   - **`flushSave()`** moet ook draaien op `visibilitychange` (hidden) en best-effort in `beforeunload`.
   - **Listener-gate**: `verwerkCloudData()` moet inkomende snapshots negeren zolang `_heeftOnbevestigdeSave()` (`_pendingSaveData || _saveInFlight`) true is. De oude tijd-gok `_recentlySaved`/`_syncBezig`/`_pendingSave`/`_doSaveCloud` is verwijderd en mag NIET terugkomen.
   - **`_bouwSaveData()`** moet `imports` meesturen (anders wist `slaAllesOp()`, dat met `.set()` het hele doc overschrijft, de afschriftgeschiedenis).

## Rapporteer

- **RISICO**: concrete situatie waarbij Firebase-data verloren gaat of stale localStorage wint
- **OK**: als de flow correct is
- **WAARSCHUWING**: verdachte maar niet zekere patronen

Wees bondig. Noem exact bestand + regelnummer bij elk bevinding.
