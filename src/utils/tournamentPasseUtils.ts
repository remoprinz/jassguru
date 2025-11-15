/**
 * 🎯 TOURNAMENT PASSE UTILITIES
 * 
 * Zentrale Logik für Passe-Nummer-Berechnung und Spieler-Verfügbarkeit.
 * Wird von TournamentViewPage UND tournamentStore verwendet für Konsistenz.
 */

import type { ParticipantWithProgress } from '@/store/tournamentStore';
import type { TournamentGame } from '@/types/tournament';

/**
 * Berechnet, ob ein Spieler für eine bestimmte Passe-Nummer verfügbar ist
 */
export function isPlayerAvailableForPasse(
  participant: ParticipantWithProgress,
  passeNumber: number,
  playersInActivePasses: Set<string>
): boolean {
  // Spieler muss diese Passe-Nummer noch nicht gespielt haben
  const hasNotPlayedYet = (participant.completedPassesCount || 0) < passeNumber;
  
  // Spieler darf nicht in einer aktiven Passe sein
  const isNotInActivePasse = !playersInActivePasses.has(participant.uid);
  
  return hasNotPlayedYet && isNotInActivePasse;
}

/**
 * Berechnet die Liste aller verfügbaren Spieler für eine Passe-Nummer
 */
export function getAvailablePlayersForPasse(
  participants: ParticipantWithProgress[],
  passeNumber: number,
  playersInActivePasses: Set<string>
): ParticipantWithProgress[] {
  return participants.filter(p => 
    isPlayerAvailableForPasse(p, passeNumber, playersInActivePasses)
  );
}

/**
 * 🎯 KERN-ALGORITHMUS: Berechnet die nächste spielbare Passe-Nummer
 * 
 * Logik:
 * 1. Starte mit minCompletedPasses + 1
 * 2. Prüfe ob genug Spieler verfügbar sind (>= 4)
 * 3. Wenn nicht: Springe zur nächsten Passe-Nummer
 * 4. Wiederhole bis spielbare Passe gefunden
 * 
 * Unterstützt 9-Spieler-Rotations-Szenario automatisch!
 */
export interface NextPasseCalculationResult {
  nextPasseNumber: number;
  availablePlayers: ParticipantWithProgress[];
  isPlayable: boolean; // true wenn >= 4 Spieler verfügbar
  reason?: string; // Optional: Grund warum nicht spielbar
}

