#!/usr/bin/env node

import admin from 'firebase-admin';
import fs from 'fs';

// Service Account Key laden
const serviceAccount = JSON.parse(fs.readFileSync('/tmp/firebase-service-account.json', 'utf8'));

// Firebase Admin initialisieren
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: `https://${serviceAccount.project_id}-default-rtdb.europe-west1.firebasedatabase.app/`
});

const db = admin.firestore();

async function analyzeFirestoreStructure() {
  console.log('🔍 FIREBASE JASSTAFEL ARCHITEKTUR-ANALYSE');
  console.log('=' .repeat(80));
  
  try {
    // Collections analysieren
    const collections = ['users', 'players', 'groups', 'sessions', 'activeGames', 'tournaments', 'jassGameSummaries', 'groupComputedStats', 'playerComputedStats'];
    
    for (const collectionName of collections) {
      console.log(`\n📁 COLLECTION: ${collectionName.toUpperCase()}`);
      console.log('-'.repeat(60));
      
      try {
        const snapshot = await db.collection(collectionName).limit(5).get();
        console.log(`📊 Anzahl Dokumente (Sample): ${snapshot.size}`);
        
        if (!snapshot.empty) {
          // Erstes Dokument analysieren für Struktur
          const firstDoc = snapshot.docs[0];
          const data = firstDoc.data();
          
          console.log(`🔑 Beispiel-Dokument ID: ${firstDoc.id}`);
          console.log(`📋 Felder (${Object.keys(data).length}):`);
          
          Object.keys(data).forEach(key => {
            const value = data[key];
            const type = typeof value;
            if (value && value.constructor) {
              if (value.constructor.name === 'Timestamp') {
                console.log(`  • ${key}: Timestamp`);
              } else if (Array.isArray(value)) {
                console.log(`  • ${key}: Array[${value.length}]`);
              } else if (type === 'object') {
                console.log(`  • ${key}: Object (${Object.keys(value).length} keys)`);
              } else {
                console.log(`  • ${key}: ${type}`);
              }
            } else {
              console.log(`  • ${key}: ${type}`);
            }
          });
          
          // Dokument-Größe schätzen
          const docSize = JSON.stringify(data).length;
          console.log(`📦 Geschätzte Dokumentgröße: ${docSize} bytes`);
        } else {
          console.log('📭 Collection ist leer');
        }
        
        // Collection-Größe schätzen
        const countSnapshot = await db.collection(collectionName).count().get();
        console.log(`📈 Total Dokumente: ${countSnapshot.data().count}`);
        
      } catch (error) {
        console.log(`❌ Fehler beim Analysieren von ${collectionName}:`, error.message);
      }
    }
    
    // Firestore Rules analysieren
    console.log('\n🛡️  SECURITY RULES ANALYSE');
    console.log('-'.repeat(60));
    
    try {
      const rulesFile = fs.readFileSync('/Users/remoprinz/Documents/Jassguru/jasstafel/firestore.rules', 'utf8');
      const ruleLines = rulesFile.split('\n');
      const matchRules = ruleLines.filter(line => line.trim().startsWith('match '));
      
      console.log(`📜 Gefundene Security Rules: ${matchRules.length}`);
      matchRules.forEach(rule => {
        console.log(`  • ${rule.trim()}`);
      });
    } catch (error) {
      console.log('❌ Konnte Firestore Rules nicht lesen:', error.message);
    }
    
    console.log('\n✅ ANALYSE ABGESCHLOSSEN');
    console.log('=' .repeat(80));
    
  } catch (error) {
    console.error('❌ Fehler bei der Analyse:', error);
  } finally {
    // Cleanup
    admin.app().delete();
    process.exit(0);
  }
}

// Analyse starten
analyzeFirestoreStructure();
