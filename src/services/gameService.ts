import { getFirestore, doc, updateDoc, setDoc, serverTimestamp, collection, query, where, orderBy, limit, getDocs, FieldValue, Timestamp, addDoc, onSnapshot, Unsubscribe, writeBatch, runTransaction, getDoc, increment, deleteDoc } from 'firebase/firestore';
import { firebaseApp } from './firebaseInit';
import type { ActiveGame, RoundEntry, JassRoundEntry, CompletedGameSummary, PlayerNames } from '../types/jass';
import { useUIStore } from '../store/uiStore';
import { useTimerStore } from '../store/timerStore'; // Import TimerStore
import { CARD_SYMBOL_MAPPINGS } from '../config/CardStyles'; // NEU: Import hinzufügen
import { sanitizeDataForFirestore } from '../utils/firestoreUtils'; // NEU: Import der Bereinigungsfunktion
import { useJassStore } from '../store/jassStore'; // Import jassStore
import { useGameStore } from '../store/gameStore'; // Import gameStore
import { getFunctions, httpsCallable } from 'firebase/functions'; // NEU: Import für Cloud Functions

const db = getFirestore(firebaseApp);

// Neuer Timestamp für Debouncing (oben in der Datei hinzufügen)
let lastUpdateTimestamp = 0;
const UPDATE_DEBOUNCE_MS = 1000; // Mindestzeit zwischen Updates

/**
 * Erstellt ein neues Dokument für ein aktives Spiel in Firestore.
 *
 * @param initialGameData Die initialen Daten für das neue Spiel.
 * @returns Die ID des neu erstellten Dokuments.
 */
export const createActiveGame = async (
  initialGameData: Omit<ActiveGame, 'createdAt' | 'lastUpdated' | 'status' | 'gameStartTime' | 'jassStartTime'> & { groupId: string } // Stellen sicher, dass groupId vorhanden ist
): Promise<string> => {
  // ✅ VEREINFACHT: Direkte Firestore-Operationen (kein DualWrite für temporäre Daten)
  const activeGamesRef = collection(db, 'activeGames');
  const newGameRef = doc(activeGamesRef); // Firestore generiert eine ID
  const gameId = newGameRef.id;

  const jassStartTime = useTimerStore.getState().jassStartTime; 

  const gameData: ActiveGame = {
    ...initialGameData,
    activeGameId: gameId,
    status: 'live',
    createdAt: serverTimestamp(),
    lastUpdated: serverTimestamp(),
    // Setze jassStartTime und gameStartTime initial gleich
    jassStartTime: jassStartTime ? Timestamp.fromMillis(jassStartTime) : serverTimestamp(),
    gameStartTime: jassStartTime ? Timestamp.fromMillis(jassStartTime) : serverTimestamp(),
  };

  try {
    // ✅ DIREKT: Alte Struktur für temporäre ActiveGames
    await setDoc(newGameRef, gameData);
  
    return gameId;
  } catch (error) {
    console.error("[GameService] Error creating active game: ", error);
    useUIStore.getState().showNotification({
      type: "error",
      message: "Fehler beim Erstellen des Online-Spiels.",
    });
    throw error; // Fehler weiterleiten, damit aufrufende Funktion reagieren kann
  }
};

/**
 * Aktualisiert ein bestehendes aktives Spiel-Dokument in Firestore.
 *
 * @param activeGameId Die ID des zu aktualisierenden Spiel-Dokuments.
 * @param dataToUpdate Ein Objekt mit den Feldern, die aktualisiert werden sollen.
 */
export const updateActiveGame = async (
  activeGameId: string,
  dataToUpdate: Partial<Omit<ActiveGame, 'createdAt' | 'groupId' | 'participantUids' | 'jassStartTime' >> & { gameStartTime?: Timestamp | FieldValue } // gameStartTime kann optional aktualisiert werden
): Promise<void> => {
  if (!activeGameId) {
    console.warn("[GameService] updateActiveGame called without activeGameId.");
    return;
  }
  const gameDocRef = doc(db, 'activeGames', activeGameId);

  // Füge immer lastUpdated hinzu
  const updatePayload = {
    ...dataToUpdate,
    lastUpdated: serverTimestamp(),
  };

  try {
    await updateDoc(gameDocRef, updatePayload);
  
  } catch (error) {
    console.error(`[GameService] Error updating active game ${activeGameId}: `, error);
    useUIStore.getState().showNotification({
      type: "error",
      message: "Fehler beim Synchronisieren des Spielstands.",
    });
    // Fehler nicht unbedingt weiterleiten, da es ein Hintergrund-Update sein kann
  }
};

/**
 * Sucht das zuletzt aktualisierte, aktive Spiel für einen Benutzer in einer bestimmten Gruppe.
 *
 * @param userId Die Firebase User ID des Benutzers.
 * @param groupId Die ID der Gruppe.
 * @returns Die ID des gefundenen Spiels oder null, wenn kein passendes Spiel gefunden wurde.
 */
export const findLatestActiveGameForUserInGroup = async (
  userId: string,
  groupId: string
): Promise<string | null> => {
  if (!userId || !groupId) {
    return null;
  }
  const activeGamesRef = collection(db, 'activeGames');

  const q = query(
    activeGamesRef,
    where('groupId', '==', groupId),
    where('status', '==', 'live'),
    where('participantUids', 'array-contains', userId),
    orderBy('lastUpdated', 'desc'),
    limit(1)
  );

  try {
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      const gameDoc = querySnapshot.docs[0];
      return gameDoc.id;
    } else {
      return null;
    }
  } catch (error) {
    console.error("[GameService] Error finding active game: ", error);
    return null;
  }
};

/**
 * Aktualisiert den Status eines aktiven Spiel-Dokuments in Firestore.
 *
 * @param activeGameId Die ID des zu aktualisierenden Spiel-Dokuments.
 * @param status Der neue Status ('completed' oder 'aborted').
 */
export const updateGameStatus = async (
  activeGameId: string,
  status: 'completed' | 'aborted'
): Promise<void> => {
  if (!activeGameId) {
    console.warn("[GameService] updateGameStatus called without activeGameId.");
    return;
  }
  if (status !== 'completed' && status !== 'aborted') {
      console.warn(`[GameService] updateGameStatus called with invalid status: ${status}`);
      return;
  }
  try {
    // Rufe die bestehende updateActiveGame Funktion auf, um nur den Status zu ändern
    await updateActiveGame(activeGameId, { status: status });
  } catch (error) {
    // Der Fehler wird bereits in updateActiveGame geloggt und eine Notification gezeigt.
    // Wir könnten hier optional den Fehler weiterleiten, wenn nötig.
    console.error(`[GameService] Failed to update status for game ${activeGameId} via updateActiveGame.`);
    // throw error; // Optional: Fehler weiterleiten
  }
};

/**
 * Speichert einen Rundeneintrag als Subdokument in der rounds-Sammlung eines aktiven Spiels.
 * 
 * @param activeGameId Die ID des aktiven Spiels
 * @param roundData Die Rundendaten, die gespeichert werden sollen
 * @returns ID des erstellten Rundendokuments
 */
