const admin = require('firebase-admin');
const path = require('path');

// Service Account Key laden
const serviceAccountPath = path.join(__dirname, '..', 'serviceAccountKey.json');
const serviceAccount = require(serviceAccountPath);

// Firebase Admin initialisieren
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

const TOURNAMENT_ID = '6RdW4o4PRv0UzsZWysex';
const GROUP_ID = 'Tz0wgIHMTlhvTtFastiJ';

async function addIsTournamentSessionFlag() {
  console.log('\n🔧 SETZE isTournamentSession FLAG\n');
  console.log('='.repeat(80));
  
  try {
    // 1. Lade jassGameSummary
    console.log('\n📝 1. LADE JASSGAMESUMMARY...\n');
    
    const summaryRef = db.doc(`groups/${GROUP_ID}/jassGameSummaries/${TOURNAMENT_ID}`);
    const summaryDoc = await summaryRef.get();
    
    if (!summaryDoc.exists) {
      console.error('❌ jassGameSummary nicht gefunden!');
      process.exit(1);
    }
    
    const summary = summaryDoc.data();
    console.log('✅ jassGameSummary gefunden');
    console.log(`   Turnier: ${summary.tournamentName}`);
    console.log(`   Aktueller isTournamentSession Wert: ${summary.isTournamentSession || 'NICHT GESETZT'}`);
    
    // 2. Update mit isTournamentSession: true
    console.log('\n✅ 2. SETZE isTournamentSession: true...\n');
    
    await summaryRef.update({
      isTournamentSession: true
    });
    
    console.log('✅ isTournamentSession erfolgreich auf true gesetzt!');
    
    // 3. Verifikation
    console.log('\n🔍 3. VERIFIKATION...\n');
    
    const updatedDoc = await summaryRef.get();
    const updatedData = updatedDoc.data();
    
    if (updatedData.isTournamentSession === true) {
      console.log('✅ Bestätigt: isTournamentSession ist jetzt true');
    } else {
      console.error('❌ FEHLER: isTournamentSession wurde nicht korrekt gesetzt!');
      process.exit(1);
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ FERTIG! Das Turnier sollte jetzt in GroupView angezeigt werden.\n');
    
  } catch (error) {
    console.error('\n❌ FEHLER:', error);
    console.error(error.stack);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

// Start
addIsTournamentSessionFlag();

