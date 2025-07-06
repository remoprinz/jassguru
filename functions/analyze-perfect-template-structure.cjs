const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

// Initialisierung der Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://jassguru-c3c0a.firebaseio.com'
});

const db = admin.firestore();

async function analyzePerfectTemplateStructure() {
  const sessionId = 'UIamH_JPMb9Yd5-sWHr-U'; // Die "perfekte" Vorlage
  console.log(`🧐 ANALYSIERE PERFEKTE VORLAGE: ${sessionId}`);
  console.log('='.repeat(60));

  const completedGamesRef = db.collection('jassGameSummaries').doc(sessionId).collection('completedGames');
  const gamesSnapshot = await completedGamesRef.get();

  if (gamesSnapshot.empty) {
    console.log('❌ Keine abgeschlossenen Spiele in dieser Session gefunden.');
    return;
  }

  console.log(`🔎 Analysiere ${gamesSnapshot.size} Spiele...`);

  for (const gameDoc of gamesSnapshot.docs) {
    const gameData = gameDoc.data();
    const gameId = gameDoc.id;
    const gameNumber = gameData.gameNumber || gameId;

    console.log(`\n--- Spiel ${gameNumber} (${gameId}) ---`);

    if (!gameData.roundHistory || gameData.roundHistory.length === 0) {
      console.log('   -> Keine roundHistory vorhanden, wird übersprungen.');
      continue;
    }

    gameData.roundHistory.forEach((round, index) => {
      let findings = [];

      // 1. Prüfung auf strichInfo vs. eventType
      if (round.strichInfo) {
        findings.push(`✅ strichInfo: { type: '${round.strichInfo.type}', team: '${round.strichInfo.team}' }`);
      }
      if (round.eventType) {
        findings.push(`❌ eventType gefunden: '${round.eventType}'`);
      }

      // 2. Prüfung auf _savedWeisPoints vs. weisPoints
      let weisFinding = null;
      if (round.hasOwnProperty('_savedWeisPoints')) {
        weisFinding = "❌ _savedWeisPoints existiert";
      }
      if (round.weisPoints && (round.weisPoints.top > 0 || round.weisPoints.bottom > 0)) {
         if (weisFinding) {
            weisFinding += ` (aber weisPoints hat Daten: T${round.weisPoints.top}/B${round.weisPoints.bottom})`;
         } else {
            weisFinding = `✅ weisPoints hat Daten: T${round.weisPoints.top}/B${round.weisPoints.bottom}`;
         }
      }
      if (weisFinding) {
        findings.push(weisFinding);
      }

      if (findings.length > 0) {
        console.log(`   [Runde ${index + 1}]`);
        findings.forEach(finding => console.log(`     -> ${finding}`));
      }
    });
  }
   console.log('\n\n✅ Analyse abgeschlossen.');
}

analyzePerfectTemplateStructure().catch(console.error); 