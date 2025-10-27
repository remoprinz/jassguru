/**
 * TEAM DOCUMENTS MANAGER
 * ======================
 * 
 * Diese Utility verwaltet Team-Dokumente in der Datenbank.
 * 
 * ✅ ZIEL:
 * - Team-Dokumente erstellen und verwalten
 * - Konsistente Team-Identifikation
 * - Session-basierte Team-Tracking
 * 
 * 🎯 DATENSTRUKTUR:
 * groups/{groupId}/teams/{teamKey}
 * 
 * Beispiel:
 * groups/Tz0wgIHMTlhvTtFastiJ/teams/playerA_playerB
 */

import * as admin from 'firebase-admin';
import { TeamInfo, MemberData, createTeamInfo } from '../utils/teamMatcher';

// Firebase Admin initialisieren
const serviceAccount = require('../../../serviceAccountKey.json') as admin.ServiceAccount;
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://jassguru.firebaseio.com'
});

const db = admin.firestore();

// ===== INTERFACES =====

export interface TeamDocument {
  teamKey: string;           // "playerA_playerB" (alphabetisch sortiert)
  playerIds: string[];       // ["playerA", "playerB"] (alphabetisch sortiert)
  displayNames: string[];    // ["Max", "Maria"] (entsprechend playerIds)
  displayName: string;       // "Max & Maria"
  
  // Session-Tracking
  firstSeen: admin.firestore.Timestamp;  // Erste gemeinsame Session
  lastSeen: admin.firestore.Timestamp;   // Letzte gemeinsame Session
  totalSessions: number;                 // Anzahl gemeinsamer Sessions
  
  // Statistiken (optional, für spätere Verwendung)
  totalGames?: number;       // Gesamtanzahl Spiele
  totalWins?: number;        // Gesamtanzahl Siege
  totalLosses?: number;      // Gesamtanzahl Niederlagen
  
  // Metadata
  createdAt: admin.firestore.Timestamp;
  lastUpdated: admin.firestore.Timestamp;
}

export interface SessionTeamData {
  sessionId: string;
  teams: {
    top: { players: { playerId: string; displayName: string; }[]; };
    bottom: { players: { playerId: string; displayName: string; }[]; };
  };
  completedAt: admin.firestore.Timestamp;
}

// ===== HAUPTFUNKTIONEN =====

/**
 * 🎯 TEAM-DOKUMENT ERSTELLEN ODER AKTUALISIEREN
 * 
 * @param groupId Gruppen-ID
 * @param playerIds Array von Player-IDs (beliebige Reihenfolge)
 * @param members Map mit Member-Daten
 * @param sessionId Session-ID für Tracking
 * @param sessionTimestamp Timestamp der Session
 * @returns Team-Dokument
 */
async function createOrUpdateTeamDocument(
  groupId: string,
  playerIds: string[],
  members: Map<string, MemberData>,
  sessionId: string,
  sessionTimestamp: admin.firestore.Timestamp
): Promise<TeamDocument> {
  if (!Array.isArray(playerIds) || playerIds.length !== 2) {
    throw new Error('Team muss genau 2 Spieler haben');
  }
  
  // Team-Info erstellen
  const teamInfo = createTeamInfo(playerIds, members);
  const teamKey = teamInfo.teamKey;
  
  // Team-Dokument Referenz
  const teamRef = db.doc(`groups/${groupId}/teams/${teamKey}`);
  
  // Prüfe ob Team bereits existiert
  const teamSnap = await teamRef.get();
  
  if (teamSnap.exists) {
    // Team existiert - aktualisiere
    const existingTeam = teamSnap.data() as TeamDocument;
    
    const updatedTeam: TeamDocument = {
      ...existingTeam,
      lastSeen: sessionTimestamp,
      totalSessions: existingTeam.totalSessions + 1,
      lastUpdated: admin.firestore.Timestamp.now()
    };
    
    await teamRef.set(updatedTeam);
    console.log(`✅ Team ${teamKey} aktualisiert (${updatedTeam.totalSessions} Sessions)`);
    
    return updatedTeam;
  } else {
    // Team existiert nicht - erstelle neu
    const newTeam: TeamDocument = {
      teamKey: teamInfo.teamKey,
      playerIds: teamInfo.playerIds,
      displayNames: teamInfo.displayNames,
      displayName: teamInfo.displayName,
      
      // Session-Tracking
      firstSeen: sessionTimestamp,
      lastSeen: sessionTimestamp,
      totalSessions: 1,
      
      // Statistiken (initial)
      totalGames: 0,
      totalWins: 0,
      totalLosses: 0,
      
      // Metadata
      createdAt: admin.firestore.Timestamp.now(),
      lastUpdated: admin.firestore.Timestamp.now()
    };
    
    await teamRef.set(newTeam);
    console.log(`✅ Neues Team ${teamKey} erstellt: ${newTeam.displayName}`);
    
    return newTeam;
  }
}

/**
 * 🎯 ALLE TEAMS EINER GRUPPE LADEN
 * 
 * @param groupId Gruppen-ID
 * @returns Array von Team-Dokumenten
 */
async function getAllTeamsForGroup(groupId: string): Promise<TeamDocument[]> {
  const teamsRef = db.collection(`groups/${groupId}/teams`);
  const teamsSnap = await teamsRef.get();
  
  const teams: TeamDocument[] = [];
  teamsSnap.forEach(doc => {
    teams.push(doc.data() as TeamDocument);
  });
  
  return teams;
}