export const saveRoundToFirestore = async (
  activeGameId: string,
  roundEntry: RoundEntry,
  isFinalRound: boolean = false
): Promise<void> => {
  if (!activeGameId) {
    console.warn("[GameService] saveRoundToFirestore called without activeGameId.");
    return;
  }

  // Debounce-Prüfung für zu schnell aufeinanderfolgende Updates
  const now = Date.now();
  if (now - lastUpdateTimestamp < UPDATE_DEBOUNCE_MS) {
    return;
  }
  
  // Aktualisiere den Timestamp, da wir das Update jetzt durchführen werden
  lastUpdateTimestamp = now;

  // Referenz zur rounds-Subkollektion des aktiven Spiels
  const roundsCollectionRef = collection(db, 'activeGames', activeGameId, 'rounds');

  try {
    // NEU: Stellen sicher, dass die Zeitwerte gesetzt sind
    if (!roundEntry.startTime) {
      roundEntry.startTime = roundEntry.timestamp;
    }
    
    // Setze die endTime auf den aktuellen Zeitpunkt
    roundEntry.endTime = now;

    // Bereite Daten für Firestore vor
    const baseRoundData = {
      id: roundEntry.id,
      roundId: roundEntry.roundId,
      timestamp: Timestamp.fromMillis(roundEntry.timestamp),
      actionType: roundEntry.actionType,
      startingPlayer: roundEntry.startingPlayer,
      startingPlayerName: roundEntry.startingPlayerName,
      currentPlayer: roundEntry.currentPlayer,
      isRoundFinalized: roundEntry.isRoundFinalized,
      weisPoints: roundEntry.weisPoints,
      jassPoints: roundEntry.jassPoints,
      scores: roundEntry.scores,
      striche: roundEntry.striche,
      weisActions: roundEntry.weisActions || [],
      roundState: roundEntry.roundState,
      isActive: true, // NEU: Markiere diese Runde als aktiv
      savedAt: serverTimestamp()
    };

    let finalRoundData: any = { ...baseRoundData };

    // Füge Jass-spezifische Daten hinzu, wenn vorhanden
    if (roundEntry.actionType === 'jass') {
      const jassEntry = roundEntry as JassRoundEntry;
      
      // Wandle JassColor in DB-String um (kann undefined sein)
      const dbFarbe = jassEntry.farbe ? CARD_SYMBOL_MAPPINGS[jassEntry.farbe]?.[jassEntry.cardStyle] : undefined;
      
      finalRoundData = {
        ...finalRoundData,
        // Füge cardStyle immer hinzu
        cardStyle: jassEntry.cardStyle,
      };
      
      // Füge farbe NUR hinzu, wenn dbFarbe NICHT undefined ist
      if (dbFarbe !== undefined) {
         finalRoundData.farbe = dbFarbe;
      }
      
      // Füge strichInfo NUR hinzu, wenn es NICHT undefined ist
      if (jassEntry.strichInfo !== undefined) {
        finalRoundData.strichInfo = jassEntry.strichInfo;
      }
    }

    // NEU: Bereinige die Daten für Firestore (undefined zu null)
    const cleanedRoundData = sanitizeDataForFirestore(finalRoundData);

    // DEBUGGING: Logge die bereinigten Daten
    // console.log(`[GameService] RoundData bereinigt für Firestore:`, cleanedRoundData);
      
      // NEU: Verwende eine Transaktion für atomares Schreiben und Deaktivieren
      const docRef = doc(roundsCollectionRef); // Generiere Ref für das neue Dokument
      
      // LOGGING:
      // console.log(`[GameService] Starte Transaktion für Rundspeicherung (roundId: ${roundEntry.roundId}, docRef: ${docRef.id})`);
      
      // In separaten try-catch-Block für die Transaktion
      try {
        await runTransaction(db, async (transaction) => {
          // 2. Schreibe das neue, aktive Rundendokument
          transaction.set(docRef, cleanedRoundData);
          // console.log(`[GameService] Füge neues Dokument ${docRef.id} (roundId: ${roundEntry.roundId}) in Transaktion hinzu`);
        });
        
        // console.log(`[GameService] Round ${roundEntry.roundId} erfolgreich in Transaktion gespeichert: ${docRef.id}`);
      } catch (transactionError) {
        // Spezifischere Fehlerbehandlung für die Transaktion
        console.error(`[GameService] Transaktionsfehler bei Rundspeicherung (roundId: ${roundEntry.roundId}):`, transactionError);
        useUIStore.getState().showNotification({
          type: "error",
          message: "Fehler bei der Datenspeicherung. Bitte überprüfe deine Internetverbindung und versuche es erneut!",
        });
        return;
      }
     
      // === ERWEITERUNG: Hauptdokument aktualisieren (bleibt außerhalb der Transaktion, da weniger kritisch) ===
      // Berechne den GESAMTscore für das Update des Hauptdokuments
      const totalScores = { top: roundEntry.scores.top, bottom: roundEntry.scores.bottom };
      // console.log(`[GameService] Updating main game document ${activeGameId} with total scores:`, totalScores);
      await updateActiveGame(activeGameId, {
          scores: totalScores,
      });
      
      // Hole den aktuellen Spielzustand für gamePlayers
      const gameStore = useGameStore.getState();
      
      // Aktualisiere das Hauptdokument mit dem Gesamtscore, Strichen, Weis und aktueller Runde/Spieler
      // NEU: Bereinige auch diese Daten
      const mainDocUpdate = sanitizeDataForFirestore({
        scores: totalScores, // Jetzt verwenden wir die korrekte Summe
        striche: roundEntry.striche,
        weisPoints: roundEntry.weisPoints, 
        currentPlayer: roundEntry.roundState.nextPlayer, 
        startingPlayer: roundEntry.roundState.nextPlayer,
        currentRound: roundEntry.roundState.roundNumber,
        lastUpdated: serverTimestamp(),
        currentRoundWeis: [],
        // Neue Felder hinzufügen
        currentJassPoints: roundEntry.jassPoints, // Aktuelle Jass-Punkte
        isRoundCompleted: roundEntry.isRoundFinalized, // Runden-Status
        gamePlayers: gameStore.gamePlayers, // Strukturierte Spielerdaten
        roundHistory: gameStore.roundHistory, // ✅ KRITISCH: roundHistory für Live-Zuschauer
      });
      
      try {
        await updateDoc(doc(db, 'activeGames', activeGameId), mainDocUpdate);
        // console.log(`[GameService] Main game document ${activeGameId} successfully updated with new round data`);
      } catch (updateError) {
        console.error(`[GameService] Error updating main game document ${activeGameId}:`, updateError);
        // Kein Return null hier - die Runde wurde erfolgreich in der Transaktion gespeichert
        // Wir zeigen nur eine Warnung
        useUIStore.getState().showNotification({
          type: "warning",
          message: "Die Runde wurde gespeichert, aber es gab ein Problem bei der Aktualisierung der Spielübersicht.",
        });
      }
      // === ENDE ERWEITERUNG ===
      
      // Wenn letzter Zug dieser Runde, aktualisiere das Hauptdokument
      if (isFinalRound) {
        await updateActiveGame(activeGameId, {
          lastUpdated: serverTimestamp(),
        });
      }
  } catch (error) {
    console.error(`[GameService] Error saving round to Firestore for game ${activeGameId}:`, error);
    useUIStore.getState().showNotification({
      type: "error",
      message: "Fehler beim Speichern der Runde. Bitte überprüfe deine Internetverbindung!",
    });
  }
};

/**
 * Lädt alle Rundendaten für ein aktives Spiel aus Firestore.
 * 
 * @param activeGameId Die ID des aktiven Spiels
 * @returns Array mit allen Rundendaten, chronologisch sortiert
 */
