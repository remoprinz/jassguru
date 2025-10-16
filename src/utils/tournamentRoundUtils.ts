/**
 * Zentrale Utility-Funktionen für Turnier-Runden-Management
 * 
 * Diese Datei enthält die EINZIGE SOURCE OF TRUTH für Runden-Berechnungen.
 * Alle anderen Dateien importieren diese Funktionen.
 */

/**
 * Berechnet die maximale Kapazität einer Runde
 * 
 * @param totalParticipants - Gesamtzahl der Turnierteilnehmer
 * @returns Maximale Anzahl Spieler pro Runde (immer ein Vielfaches von 4)
 * 
 * Beispiele:
 * - 8 Spieler → 8 (2 Tische à 4)
 * - 9 Spieler → 8 (2 Tische, 1 pausiert)
 * - 10 Spieler → 8 (2 Tische, 2 pausieren)
 * - 11 Spieler → 8 (2 Tische, 3 pausieren)
 * - 12 Spieler → 12 (3 Tische)
 */
export const calculateRoundCapacity = (totalParticipants: number): number => {
  return Math.floor(totalParticipants / 4) * 4;
};

/**
 * Zählt wie viele Passen (à 4 Spieler) in einer bestimmten Runde existieren
 * 
 * @param passeLabels - Mapping von Passe-IDs zu Labels (z.B. {"id1": "6A", "id2": "6B", "id3": "6AA"})
 * @param round - Die zu prüfende Rundennummer
 * @returns Anzahl der Passen in dieser Runde
 */
export const countPassesInRound = (
  passeLabels: Record<string, string>,
  round: number
): number => {
  let count = 0;
  
  Object.values(passeLabels).forEach(label => {
    const roundMatch = label.match(/^(\d+)([A-Z]+)$/);
    if (roundMatch && parseInt(roundMatch[1]) === round) {
      count++;
    }
  });
  
  return count;
};

/**
 * Zählt wie viele Spieler in einer bestimmten Runde bereits gespielt haben
 * 
 * @param passeLabels - Mapping von Passe-IDs zu Labels
 * @param round - Die zu prüfende Rundennummer
 * @returns Anzahl der Spieler in dieser Runde (Passen * 4)
 */
export const countPlayersInRound = (
  passeLabels: Record<string, string>,
  round: number
): number => {
  const passesInRound = countPassesInRound(passeLabels, round);
  return passesInRound * 4; // Jede Passe hat genau 4 Spieler
};

/**
 * Prüft ob eine Runde bereits ihre maximale Kapazität erreicht hat
 * 
 * @param totalParticipants - Gesamtzahl der Turnierteilnehmer
 * @param round - Die zu prüfende Rundennummer
 * @param passeLabels - Mapping von Passe-IDs zu Labels
 * @returns true wenn die Runde voll ist, false wenn noch Platz ist
 * 
 * Beispiel bei 8 Spielern:
 * - Runde 6 mit Passen "6A", "6B" (8 Spieler) → true (voll)
 * - Runde 6 mit Passe "6A" (4 Spieler) → false (noch Platz für 6B)
 */
export const isRoundFull = (
  totalParticipants: number,
  round: number,
  passeLabels: Record<string, string>
): boolean => {
  const capacity = calculateRoundCapacity(totalParticipants);
  const playersInRound = countPlayersInRound(passeLabels, round);
  
  return playersInRound >= capacity;
};

/**
 * Berechnet die korrekte Runde für einen Spieler (mit Kapazitäts-Check)
 * 
 * Dies ist die ZENTRALE Funktion für alle Runden-Berechnungen!
 * 
 * @param playerUid - UID des Spielers
 * @param playerPasseStatus - Status aller Spieler
 * @param passeLabels - Mapping von Passe-IDs zu Labels
 * @param totalParticipants - Gesamtzahl der Turnierteilnehmer
 * @returns Die korrekte Rundennummer für diesen Spieler
 * 
 * Logik:
 * 1. Spieler hat X Spiele gespielt → Vorschlag: Runde X+1
 * 2. Ist Runde X+1 voll? → Wenn ja, versuche X+2
 * 3. Wiederhole bis eine nicht-volle Runde gefunden wird
 */
