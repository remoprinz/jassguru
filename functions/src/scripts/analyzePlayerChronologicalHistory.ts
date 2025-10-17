#!/usr/bin/env ts-node

import * as admin from 'firebase-admin';
import * as path from 'path';

// Initialize Firebase Admin SDK
const serviceAccountPath = path.resolve(__dirname, '../../../serviceAccountKey.json');
const serviceAccount = require(serviceAccountPath);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

interface PlayerHistoryEntry {
  createdAt: admin.firestore.Timestamp;
  playerId: string;
  groupId: string;
  eventType: 'session_end' | 'tournament_end';
  eventId: string;
  rating: number;
  gamesPlayed: number;
  tier: string;
  tierEmoji: string;
  delta: {
    rating: number;
    striche: number;
    games: number;
    wins: number;
    losses: number;
    points: number;
    pointsReceived: number;
    sessionWin: boolean;
    sessionLoss: boolean;
    sessionDraw: boolean;
  };
  cumulative: {
    striche: number;
    wins: number;
    losses: number;
    points: number;
    pointsReceived: number;
    sessionWins: number;
    sessionLosses: number;
    sessionDraws: number;
  };
  context: string;
}

interface EventDetails {
  eventId: string;
  eventType: 'session_end' | 'tournament_end';
  eventName?: string;
  eventDate: string;
  gamesPlayed: number;
  participants: string[];
}

