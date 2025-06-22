#!/usr/bin/env node

/**
 * Migration Script V3: EventCounts und top/bottom Umstellung
 * 
 * Dieses Skript:
 * 1. Migriert alle sessionTeams von teamA/teamB zu top/bottom
 * 2. Migriert alle pairingIdentifiers von teamA/teamB zu top/bottom  
 * 3. Fügt eventCounts zu allen completedGames hinzu
 * 4. Aggregiert eventCounts auf Session-Ebene in jassGameSummaries
 * 
 * Verwendung: npx ts-node scripts/migration-eventcounts-v3.ts
 */

import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

// Firebase Admin initialisieren
if (!admin.apps.length) {
  const serviceAccountPath = path.resolve(__dirname, '../service-account-key.json');
  
  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id
    });
  } else {
    // Fallback für Umgebungsvariablen
    admin.initializeApp();
  }
}

const db = admin.firestore();
const JASS_SUMMARIES_COLLECTION = 'jassGameSummaries';
const COMPLETED_GAMES_SUBCOLLECTION = 'completedGames';

// === INTERFACES ===

interface EventCountRecord {
  sieg: number;
  berg: number;
  matsch: number;
  kontermatsch: number;
  schneider: number;
}

interface EventCounts {
  bottom: EventCountRecord;
  top: EventCountRecord;
}

interface StricheRecord {
  berg: number;
  sieg: number;
  matsch: number;
  schneider: number;
  kontermatsch: number;
}

interface TeamScores {
  top: number;
  bottom: number;
}

// === HILFSFUNKTIONEN ===

/**
 * Berechnet eventCounts aus finalStriche und finalScores (identisch zur Client-Version)
 */
function calculateEventCounts(
  finalStriche: { top: StricheRecord; bottom: StricheRecord },
  finalScores: TeamScores,
  roundHistory: any[] | undefined
): EventCounts {
  const bottomEvents: EventCountRecord = {
    sieg: 0,
    berg: 0,
    matsch: 0,
    kontermatsch: 0,
    schneider: 0
  };
  
  const topEvents: EventCountRecord = {
    sieg: 0,
    berg: 0,
    matsch: 0,
    kontermatsch: 0,
    schneider: 0
  };

  // 1. Zähle Matsch/Kontermatsch Events direkt aus der roundHistory
  if (roundHistory && Array.isArray(roundHistory)) {
    roundHistory.forEach(round => {
      if (round.strichInfo && round.strichInfo.type) {
        const teamKey = round.strichInfo.team as 'top' | 'bottom' | undefined;
        if (!teamKey) return;

        if (round.strichInfo.type === 'matsch') {
          if (teamKey === 'bottom') bottomEvents.matsch++;
          else if (teamKey === 'top') topEvents.matsch++;
        } else if (round.strichInfo.type === 'kontermatsch') {
          if (teamKey === 'bottom') bottomEvents.kontermatsch++;
          else if (teamKey === 'top') topEvents.kontermatsch++;
        }
      }
    });
  }

  // 2. SIEG: Wird aus finalStriche gelesen. Nur ein Team kann sich bedanken.
  if (finalStriche.bottom.sieg > 0) {
    bottomEvents.sieg = 1;
  } else if (finalStriche.top.sieg > 0) {
    topEvents.sieg = 1;
  }

  // 3. BERG: Wird aus finalStriche gelesen. Nur ein Team kann Berg ansagen.
  if (finalStriche.bottom.berg > 0) {
    bottomEvents.berg = 1; // Ein Berg-Event pro Spiel
  } else if (finalStriche.top.berg > 0) {
    topEvents.berg = 1; // Ein Berg-Event pro Spiel
  }

  // 4. SCHNEIDER: Nur das Team, das den SIEG-Event hat, kann Schneider haben,
  // wenn der Gegner unter der Schwelle liegt.
  const SCHNEIDER_THRESHOLD = 1000;
  
  if (bottomEvents.sieg > 0 && finalScores.top < SCHNEIDER_THRESHOLD) {
    bottomEvents.schneider = 1;
  } else if (topEvents.sieg > 0 && finalScores.bottom < SCHNEIDER_THRESHOLD) {
    topEvents.schneider = 1;
  }

  return {
    bottom: bottomEvents,
    top: topEvents
  };
}