export const loadRoundsFromFirestore = async (
  activeGameId: string
): Promise<RoundEntry[]> => {
  if (!activeGameId) {
    console.warn("[GameService] loadRoundsFromFirestore called without activeGameId.");
    return [];
  }

  try {
    // Referenz zur rounds-Subkollektion des aktiven Spiels
    const roundsCollectionRef = collection(db, 'activeGames', activeGameId, 'rounds');
    
    // 🚨 FIX: Query ohne orderBy um Firestore Index-Fehler zu vermeiden
    const q = query(
      roundsCollectionRef,
      where("isActive", "==", true) // Nur aktive Runden laden
      // orderBy entfernt - wird client-seitig sortiert
    );
    
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {

      return [];
    }
    
    // Konvertiere Firestore-Dokumente zurück in RoundEntry-Objekte
    const rounds: RoundEntry[] = [];
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      
      // Konvertiere Firestore-Timestamp zurück in JavaScript-Timestamp
      const timestamp = data.timestamp?.toMillis() || Date.now();
      
      // Basisobjekt für alle Rundentypen
      const baseEntry: Partial<RoundEntry> = {
        id: data.id,
        roundId: data.roundId,
        timestamp: timestamp,
        actionType: data.actionType,
        startingPlayer: data.startingPlayer,
        startingPlayerName: data.startingPlayerName,
        currentPlayer: data.currentPlayer,
        isRoundFinalized: data.isRoundFinalized,
        weisPoints: data.weisPoints,
        jassPoints: data.jassPoints,
        scores: data.scores,
        striche: data.striche,
        weisActions: data.weisActions || [],
        roundState: data.roundState,
        isCompleted: data.isRoundFinalized, // Setze isCompleted basierend auf isRoundFinalized
        isActive: data.isActive // NEU: isActive-Flag mit übernehmen
      };
      
      // Spezifische Felder für Jass-Runden
      if (data.actionType === 'jass') {
        const jassRound: JassRoundEntry = {
          ...baseEntry as RoundEntry,
          actionType: 'jass',
          farbe: data.farbe,
          cardStyle: data.cardStyle,
          strichInfo: data.strichInfo,
          isRoundFinalized: true,  // Muss true sein für JassRoundEntry
          isCompleted: true        // Muss true sein für JassRoundEntry
        };
        rounds.push(jassRound);
      } else {
        // Weis-Runden
        rounds.push(baseEntry as RoundEntry);
      }
    });
    
    // 🚨 FIX: Client-seitige Sortierung nach roundId
    rounds.sort((a, b) => {
      const aRoundId = a.roundId || 0;
      const bRoundId = b.roundId || 0;
      return aRoundId - bRoundId;
    });
    
    // console.log(`[GameService] Successfully loaded ${rounds.length} active rounds for game ${activeGameId}`);
    return rounds;
    
  } catch (error) {
    console.error(`[GameService] Error loading rounds for game ${activeGameId}:`, error);
    useUIStore.getState().showNotification({
      type: "error",
      message: "Fehler beim Laden der Spielrunden.",
    });
    return [];
  }
};

/**
 * Speichert die Zusammenfassung eines abgeschlossenen Spiels in Firestore.
 * Pfad: jassGameSummaries/{sessionId}/completedGames/{gameNumber}
 *
 * @param sessionId Die ID der Jass-Session (entspricht oft der activeGameId).
 * @param gameNumber Die Nummer des abgeschlossenen Spiels.
 * @param summaryData Das Datenobjekt mit der Spielzusammenfassung.
 * @param showSuccessNotification Ob eine Erfolgsmeldung angezeigt werden soll.
 * @returns Ein Promise mit boolean-Wert, ob das Speichern erfolgreich war.
 */
export const saveCompletedGameToFirestore = async (
  sessionId: string,
  gameNumber: number,
  summaryData: CompletedGameSummary,
  showSuccessNotification: boolean = true
): Promise<boolean> => {
  // Grundlegende Validierung
  if (!sessionId || typeof gameNumber !== 'number' || gameNumber <= 0) {
    console.error("[saveCompletedGameToFirestore] Ungültige sessionId oder gameNumber.", { sessionId, gameNumber });
    return false;
  }
  if (!summaryData) {
    console.error("[saveCompletedGameToFirestore] Keine summaryData übergeben.");
    return false;
  }

  // Verwende die stabile jassSessionId aus dem jassStore als primäre ID
  // Fallback auf die übergebene sessionId, falls keine jassSessionId existiert
  const jassSessionId = useJassStore.getState().jassSessionId || sessionId;
  const currentSession = useJassStore.getState().currentSession;
  
  if (!jassSessionId) {
    console.error("[saveCompletedGameToFirestore] Keine gültige Session-ID gefunden.");
    return false;
  }

  const docId = String(gameNumber); // Dokument-ID basierend auf gameNumber
  
  // 🚀 NEUE ARCHITEKTUR: CompletedGame in neue Gruppenstruktur schreiben (OHNE Fallback)
  if (!currentSession?.gruppeId) {
    console.error(`[saveCompletedGameToFirestore] No groupId found for session ${jassSessionId}`);
    return false;
  }
  

  const gameSummaryRef = doc(db, 'groups', currentSession.gruppeId, 'jassGameSummaries', jassSessionId, 'completedGames', docId);

  try {
    // Prüfung, ob das Dokument bereits existiert
    const existingDoc = await getDoc(gameSummaryRef);
    
    if (existingDoc.exists()) {
      const existingData = existingDoc.data() as CompletedGameSummary;
      
      // Wenn das existierende Dokument keine oder eine leere roundHistory hat, 
      // aber unsere summaryData eine nicht-leere roundHistory hat
      if ((!existingData.roundHistory || existingData.roundHistory.length === 0) && 
          summaryData.roundHistory && summaryData.roundHistory.length > 0) {

        
        // Nur die roundHistory und trumpColorsPlayed aktualisieren
        await updateDoc(gameSummaryRef, {
          roundHistory: summaryData.roundHistory,
          trumpColorsPlayed: summaryData.trumpColorsPlayed || []
        });
        
        if (showSuccessNotification) {
          useUIStore.getState().showNotification({
            type: 'success',
            message: 'Spielhistorie erfolgreich aktualisiert.',
            duration: 3000
          });
        }
        
        return true;
      } else {

        return true; // Überspringen des Speicherns gilt als Erfolg
      }
    }

    // Rundenhistorie neu nummerieren
    let renumberedHistory: RoundEntry[] = [];
    if (summaryData.roundHistory && Array.isArray(summaryData.roundHistory)) {
      renumberedHistory = summaryData.roundHistory.map((entry, index) => {
        // Erstelle eine Kopie des Eintrags
        const updatedEntry = { ...entry };
        // Überschreibe die roundState.roundNumber mit dem Index + 1
        if (updatedEntry.roundState) {
          updatedEntry.roundState = { ...updatedEntry.roundState, roundNumber: index + 1 };
        } else {
          // Fallback, falls roundState fehlt 
          updatedEntry.roundState = { roundNumber: index + 1, nextPlayer: entry.currentPlayer || 1 };
        }
        return updatedEntry;
      });

    } else {
      console.warn(`[saveCompletedGameToFirestore] Keine gültige Rundenhistorie zum Neunummerieren in Spiel ${gameNumber} gefunden.`);
    }
    
    // Erstelle eine Kopie der summaryData mit der neu nummerierten Historie
    const dataToSave: CompletedGameSummary = {
      ...summaryData,
      roundHistory: renumberedHistory, // Verwende die neu nummerierte Historie
    };

    // Bereinige die Daten vor dem Speichern
    const cleanedSummaryData = sanitizeDataForFirestore(dataToSave); 


    // Spiel speichern
    await setDoc(gameSummaryRef, cleanedSummaryData);

    // Erfolgsnotification nur anzeigen, wenn gewünscht
    if (showSuccessNotification) {
      useUIStore.getState().showNotification({
        type: 'success',
        message: 'Jass-Partie wurde erfolgreich gespeichert & alle Statistiken aktualisiert.',
        duration: 3000
      });
    }
    
    return true;

  } catch (error) {
    console.error(`[saveCompletedGameToFirestore] Fehler beim Speichern von Spiel ${gameNumber} für Session ${jassSessionId}:`, error);
    useUIStore.getState().showNotification({
      type: 'error',
      message: `Fehler: Zusammenfassung für Spiel ${gameNumber} konnte nicht gespeichert werden.`,
      duration: 5000
    });
    return false;
  }
};

