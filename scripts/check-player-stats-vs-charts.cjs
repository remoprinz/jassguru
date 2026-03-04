const admin = require('firebase-admin');
const path = require('path');

const serviceAccountPath = path.join(__dirname, '..', 'serviceAccountKey.json');
const serviceAccount = require(serviceAccountPath);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

const GROUP_ID = 'Tz0wgIHMTlhvTtFastiJ';
const TOURNAMENT_ID = '6RdW4o4PRv0UzsZWysex';

// Die 3 Spieler, die nur im Turnier waren
const TARGET_PLAYERS = [
  { id: 'PH15EO1vuTXq7FXal5Q_b', name: 'Reto' },
  { id: 'mgn9a1L5tM8iAJk5S2hkE', name: 'Schällenursli' },
  { id: '4nhOwuVONajPArNERzyEj', name: 'Davester' }
];

async function checkPlayerStatsVsCharts() {
  console.log('\n🔍 PRÜFE: WARUM ERSCHEINEN SPIELER IN CHARTS ABER NICHT IN STATS?\n');
  console.log('='.repeat(120));
  
  try {
    // Lade jassGameSummary für das Turnier
    const summaryRef = db.collection(`groups/${GROUP_ID}/jassGameSummaries`).doc(TOURNAMENT_ID);
    const summaryDoc = await summaryRef.get();
    const summaryData = summaryDoc.data();
    
    console.log(`\n📊 Turnier: ${summaryData?.tournamentName || TOURNAMENT_ID}`);
    console.log(`   Teilnehmer: ${summaryData?.participantPlayerIds?.length || 0}\n`);
    
    for (const targetPlayer of TARGET_PLAYERS) {
      console.log(`\n${'─'.repeat(120)}`);
      console.log(`\n👤 ${targetPlayer.name} (${targetPlayer.id})`);
      console.log('─'.repeat(120));
      
      // 1. Prüfe scoresHistory (für Charts)
      const scoresHistoryRef = db.collection(`players/${targetPlayer.id}/scoresHistory`);
      const scoresHistorySnap = await scoresHistoryRef.get();
      const scoresHistoryCount = scoresHistorySnap.size;
      
      console.log(`\n📈 CHARTS (scoresHistory):`);
      console.log(`   ✅ Einträge: ${scoresHistoryCount}`);
      
      if (scoresHistoryCount > 0) {
        const entries = scoresHistorySnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        const tournamentEntry = entries.find(e => 
          e.sessionId === TOURNAMENT_ID || 
          e.groupId === GROUP_ID
        );
        
        if (tournamentEntry) {
          console.log(`   ✅ Turnier-Eintrag gefunden:`);
          console.log(`      - stricheDiff: ${tournamentEntry.stricheDiff || 0}`);
          console.log(`      - pointsDiff: ${tournamentEntry.pointsDiff || 0}`);
          console.log(`      - completedAt: ${tournamentEntry.completedAt?.toDate?.()?.toISOString() || 'N/A'}`);
        } else {
          console.log(`   ⚠️  Kein Turnier-Eintrag in scoresHistory gefunden!`);
        }
      }
      
      // 2. Prüfe playerStats (für andere Statistiken)
      const playerStatsRef = db.collection('players').doc(targetPlayer.id);
      const playerStatsDoc = await playerStatsRef.get();
      const playerStatsData = playerStatsDoc.data();
      
      console.log(`\n📊 STATS (players/{id}/computedStats):`);
      
      // Prüfe ob computedStats existiert
      const computedStatsRef = db.collection(`players/${targetPlayer.id}/computedStats`);
      const computedStatsSnap = await computedStatsRef.get();
      
      if (computedStatsSnap.empty) {
        console.log(`   ❌ KEINE computedStats gefunden!`);
        console.log(`   ⚠️  Das erklärt, warum keine Statistiken angezeigt werden!`);
      } else {
        const computedStats = computedStatsSnap.docs[0].data();
        console.log(`   ✅ computedStats gefunden:`);
        console.log(`      - totalSessions: ${computedStats.totalSessions || 0}`);
        console.log(`      - totalGames: ${computedStats.totalGames || 0}`);
        console.log(`      - sessionsWon: ${computedStats.sessionsWon || 0}`);
        console.log(`      - gamesWon: ${computedStats.gamesWon || 0}`);
      }
      
      // 3. Prüfe ob Spieler in jassGameSummaries vorkommt
      const allSummariesRef = db.collection(`groups/${GROUP_ID}/jassGameSummaries`);
      const allSummariesSnap = await allSummariesRef
        .where('participantPlayerIds', 'array-contains', targetPlayer.id)
        .where('status', '==', 'completed')
        .get();
      
      console.log(`\n📋 JASSGAMESUMMARIES:`);
      console.log(`   ✅ Sessions gefunden: ${allSummariesSnap.size}`);
      
      if (allSummariesSnap.size > 0) {
        allSummariesSnap.docs.forEach(doc => {
          const data = doc.data();
          const isTournament = data.isTournamentSession || false;
          console.log(`      - ${doc.id}: ${isTournament ? 'TURNIER' : 'Session'} (${data.completedAt?.toDate?.()?.toISOString() || 'N/A'})`);
        });
      }
      
      // 4. Prüfe ob playerStatsCalculator die Stats berechnet hat
      console.log(`\n🔧 DIAGNOSE:`);
      
      if (scoresHistoryCount > 0 && computedStatsSnap.empty) {
        console.log(`   ❌ PROBLEM GEFUNDEN:`);
        console.log(`      - scoresHistory existiert (Charts funktionieren) ✅`);
        console.log(`      - computedStats fehlt (andere Stats funktionieren nicht) ❌`);
        console.log(`   💡 LÖSUNG: playerStatsCalculator muss für diesen Spieler ausgeführt werden!`);
      } else if (scoresHistoryCount > 0 && !computedStatsSnap.empty) {
        const computedStats = computedStatsSnap.docs[0].data();
        if ((computedStats.totalSessions || 0) === 0) {
          console.log(`   ⚠️  computedStats existiert, aber totalSessions = 0`);
          console.log(`      - Möglicherweise wurden nur Turnier-Sessions nicht gezählt`);
        } else {
          console.log(`   ✅ Beide existieren - sollte funktionieren`);
        }
      } else {
        console.log(`   ⚠️  Weder scoresHistory noch computedStats gefunden`);
      }
    }
    
    console.log(`\n${'='.repeat(120)}\n`);
    
  } catch (error) {
    console.error('\n❌ FEHLER:', error);
    console.error(error.stack);
  } finally {
    process.exit(0);
  }
}

checkPlayerStatsVsCharts().catch(console.error);