/**
 * 🎯 TEAM-DOKUMENT LADEN
 * 
 * @param groupId Gruppen-ID
 * @param teamKey Team-Key
 * @returns Team-Dokument oder null
 */
async function getTeamDocument(
  groupId: string, 
  teamKey: string
): Promise<TeamDocument | null> {
  const teamRef = db.doc(`groups/${groupId}/teams/${teamKey}`);
  const teamSnap = await teamRef.get();
  
  if (!teamSnap.exists) {
    return null;
  }
  
  return teamSnap.data() as TeamDocument;
}

/**
 * 🎯 TEAMS AUS SESSION-DATEN EXTRAHIEREN
 * 
 * @param sessionData Session-Daten
 * @returns Array von Team-Info Objekten
 */
function extractTeamsFromSession(sessionData: SessionTeamData): TeamInfo[] {
  const teams: TeamInfo[] = [];
  
  // Top Team
  if (sessionData.teams.top?.players?.length === 2) {
    const topPlayerIds = sessionData.teams.top.players.map(p => p.playerId);
    const topMembers = new Map<string, MemberData>();
    
    sessionData.teams.top.players.forEach(player => {
      topMembers.set(player.playerId, { displayName: player.displayName });
    });
    
    teams.push(createTeamInfo(topPlayerIds, topMembers));
  }
  
  // Bottom Team
  if (sessionData.teams.bottom?.players?.length === 2) {
    const bottomPlayerIds = sessionData.teams.bottom.players.map(p => p.playerId);
    const bottomMembers = new Map<string, MemberData>();
    
    sessionData.teams.bottom.players.forEach(player => {
      bottomMembers.set(player.playerId, { displayName: player.displayName });
    });
    
    teams.push(createTeamInfo(bottomPlayerIds, bottomMembers));
  }
  
  return teams;
}

/**
 * 🎯 TEAM-DOKUMENTE FÜR SESSION AKTUALISIEREN
 * 
 * @param groupId Gruppen-ID
 * @param sessionData Session-Daten
 * @param members Map mit Member-Daten
 */
async function updateTeamDocumentsForSession(
  groupId: string,
  sessionData: SessionTeamData,
  members: Map<string, MemberData>
): Promise<void> {
  console.log(`🔄 Aktualisiere Team-Dokumente für Session ${sessionData.sessionId}`);
  
  // Teams aus Session extrahieren
  const teams = extractTeamsFromSession(sessionData);
  
  // Für jedes Team: Dokument erstellen oder aktualisieren
  for (const teamInfo of teams) {
    await createOrUpdateTeamDocument(
      groupId,
      teamInfo.playerIds,
      members,
      sessionData.sessionId,
      sessionData.completedAt
    );
  }
  
  console.log(`✅ ${teams.length} Team-Dokumente aktualisiert`);
}

// ===== TEST-FUNKTIONEN =====

/**
 * 🧪 TEST-FUNKTION: Team-Dokumente Manager
 */
async function testTeamDocumentsManager(): Promise<void> {
  console.log('🧪 Testing Team Documents Manager...');
  
  // Test-Daten
  const testGroupId = 'test-group-id';
  const members = new Map<string, MemberData>([
    ['playerA', { displayName: 'Max' }],
    ['playerB', { displayName: 'Maria' }],
    ['playerC', { displayName: 'Tom' }],
    ['playerD', { displayName: 'Anna' }]
  ]);
  
  const sessionData: SessionTeamData = {
    sessionId: 'test-session-1',
    teams: {
      top: {
        players: [
          { playerId: 'playerA', displayName: 'Max' },
          { playerId: 'playerB', displayName: 'Maria' }
        ]
      },
      bottom: {
        players: [
          { playerId: 'playerC', displayName: 'Tom' },
          { playerId: 'playerD', displayName: 'Anna' }
        ]
      }
    },
    completedAt: admin.firestore.Timestamp.now()
  };
  
  try {
    // Test 1: Team-Dokumente erstellen
    console.log('📝 Test 1: Team-Dokumente erstellen...');
    await updateTeamDocumentsForSession(testGroupId, sessionData, members);
    
    // Test 2: Teams laden
    console.log('📖 Test 2: Teams laden...');
    const teams = await getAllTeamsForGroup(testGroupId);
    console.log(`✅ Gefunden: ${teams.length} Teams`);
    
    teams.forEach(team => {
      console.log(`   - ${team.displayName} (${team.teamKey}): ${team.totalSessions} Sessions`);
    });
    
    // Test 3: Einzelnes Team laden
    console.log('🔍 Test 3: Einzelnes Team laden...');
    const teamKey = 'playerA_playerB';
    const team = await getTeamDocument(testGroupId, teamKey);
    
    if (team) {
      console.log(`✅ Team geladen: ${team.displayName}`);
    } else {
      console.log(`❌ Team nicht gefunden: ${teamKey}`);
    }
    
    console.log('🎉 Team Documents Manager Tests abgeschlossen!');
  } catch (error) {
    console.error('❌ Test fehlgeschlagen:', error);
    throw error;
  }
}

// ===== EXPORTS =====

export {
  createOrUpdateTeamDocument,
  getAllTeamsForGroup,
  getTeamDocument,
  extractTeamsFromSession,
  updateTeamDocumentsForSession,
  testTeamDocumentsManager
};

// ===== TEST-AUSFÜHRUNG =====

// Führe Tests aus wenn direkt aufgerufen
if (require.main === module) {
  testTeamDocumentsManager()
    .then(() => {
      console.log('🎯 Team Documents Manager Tests erfolgreich!');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Tests fehlgeschlagen:', error);
      process.exit(1);
    });
}