export function calculateNextPlayablePasse(
  participants: ParticipantWithProgress[],
  activePassesInTournament: any[] // Array von aktiven Passen mit participantUids
): NextPasseCalculationResult {
  // Edge Case: Keine Teilnehmer
  if (!participants || participants.length === 0) {
    return {
      nextPasseNumber: 1,
      availablePlayers: [],
      isPlayable: false,
      reason: 'Keine Teilnehmer im Turnier'
    };
  }
  
  // Edge Case: Weniger als 4 Teilnehmer gesamt
  if (participants.length < 4) {
    return {
      nextPasseNumber: 1,
      availablePlayers: participants,
      isPlayable: false,
      reason: `Turnier benötigt mindestens 4 Teilnehmer (aktuell: ${participants.length})`
    };
  }
  
  // 1. Sammle UIDs aller Spieler in aktiven Passen
  const playersInActivePasses = new Set<string>();
  if (activePassesInTournament && activePassesInTournament.length > 0) {
    activePassesInTournament.forEach(activePasse => {
      const participantUids = activePasse.participantUids || [];
      participantUids.forEach((uid: string) => {
        if (uid) playersInActivePasses.add(uid);
      });
    });
  }
  
  // 2. Berechne Kandidaten-Passe basierend auf minCompletedPasses
  const completedPassesCounts = participants.map(p => p.completedPassesCount || 0);
  const minCompletedPasses = Math.min(...completedPassesCounts);
  let candidatePasseNumber = minCompletedPasses + 1;
  
  // 3. Loop: Finde die erste spielbare Passe (mit >= 4 verfügbaren Spielern)
  const MAX_ITERATIONS = 100; // Sicherheit gegen Endlosschleife
  let iterations = 0;
  
  while (iterations < MAX_ITERATIONS) {
    iterations++;
    
    // Berechne verfügbare Spieler für diese Kandidaten-Passe
    const availablePlayers = getAvailablePlayersForPasse(
      participants,
      candidatePasseNumber,
      playersInActivePasses
    );
    
    // Prüfe ob genug Spieler verfügbar sind
    if (availablePlayers.length >= 4) {
      // ✅ Spielbare Passe gefunden!
      return {
        nextPasseNumber: candidatePasseNumber,
        availablePlayers,
        isPlayable: true
      };
    }
    
    // Nicht genug Spieler → Prüfe ob wir aufgeben sollten
    if (availablePlayers.length === 0) {
      // Keine Spieler mehr verfügbar → Turnier ist "abgeschlossen" oder blockiert
      return {
        nextPasseNumber: candidatePasseNumber,
        availablePlayers: [],
        isPlayable: false,
        reason: `Keine Spieler für Passe ${candidatePasseNumber} verfügbar (alle haben bereits gespielt oder sind in aktiven Passen)`
      };
    }
    
    // 1-3 Spieler verfügbar → Springe zur nächsten Passe
    candidatePasseNumber++;
  }
  
  // Sollte nie erreicht werden, aber zur Sicherheit
  console.error('[calculateNextPlayablePasse] ⚠️ Max iterations reached! Returning fallback.');
  return {
    nextPasseNumber: minCompletedPasses + 1,
    availablePlayers: [],
    isPlayable: false,
    reason: 'Interner Fehler: Keine spielbare Passe gefunden nach 100 Iterationen'
  };
}

/**
 * 🎯 BUCHSTABEN-BERECHNUNG: Findet den nächsten freien Buchstaben (A-Z, AA-ZZ)
 * 
 * Berücksichtigt:
 * - Maximale Anzahl Tische basierend auf Teilnehmer-Anzahl
 * - Bereits verwendete Buchstaben (aus abgeschlossenen + aktiven Passen)
 */
export function numberToLetter(num: number): string {
  if (num < 26) {
    // Einfacher Buchstabe: A-Z
    return String.fromCharCode(65 + num); // 65 = 'A'
  } else {
    // Doppelter Buchstabe: AA-ZZ
    const firstLetter = Math.floor((num - 26) / 26);
    const secondLetter = (num - 26) % 26;
    return String.fromCharCode(65 + firstLetter) + String.fromCharCode(65 + secondLetter);
  }
}

export function calculateNextPasseLetter(
  passeNumber: number,
  completedGames: TournamentGame[],
  activePassesInTournament: any[],
  totalParticipants: number
): string {
  // 1. Berechne maximale Tische für dieses Turnier
  const maxTische = Math.floor(totalParticipants / 4);
  
  if (maxTische === 0) {
    console.warn('[calculateNextPasseLetter] ⚠️ Weniger als 4 Teilnehmer! Returning A as fallback.');
    return 'A';
  }
  
  // 2. Sammle verwendete Buchstaben für diese Passe-Nummer
  const usedLetters = new Set<string>();
  
  // 2a. Sammle aus abgeschlossenen Passen
  if (completedGames) {
    completedGames.forEach(game => {
      if (game.tournamentRound === passeNumber && game.passeInRound) {
        usedLetters.add(game.passeInRound);
      }
    });
  }
  
  // 2b. Sammle aus aktiven Passen
  if (activePassesInTournament && activePassesInTournament.length > 0) {
    activePassesInTournament.forEach(activePasse => {
      // Bestimme die Passe-Nummer dieser aktiven Passe
      const activePasseNumber = activePasse.passeTournamentNumber || activePasse.currentGameNumber || activePasse.passeNumber;
      const activePasseLetter = activePasse.passeInRound;
      
      if (activePasseNumber === passeNumber && activePasseLetter) {
        usedLetters.add(activePasseLetter);
      }
    });
  }
  
  // 3. Finde den nächsten freien Buchstaben (aber nur bis maxTische!)
  let index = 0;
  let nextLetter = numberToLetter(index);
  
  while (usedLetters.has(nextLetter) && index < maxTische) {
    index++;
    nextLetter = numberToLetter(index);
  }
  
  // 4. Sicherheitscheck: Falls alle Tische belegt
  if (index >= maxTische) {
    console.warn(`[calculateNextPasseLetter] ⚠️ Alle ${maxTische} Tische für Passe ${passeNumber} belegt! Returning letzten Buchstaben.`);
    return numberToLetter(maxTische - 1);
  }
  
  return nextLetter;
}

