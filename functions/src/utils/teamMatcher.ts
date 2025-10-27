/**
 * TEAM MATCHING ENGINE
 * ===================
 * 
 * Diese Utility erstellt konsistente Team-Identifikationen
 * unabhängig von der Reihenfolge der Partner.
 * 
 * ✅ ZIEL:
 * - Konsistente Team-Keys über alle Sessions hinweg
 * - Alphabetische Sortierung für Stabilität
 * - Display-Namen aus Member-Daten
 * 
 * 🎯 VERWENDUNG:
 * - Team-Charts Backfill-Scripts
 * - Historie-Schreiber
 * - Frontend Team-Identifikation
 */

// ===== INTERFACES =====

export interface TeamInfo {
  teamKey: string;           // "playerA_playerB" (alphabetisch sortiert)
  playerIds: string[];       // ["playerA", "playerB"] (alphabetisch sortiert)
  displayNames: string[];    // ["Max", "Maria"] (entsprechend playerIds)
  displayName: string;       // "Max & Maria"
}

export interface MemberData {
  displayName: string;
  // Weitere Member-Felder können hier hinzugefügt werden
}

// ===== HAUPTFUNKTIONEN =====

/**
 * 🎯 ERSTELLE KONSISTENTEN TEAM-KEY
 * 
 * @param playerIds Array von Player-IDs (beliebige Reihenfolge)
 * @returns Konsistenter Team-Key (alphabetisch sortiert)
 * 
 * Beispiel:
 * getTeamKey(["playerB", "playerA"]) → "playerA_playerB"
 * getTeamKey(["playerA", "playerB"]) → "playerA_playerB"
 */
function getTeamKey(playerIds: string[]): string {
  if (!Array.isArray(playerIds) || playerIds.length !== 2) {
    throw new Error('Team muss genau 2 Spieler haben');
  }
  
  // Alphabetische Sortierung für Konsistenz
  const sortedIds = [...playerIds].sort();
  
  return sortedIds.join('_');
}

/**
 * 🎯 ERSTELLE TEAM-DISPLAY-NAME
 * 
 * @param playerIds Array von Player-IDs (beliebige Reihenfolge)
 * @param members Map mit Member-Daten (playerId → MemberData)
 * @returns Team-Display-Name "Max & Maria"
 */
function getTeamDisplayName(
  playerIds: string[], 
  members: Map<string, MemberData>
): string {
  if (!Array.isArray(playerIds) || playerIds.length !== 2) {
    throw new Error('Team muss genau 2 Spieler haben');
  }
  
  // Alphabetische Sortierung für Konsistenz
  const sortedIds = [...playerIds].sort();
  
  // Display-Namen aus Members laden
  const displayNames = sortedIds.map(playerId => {
    const member = members.get(playerId);
    return member?.displayName || `Spieler_${playerId.slice(0, 6)}`;
  });
  
  return displayNames.join(' & ');
}

/**
 * 🎯 VOLLSTÄNDIGE TEAM-INFO ERSTELLEN
 * 
 * @param playerIds Array von Player-IDs (beliebige Reihenfolge)
 * @param members Map mit Member-Daten
 * @returns Vollständige Team-Information
 */
function createTeamInfo(
  playerIds: string[], 
  members: Map<string, MemberData>
): TeamInfo {
  if (!Array.isArray(playerIds) || playerIds.length !== 2) {
    throw new Error('Team muss genau 2 Spieler haben');
  }
  
  // Alphabetische Sortierung für Konsistenz
  const sortedIds = [...playerIds].sort();
  
  // Display-Namen laden
  const displayNames = sortedIds.map(playerId => {
    const member = members.get(playerId);
    return member?.displayName || `Spieler_${playerId.slice(0, 6)}`;
  });
  
  return {
    teamKey: sortedIds.join('_'),
    playerIds: sortedIds,
    displayNames: displayNames,
    displayName: displayNames.join(' & ')
  };
}

/**
 * 🎯 TEAM-KEY VALIDIERUNG
 * 
 * @param teamKey Team-Key zum Validieren
 * @returns true wenn gültig, false wenn ungültig
 */
function isValidTeamKey(teamKey: string): boolean {
  if (typeof teamKey !== 'string') return false;
  
  const parts = teamKey.split('_');
  if (parts.length !== 2) return false;
  
  // Prüfe ob beide Teile nicht leer sind
  return parts[0].length > 0 && parts[1].length > 0;
}

/**
 * 🎯 PLAYER-IDs AUS TEAM-KEY EXTRAHIEREN
 * 
 * @param teamKey Team-Key
 * @returns Array mit Player-IDs
 */
function getPlayerIdsFromTeamKey(teamKey: string): string[] {
  if (!isValidTeamKey(teamKey)) {
    throw new Error(`Ungültiger Team-Key: ${teamKey}`);
  }
  
  return teamKey.split('_');
}

// ===== TEST-FUNKTIONEN =====

/**
 * 🧪 TEST-FUNKTION: Team-Matching-Engine
 * 
 * Diese Funktion kann in Scripts verwendet werden um die Engine zu testen
 */
function testTeamMatcher(): void {
  console.log('🧪 Testing Team Matching Engine...');
  
  // Test-Daten
  const members = new Map<string, MemberData>([
    ['playerA', { displayName: 'Max' }],
    ['playerB', { displayName: 'Maria' }],
    ['playerC', { displayName: 'Tom' }],
    ['playerD', { displayName: 'Anna' }]
  ]);
  
  // Test 1: Konsistente Team-Keys
  const teamKey1 = getTeamKey(['playerA', 'playerB']);
  const teamKey2 = getTeamKey(['playerB', 'playerA']);
  console.log(`✅ Team-Key Konsistenz: ${teamKey1} === ${teamKey2} ? ${teamKey1 === teamKey2}`);
  
  // Test 2: Display-Namen
  const displayName1 = getTeamDisplayName(['playerA', 'playerB'], members);
  const displayName2 = getTeamDisplayName(['playerB', 'playerA'], members);
  console.log(`✅ Display-Name Konsistenz: "${displayName1}" === "${displayName2}" ? ${displayName1 === displayName2}`);
  
  // Test 3: Vollständige Team-Info
  const teamInfo = createTeamInfo(['playerC', 'playerD'], members);
  console.log(`✅ Team-Info:`, teamInfo);
  
  // Test 4: Team-Key Validierung
  console.log(`✅ Validierung "playerA_playerB": ${isValidTeamKey('playerA_playerB')}`);
  console.log(`✅ Validierung "invalid": ${isValidTeamKey('invalid')}`);
  
  // Test 5: Player-IDs Extraktion
  const playerIds = getPlayerIdsFromTeamKey('playerA_playerB');
  console.log(`✅ Player-IDs aus Key: [${playerIds.join(', ')}]`);
  
  console.log('🎉 Team Matching Engine Tests abgeschlossen!');
}

// ===== EXPORTS =====

export {
  getTeamKey,
  getTeamDisplayName,
  createTeamInfo,
  isValidTeamKey,
  getPlayerIdsFromTeamKey,
  testTeamMatcher
};

// ===== TEST-AUSFÜHRUNG =====

// Führe Tests aus wenn direkt aufgerufen
if (require.main === module) {
  testTeamMatcher();
}