/**
 * Aggregiert eventCounts von mehreren Spielen
 */
function aggregateEventCounts(allGameEventCounts: EventCounts[]): EventCounts {
  const aggregated: EventCounts = {
    bottom: { sieg: 0, berg: 0, matsch: 0, kontermatsch: 0, schneider: 0 },
    top: { sieg: 0, berg: 0, matsch: 0, kontermatsch: 0, schneider: 0 }
  };

  allGameEventCounts.forEach(gameEvents => {
    Object.keys(aggregated.bottom).forEach(key => {
      const K = key as keyof EventCountRecord;
      aggregated.bottom[K] += gameEvents.bottom[K];
      aggregated.top[K] += gameEvents.top[K];
    });
  });

  return aggregated;
}

/**
 * Konvertiert teamA/teamB Struktur zu top/bottom
 */
function convertTeamsStructure(teams: any): any {
  if (!teams) return teams;
  
  const result: any = {};
  
  if (teams.teamA) {
    result.bottom = teams.teamA; // teamA war normalerweise bottom
  }
  
  if (teams.teamB) {
    result.top = teams.teamB; // teamB war normalerweise top
  }
  
  return result;
}

/**
 * Konvertiert pairingIdentifiers von teamA/teamB zu top/bottom
 */
function convertPairingIdentifiers(pairingIdentifiers: any): any {
  if (!pairingIdentifiers) return pairingIdentifiers;
  
  const result: any = {};
  
  if (pairingIdentifiers.teamA) {
    result.bottom = pairingIdentifiers.teamA;
  }
  
  if (pairingIdentifiers.teamB) {
    result.top = pairingIdentifiers.teamB;
  }
  
  return result;
}

// === HAUPTFUNKTIONEN ===

/**
 * Migriert ein einzelnes completedGame
 */
async function migrateCompletedGame(sessionDocRef: FirebaseFirestore.DocumentReference, gameNumber: string, gameData: any): Promise<{ success: boolean; eventCounts?: EventCounts; error?: string }> {
  try {
    console.log(`    Migriere Spiel ${gameNumber}...`);
    
    // eventCounts berechnen
    if (!gameData.finalStriche || !gameData.finalScores) {
      return { success: false, error: `Spiel ${gameNumber} fehlen finalStriche oder finalScores` };
    }
    
    const eventCounts = calculateEventCounts(gameData.finalStriche, gameData.finalScores, gameData.roundHistory);
    
    // Spiel aktualisieren
    const gameDocRef = sessionDocRef.collection(COMPLETED_GAMES_SUBCOLLECTION).doc(gameNumber);
    await gameDocRef.update({
      eventCounts: eventCounts
    });
    
    console.log(`    ✅ Spiel ${gameNumber} erfolgreich migriert`);
    return { success: true, eventCounts };
    
  } catch (error) {
    console.error(`    ❌ Fehler beim Migrieren von Spiel ${gameNumber}:`, error);
    return { success: false, error: String(error) };
  }
}

/**
 * Migriert eine einzelne Jass-Session
 */
