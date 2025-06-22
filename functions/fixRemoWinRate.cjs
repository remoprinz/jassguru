const admin = require('firebase-admin');
const path = require('path');

// --- Konfiguration ---
const serviceAccountPath = path.resolve(__dirname, './serviceAccountKey.json');
const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// Die Gruppen-ID und Remos Player-ID
const GROUP_ID = 'Tz0wgIHMTlhvTtFastiJ'; // fürDich OGs
const REMO_PLAYER_ID = 'b16c1120111b7d9e7d733837';

async function fixRemoWinRate() {
    console.log('🔧 Starte die manuelle Korrektur von Remos Spielsiegquote...');

    // 1. Zuerst die exakte Berechnung durchführen
    let totalGames = 0;
    let totalWins = 0;
    
    console.log('📊 Analysiere alle Sessions für Remo...');
    
    const sessionsQuery = db.collection('sessions')
        .where('groupId', '==', GROUP_ID)
        .where('status', '==', 'completed')
        .where('participantPlayerIds', 'array-contains', REMO_PLAYER_ID);
    
    const sessionsSnap = await sessionsQuery.get();
    
    for (const sessionDoc of sessionsSnap.docs) {
        const sessionData = sessionDoc.data();
        const sessionId = sessionDoc.id;
        
        console.log(`\n--- Session: ${sessionId} ---`);
        
        // Spiele aus gameWinsByPlayer zählen
        if (sessionData.gameWinsByPlayer && sessionData.gameWinsByPlayer[REMO_PLAYER_ID]) {
            const remoGameData = sessionData.gameWinsByPlayer[REMO_PLAYER_ID];
            const sessionWins = remoGameData.wins || 0;
            const sessionLosses = remoGameData.losses || 0;
            const sessionGames = sessionWins + sessionLosses;
            
            totalGames += sessionGames;
            totalWins += sessionWins;
            
            console.log(`  Spiele: ${sessionGames}, Siege: ${sessionWins}, Niederlagen: ${sessionLosses}`);
        } else {
            console.log(`  ⚠️  Keine gameWinsByPlayer-Daten für Remo gefunden`);
        }
    }
    
    const winRate = totalGames > 0 ? totalWins / totalGames : 0;
    
    console.log(`\n🎯 FINALE BERECHNUNG:`);
    console.log(`   Gesamte Spiele: ${totalGames}`);
    console.log(`   Gesamte Siege: ${totalWins}`);
    console.log(`   Siegquote: ${(winRate * 100).toFixed(1)}%`);
    
    // 2. Jetzt das groupComputedStats-Dokument direkt korrigieren
    console.log('\n🔧 Korrigiere das groupComputedStats-Dokument...');
    
    const groupStatsRef = db.collection('groupComputedStats').doc(GROUP_ID);
    const groupStatsDoc = await groupStatsRef.get();
    
    if (!groupStatsDoc.exists) {
        console.log('❌ groupComputedStats-Dokument nicht gefunden!');
        return;
    }
    
    const groupStatsData = groupStatsDoc.data();
    
    // Finde Remo in der playerWithHighestWinRateGame-Liste
    if (groupStatsData.playerWithHighestWinRateGame) {
        const updatedList = groupStatsData.playerWithHighestWinRateGame.map(player => {
            if (player.playerId === REMO_PLAYER_ID) {
                console.log(`  🎯 Remo gefunden: Alte Siegquote: ${player.value}, Neue Siegquote: ${winRate}`);
                return {
                    ...player,
                    value: winRate,
                    eventsPlayed: totalGames
                };
            }
            return player;
        });
        
        // Sortiere die Liste neu nach Siegquote
        updatedList.sort((a, b) => b.value - a.value);
        
        // Schreibe die korrigierten Daten zurück
        await groupStatsRef.update({
            playerWithHighestWinRateGame: updatedList,
            lastUpdateTimestamp: admin.firestore.Timestamp.now()
        });
        
        console.log('✅ groupComputedStats erfolgreich korrigiert!');
        
        // Zeige die neue Position von Remo in der Liste
        const remoNewPosition = updatedList.findIndex(p => p.playerId === REMO_PLAYER_ID) + 1;
        console.log(`🏆 Remo steht jetzt auf Platz ${remoNewPosition} mit ${(winRate * 100).toFixed(1)}% Siegquote`);
        
    } else {
        console.log('❌ playerWithHighestWinRateGame-Liste nicht gefunden!');
    }
}

// Skript ausführen
fixRemoWinRate()
    .then(() => {
        console.log('\n🎉 Korrektur abgeschlossen!');
        process.exit(0);
    })
    .catch(error => {
        console.error('❌ Fehler:', error);
        process.exit(1);
    }); 