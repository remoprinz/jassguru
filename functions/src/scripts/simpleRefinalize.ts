#!/usr/bin/env node

import * as admin from 'firebase-admin';
import { initializeApp } from 'firebase-admin/app';

// Firebase Admin SDK initialisieren
const serviceAccount = require('../../../serviceAccountKey.json');
initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'jassguru-8c8d8'
});

const db = admin.firestore();

async function refinalizeTournament(tournamentId: string) {
  console.log(`🔄 Refinalisiere Turnier: ${tournamentId}`);
  
  try {
    // 1. Turnier-Dokument laden
    const tournamentRef = db.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();
    
    if (!tournamentDoc.exists) {
      throw new Error(`Turnier ${tournamentId} nicht gefunden`);
    }
    
    const tournamentData = tournamentDoc.data();
    console.log(`📊 Turnier gefunden: ${tournamentData?.name}`);
    
    // 2. finalizeTournament Funktion aufrufen
    const { finalizeTournamentInternal } = await import('../finalizeTournament');
    
    console.log(`🚀 Starte finalizeTournamentInternal...`);
    const result = await finalizeTournamentInternal(tournamentId);
    
    console.log(`✅ Turnier erfolgreich refinalisiert!`);
    console.log(`📈 Ergebnis:`, result);
  } catch (error) {
    console.error(`❌ Fehler beim Refinalisieren:`, error);
    throw error;
  }
}

// Script ausführen
const tournamentId = process.argv[2];
if (!tournamentId) {
  console.error('❌ Bitte Turnier-ID als Parameter angeben');
  console.error('Usage: node simpleRefinalize.js <tournamentId>');
  process.exit(1);
}

refinalizeTournament(tournamentId)
  .then(() => {
    console.log('🎉 Script erfolgreich abgeschlossen!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Script fehlgeschlagen:', error);
    process.exit(1);
  });
