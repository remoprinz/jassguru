// src/constants/jassErfassenMessages.js

export const JASS_ERFASSEN_MESSAGES = {
  // Allgemeine Nachrichten
  GENERAL: {
    ERROR: 'Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.',
    LOADING: 'Daten werden geladen...',
    SAVING: 'Daten werden gespeichert...',
  },

  // Modus Erfassen (Schritt 1)
  MODUS_ERFASSEN: {
    SELECT_PROMPT: 'Bitte wählen Sie den Spielmodus aus.',
    SELECTED: 'Spielmodus "{mode}" ausgewählt. Wählen Sie nun eine Gruppe aus.',
    ERROR: 'Fehler bei der Auswahl des Spielmodus. Bitte versuchen Sie es erneut.',
  },

  // Gruppe Auswählen (Schritt 2)
  GROUP_SELECT: {
    LOADING: 'Gruppen werden geladen...',
    LOAD_ERROR: 'Fehler beim Laden der Gruppen. Bitte versuchen Sie es erneut.',
    SELECT_PROMPT: 'Bitte wählen Sie eine Gruppe aus.',
    INVALID_SELECTION: 'Ungültige Gruppenauswahl.',
    SELECTED: 'Gruppe "{groupName}" ausgewählt.',
    CONFIRMED: 'Gruppe "{groupName}" bestätigt. Wählen Sie nun die Spieler aus.',
    ERROR: 'Fehler bei der Auswahl der Gruppe. Bitte versuchen Sie es erneut.',
  },

  // Spieler Erfassen (Schritt 3)
  PLAYER_SELECT: {
    LOADING: 'Spieler werden geladen...',
    LOAD_ERROR: 'Fehler beim Laden der Spieler. Bitte versuchen Sie es erneut.',
    SELECT_PROMPT: 'Bitte wählen Sie die Spieler aus.',
    PLAYER_ADDED: 'Spieler "{playerName}" wurde für Position {position} ausgewählt.',
    PLAYER_REMOVED: 'Spieler "{playerName}" wurde von Position {position} entfernt.',
    ALL_SELECTED: 'Alle Spieler ausgewählt. Wer darf heute zuerst ansagen?',
    ERROR: 'Fehler bei der Auswahl der Spieler. Bitte überprüfen Sie Ihre Auswahl.',
    DUPLICATE_SELECTION: 'Spieler "{playerName}" ist bereits ausgewählt. Bitte wählen Sie einen anderen Spieler.',
    INVALID_SELECTION: 'Ungültige Spielerauswahl. Bitte versuchen Sie es erneut.',
    NOT_ENOUGH_PLAYERS: 'Es müssen genau 4 Spieler ausgewählt werden.',
    NOT_FOUND: 'Kein Spieler gefunden.',
    NO_MATCHING_PLAYER: 'Kein passender Spieler für diese Gruppe gefunden.',
  },

  // Rosen 10 Spieler (Schritt 4)
  ROSEN10_PLAYER: {
    SELECTED: '"{playerName}" darf heute das Spiel beginnen.',
  },

  // Jass Erfassen Übersicht (Schritt 5)
  OVERVIEW: {
    READY: 'Bitte überprüfen Sie Ihre Angaben.',
    CONFIRMED: 'Alles klar? Sie können das Spiel jetzt starten.',
    ERROR: 'Fehler beim Laden der Übersicht. Bitte versuchen Sie es erneut.',
  },

  // Spiel Starten/Speichern
  GAME: {
    STARTED: 'Jass erfolgreich gestartet',
    SAVED: 'Das Spiel wurde erfolgreich gespeichert.',
    ERROR: 'Ein Fehler ist beim Starten des Jass aufgetreten.'
  },
  
  FINALIZE: {
    INVALID_DATA: 'Ungültige Jass-Daten',
    ERROR: 'Ein Fehler ist beim Finalisieren des Jass aufgetreten.'
  },
};