async function analyzePlayerChronologicalHistory(groupId: string, playerId: string) {
  try {
    console.log(`🔍 Analysiere chronologische Historie für Spieler ${playerId} in Gruppe ${groupId}...\n`);

    // 1. Hole alle History-Einträge für den Spieler (ohne Index)
    const historyRef = db.collection(`groups/${groupId}/playerRatings/${playerId}/history`);
    const historySnap = await historyRef.get();

    if (historySnap.empty) {
      console.log(`❌ Keine History-Einträge für Spieler ${playerId} gefunden.`);
      return;
    }

    // Filtere und sortiere lokal (um Index-Probleme zu vermeiden)
    const allEntries = historySnap.docs.map(doc => doc.data() as PlayerHistoryEntry);
    const historyEntries = allEntries
      .filter(entry => entry.playerId === playerId)
      .sort((a, b) => {
        // Handle different timestamp formats
        const aTime = a.createdAt?.toMillis?.() || (a.createdAt as any)?._seconds * 1000 || 0;
        const bTime = b.createdAt?.toMillis?.() || (b.createdAt as any)?._seconds * 1000 || 0;
        return aTime - bTime;
      });
    
    console.log(`📊 Gefunden: ${historyEntries.length} History-Einträge\n`);

    // 2. Hole Spieler-Informationen
    const playerRef = db.collection(`groups/${groupId}/players`).doc(playerId);
    const playerSnap = await playerRef.get();
    const playerName = playerSnap.exists ? playerSnap.data()?.displayName || 'Unbekannt' : 'Unbekannt';

    console.log(`👤 Spieler: ${playerName} (${playerId})\n`);

    // 3. Erstelle Event-Details Mapping
    const eventDetailsMap = new Map<string, EventDetails>();
    
    // Hole Session-Details
    const sessionsRef = db.collection(`groups/${groupId}/jassGameSummaries`);
    const sessionsSnap = await sessionsRef.get();
    
    sessionsSnap.docs.forEach(doc => {
      const data = doc.data();
      if (data.status === 'completed') {
        const eventDate = data.endedAt?.toDate?.() || data.createdAt?.toDate?.() || new Date();
        eventDetailsMap.set(doc.id, {
          eventId: doc.id,
          eventType: data.tournamentId ? 'tournament_end' : 'session_end',
          eventName: data.tournamentName || `Session ${doc.id.substring(0, 8)}`,
          eventDate: eventDate.toLocaleDateString('de-DE'),
          gamesPlayed: data.gamesPlayed || 0,
          participants: data.participantPlayerIds || []
        });
      }
    });

    // 4. Zeige chronologischen Verlauf
    console.log('📈 CHRONOLOGISCHER VERLAUF DES ELO-RANKINGS:');
    console.log('=' .repeat(80));
    console.log();

    let previousRating = 100; // Start-Rating
    let totalGames = 0;
    let totalWins = 0;
    let totalLosses = 0;
    let totalStriche = 0;
    let totalPoints = 0;

    historyEntries.forEach((entry, index) => {
      const eventDetails = eventDetailsMap.get(entry.eventId);
      const eventName = eventDetails?.eventName || `Event ${entry.eventId.substring(0, 8)}`;
      const eventDate = eventDetails?.eventDate || 'Unbekannt';
      
      const ratingChange = entry.rating - previousRating;
      const ratingChangeStr = ratingChange >= 0 ? `+${ratingChange.toFixed(2)}` : `${ratingChange.toFixed(2)}`;
      
      // Berechne Siegrate
      const winRate = entry.cumulative.wins + entry.cumulative.losses > 0 
        ? (entry.cumulative.wins / (entry.cumulative.wins + entry.cumulative.losses) * 100).toFixed(1)
        : '0.0';

      console.log(`🎯 EVENT ${index + 1}: ${eventName}`);
      console.log(`   📅 Datum: ${eventDate}`);
      console.log(`   🎮 Typ: ${entry.eventType === 'session_end' ? 'Session' : 'Turnier'}`);
      console.log(`   👥 Teilnehmer: ${eventDetails?.participants.length || 'Unbekannt'} Spieler`);
      console.log(`   🎲 Spiele in diesem Event: ${entry.delta.games}`);
      console.log();
      
      console.log(`   📊 ELO-RATING:`);
      console.log(`      Vorher: ${previousRating.toFixed(2)}`);
      console.log(`      Nachher: ${entry.rating.toFixed(2)} (${ratingChangeStr})`);
      console.log(`      Tier: ${entry.tier} ${entry.tierEmoji}`);
      console.log();
      
      console.log(`   🎯 EVENT-STATISTIKEN:`);
      console.log(`      Striche: ${entry.delta.striche >= 0 ? '+' : ''}${entry.delta.striche}`);
      console.log(`      Siege: ${entry.delta.wins}`);
      console.log(`      Niederlagen: ${entry.delta.losses}`);
      console.log(`      Punkte: ${entry.delta.points.toLocaleString()}`);
      console.log(`      Punkte erhalten: ${entry.delta.pointsReceived.toLocaleString()}`);
      console.log(`      Punktedifferenz: ${(entry.delta.points - entry.delta.pointsReceived) >= 0 ? '+' : ''}${(entry.delta.points - entry.delta.pointsReceived).toLocaleString()}`);
      
      // Session-Gewinn/Verlust/Unentschieden (nur für Sessions)
      if (entry.eventType === 'session_end') {
        if (entry.delta.sessionWin) {
          console.log(`      Session: ✅ GEWONNEN`);
        } else if (entry.delta.sessionLoss) {
          console.log(`      Session: ❌ VERLOREN`);
        } else if (entry.delta.sessionDraw) {
          console.log(`      Session: 🤝 UNENTSCHIEDEN`);
        }
      }
      console.log();
      
      console.log(`   📈 KUMULATIVE STATISTIKEN:`);
      console.log(`      Gesamt-Spiele: ${entry.cumulative.wins + entry.cumulative.losses}`);
      console.log(`      Gesamt-Siege: ${entry.cumulative.wins}`);
      console.log(`      Gesamt-Niederlagen: ${entry.cumulative.losses}`);
      console.log(`      Siegrate: ${winRate}%`);
      console.log(`      Gesamt-Striche: ${entry.cumulative.striche >= 0 ? '+' : ''}${entry.cumulative.striche}`);
      console.log(`      Gesamt-Punkte: ${entry.cumulative.points.toLocaleString()}`);
      console.log(`      Gesamt-Punkte erhalten: ${entry.cumulative.pointsReceived.toLocaleString()}`);
      console.log(`      Gesamt-Punktedifferenz: ${(entry.cumulative.points - entry.cumulative.pointsReceived) >= 0 ? '+' : ''}${(entry.cumulative.points - entry.cumulative.pointsReceived).toLocaleString()}`);
      
      // Session-Statistiken (nur Sessions, nicht Turniere)
      const totalSessions = entry.cumulative.sessionWins + entry.cumulative.sessionLosses + entry.cumulative.sessionDraws;
      if (totalSessions > 0) {
        const sessionWinRate = (entry.cumulative.sessionWins / totalSessions * 100).toFixed(1);
        console.log(`      Session-Siegquote: ${sessionWinRate}% (${entry.cumulative.sessionWins}/${totalSessions})`);
        console.log(`      Session-Gewinne: ${entry.cumulative.sessionWins}`);
        console.log(`      Session-Niederlagen: ${entry.cumulative.sessionLosses}`);
        console.log(`      Session-Unentschieden: ${entry.cumulative.sessionDraws}`);
      }
      console.log();
      
      console.log('   ' + '-'.repeat(60));
      console.log();

      previousRating = entry.rating;
      totalGames = entry.cumulative.wins + entry.cumulative.losses;
      totalWins = entry.cumulative.wins;
      totalLosses = entry.cumulative.losses;
      totalStriche = entry.cumulative.striche;
      totalPoints = entry.cumulative.points;
    });

    // 5. Zusammenfassung
    console.log('📊 ZUSAMMENFASSUNG:');
    console.log('=' .repeat(50));
    console.log(`👤 Spieler: ${playerName}`);
    console.log(`🎯 Start-Rating: 100.00`);
    console.log(`🎯 End-Rating: ${previousRating.toFixed(2)} (${(previousRating - 100).toFixed(2)})`);
    console.log(`🏆 Aktueller Tier: ${historyEntries[historyEntries.length - 1]?.tier} ${historyEntries[historyEntries.length - 1]?.tierEmoji}`);
    console.log();
    console.log(`🎮 Gesamt-Spiele: ${totalGames}`);
    console.log(`✅ Gesamt-Siege: ${totalWins}`);
    console.log(`❌ Gesamt-Niederlagen: ${totalLosses}`);
    console.log(`📊 Siegrate: ${totalGames > 0 ? (totalWins / totalGames * 100).toFixed(1) : '0.0'}%`);
    console.log(`🎯 Gesamt-Striche: ${totalStriche >= 0 ? '+' : ''}${totalStriche}`);
    console.log(`💰 Gesamt-Punkte: ${totalPoints.toLocaleString()}`);
    
    // Zusätzliche Statistiken aus dem letzten Eintrag
    const lastEntry = historyEntries[historyEntries.length - 1];
    if (lastEntry) {
      console.log(`💰 Gesamt-Punkte erhalten: ${lastEntry.cumulative.pointsReceived.toLocaleString()}`);
      console.log(`💰 Gesamt-Punktedifferenz: ${(lastEntry.cumulative.points - lastEntry.cumulative.pointsReceived) >= 0 ? '+' : ''}${(lastEntry.cumulative.points - lastEntry.cumulative.pointsReceived).toLocaleString()}`);
      
      // Session-Statistiken
      const totalSessions = lastEntry.cumulative.sessionWins + lastEntry.cumulative.sessionLosses + lastEntry.cumulative.sessionDraws;
      if (totalSessions > 0) {
        const sessionWinRate = (lastEntry.cumulative.sessionWins / totalSessions * 100).toFixed(1);
        console.log(`🏆 Session-Siegquote: ${sessionWinRate}% (${lastEntry.cumulative.sessionWins}/${totalSessions})`);
        console.log(`✅ Session-Gewinne: ${lastEntry.cumulative.sessionWins}`);
        console.log(`❌ Session-Niederlagen: ${lastEntry.cumulative.sessionLosses}`);
        console.log(`🤝 Session-Unentschieden: ${lastEntry.cumulative.sessionDraws}`);
      }
    }
    
    console.log();
    console.log(`📅 Events analysiert: ${historyEntries.length}`);
    console.log(`📈 Rating-Änderung: ${(previousRating - 100).toFixed(2)} Punkte`);

  } catch (error) {
    console.error('❌ Fehler beim Analysieren der Spieler-Historie:', error);
  }
}

// Command line interface
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('📋 Verwendung:');
    console.log('  npm run analyze-player-history -- --groupId=<groupId> --playerId=<playerId>');
    console.log();
    console.log('📝 Beispiel:');
    console.log('  npm run analyze-player-history -- --groupId=BhEdUmwb7tb4ka8BLUfM --playerId=4ixOg5n0DcQmg028WPtvF');
    process.exit(1);
  }

  let groupId = '';
  let playerId = '';

  args.forEach(arg => {
    if (arg.startsWith('--groupId=')) {
      groupId = arg.split('=')[1];
    } else if (arg.startsWith('--playerId=')) {
      playerId = arg.split('=')[1];
    }
  });

  if (!groupId || !playerId) {
    console.log('❌ Fehler: groupId und playerId sind erforderlich');
    process.exit(1);
  }

  await analyzePlayerChronologicalHistory(groupId, playerId);
  process.exit(0);
}

if (require.main === module) {
  main().catch(console.error);
}

export { analyzePlayerChronologicalHistory };