/**
 * Lädt alle abgeschlossenen Spiele für eine Session aus Firestore EINMALIG.
 * 
 * @param sessionId Die ID der Jass-Session
 * @returns Ein Promise mit einem Array von CompletedGameSummary-Objekten
 */
export const fetchCompletedGamesFromFirestore = async (
  sessionId: string,
  groupId?: string
): Promise<CompletedGameSummary[]> => {
  if (!sessionId) {
    console.warn("[GameService] fetchCompletedGamesFromFirestore called without sessionId.");
    return [];
  }
  const db = getFirestore(firebaseApp);
  try {
    let resolvedGroupId: string | null = null;
    
    // ✅ ELEGANTE LÖSUNG: Ermittle groupId aus Session ODER Tournament
    const isTournamentSession = sessionId.startsWith('tournament_');
    
    if (isTournamentSession) {
      // ✅ ROBUST: Extrahiere Tournament-ID aus Session-ID
      const tournamentIdMatch = sessionId.match(/^tournament_([^_]+)_passe_/);
      if (tournamentIdMatch) {
        const tournamentId = tournamentIdMatch[1];
        
        // ✅ ELEGANT: Hole groupId direkt aus Tournament-Dokument
        const tournamentDoc = await getDoc(doc(db, 'tournaments', tournamentId));
        if (tournamentDoc.exists()) {
          resolvedGroupId = tournamentDoc.data()?.groupId || null;
        }
      }
    } else {
      // Normale Session: Hole groupId aus Session-Dokument
      const sessionDoc = await getDoc(doc(db, 'sessions', sessionId));
      if (sessionDoc.exists()) {
        const sessionData = sessionDoc.data();
        resolvedGroupId = sessionData?.groupId || sessionData?.gruppeId || null;
      }
    }
    
    if (!resolvedGroupId) {
      console.error(`[fetchCompletedGamesFromFirestore] No groupId found for session ${sessionId}`);
      return [];
    }

    const completedGamesRef = collection(db, 'groups', resolvedGroupId, 'jassGameSummaries', sessionId, 'completedGames');
    const q = query(completedGamesRef, orderBy('gameNumber', 'asc'));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      return [];
    }
    
    const completedGames: CompletedGameSummary[] = [];
    querySnapshot.forEach((doc) => {
      completedGames.push(doc.data() as CompletedGameSummary);
    });
    
    return completedGames;
  } catch (error) {
    console.error(`[GameService] Error fetching completed games for session ${sessionId}:`, error);
    useUIStore.getState().showNotification({
      type: "error",
      message: "Fehler beim Laden der abgeschlossenen Spiele.",
    });
    return [];
  }
};

/**
 * Lädt die abgeschlossenen Spiele einer Session aus Firestore und abonniert auf Änderungen.
 * @param sessionId Die ID der Jass-Session.
 * @param onUpdate Eine Callback-Funktion, die mit der Liste der Spiele aufgerufen wird.
 * @returns Eine `Unsubscribe`-Funktion, um den Listener zu entfernen.
 */
export const loadCompletedGamesFromFirestore = (
  sessionId: string,
  onUpdate: (games: CompletedGameSummary[]) => void
): Unsubscribe => {
  if (!sessionId) {
    console.error("[GameService] loadCompletedGamesFromFirestore aufgerufen ohne sessionId.");
    return () => {};
  }
  
  const db = getFirestore(firebaseApp);
  let unsubscribeFunction: Unsubscribe = () => {};
  
  // ✅ ELEGANTE LÖSUNG: Ermittle groupId aus Session ODER Tournament
  const setupListener = async () => {
    try {
      let groupId: string | null = null;
      
      // 1. Prüfe, ob es eine Turnier-Session ist (Format: tournament_{tournamentId}_passe_{n})
      const isTournamentSession = sessionId.startsWith('tournament_');
      
      if (isTournamentSession) {
        // ✅ ROBUST: Extrahiere Tournament-ID aus Session-ID
        const tournamentIdMatch = sessionId.match(/^tournament_([^_]+)_passe_/);
        if (tournamentIdMatch) {
          const tournamentId = tournamentIdMatch[1];
          
          // ✅ ELEGANT: Hole groupId direkt aus Tournament-Dokument
          const tournamentDoc = await getDoc(doc(db, 'tournaments', tournamentId));
          if (tournamentDoc.exists()) {
            groupId = tournamentDoc.data()?.groupId || null;
          }
        }
      } else {
        // 2. Normale Session: Hole groupId aus Session-Dokument
        const sessionDoc = await getDoc(doc(db, 'sessions', sessionId));
        if (sessionDoc.exists()) {
          const sessionData = sessionDoc.data();
          groupId = sessionData?.groupId || sessionData?.gruppeId || null;
        }
      }
      
      if (!groupId) {
        console.error(`[loadCompletedGamesFromFirestore] No groupId found for session ${sessionId}`);
        onUpdate([]);
        return;
      }

      const gamesRef = collection(db, 'groups', groupId, 'jassGameSummaries', sessionId, 'completedGames');
      const q = query(gamesRef, orderBy('gameNumber', 'asc'));

      unsubscribeFunction = onSnapshot(q, (querySnapshot) => {
        const games: CompletedGameSummary[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          if (data) {
            games.push(data as CompletedGameSummary);
          }
        });
        onUpdate(games);
      }, (error) => {
        console.error(`[GameService] Fehler beim Laden der abgeschlossenen Spiele für Session ${sessionId}:`, error);
        onUpdate([]);
      });
      
    } catch (error) {
      console.error(`[GameService] Fehler beim Setup des CompletedGames Listeners für Session ${sessionId}:`, error);
      onUpdate([]);
    }
  };
  
  setupListener();
  return () => unsubscribeFunction();
};

/**
 * Richtet einen Echtzeit-Listener für abgeschlossene Spiele einer Session ein.
 * 
 * @param sessionId Die ID der Jass-Session
 * @param callback Callback-Funktion, die bei Änderungen aufgerufen wird
 * @returns Eine Unsubscribe-Funktion, um den Listener wieder zu entfernen
 */