async function migrateSession(sessionId: string): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`\n🔎 Migriere Session: ${sessionId}`);
    
    const sessionDocRef = db.collection(JASS_SUMMARIES_COLLECTION).doc(sessionId);
    const sessionDoc = await sessionDocRef.get();

    if (!sessionDoc.exists) {
      return { success: false, error: 'Session nicht gefunden' };
    }

    const sessionData = sessionDoc.data() as any;
    const updates: { [key: string]: any } = {};
    let needsUpdate = false;

    // 1. Teams-Struktur migrieren (falls noch im alten Format)
    if (sessionData.teams && (sessionData.teams.teamA || sessionData.teams.teamB)) {
      console.log('  -> Konvertiere teams-Struktur...');
      updates.teams = convertTeamsStructure(sessionData.teams);
      needsUpdate = true;
    }

    // 2. pairingIdentifiers migrieren (falls noch im alten Format)
    if (sessionData.pairingIdentifiers && (sessionData.pairingIdentifiers.teamA || sessionData.pairingIdentifiers.teamB)) {
      console.log('  -> Konvertiere pairingIdentifiers-Struktur...');
      updates.pairingIdentifiers = convertPairingIdentifiers(sessionData.pairingIdentifiers);
      needsUpdate = true;
    }

    // 3. teamScoreMapping migrieren (falls vorhanden)
    if (sessionData.teamScoreMapping) {
      updates.teamScoreMapping = admin.firestore.FieldValue.delete();
      needsUpdate = true;
    }
    
    // 4. Veraltete Felder entfernen
    if (sessionData.playerUids) {
        updates.playerUids = admin.firestore.FieldValue.delete();
        needsUpdate = true;
    }

    // 5. CompletedGames laden und migrieren
    const gamesPlayed = sessionData.gamesPlayed || 0;
    const allGameEventCounts: EventCounts[] = [];
    let gamesMigrated = 0;
    let gamesError = 0;
    
    console.log(`  🎮 Migriere ${gamesPlayed} Spiele...`);
    
    for (let gameNumber = 1; gameNumber <= gamesPlayed; gameNumber++) {
      try {
        const gameDoc = await sessionDocRef.collection(COMPLETED_GAMES_SUBCOLLECTION).doc(gameNumber.toString()).get();
        
        if (gameDoc.exists) {
          const result = await migrateCompletedGame(sessionDocRef, gameNumber.toString(), gameDoc.data());
          
          if (result.success && result.eventCounts) {
            allGameEventCounts.push(result.eventCounts);
            gamesMigrated++;
          } else {
            gamesError++;
            console.warn(`    ⚠️ Spiel ${gameNumber} konnte nicht migriert werden: ${result.error}`);
          }
        } else {
          console.warn(`    ⚠️ Spiel ${gameNumber} nicht gefunden`);
          gamesError++;
        }
      } catch (error) {
        console.error(`    ❌ Fehler beim Laden von Spiel ${gameNumber}:`, error);
        gamesError++;
      }
    }
    
    // 6. Session-Level eventCounts aggregieren
    if (allGameEventCounts.length > 0) {
      console.log(`  📊 Aggregiere eventCounts für Session...`);
      updates.eventCounts = aggregateEventCounts(allGameEventCounts);
      needsUpdate = true;
    }
    
    // 7. Migration-Metadaten hinzufügen
    updates.migratedToEventCountsAt = admin.firestore.Timestamp.now();
    updates.migratedToEventCountsBy = 'migration-eventcounts-v3-script-targeted';
    needsUpdate = true;
    
    // 8. Session-Dokument aktualisieren
    if (needsUpdate) {
      await sessionDocRef.update(updates);
      console.log(`  ✅ Session ${sessionId} erfolgreich migriert`);
      console.log(`     - Spiele migriert: ${gamesMigrated}/${gamesPlayed}`);
      console.log(`     - Spiele mit Fehlern: ${gamesError}`);
    } else {
      console.log(`  ℹ️ Session ${sessionId} benötigt keine Migration`);
    }
    
    return { success: true };
    
  } catch (error) {
    console.error(`❌ Fehler beim Migrieren von Session ${sessionId}:`, error);
    return { success: false, error: String(error) };
  }
}

/**
 * Hauptmigrationsfunktion
 */
async function runMigration(): Promise<void> {
  const targetSessionId = 'ug4T8neILrk9G-eyypiwR'; // <-- HIER DIE ZIEL-SESSION EINGEBEN
  console.log(`🚀 Starte EventCounts Migration für spezifische Session: ${targetSessionId}...\\n`);

  try {
    const result = await migrateSession(targetSessionId);

    if (result.success) {
      console.log(`\\n🎉 Migration für Session ${targetSessionId} erfolgreich abgeschlossen!`);
    } else {
      console.log(`\\n❌ Migration für Session ${targetSessionId} fehlgeschlagen.`);
      if (result.error) {
        console.error('Fehler:', result.error);
      }
    }
  } catch (error) {
    console.error(`💥 Kritischer Fehler während der Migration von Session ${targetSessionId}:`, error);
    process.exit(1);
  }
}

// === SCRIPT AUSFÜHRUNG ===

if (require.main === module) {
  runMigration()
    .then(() => {
      console.log('\\n✨ Migration erfolgreich abgeschlossen!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\\n💥 Migration fehlgeschlagen:', error);
      process.exit(1);
    });
}
 