export const getCorrectRoundForPlayer = (
  playerUid: string,
  playerPasseStatus: Record<string, any>,
  passeLabels: Record<string, string>,
  totalParticipants: number
): number => {
  const playerStatus = playerPasseStatus[playerUid];
  
  // Vorschlag: Neuer Spieler → Runde 1, bereits gespielt → nächste Runde
  let suggestedRound = playerStatus ? playerStatus.totalGamesPlayed + 1 : 1;
  
  // 🚀 KRITISCHER CHECK: Ist die vorgeschlagene Runde bereits voll?
  // WICHTIG: Auch für neue Spieler prüfen, ob Runde 1 voll ist!
  while (isRoundFull(totalParticipants, suggestedRound, passeLabels)) {
    suggestedRound++;
  }
  
  return suggestedRound;
};

/**
 * Prüft ob ein Spieler bereits in einer bestimmten Runde gespielt hat
 * 
 * @param playerUid - UID des Spielers
 * @param round - Die zu prüfende Rundennummer
 * @param playerPasseStatus - Status aller Spieler
 * @returns true wenn der Spieler diese Runde bereits gespielt hat
 */
export const hasPlayerPlayedInRound = (
  playerUid: string,
  round: number,
  playerPasseStatus: Record<string, any>
): boolean => {
  const playerStatus = playerPasseStatus[playerUid];
  if (!playerStatus) return false;
  
  // Wenn der Spieler bereits X Spiele gespielt hat, hat er Runden 1 bis X gespielt
  return playerStatus.totalGamesPlayed >= round;
};

/**
 * Generiert erweiterte Passe-Labels für große Turniere (Excel-ähnlich)
 * 
 * @param round - Die Rundennummer
 * @param passeInRound - Die Passe-Nummer innerhalb der Runde (1-basiert)
 * @returns Passe-Label wie "1A", "1Z", "1AA", "1AB", "1BA", etc.
 * 
 * Beispiele:
 * - generatePasseLabel(1, 1) → "1A"
 * - generatePasseLabel(1, 26) → "1Z"
 * - generatePasseLabel(1, 27) → "1AA"
 * - generatePasseLabel(1, 52) → "1AZ"
 * - generatePasseLabel(1, 53) → "1BA"
 * - generatePasseLabel(1, 702) → "1ZZ"
 * - generatePasseLabel(1, 703) → "1AAA"
 */
export const generatePasseLabel = (round: number, passeInRound: number): string => {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let label = '';
  let remaining = passeInRound;
  
  // Excel-ähnliche Spalten-Nummerierung
  while (remaining > 0) {
    remaining--; // 0-basiert für Array-Index
    label = letters[remaining % 26] + label;
    remaining = Math.floor(remaining / 26);
  }
  
  return `${round}${label}`;
};

/**
 * Parst ein Passe-Label und extrahiert die Rundennummer
 * 
 * @param label - Passe-Label wie "1A", "5BA", "12AAA"
 * @returns Rundennummer oder null bei ungültigem Format
 * 
 * Beispiele:
 * - parsePasseLabel("1A") → 1
 * - parsePasseLabel("5BA") → 5
 * - parsePasseLabel("12AAA") → 12
 * - parsePasseLabel("invalid") → null
 */
export const parsePasseLabel = (label: string): number | null => {
  const match = label.match(/^(\d+)([A-Z]+)$/);
  return match ? parseInt(match[1]) : null;
};

/**
 * Konvertiert einen Passe-Label-Buchstaben-Teil zu einer Nummer
 * 
 * @param letters - Buchstaben-Teil wie "A", "Z", "AA", "BA"
 * @returns Nummer (1-basiert) oder 0 bei ungültigem Format
 * 
 * Beispiele:
 * - lettersToNumber("A") → 1
 * - lettersToNumber("Z") → 26
 * - lettersToNumber("AA") → 27
 * - lettersToNumber("BA") → 53
 */
export const lettersToNumber = (letters: string): number => {
  const lettersUpper = letters.toUpperCase();
  let result = 0;
  
  for (let i = 0; i < lettersUpper.length; i++) {
    const char = lettersUpper[i];
    if (char < 'A' || char > 'Z') return 0;
    
    result = result * 26 + (char.charCodeAt(0) - 'A'.charCodeAt(0) + 1);
  }
  
  return result;
};

