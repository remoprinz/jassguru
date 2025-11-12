import * as admin from 'firebase-admin';
import { google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';

// Initialisiere Firebase Admin
if (!admin.apps.length) {
  const serviceAccountPath = path.join(__dirname, '../../serviceAccountKey.json');
  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error(`Service Account Key nicht gefunden: ${serviceAccountPath}`);
  }
  
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccountPath as any),
  });
}

const db = admin.firestore();
const SPREADSHEET_ID = "1wffL-mZRMVoXjVL3WPMiRJ_AsC5ALZXn1Jx6GYxKqKA";
const SHEET_NAME = "Rohdaten";
const TARGET_GROUP_ID = "Tz0wgIHMTlhvTtFastiJ";

interface JassGameSummary {
  id: string;
  groupId: string;
  startedAt: admin.firestore.Timestamp;
  playerNames: { [key: string]: string };
  participantUids?: string[];
  participantPlayerIds?: string[];
  Rosen10player?: string | null;
  teams: {
    top: { players: { displayName: string; playerId?: string }[] };
    bottom: { players: { displayName: string; playerId?: string }[] };
  };
  finalStriche: {
    top: { sieg: number };
    bottom: { sieg: number };
  };
  winnerTeamKey: 'top' | 'bottom';
  status: string;
}

interface CompletedGame {
  gameNumber: number;
  initialStartingPlayer?: number; // ✅ PlayerNumber (1-4)
  playerNames?: { [key: number]: string }; // ✅ PlayerNames zur Namens-Zuordnung
  finalStriche?: {
    top?: { berg?: number; sieg?: number; matsch?: number; schneider?: number; kontermatsch?: number };
    bottom?: { berg?: number; sieg?: number; matsch?: number; schneider?: number; kontermatsch?: number };
  };
}

/**
 * Finde die letzte Session vom 30. Oktober (2024 oder 2025)
 */
async function findSessionFromOctober30() {
  console.log('🔍 Suche nach Sessions vom 30. Oktober...\n');
  
  const groupRef = db.collection(`groups/${TARGET_GROUP_ID}/jassGameSummaries`);
  // ⚠️ OHNE where + orderBy, da Index fehlt - lade alle und filtere clientseitig
  const sessionsSnap = await groupRef.get();
  
  if (sessionsSnap.empty) {
    console.log('❌ Keine Sessions gefunden!');
    return null;
  }
  
  // Suche nach Session vom 30. Oktober 2024 oder 2025
  const targetDate2024 = new Date('2024-10-30');
  const targetDate2025 = new Date('2025-10-30');
  
  const targetDates = [
    {
      year: 2024,
      start: new Date(targetDate2024.getFullYear(), targetDate2024.getMonth(), targetDate2024.getDate()),
      end: new Date(targetDate2024.getFullYear(), targetDate2024.getMonth(), targetDate2024.getDate() + 1)
    },
    {
      year: 2025,
      start: new Date(targetDate2025.getFullYear(), targetDate2025.getMonth(), targetDate2025.getDate()),
      end: new Date(targetDate2025.getFullYear(), targetDate2025.getMonth(), targetDate2025.getDate() + 1)
    }
  ];
  
  console.log(`📅 Suche zwischen ${targetDates[0].start.toISOString()} und ${targetDates[1].end.toISOString()}\n`);
  
  // Filtere clientseitig: Nur completed Sessions vom 30. Oktober
  const allSessions = sessionsSnap.docs
    .map(doc => {
      const data = doc.data();
      const startedAt = data.startedAt;
      
      if (!startedAt || data.status !== 'completed') return null;
      
      let sessionDate: Date;
      if (typeof startedAt.toDate === 'function') {
        sessionDate = startedAt.toDate();
      } else if (startedAt.seconds) {
        sessionDate = new Date(startedAt.seconds * 1000);
      } else {
        return null;
      }
      
      return {
        id: doc.id,
        data: { ...data, id: doc.id },
        date: sessionDate
      };
    })
    .filter((s): s is { id: string; data: any; date: Date } => s !== null)
    .filter(s => {
      // Prüfe ob Session am 30. Oktober (egal welches Jahr)
      const month = s.date.getMonth();
      const day = s.date.getDate();
      return month === 9 && day === 30; // Oktober = Monat 9 (0-indexed)
    })
    .sort((a, b) => b.date.getTime() - a.date.getTime()); // Neueste zuerst
  
  let foundSession: { id: string; data: any } | null = null;
  
  if (allSessions.length > 0) {
    // Neueste Session vom 30. Oktober
    const latest = allSessions[0];
    foundSession = {
      id: latest.id,
      data: latest.data
    };
    console.log(`✅ Session gefunden:`);
    console.log(`   ID: ${latest.id}`);
    console.log(`   Datum: ${latest.date.toLocaleString('de-CH')}`);
    console.log(`   Spiele: ${latest.data.gamesPlayed || 0}`);
    console.log(`   Status: ${latest.data.status}`);
  }
  
  if (!foundSession) {
    console.log('❌ Keine Session vom 30. Oktober 2024 gefunden!');
    console.log('\nVerfügbare Sessions (neueste 10):');
    sessionsSnap.docs.slice(0, 10).forEach((doc, idx) => {
      const data = doc.data();
      const startedAt = data.startedAt;
      if (startedAt && typeof startedAt.toDate === 'function') {
        const date = startedAt.toDate();
        console.log(`   ${idx + 1}. ${doc.id} - ${date.toLocaleDateString('de-CH')} ${date.toLocaleTimeString('de-CH')}`);
      }
    });
    return null;
  }
  
  return foundSession;
}