export const subscribeToCompletedGames = (
  sessionId: string,
  callback: (games: CompletedGameSummary[]) => void
): Unsubscribe => {
  if (!sessionId) {
    console.warn("[GameService] subscribeToCompletedGames called without sessionId.");
    return () => {}; // Dummy-Unsubscribe-Funktion
  }

  const db = getFirestore(firebaseApp);
  let unsubscribeFunction: Unsubscribe = () => {};
  
  // 🚀 NEUE ARCHITEKTUR: GroupId aus Session ermitteln und dann Listener einrichten
  const setupListener = async () => {
    try {
      const sessionDoc = await getDoc(doc(db, 'sessions', sessionId));
      let groupId: string | null = null;
      
      if (sessionDoc.exists()) {
        const sessionData = sessionDoc.data();
        groupId = sessionData?.groupId || sessionData?.gruppeId || null;
      }
      
      if (!groupId) {
        console.error(`[subscribeToCompletedGames] No groupId found for session ${sessionId}`);
        callback([]);
        return;
      }
      

      const completedGamesRef = collection(db, 'groups', groupId, 'jassGameSummaries', sessionId, 'completedGames');
      
      const q = query(completedGamesRef, orderBy('gameNumber', 'asc'));
      
      unsubscribeFunction = onSnapshot(q, (snapshot) => {
        const completedGames: CompletedGameSummary[] = [];
        
        snapshot.forEach((doc) => {
          const data = doc.data() as CompletedGameSummary;
          completedGames.push(data);
        });
        
        console.log(`[GameService] Snapshot update: ${completedGames.length} completed games for session ${sessionId}`);
        callback(completedGames);
      }, (error) => {
        console.error(`[GameService] Error in completed games snapshot listener for session ${sessionId}:`, error);
        useUIStore.getState().showNotification({
          type: "error",
          message: "Fehler bei der Echtzeitaktualisierung der abgeschlossenen Spiele.",
        });
      });
      
    } catch (error) {
      console.error(`[GameService] Error setting up completed games listener for session ${sessionId}:`, error);
      useUIStore.getState().showNotification({
        type: "error",
        message: "Fehler beim Einrichten des Listeners für abgeschlossene Spiele.",
      });
    }
  };
  
  // Setup asynchron starten
  setupListener();
  
  // Return-Funktion die den tatsächlichen unsubscribe aufruft
  return () => unsubscribeFunction();
};

/**
 * Markiert spezifische Rundeneinträge in Firestore als inaktiv.
 * Wird verwendet, wenn Runden durch Navigation in der Geschichte überschrieben werden.
 * 
 * @param activeGameId Die ID des aktiven Spiels
 * @param roundIdsToDeactivate Array mit den IDs der zu deaktivierenden Runden
 * @returns Promise, das erfüllt wird, wenn alle Runden erfolgreich deaktiviert wurden
 */
export const markRoundsAsInactive = async (
  activeGameId: string,
  roundIdsToDeactivate: number[]
): Promise<void> => {
  if (!activeGameId || !roundIdsToDeactivate.length) {
    console.log("[GameService] markRoundsAsInactive: Keine activeGameId oder keine zu deaktivierenden Runden.");
    return;
  }

  // console.log(`[GameService] Deaktiviere ${roundIdsToDeactivate.length} Runden für Spiel ${activeGameId}: ${roundIdsToDeactivate.join(', ')}`);

  try {
    // Referenz zur rounds-Subkollektion des aktiven Spiels
    const roundsCollectionRef = collection(db, 'activeGames', activeGameId, 'rounds');
    
    // Finde alle aktiven Rundendokumente mit den angegebenen roundIds
    const q = query(
      roundsCollectionRef,
      where("isActive", "==", true), // Nur aktive Runden
      where("roundId", "in", roundIdsToDeactivate) // Nur die Runden mit den angegebenen IDs
    );
    
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      console.log(`[GameService] Keine zu deaktivierenden Runden gefunden für IDs: ${roundIdsToDeactivate.join(', ')}`);
      return;
    }
    
    // Batch-Update verwenden, um alle Dokumente effizient zu aktualisieren
    const batch = writeBatch(db);
    
    querySnapshot.forEach(docSnapshot => {
      // Jedes gefundene Dokument als inaktiv markieren
      batch.update(docSnapshot.ref, {
        isActive: false,
        deactivatedAt: serverTimestamp(),
        deactivationReason: "history_navigation_overwrite" // Grund für die Deaktivierung speichern
      });
      console.log(`[GameService] Markiere Runde ${docSnapshot.id} (roundId: ${docSnapshot.data().roundId}) als inaktiv`);
    });
    
    // Batch-Update ausführen
    await batch.commit();
    console.log(`[GameService] ${querySnapshot.size} Runden erfolgreich als inaktiv markiert`);
    
  } catch (error) {
    console.error(`[GameService] Fehler beim Deaktivieren der Runden:`, error);
    throw error; // Fehler weiterleiten, damit der Aufrufer reagieren kann
  }
};

/**
 * Markiert spezifische Rundeneinträge in Firestore als aktiv.
 * Wird bei der Navigation zur Wiederherstellung älterer Runden verwendet.
 *
 * @param activeGameId Die ID des aktiven Spiels
 * @param roundIdsToActivate Array mit den IDs der zu aktivierenden Runden
 * @returns Promise, das erfüllt wird, wenn alle Runden erfolgreich aktiviert wurden
 */
export const markRoundsAsActive = async (
  activeGameId: string,
  roundIdsToActivate: number[]
): Promise<void> => {
  if (!activeGameId || !roundIdsToActivate.length) {
    console.log("[GameService] markRoundsAsActive: Keine activeGameId oder keine zu aktivierenden Runden.");
    return;
  }

  console.log(`[GameService] Aktiviere ${roundIdsToActivate.length} Runden für Spiel ${activeGameId}: ${roundIdsToActivate.join(', ')}`);

  try {
    // Referenz zur rounds-Subkollektion des aktiven Spiels
    const roundsCollectionRef = collection(db, 'activeGames', activeGameId, 'rounds');

    // Finde alle Rundendokumente mit den angegebenen roundIds (egal ob aktiv oder inaktiv)
    const q = query(
      roundsCollectionRef,
      where("roundId", "in", roundIdsToActivate)
    );

    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      console.log(`[GameService] Keine zu aktivierenden Runden gefunden für IDs: ${roundIdsToActivate.join(', ')}`);
      return;
    }

    // Batch-Update für alle Dokumente
    const batch = writeBatch(db);

    querySnapshot.forEach(docSnapshot => {
      // KORREKTUR: Nur den neuesten Eintrag pro roundId aktivieren
      // Dies benötigt eine zusätzliche Logik, um pro roundId den Eintrag mit dem höchsten timestamp zu finden.
      // Vereinfachung: Wir gehen davon aus, dass pro roundId nur ein relevanter Eintrag existiert (der letzte gespeicherte)
      // und aktivieren diesen. Eine robustere Lösung würde die Timestamps vergleichen.

      batch.update(docSnapshot.ref, {
        isActive: true,
        reactivatedAt: serverTimestamp(),
        deactivationReason: null // Grund zurücksetzen
      });
      console.log(`[GameService] Markiere Runde ${docSnapshot.id} (roundId: ${docSnapshot.data().roundId}) als aktiv`);
    });

    await batch.commit();
    console.log(`[GameService] ${querySnapshot.size} Runden erfolgreich als aktiv markiert`);

  } catch (error) {
    console.error(`[GameService] Fehler beim Aktivieren der Runden:`, error);
    throw error;
  }
};

/**
 * Markiert ALLE Rundeneinträge mit einer roundId größer als die angegebene als inaktiv.
 * Essentiell für konsistente Rundenhistorie ohne Sprünge.
 *
 * @param activeGameId Die ID des aktiven Spiels
 * @param currentRoundId Die aktuelle roundId - alle höheren IDs werden deaktiviert
 * @returns Promise, erfüllt wenn alle Runden erfolgreich deaktiviert wurden
 */
