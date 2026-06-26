// firebase-config.js
// Firebase initialisatie en fbAPI wrapper voor YS Boekhouding
// Dit bestand wordt geladen NA de Firebase SDK scripts

(function(){
  // Config direct inline — geen timing problemen
  const _FB_CONFIG = {
    apiKey: "AIzaSyDCwgK-b4OEXAG7-gXqr6j5ilgTRAxuCTM",
    authDomain: "boekhouding-6bcfe.firebaseapp.com",
    projectId: "boekhouding-6bcfe",
    storageBucket: "boekhouding-6bcfe.firebasestorage.app",
    messagingSenderId: "412388229605",
    appId: "1:412388229605:web:ea2b4fc84a68536706ef0c"
  };
  firebase.initializeApp(_FB_CONFIG);
  const db      = firebase.firestore();
  const storage = firebase.storage();

  // ============================================================
  // AUTH — email + wachtwoord login
  // ============================================================

  // Wie is de hoofdeigenaar? Dit e-mailadres is altijd eigenaar van
  // alle bedrijven. Andere ingelogde e-mailadressen zijn kassier en
  // zien alleen de bedrijven waar ze op de gastenlijst staan.
  const _HOOFD_EIGENAAR = 'ymeraldo@hotmail.com';
  window._HOOFD_EIGENAAR = _HOOFD_EIGENAAR;

  window.FBAuth = {
    // Is er iemand ingelogd?
    currentUser(){ return firebase.auth().currentUser; },
    currentEmail(){
      const u = firebase.auth().currentUser;
      return u && u.email ? u.email.toLowerCase() : null;
    },

    // Inloggen met e-mailadres en wachtwoord.
    async inloggenMetWachtwoord(email, wachtwoord){
      const adres = (email||'').trim().toLowerCase();
      if(!adres || adres.indexOf('@') < 0) throw new Error('Ongeldig e-mailadres');
      if(!wachtwoord) throw new Error('Vul een wachtwoord in');
      const result = await firebase.auth().signInWithEmailAndPassword(adres, wachtwoord);
      return result.user && result.user.email ? result.user.email.toLowerCase() : adres;
    },

    // Stuur een wachtwoord-reset mail (voor nieuwe of vergeten wachtwoorden).
    async wachtwoordResetten(email){
      const adres = (email||'').trim().toLowerCase();
      if(!adres || adres.indexOf('@') < 0) throw new Error('Ongeldig e-mailadres');
      await firebase.auth().sendPasswordResetEmail(adres);
      return true;
    },

    async uitloggen(){
      return firebase.auth().signOut();
    }
  };

  window.FB = {
    db, storage,

    async getBedrijvenLijst(){
      // Haal alle bedrijven op uit Firebase.
      // Probleem dat dit oplost: bedrijven die zijn aangemaakt zonder een
      // veld op het hoofddocument zijn "ghost documents". Ze staan wel in
      // de Firebase Console maar komen NIET terug uit collection().get().
      // Daarom voegen we de namen uit de collectionGroup 'data' toe: elk
      // bedrijf heeft een data/main, en het bovenliggende bedrijf-id halen
      // we daar uit. Zo verschijnen ook oudere bedrijven gewoon in de lijst.
      const namen = new Set();
      try{
        const snap = await db.collection('bedrijven').get();
        snap.docs.forEach(d=>namen.add(d.id));
      }catch(e){}
      try{
        const grp = await db.collectionGroup('data').get();
        grp.docs.forEach(d=>{
          // pad: bedrijven/{naam}/data/{docId} -> parent.parent is het bedrijf
          const bedrijfRef = d.ref.parent && d.ref.parent.parent;
          if(bedrijfRef && bedrijfRef.id) namen.add(bedrijfRef.id);
        });
      }catch(e){}
      return JSON.stringify(Array.from(namen));
    },

    async laadAlles(bedrijf){
      const [mainSnap, vkSnap, ikSnap, trSnap, klSnap, urSnap, upSnap] = await Promise.all([
        db.collection('bedrijven').doc(bedrijf).collection('data').doc('main').get(),
        db.collection('bedrijven').doc(bedrijf).collection('data').doc('verkoop').get(),
        db.collection('bedrijven').doc(bedrijf).collection('data').doc('inkoop').get(),
        db.collection('bedrijven').doc(bedrijf).collection('data').doc('transacties').get(),
        db.collection('bedrijven').doc(bedrijf).collection('data').doc('kassalijsten').get(),
        db.collection('bedrijven').doc(bedrijf).collection('data').doc('uren').get(),
        db.collection('bedrijven').doc(bedrijf).collection('uploads').get(),
      ]);
      const main = mainSnap.exists ? mainSnap.data() : {};
      return JSON.stringify({
        kassiers:    main.kassiers||[],
        profiel:     main.profiel||{},
        grootboek:   main.grootboek||[],
        regels:      main.regels||[],
        memoriaal:   main.memoriaal||[],
        vasteActiva: main.vasteActiva||[],
        imports:     main.imports||[],
        verkoop:     vkSnap.exists ? (vkSnap.data().items||[]) : [],
        inkoop:      ikSnap.exists ? (ikSnap.data().items||[]) : [],
        transacties: trSnap.exists ? (trSnap.data().items||[]) : [],
        kassalijsten:klSnap.exists ? (klSnap.data().items||[]) : [],
        uren:        urSnap.exists ? (urSnap.data().items||[]) : [],
      });
    },

    // Realtime listener op alle bedrijfsdocs — callback bij elke wijziging.
    // Geeft een unsubscribe-functie terug.
    luisterAlles(bedrijf, callback, onError){
      const ref = db.collection('bedrijven').doc(bedrijf).collection('data');
      const docs = { main:null, verkoop:null, inkoop:null, transacties:null, kassalijsten:null, uren:null };
      const unsubs = [];

      function samenstellenEnCallback(){
        if(Object.values(docs).some(v=>v===null)) return;
        try{
          const main = docs.main;
          callback(JSON.stringify({
            kassiers:     main.kassiers     || [],
            profiel:      main.profiel      || {},
            grootboek:    main.grootboek    || [],
            regels:       main.regels       || [],
            memoriaal:    main.memoriaal    || [],
            vasteActiva:  main.vasteActiva  || [],
            imports:      main.imports      || [],
            verkoop:      docs.verkoop.items      || [],
            inkoop:       docs.inkoop.items       || [],
            transacties:  docs.transacties.items  || [],
            kassalijsten: docs.kassalijsten.items || [],
            uren:         docs.uren.items         || [],
          }));
        }catch(e){ if(onError) onError(e); }
      }

      function luisterOp(docId, sleutel){
        const u = ref.doc(docId).onSnapshot(
          snap=>{ docs[sleutel] = snap.exists ? snap.data() : {}; samenstellenEnCallback(); },
          err =>{ if(onError) onError(err); }
        );
        unsubs.push(u);
      }

      luisterOp('main',         'main');
      luisterOp('verkoop',      'verkoop');
      luisterOp('inkoop',       'inkoop');
      luisterOp('transacties',  'transacties');
      luisterOp('kassalijsten', 'kassalijsten');
      luisterOp('uren',         'uren');

      return ()=>unsubs.forEach(u=>u());
    },

    // Schrijf ALLEEN het kassiers-veld van data/main, los van save() en de
    // balanscheck. Mirror van het uren/kassalijsten-patroon, maar omdat kassiers
    // in 'main' wonen werken we gericht dat ene veld bij (update i.p.v. set),
    // zodat profiel/grootboek/regels onaangeroerd blijven.
    async slaKassiersOp(bedrijf, kassiersJson){
      const kassiers = JSON.parse(kassiersJson || '[]');
      const ref = db.collection('bedrijven').doc(bedrijf).collection('data').doc('main');
      // set met merge: maakt 'main' aan als die nog niet bestaat, en raakt
      // verder geen enkel ander veld.
      await ref.set({ kassiers }, {merge:true});
      return JSON.stringify({ok:true});
    },

    async slaAllesOp(bedrijf, dataJson){
      const d = JSON.parse(dataJson);
      const ref = db.collection('bedrijven').doc(bedrijf).collection('data');
      await Promise.all([
        ref.doc('main').set({
          kassiers:    d.kassiers||[],
          profiel:     d.profiel||{},
          grootboek:   d.grootboek||[],
          regels:      d.regels||[],
          memoriaal:   d.memoriaal||[],
          vasteActiva: d.vasteActiva||[],
          imports:     d.imports||[],
        }),
        ref.doc('verkoop').set({items: d.verkoop||[]}),
        ref.doc('inkoop').set({items: d.inkoop||[]}),
        ref.doc('transacties').set({items: d.transacties||[]}),
        ref.doc('kassalijsten').set({items: d.kassalijsten||[]}),
        ref.doc('uren').set({items: d.uren||[]}),
      ]);
      return true;
    },

    // ===== GASTENLIJST (fase 2) =====
    // De toegangslijst van een bedrijf staat in
    // bedrijven/{bedrijf}/toegang/lijst met een veld emails[].
    // Iedereen op die lijst is kassier van dat bedrijf.
    async getGastenlijst(bedrijf){
      const snap = await db.collection('bedrijven').doc(bedrijf)
        .collection('toegang').doc('lijst').get();
      const data = snap.exists ? snap.data() : {};
      return JSON.stringify(data.emails || []);
    },

    async setGastenlijst(bedrijf, emailsJson){
      const emails = JSON.parse(emailsJson || '[]');
      try {
        await db.collection('bedrijven').doc(bedrijf)
          .collection('toegang').doc('lijst')
          .set({ emails: emails }, {merge:true});
      } catch(e){ console.error('[setGastenlijst]', e); throw e; }
      return true;
    },

    async maakBedrijf(naam){
      // Schrijf eerst een echt veld naar het bedrijf-document zelf.
      // Zonder dit blijft bedrijven/{naam} een "ghost document": het is
      // wel zichtbaar in de Firebase Console, maar verschijnt NIET in
      // collection('bedrijven').get(), waardoor andere apparaten het niet
      // zien. Met dit veld komt het document gewoon in de lijst.
      await db.collection('bedrijven').doc(naam).set({
        naam,
        aangemaakt: firebase.firestore.FieldValue.serverTimestamp()
      }, {merge:true});
      await db.collection('bedrijven').doc(naam).collection('data').doc('main').set({
        kassiers:[],
        profiel:{
          naam,
          btwStelsel:'factuurstelsel', // eigenaar kan dit aanpassen in profiel
          btwStandaard:'21',
          rechtsvorm:'eenmanszaak',
        },
        grootboek:[], regels:[],
        memoriaal:[], vasteActiva:[], imports:[]
      }, {merge:true});
      // Maak ook lege kassalijsten doc aan
      await db.collection('bedrijven').doc(naam).collection('data').doc('kassalijsten').set({items:[]}, {merge:true});
      return JSON.stringify({ok:true, naam});
    },

    async voegKassalijstToe(bedrijf, kassalijstJson){
      const nieuw = JSON.parse(kassalijstJson);
      const snap = await db.collection('bedrijven').doc(bedrijf).collection('data').doc('kassalijsten').get();
      const bestaand = snap.exists ? (snap.data().items||[]) : [];
      // Voorkom duplicaten op basis van id
      if(bestaand.some(k=>k.id===nieuw.id)){
        return JSON.stringify({ok:true, dubbel:true});
      }
      bestaand.push(nieuw);
      await db.collection('bedrijven').doc(bedrijf).collection('data').doc('kassalijsten').set({items:bestaand});
      return JSON.stringify({ok:true});
    },

    async voegUrenToe(bedrijf, urenJson){
      const nieuw = JSON.parse(urenJson);
      const snap = await db.collection('bedrijven').doc(bedrijf).collection('data').doc('uren').get();
      const bestaand = snap.exists ? (snap.data().items||[]) : [];
      // Voorkom duplicaten op basis van id
      if(bestaand.some(u=>u.id===nieuw.id)){
        return JSON.stringify({ok:true, dubbel:true});
      }
      bestaand.push(nieuw);
      try {
        await db.collection('bedrijven').doc(bedrijf).collection('data').doc('uren').set({items:bestaand});
      } catch(e){ console.error('[voegUrenToe]', e); throw e; }
      return JSON.stringify({ok:true});
    },

    // Status van één uren-ingave bijwerken (goedkeuren/afwijzen) zonder de rest te raken
    async updateUrenStatus(bedrijf, id, status){
      const ref = db.collection('bedrijven').doc(bedrijf).collection('data').doc('uren');
      const snap = await ref.get();
      const bestaand = snap.exists ? (snap.data().items||[]) : [];
      const idx = bestaand.findIndex(u=>u.id===id);
      if(idx === -1) return JSON.stringify({ok:false, reden:'niet gevonden'});
      bestaand[idx].status = status;
      try {
        await ref.set({items:bestaand});
      } catch(e){ console.error('[updateUrenStatus]', e); throw e; }
      return JSON.stringify({ok:true});
    },

    async checkKassalijstBestaat(bedrijf, kassaId){
      const snap = await db.collection('bedrijven').doc(bedrijf).collection('data').doc('kassalijsten').get();
      if(!snap.exists) return false;
      return (snap.data().items||[]).some(k=>k.id===kassaId);
    },

    async checkBonBestaat(bedrijf, bonId){
      const snap = await db.collection('bedrijven').doc(bedrijf).collection('uploads').doc(bonId).get();
      return snap.exists;
    },

    async uploadBijlage(bedrijf, jsonStr){
      const b = JSON.parse(jsonStr);
      const pad = `${bedrijf}/facturen/${b.factuurId}/${b.naam}`;
      const storageRef = storage.ref(pad);
      await storageRef.putString(b.data, 'data_url');
      const url = await storageRef.getDownloadURL();
      return JSON.stringify({ok:true, result:{driveUrl:url, viewUrl:url, naam:b.naam, type:b.type}});
    },

    async uploadBon(bedrijf, jsonStr){
      const b = JSON.parse(jsonStr);
      console.log('[Bonnen] Opslaan in Firestore | bedrijf:', JSON.stringify(bedrijf), '| pad: bedrijven/'+bedrijf+'/uploads/'+b.id);
      // Sla bestand direct als base64 op in Firestore (geen Storage nodig)
      const maxBytes = 900000; // ~900KB Firestore limiet veiligheid
      if(b.bestand && b.bestand.length > maxBytes){
        throw new Error('Bestand te groot voor directe opslag (max ~650KB)');
      }
      await db.collection('bedrijven').doc(bedrijf).collection('uploads').doc(b.id).set({
        id:b.id, naam:b.naam, type:b.type,
        omschrijving:b.omschrijving||'',
        uploadedBy:b.uploadedBy||'',
        uploadedAt:b.uploadedAt||new Date().toISOString(),
        status:'nieuw',
        bestandData:b.bestand||''
      });
      return JSON.stringify({ok:true, naam:b.naam});
    },

    async laadUploads(bedrijf){
      console.log('[Bonnen] Laden van bedrijf:', JSON.stringify(bedrijf), '| pad: bedrijven/'+bedrijf+'/uploads');
      const snaps = await db.collection('bedrijven').doc(bedrijf).collection('uploads').get();
      console.log('[Bonnen] Firestore resultaat: '+snaps.docs.length+' documenten gevonden');
      const items = snaps.docs.map(d=>d.data())
        .sort((a,b)=>(b.uploadedAt||'').localeCompare(a.uploadedAt||''));
      return JSON.stringify(items);
    },

    async updateUploadStatus(bedrijf, uploadId, status){
      try {
        await db.collection('bedrijven').doc(bedrijf).collection('uploads').doc(uploadId).update({status});
      } catch(e){ console.error('[updateUploadStatus]', e); throw e; }
      return JSON.stringify({ok:true});
    },

    // Lees de bedrijvenlijst van een specifieke kassier uit bedrijven_toegang/{email}.
    // Kassiers kunnen alleen hun eigen document lezen (security rule: email == auth.email).
    // Eigenaar schrijft dit document bij elke bedrijfstoewijzing.
    async getBedrijvenVoorKassier(email){
      const adres = String(email||'').trim().toLowerCase();
      if(!adres) return JSON.stringify({exists:false, bedrijven:[]});
      const snap = await db.collection('bedrijven_toegang').doc(adres).get();
      if(!snap.exists) return JSON.stringify({exists:false, bedrijven:[]});
      const data = snap.data();
      return JSON.stringify({exists:true, bedrijven: Array.isArray(data.bedrijven) ? data.bedrijven : []});
    },

    // Schrijf de bedrijvenlijst van een kassier naar bedrijven_toegang/{email}.
    // Alleen de eigenaar mag schrijven (security rule: isHoofdeigenaar()).
    async setBedrijvenVoorKassier(email, bedrijvenJson){
      const adres = String(email||'').trim().toLowerCase();
      if(!adres) return;
      const bedrijven = JSON.parse(bedrijvenJson||'[]');
      try {
        await db.collection('bedrijven_toegang').doc(adres).set({ bedrijven }, { merge: false });
      } catch(e){ console.error('[setBedrijvenVoorKassier]', e); throw e; }
      return JSON.stringify({ok:true});
    },
  };

  window._fbKlaar = true;
  console.log('Firebase klaar ✓');
})();