/**
 * 🎯 HAUPT-FUNKTION: Berechnet nächste Passe-Nummer UND Buchstaben
 * 
 * Diese Funktion kombiniert alle obigen Helpers und ist die zentrale
 * Schnittstelle für View + Store.
 */
export interface NextPasseInfo {
  nextPasseNumber: number;
  nextPasseLabel: string; // z.B. "3B"
  availablePlayers: ParticipantWithProgress[];
  isPlayable: boolean;
  reason?: string;
}

/**
 * 🎯 HELPER: Berechnet completedPassesCount DYNAMISCH aus ABGESCHLOSSENEN Games
 * 
 * WARUM?
 * - `participants.completedPassesCount` wird nicht in Echtzeit aktualisiert
 * - Wir zählen nur abgeschlossene Games (completedAt vorhanden)
 * - Durch Zählen der abgeschlossenen Games haben wir immer die korrekte Anzahl
 * 
 * WICHTIG:
 * - Aktive Spiele zählen NICHT MIT! (Spieler spielt gerade Passe X, hat aber erst X-1 abgeschlossen)
 * - Nur Games mit `completedAt !== undefined` werden gezählt
 */
export function calculateCompletedPassesCountFromGames(
  participantUid: string,
  completedGames: TournamentGame[]  // ✅ NUR abgeschlossene Games!
): number {
  return completedGames.filter(game => {
    // ✅ WICHTIG: Nur abgeschlossene Games zählen (haben completedAt)
    if (!game.completedAt) return false;
    
    // Prüfe in participantUidsForPasse (aus abgeschlossenen Games)
    return game.participantUidsForPasse?.includes(participantUid) || false;
  }).length;
}

export function calculateNextPasse(
  participants: ParticipantWithProgress[],
  completedGames: TournamentGame[],
  activePassesInTournament: any[]
): NextPasseInfo {
  // ✅ ELEGANT: Berechne completedPassesCount DYNAMISCH aus NUR abgeschlossenen Games
  // Aktive Games zählen NICHT MIT für completedPassesCount!
  const participantsWithLiveCount = participants.map(p => ({
    ...p,
    completedPassesCount: calculateCompletedPassesCountFromGames(p.uid, completedGames)
  }));
  
  // 1. Berechne nächste spielbare Passe-Nummer (mit live counts!)
  const passeCalculation = calculateNextPlayablePasse(
    participantsWithLiveCount,
    activePassesInTournament
  );
  
  // 2. Berechne Buchstaben für diese Passe
  const passeLetter = calculateNextPasseLetter(
    passeCalculation.nextPasseNumber,
    completedGames,
    activePassesInTournament,
    participants.length
  );
  
  // 3. Kombiniere zu Label
  const nextPasseLabel = `${passeCalculation.nextPasseNumber}${passeLetter}`;
  
  return {
    nextPasseNumber: passeCalculation.nextPasseNumber,
    nextPasseLabel,
    availablePlayers: passeCalculation.availablePlayers,
    isPlayable: passeCalculation.isPlayable,
    reason: passeCalculation.reason
  };
}