export const markAllFollowingRoundsAsInactive = async (
  activeGameId: string,
  currentRoundId: number
): Promise<void> => {
  if (!activeGameId) {
    console.log("[GameService] markAllFollowingRoundsAsInactive: Keine activeGameId.");
    return;
  }

  // console.log(`[GameService] Deaktiviere alle aktiven Runden mit ID > ${currentRoundId} für Spiel ${activeGameId}`);

  try {
    const roundsCollectionRef = collection(db, 'activeGames', activeGameId, 'rounds');

    // Finde alle aktiven Rundendokumente mit höherer roundId
    const q = query(
      roundsCollectionRef,
      where("isActive", "==", true),
      where("roundId", ">", currentRoundId)
    );

    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      console.log(`[GameService] Keine aktiven zu deaktivierenden Runden mit höherer ID als ${currentRoundId} gefunden.`);
      return;
    }

    // Batch-Update für alle Dokumente
    const batch = writeBatch(db);

    querySnapshot.forEach(docSnapshot => {
      batch.update(docSnapshot.ref, {
        isActive: false,
        deactivatedAt: serverTimestamp(),
        deactivationReason: "history_overwrite" // Klarer Grund
      });
      console.log(`[GameService] Markiere Runde ${docSnapshot.id} (roundId: ${docSnapshot.data().roundId}) als inaktiv durch History-Überschreibung`);
    });

    await batch.commit();
    console.log(`[GameService] ${querySnapshot.size} Runden mit höherer ID erfolgreich als inaktiv markiert`);

  } catch (error) {
    console.error(`[GameService] Fehler beim Deaktivieren der Runden mit höherer ID:`, error);
    throw error; // Fehler weiterleiten
  }
};

// Hinzugefügt: Schritt 2 - Temporäre Bereinigungsfunktion
/**
 * Sucht in einer Session nach abgeschlossenen Spielen mit einer ID, die mit "game_" beginnt,
 * und löscht diese, da sie als fehlerhaft/dupliziert angesehen werden.
 *
 * @param sessionId Die ID der Jass-Session, die bereinigt werden soll.
 */
export const cleanupDuplicateCompletedGames = async (sessionId: string): Promise<void> => {
  if (!sessionId) {
    console.warn("[Cleanup] cleanupDuplicateCompletedGames ohne sessionId aufgerufen.");
    return;
  }
  console.log(`[Cleanup] Starte Bereinigung für Session ${sessionId}...`);
  const db = getFirestore(firebaseApp);
  try {
    // 🚀 NEUE ARCHITEKTUR: GroupId aus Session ermitteln (OHNE Fallback)
    const sessionDoc = await getDoc(doc(db, 'sessions', sessionId));
    let groupId: string | null = null;
    
    if (sessionDoc.exists()) {
      const sessionData = sessionDoc.data();
      groupId = sessionData?.groupId || sessionData?.gruppeId || null;
    }
    
    if (!groupId) {
      console.error(`[cleanupDuplicateCompletedGames] No groupId found for session ${sessionId}`);
      return;
    }
    

    const gamesRef = collection(db, 'groups', groupId, 'jassGameSummaries', sessionId, 'completedGames');
    
    const snapshot = await getDocs(gamesRef); // Alle Dokumente holen

    if (snapshot.empty) {
      console.log(`[Cleanup] Keine abgeschlossenen Spiele in Session ${sessionId} gefunden.`);
      return;
    }

    // Batch für Löschoperationen vorbereiten
    const batch = writeBatch(db);
    let toDeleteCount = 0;

    // Nach "game_X" Mustern suchen und zum Löschen vormerken
    snapshot.forEach(doc => {
      const docId = doc.id;
      // Prüft, ob die ID mit "game_" beginnt UND ob dahinter eine Zahl folgt
      if (docId.startsWith('game_') && !isNaN(parseInt(docId.substring(5)))) {
        console.log(`[Cleanup] Markiere fehlerhaftes Dokument zur Löschung: ${sessionId}/completedGames/${docId}`);
        batch.delete(doc.ref);
        toDeleteCount++;
      }
    });

    // Batch ausführen, wenn Dokumente zum Löschen gefunden wurden
    if (toDeleteCount > 0) {
      await batch.commit();
      // Entferne verbose success log:
      // console.log(`[Cleanup] ${toDeleteCount} fehlerhafte(s) Dokument(e) in Session ${sessionId} erfolgreich gelöscht.`);
    } else {
      // Entferne "nicht gefunden" log, da dies normal sein kann:
      // console.log(`[Cleanup] Keine fehlerhaften 'game_X'-Dokumente in Session ${sessionId} gefunden.`);
    }
  } catch (error) {
    console.error(`[Cleanup] Fehler beim Bereinigen der Session ${sessionId}:`, error);
     useUIStore.getState().showNotification({
      type: 'error',
      message: `Fehler bei der Bereinigung alter Spieldaten.`,
      duration: 5000
    });
  }
};

// *** NEUE FUNKTION: Erstellt EIN NEUES activeGames Dokument ***
export const createNewActiveGame = async (
  initialState: Omit<ActiveGame, 'activeGameId' | 'createdAt' | 'lastUpdated' | 'status' | 'gameStartTime' | 'jassStartTime'> & { participantUids: string[], groupId: string, sessionId: string }
): Promise<string> => {
  // ✅ VEREINFACHT: Direkte Firestore-Operationen für temporäre ActiveGames
  const activeGamesRef = collection(db, 'activeGames');
  // KORREKTUR: ID VORHER generieren mit doc()
  const newGameDocRef = doc(activeGamesRef); 
  const newGameId = newGameDocRef.id;

  // Bereite die vollständigen Daten vor, inklusive der neuen ID
  const jassStartTime = useTimerStore.getState().jassStartTime;
  const gameData: Omit<ActiveGame, 'activeGameId'> & { activeGameId: string, createdAt: FieldValue, lastUpdated: FieldValue, gameStartTime: Timestamp | FieldValue, jassStartTime: Timestamp | FieldValue, status: 'live' } = {
    ...initialState,
    activeGameId: newGameId, // Füge die ID hier hinzu
    status: 'live',
    createdAt: serverTimestamp(),
    lastUpdated: serverTimestamp(),
    jassStartTime: jassStartTime ? Timestamp.fromMillis(jassStartTime) : serverTimestamp(),
    gameStartTime: jassStartTime ? Timestamp.fromMillis(jassStartTime) : serverTimestamp(),
    // Wichtige Felder explizit initialisieren
    scores: initialState.scores ?? { top: 0, bottom: 0 },
    striche: initialState.striche ?? { top: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 }, bottom: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 } },
    weisPoints: initialState.weisPoints ?? { top: 0, bottom: 0 },
    currentRound: initialState.currentRound ?? 1,
    currentRoundWeis: initialState.currentRoundWeis ?? [],
  };

  try {
    // Bereinige die Daten vor dem Hinzufügen
    const cleanedGameData = sanitizeDataForFirestore(gameData);
    
    // ✅ DIREKT: Alte Struktur für temporäre ActiveGames  
    await setDoc(newGameDocRef, cleanedGameData);
    
    // console.log(`[GameService] Successfully created NEW active game document with ID: ${newGameId}.`);
    return newGameId; // Gib die generierte ID zurück
  } catch (error) {
    console.error("[GameService] Error creating NEW active game document: ", error);
    useUIStore.getState().showNotification({
      type: "error",
      message: "Fehler beim Erstellen des neuen Online-Spiels.",
    });
    throw error;
  }
};

/**
 * Erstellt ein neues activeGame-Dokument UND aktualisiert die Session-currentActiveGameId
 * in einem einzigen atomaren writeBatch. Verhindert inkonsistente Zustände bei Crashes.
 */
