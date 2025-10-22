#!/usr/bin/env node

/**
 * 🔧 MASTER FIX SCRIPT (SICHERE VERSION)
 * 
 * Ruft die masterFix Cloud Function auf, um fehlende ratingHistory Einträge zu reparieren
 * 
 * ✅ SICHERHEIT: Verwendet Umgebungsvariablen statt hardcodierte API Keys
 */

import { initializeApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

// Firebase Config aus Umgebungsvariablen
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Validierung der Umgebungsvariablen
function validateConfig() {
  const requiredVars = [
    'NEXT_PUBLIC_FIREBASE_API_KEY',
    'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
    'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
    'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
    'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
    'NEXT_PUBLIC_FIREBASE_APP_ID'
  ];

  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.error('❌ Fehlende Umgebungsvariablen:', missingVars.join(', '));
    console.error('💡 Bitte setzen Sie diese Variablen in Ihrer .env Datei');
    process.exit(1);
  }
}

async function callMasterFix(groupId: string, sessionId: string) {
  try {
    console.log('🔧 Calling masterFix function...');
    console.log(`📊 Group: ${groupId}`);
    console.log(`🎮 Session: ${sessionId}`);
    
    // Firebase App initialisieren
    const app = initializeApp(firebaseConfig);
    const functions = getFunctions(app);
    
    // Master Fix Function aufrufen
    const masterFix = httpsCallable(functions, 'masterFix');
    
    const result = await masterFix({
      groupId: groupId,
      sessionId: sessionId
    });
    
    console.log('✅ Master Fix completed successfully!');
    console.log('📋 Result:', result.data);
    
    return result.data;
    
  } catch (error) {
    console.error('❌ Master Fix failed:', error);
    throw error;
  }
}

// Script ausführen
if (require.main === module) {
  // Umgebungsvariablen validieren
  validateConfig();
  
  const groupId = process.argv[2] || 'Rosen10player';
  const sessionId = process.argv[3] || 'kFI60_GTBnYADP7BQZSg9';
  
  callMasterFix(groupId, sessionId)
    .then(() => {
      console.log('🔧 Master Fix completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Master Fix failed:', error);
      process.exit(1);
    });
}

export { callMasterFix };