/**
 * Testet den Spreadsheet-Export für eine Session
 */
async function testSpreadsheetExport(session: { id: string; data: any }) {
  console.log('\n🧪 Teste Spreadsheet-Export...\n');
  
  try {
    // 1. Lade completedGames
    const completedGamesSnapshot = await db
      .collection(`groups/${TARGET_GROUP_ID}/jassGameSummaries/${session.id}/completedGames`)
      .orderBy('gameNumber')
      .get();
    
    if (completedGamesSnapshot.empty) {
      console.log('❌ Keine abgeschlossenen Spiele gefunden!');
      return;
    }
    
    console.log(`✅ ${completedGamesSnapshot.size} abgeschlossene Spiele gefunden\n`);
    
    // 2. Bereite Daten vor (wie im echten Code)
    const sessionData = session.data as JassGameSummary;
    
    const team1Player1 = sessionData.teams.bottom.players[0]?.displayName || "Unbekannt";
    const team1Player2 = sessionData.teams.bottom.players[1]?.displayName || "Unbekannt";
    const team2Player1 = sessionData.teams.top.players[0]?.displayName || "Unbekannt";
    const team2Player2 = sessionData.teams.top.players[1]?.displayName || "Unbekannt";
    
    console.log('👥 Teams:');
    console.log(`   Team 1: ${team1Player1} & ${team1Player2}`);
    console.log(`   Team 2: ${team2Player1} & ${team2Player2}\n`);
    
    // 3. Rosen10-Name ermitteln aus initialStartingPlayer des ersten Spiels
    // PlayerNumber-Mapping: 1 = bottom[0], 2 = top[0], 3 = bottom[1], 4 = top[1]
    const playerNumberToName: { [key: number]: string } = {
      1: team1Player1,  // bottom.players[0]
      2: team2Player1,  // top.players[0]
      3: team1Player2,  // bottom.players[1]
      4: team2Player2,  // top.players[1]
    };

    let rosen10Name = "";
    const firstGameDoc = completedGamesSnapshot.docs.find(doc => {
      const g = doc.data() as CompletedGame;
      return g.gameNumber === 1;
    });
    
    if (firstGameDoc) {
      const firstGame = firstGameDoc.data() as CompletedGame;
      if (firstGame.initialStartingPlayer) {
        rosen10Name = firstGame.playerNames?.[firstGame.initialStartingPlayer] 
          || sessionData.playerNames?.[firstGame.initialStartingPlayer]
          || playerNumberToName[firstGame.initialStartingPlayer]
          || "";
        console.log(`🌹 Rosen10: ${rosen10Name || 'NICHT GEFUNDEN'} (PlayerNumber: ${firstGame.initialStartingPlayer})\n`);
      } else {
        console.log('⚠️  initialStartingPlayer fehlt im ersten Spiel!\n');
      }
    } else {
      console.log('⚠️  Erstes Spiel nicht gefunden!\n');
    }
    
    // 4. Bereite Zeilen vor
    const rowsToAppend: (string | number)[][] = [];
    
    for (const gameDoc of completedGamesSnapshot.docs) {
      const game = gameDoc.data() as CompletedGame;
      const datum = sessionData.startedAt 
        ? new Date(sessionData.startedAt.seconds * 1000).toLocaleDateString("de-CH") 
        : "";
      const spielNr = game.gameNumber || "";
      const rosen10 = game.gameNumber === 1 ? rosen10Name : "";
      
      const stricheBottom = game.finalStriche?.bottom || {};
      const stricheTop = game.finalStriche?.top || {};
      const siegBottom = stricheBottom.sieg || 0;
      const siegTop = stricheTop.sieg || 0;
      
      let berg: number | string = ""; 
      if ((stricheBottom.berg || 0) > 0) berg = 1; 
      else if ((stricheTop.berg || 0) > 0) berg = 2;
      
      let sieg: number | string = ""; 
      if (siegBottom > 0) sieg = 1; 
      else if (siegTop > 0) sieg = 2;
      
      let schneider: number | string = "";
      if ((stricheBottom.schneider || 0) + (stricheTop.schneider || 0) > 0) {
        if (siegBottom > siegTop) schneider = 1; 
        else if (siegTop > siegBottom) schneider = 2;
      }
      
      const t1Matsch = stricheBottom.matsch ?? "";
      const t2Matsch = stricheTop.matsch ?? "";
      const t1Kontermatsch = (stricheBottom.kontermatsch || 0) > 0 ? 1 : "";
      const t2Kontermatsch = (stricheTop.kontermatsch || 0) > 0 ? 1 : "";
      
      rowsToAppend.push([
        datum, spielNr, rosen10,
        team1Player1, team1Player2, team2Player1, team2Player2,
        berg, sieg, t1Matsch, t2Matsch, schneider,
        t1Kontermatsch, t2Kontermatsch,
      ]);
      
      console.log(`📊 Spiel ${spielNr}: Berg=${berg}, Sieg=${sieg}, Schneider=${schneider}, Matsch T1=${t1Matsch}, Matsch T2=${t2Matsch}`);
    }
    
    console.log(`\n✅ ${rowsToAppend.length} Zeilen vorbereitet\n`);
    
    // 5. Prüfe ob Service Account vorhanden
    const serviceAccountPath = path.join(__dirname, '../../serviceAccountKey.json');
    if (!fs.existsSync(serviceAccountPath)) {
      console.log('❌ Service Account Key nicht gefunden - kann nicht in Google Sheets schreiben');
      console.log('   Aber die Daten sind korrekt vorbereitet!');
      return;
    }
    
    // 6. Exportiere zu Google Sheets
    console.log('📤 Exportiere zu Google Sheets...\n');
    
    const auth = new google.auth.GoogleAuth({
      keyFile: serviceAccountPath,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const sheets = google.sheets({ version: "v4", auth });
    
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: rowsToAppend },
    });
    
    console.log(`✅ Erfolgreich ${rowsToAppend.length} Spiele exportiert!`);
    console.log(`   Spreadsheet: https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}`);
    
  } catch (error: any) {
    console.error('❌ Fehler beim Export:', error);
    console.error('   Fehler-Details:', error.message);
    if (error.response) {
      console.error('   API Response:', error.response.data);
    }
    throw error;
  }
}

/**
 * Hauptfunktion
 */
async function main() {
  try {
    const session = await findSessionFromOctober30();
    
    if (!session) {
      console.log('\n❌ Keine Session zum Testen gefunden');
      process.exit(1);
    }
    
    await testSpreadsheetExport(session);
    
    console.log('\n✅ Test erfolgreich abgeschlossen!');
    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ FEHLER:', error);
    process.exit(1);
  }
}

// Script ausführen
main();