export const createGameAndUpdateSession = async (
  initialState: Omit<ActiveGame, 'activeGameId' | 'createdAt' | 'lastUpdated' | 'status' | 'gameStartTime' | 'jassStartTime'> & { participantUids: string[], groupId: string, sessionId: string },
  sessionId: string
): Promise<string> => {
  const activeGamesRef = collection(db, 'activeGames');
  const newGameDocRef = doc(activeGamesRef);
  const newGameId = newGameDocRef.id;
  const sessionDocRef = doc(db, 'sessions', sessionId);

  const jassStartTime = useTimerStore.getState().jassStartTime;
  const gameData = {
    ...initialState,
    activeGameId: newGameId,
    status: 'live' as const,
    createdAt: serverTimestamp(),
    lastUpdated: serverTimestamp(),
    jassStartTime: jassStartTime ? Timestamp.fromMillis(jassStartTime) : serverTimestamp(),
    gameStartTime: jassStartTime ? Timestamp.fromMillis(jassStartTime) : serverTimestamp(),
    scores: initialState.scores ?? { top: 0, bottom: 0 },
    striche: initialState.striche ?? { top: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 }, bottom: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 } },
    weisPoints: initialState.weisPoints ?? { top: 0, bottom: 0 },
    currentRound: initialState.currentRound ?? 1,
    currentRoundWeis: initialState.currentRoundWeis ?? [],
  };

  try {
    const batch = writeBatch(db);
    batch.set(newGameDocRef, sanitizeDataForFirestore(gameData));
    batch.update(sessionDocRef, sanitizeDataForFirestore({
      currentActiveGameId: newGameId,
      lastUpdated: serverTimestamp(),
    }));
    await batch.commit();
    return newGameId;
  } catch (error) {
    console.error("[GameService] Error in createGameAndUpdateSession: ", error);
    useUIStore.getState().showNotification({ type: "error", message: "Fehler beim Starten des nächsten Spiels." });
    throw error;
  }
};

// *** WIEDER EINGEFÜGT: Aktualisiert die currentActiveGameId im Session-Dokument ***
export const updateSessionActiveGameId = async (
  sessionId: string,
  newActiveGameId: string | null // Erlaube auch null, um es zu löschen
): Promise<void> => {
   if (!sessionId) {
    console.warn("[GameService] updateSessionActiveGameId called without sessionId.");
    return;
  }
  const sessionDocRef = doc(db, 'sessions', sessionId);
  try {
    // Bereinige die Daten (obwohl hier nur einfache Typen)
    const updateData = sanitizeDataForFirestore({
      currentActiveGameId: newActiveGameId,
      lastUpdated: serverTimestamp(),
    });
    await updateDoc(sessionDocRef, updateData);

  } catch (error) {
     console.error(`[GameService] Error updating session ${sessionId} with activeGameId ${newActiveGameId}: `, error);
     // Fehler weiterleiten, falls die aufrufende Logik ihn behandeln muss
     // Wir werfen ihn hier, damit ResultatKreidetafel ihn fangen kann
     throw error; 
  }
};

// *** NEU: Erstellt das initiale Session-Dokument ***
export const createSessionDocument = async (
  sessionId: string, 
  initialData: { 
    groupId: string | null; 
    participantUids: string[]; 
    playerNames: PlayerNames; 
    participantPlayerIds?: string[]; // NEU: Optional für initiale Erstellung
    // Füge hier weitere initiale Felder hinzu, die für eine Session benötigt werden
  }
): Promise<void> => {
  if (!sessionId) {
    console.warn("[GameService] createSessionDocument called without sessionId.");
    return;
  }
  const sessionDocRef = doc(db, 'sessions', sessionId);
  try {
    // ✅ PERMISSION-FIX: Stelle sicher, dass beide ID-Arrays gesetzt sind
    const participantPlayerIds = initialData.participantPlayerIds?.length 
      ? initialData.participantPlayerIds 
      : await getPlayerIdsFromUids(initialData.participantUids);

    const fullData = sanitizeDataForFirestore({
      ...initialData,
      participantUids: initialData.participantUids || [], // Sicher stellen
      participantPlayerIds: participantPlayerIds || [], // Aus UIDs ableiten falls nicht gegeben
      startedAt: serverTimestamp(),
      lastUpdated: serverTimestamp(),
      currentActiveGameId: null, // Beginnt ohne aktives Spiel
      notes: "", // Nur noch dieses eine optionale Feld für Notizen
      createdBy: initialData.participantUids?.[0] || null // Erster User als Creator
    });
    await setDoc(sessionDocRef, fullData);

  } catch (error) {
    console.error(`[GameService] Error creating session document ${sessionId}:`, error);
    throw error; // Fehler weiterleiten
  }
};

// ✅ HILFSFUNKTION: PlayerIds aus UIDs ermitteln
async function getPlayerIdsFromUids(uids: string[]): Promise<string[]> {
  const playerIds: string[] = [];
  
  for (const uid of uids) {
    try {
      // User-Dokument abrufen um playerId zu finden
      const userDoc = await getDoc(doc(db, 'users', uid));
      if (userDoc.exists() && userDoc.data()?.playerId) {
        playerIds.push(userDoc.data()!.playerId);
      }
    } catch (error) {
      console.warn(`[GameService] Could not resolve playerId for uid ${uid}:`, error);
      // Ignoriere Fehler für einzelne UIDs - app funktioniert trotzdem
    }
  }
  
  return playerIds;
}

// *** NEU: Aktualisiert die participantPlayerIds einer bestehenden Session ***
export const updateSessionParticipantPlayerIds = async (
  sessionId: string,
  participantPlayerIds: string[]
): Promise<void> => {
  if (!sessionId) {
    console.warn("[GameService] updateSessionParticipantPlayerIds called without sessionId.");
    return;
  }
  const sessionDocRef = doc(db, 'sessions', sessionId);
  try {
    await updateDoc(sessionDocRef, {
      participantPlayerIds: participantPlayerIds,
      lastUpdated: serverTimestamp()
    });

  } catch (error) {
    console.error(`[GameService] Error updating participantPlayerIds for session ${sessionId}:`, error);
    throw error; // Fehler weiterleiten
  }
};

/**
 * Bricht ein aktives Spiel vollständig ab und bereinigt alle Referenzen.
 * Diese Funktion führt folgende Aktionen durch:
 * 1. Setzt den Status des activeGames-Dokuments auf 'aborted'
 * 2. Löscht das activeGames-Dokument nach einer kurzen Verzögerung
 * 3. Bereinigt die currentActiveGameId in der entsprechenden Session
 * 4. Für Turnierspiele: Bereinigt auch die Tournament-Referenzen
 *
 * @param activeGameId Die ID des abzubrechenden Spiels
 * @param options Zusätzliche Optionen für spezielle Fälle
 */
export const abortActiveGame = async (
  activeGameId: string,
  options?: {
    tournamentInstanceId?: string;
    skipSessionCleanup?: boolean;
  }
): Promise<void> => {
  if (!activeGameId) {
    console.warn("[GameService] abortActiveGame called without activeGameId.");
    return;
  }

  // console.log(`[GameService] Starting abort process for game ${activeGameId}`);

  try {
    // SCHRITT 1: Spiel-Dokument laden, um Session-ID zu ermitteln
    const gameDocRef = doc(db, 'activeGames', activeGameId);
    const gameSnap = await getDoc(gameDocRef);
    
    if (!gameSnap.exists()) {
      console.log(`[GameService] Game ${activeGameId} does not exist, cleanup not needed.`);
      return;
    }

    const gameData = gameSnap.data() as ActiveGame;
    const sessionId = gameData.sessionId;
    const tournamentInstanceId = gameData.tournamentInstanceId || options?.tournamentInstanceId;

    // console.log(`[GameService] Game ${activeGameId} found with sessionId: ${sessionId}, tournamentInstanceId: ${tournamentInstanceId || 'none'}`);

    // SCHRITT 2: Status auf 'aborted' setzen (für andere Clients sichtbar)
    await updateDoc(gameDocRef, {
      status: 'aborted',
      lastUpdated: serverTimestamp(),
    });
    // console.log(`[GameService] Game ${activeGameId} status set to 'aborted'`);

    // SCHRITT 3: Session-Referenz bereinigen (falls nicht übersprungen)
    if (!options?.skipSessionCleanup && sessionId) {
      try {
        // Prüfe, ob es eine Tournament-Session oder reguläre Session ist
        if (tournamentInstanceId) {
          // Tournament-Session: Verwende sessions/{tournamentInstanceId}
          const sessionDocRef = doc(db, 'sessions', tournamentInstanceId);
          await updateDoc(sessionDocRef, {
            currentActiveGameId: null,
            lastUpdated: serverTimestamp(),
          });
          console.log(`[GameService] Tournament session ${tournamentInstanceId} cleared of activeGameId`);
        } else {
          // Reguläre Session: Prüfe beide mögliche Collections
          // Zuerst in sessions/{sessionId} suchen
          const sessionsDocRef = doc(db, 'sessions', sessionId);
          const sessionsSnap = await getDoc(sessionsDocRef);
          
          if (sessionsSnap.exists()) {
            await updateDoc(sessionsDocRef, {
              currentActiveGameId: null,
              lastUpdated: serverTimestamp(),
            });
            // console.log(`[GameService] Session ${sessionId} cleared of activeGameId`);
          } else {
            // console.log(`[GameService] Session ${sessionId} does not exist, no cleanup needed`);
          }
        }
      } catch (sessionError) {
        console.error(`[GameService] Error clearing session reference:`, sessionError);
        // Session-Fehler nicht fatal - Spiel kann trotzdem gelöscht werden
      }
    }

    // SCHRITT 4: Tournament-Referenz bereinigen (falls vorhanden)
    if (tournamentInstanceId) {
      try {
        const tournamentDocRef = doc(db, 'tournaments', tournamentInstanceId);
        const tournamentSnap = await getDoc(tournamentDocRef);
        
        if (tournamentSnap.exists()) {
          const tournamentData = tournamentSnap.data();
          // Nur bereinigen, wenn das aktuelle Spiel das aktive Spiel im Tournament ist
          if (tournamentData.currentActiveGameId === activeGameId) {
            await updateDoc(tournamentDocRef, {
              currentActiveGameId: null,
              updatedAt: serverTimestamp(),
              lastActivity: serverTimestamp(),
            });
            console.log(`[GameService] Tournament ${tournamentInstanceId} cleared of activeGameId`);
          }
        }
      } catch (tournamentError) {
        console.error(`[GameService] Error clearing tournament reference:`, tournamentError);
        // Tournament-Fehler nicht fatal
      }
    }

    // SCHRITT 5: Session-Bereinigung VOR der Dokument-Löschung
    // Dies verhindert, dass Fehler in der Session-Bereinigung die Dokument-Löschung blockieren
    if (sessionId && !tournamentInstanceId) {
      // Nur für reguläre Sessions (nicht Tournament-Sessions)
      // console.log(`[GameService] Calling cleanupAbortedSession for session ${sessionId} BEFORE deleting game document`);
      try {
        await cleanupAbortedSession(sessionId);
        // console.log(`[GameService] Session ${sessionId} cleanup completed successfully`);
      } catch (cleanupError) {
        console.error(`[GameService] Error during session cleanup for ${sessionId}:`, cleanupError);
        // Session-Cleanup-Fehler sind nicht fatal - wir löschen das Spiel trotzdem
        console.log(`[GameService] Continuing with game document deletion despite session cleanup error`);
      }
    }

    // SCHRITT 6: Kurze Verzögerung, dann Dokument löschen
    // Dies gibt anderen Clients Zeit, den 'aborted' Status zu sehen
    setTimeout(async () => {
      try {
        // console.log(`[GameService] Attempting to delete game document ${activeGameId} after 2 second delay...`);
        
        // 🔧 FIX: Prüfe ob das Dokument noch existiert bevor wir es löschen
        const currentGameSnap = await getDoc(gameDocRef);
        if (!currentGameSnap.exists()) {
          // console.log(`[GameService] Game document ${activeGameId} was already deleted (likely by Cloud Function cleanup). No action needed.`);
          return;
        }
        
        await deleteDoc(gameDocRef);
        // console.log(`[GameService] Game document ${activeGameId} deleted successfully`);
        
      } catch (deleteError) {
        console.error(`[GameService] CRITICAL ERROR: Failed to delete game document ${activeGameId}:`, deleteError);
        
        // 🔧 FIX: Weniger alarmierend, da das Dokument möglicherweise bereits gelöscht wurde
        if (deleteError instanceof Error && (
          deleteError.message.includes('Missing or insufficient permissions') ||
          deleteError.message.includes('No document to update')
        )) {
          console.log(`[GameService] Document ${activeGameId} was likely already cleaned up. This is expected.`);
          return;
        }
        
        // Zeige Benutzer-Notification nur bei echten kritischen Fehlern
        useUIStore.getState().showNotification({
          type: 'warning',
          message: `Spiel wurde erfolgreich abgebrochen, aber Bereinigung ist unvollständig.`,
          duration: 5000
        });
      }
    }, 2000); // 2 Sekunden Verzögerung

    // console.log(`[GameService] Abort process completed for game ${activeGameId}`);

  } catch (error) {
    console.error(`[GameService] Error aborting game ${activeGameId}:`, error);
    throw new Error(`Fehler beim Abbrechen des Spiels: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`);
  }
};

// *** NEUE FUNKTION: Löscht eine abgebrochene Session und alle zugehörigen activeGames-Einträge ***
export const cleanupAbortedSession = async (sessionId: string): Promise<void> => {
  if (!sessionId) {
    console.warn("[GameService] cleanupAbortedSession ohne sessionId aufgerufen.");
    return;
  }

  // console.log(`[GameService] Starte Bereinigung für Session ${sessionId}...`);

  try {
    // Cloud Function aufrufen
    const functions = getFunctions(firebaseApp, 'europe-west1');
    const cleanupFunction = httpsCallable(functions, 'cleanupAbortedSession');
    
    const result = await cleanupFunction({ sessionId });
    const responseData = result.data as { 
      success: boolean; 
      deletedSession: string; 
      deletedGamesCount: number; 
      message: string; 
    };

    if (responseData.success) {
      // console.log(`[GameService] Session ${sessionId} erfolgreich bereinigt: ${responseData.deletedGamesCount} Spiele gelöscht.`);
      
      useUIStore.getState().showNotification({
        type: 'success',
        message: responseData.message,
      });
    } else {
      throw new Error('Cloud Function gab Fehler zurück');
    }

  } catch (error) {
    console.error(`[GameService] Fehler beim Bereinigen der Session ${sessionId}:`, error);
    
    let errorMessage = 'Fehler beim Löschen der Session.';
    if (error instanceof Error) {
      if (error.message.includes('permission-denied')) {
        errorMessage = 'Keine Berechtigung zum Löschen dieser Session.';
      } else if (error.message.includes('not-found')) {
        errorMessage = 'Session nicht gefunden.';
      } else {
        errorMessage = `Fehler beim Löschen: ${error.message}`;
      }
    }
    
    useUIStore.getState().showNotification({
      type: 'error',
      message: errorMessage,
      duration: 5000
    });
    
    throw error; // Fehler weiterleiten für weitere Behandlung
  }
}; 