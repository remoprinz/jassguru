#!/usr/bin/env node

/**
 * Admin-Script: Re-prozessiere manuell hochgeladene Profilbilder
 * 
 * Dieses Script lädt bestehende Profilbilder herunter und prozessiert sie
 * durch die normale Upload-Pipeline (Crop + Komprimierung), um sie zu optimieren.
 * 
 * Usage: node scripts/reprocess-profile-images.mjs
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getAuth } from 'firebase-admin/auth';
import fetch from 'node-fetch';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Firebase Admin initialisieren
const serviceAccountPath = join(__dirname, '../functions/service-account-key.json');

let app;
try {
  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    app = initializeApp({
      credential: cert(serviceAccount),
      storageBucket: 'jassguru-app.appspot.com'
    });
  } else {
    // Fallback für Cloud Environment
    app = initializeApp();
  }
} catch (error) {
  console.error('❌ Firebase Admin Initialisierung fehlgeschlagen:', error);
  process.exit(1);
}

const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);

// Die drei Benutzer, die re-prozessiert werden sollen
const USERS_TO_REPROCESS = [
  '0QXvICHVH9cW60EQyZsNs1CRjtI2', // Karim (karim.png)
  'j6joaEvLqKayu4GV580Dt7EsZQg1', // User 2 (profile.jpeg)
  'kncNFPFutUPu3sLnbiiDBOjer0v2'  // User 3 (profile.png)
];

/**
 * Simuliert die Crop-Funktion (vereinfacht - nur zentrierter Crop)
 */
async function cropImageToSquare(imageBuffer) {
  try {
    const image = sharp(imageBuffer);
    const metadata = await image.metadata();
    
    if (!metadata.width || !metadata.height) {
      throw new Error('Konnte Bildabmessungen nicht ermitteln');
    }
    
    // Quadratischer Crop (zentral)
    const size = Math.min(metadata.width, metadata.height);
    const left = Math.floor((metadata.width - size) / 2);
    const top = Math.floor((metadata.height - size) / 2);
    
    const croppedBuffer = await image
      .extract({ left, top, width: size, height: size })
      .jpeg({ quality: 90 }) // Entspricht der Crop Modal Qualität
      .toBuffer();
    
    return croppedBuffer;
  } catch (error) {
    console.error('Crop-Fehler:', error);
    throw error;
  }
}

/**
 * Simuliert die Komprimierung aus imageUtils.ts
 */
async function compressImage(imageBuffer, maxWidthOrHeight = 800, quality = 0.8) {
  try {
    const image = sharp(imageBuffer);
    const metadata = await image.metadata();
    
    if (!metadata.width || !metadata.height) {
      throw new Error('Konnte Bildabmessungen nicht ermitteln');
    }
    
    // Resize auf max Dimension
    let resizeOptions = {};
    if (metadata.width > maxWidthOrHeight || metadata.height > maxWidthOrHeight) {
      resizeOptions = {
        width: maxWidthOrHeight,
        height: maxWidthOrHeight,
        fit: 'inside',
        withoutEnlargement: true
      };
    }
    
    const compressedBuffer = await image
      .resize(resizeOptions)
      .jpeg({ 
        quality: Math.round(quality * 100),
        progressive: true,
        mozjpeg: true
      })
      .toBuffer();
    
    // Prüfe Dateigröße (1MB Limit)
    const maxSizeBytes = 1 * 1024 * 1024; // 1MB
    if (compressedBuffer.length > maxSizeBytes) {
      console.warn(`⚠️ Bild nach Komprimierung immer noch > 1MB: ${(compressedBuffer.length / 1024 / 1024).toFixed(2)}MB`);
      
      // Weitere Komprimierung falls nötig
      const furtherCompressedBuffer = await sharp(compressedBuffer)
        .jpeg({ quality: 70 })
        .toBuffer();
      
      return furtherCompressedBuffer;
    }
    
    return compressedBuffer;
  } catch (error) {
    console.error('Komprimierungs-Fehler:', error);
    throw error;
  }
}

/**
 * Re-prozessiert ein Profilbild für einen User
 */
async function reprocessUserProfileImage(userId) {
  try {
    console.log(`\n🔄 Beginne Re-Prozessierung für User: ${userId}`);
    
    // 1. User-Daten aus Firebase Auth holen
    const userRecord = await auth.getUser(userId);
    if (!userRecord.photoURL) {
      console.log(`⏭️ User ${userId} hat kein Profilbild - überspringe`);
      return;
    }
    
    console.log(`📥 Lade vorhandenes Bild herunter: ${userRecord.photoURL}`);
    
    // 2. Vorhandenes Bild herunterladen
    const response = await fetch(userRecord.photoURL);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const originalBuffer = Buffer.from(await response.arrayBuffer());
    const originalSizeMB = (originalBuffer.length / 1024 / 1024).toFixed(2);
    console.log(`📊 Original-Bildgröße: ${originalSizeMB}MB`);
    
    // 3. Crop-Simulation (quadratisch)
    console.log(`✂️ Crop zu quadratischem Format...`);
    const croppedBuffer = await cropImageToSquare(originalBuffer);
    const croppedSizeMB = (croppedBuffer.length / 1024 / 1024).toFixed(2);
    console.log(`📊 Nach Crop: ${croppedSizeMB}MB`);
    
    // 4. Komprimierung (wie in imageUtils.ts)
    console.log(`🗜️ Komprimiere auf 800px, 80% Qualität...`);
    const compressedBuffer = await compressImage(croppedBuffer, 800, 0.8);
    const finalSizeMB = (compressedBuffer.length / 1024 / 1024).toFixed(2);
    console.log(`📊 Nach Komprimierung: ${finalSizeMB}MB`);
    
    // 5. Zurück zu Firebase Storage hochladen
    const bucket = storage.bucket();
    const fileName = `profileImages/${userId}/profile.jpg`; // Standard-Format
    const file = bucket.file(fileName);
    
    console.log(`⬆️ Lade optimiertes Bild hoch: ${fileName}`);
    
    await file.save(compressedBuffer, {
      metadata: {
        contentType: 'image/jpeg',
        metadata: {
          originalSize: originalSizeMB + 'MB',
          optimizedSize: finalSizeMB + 'MB',
          reprocessedAt: new Date().toISOString(),
          reprocessedBy: 'admin-script'
        }
      },
      public: false // Nicht öffentlich, nur über downloadURL
    });
    
    // 6. Neue Download-URL generieren
    const [downloadURL] = await file.getSignedUrl({
      action: 'read',
      expires: '03-01-2500' // Lange Gültigkeitsdauer
    });
    
    // 7. Firebase Auth aktualisieren
    await auth.updateUser(userId, {
      photoURL: downloadURL
    });
    
    // 8. Player-Dokument in Firestore aktualisieren (falls vorhanden)
    try {
      const playersRef = db.collection('players');
      const playerQuery = await playersRef.where('userId', '==', userId).get();
      
      if (!playerQuery.empty) {
        const playerDoc = playerQuery.docs[0];
        await playerDoc.ref.update({
          photoURL: downloadURL,
          updatedAt: new Date()
        });
        console.log(`✅ Player-Dokument aktualisiert: ${playerDoc.id}`);
      }
    } catch (firestoreError) {
      console.warn(`⚠️ Player-Dokument nicht gefunden oder Update fehlgeschlagen:`, firestoreError.message);
    }
    
    console.log(`✅ Re-Prozessierung abgeschlossen für User ${userId}`);
    console.log(`📈 Optimierung: ${originalSizeMB}MB → ${finalSizeMB}MB (${((1 - finalSizeMB/originalSizeMB) * 100).toFixed(1)}% kleiner)`);
    
  } catch (error) {
    console.error(`❌ Fehler bei User ${userId}:`, error);
  }
}

/**
 * Hauptfunktion
 */
async function main() {
  console.log('🚀 Admin-Script: Re-Prozessierung von Profilbildern');
  console.log('=' .repeat(60));
  
  if (USERS_TO_REPROCESS.some(id => id.startsWith('USER_ID_'))) {
    console.error('❌ Bitte ersetzen Sie die Platzhalter USER_ID_X mit echten User IDs!');
    process.exit(1);
  }
  
  console.log(`📋 ${USERS_TO_REPROCESS.length} User(s) zur Re-Prozessierung:`);
  USERS_TO_REPROCESS.forEach((id, index) => {
    console.log(`   ${index + 1}. ${id}`);
  });
  
  for (const userId of USERS_TO_REPROCESS) {
    await reprocessUserProfileImage(userId);
  }
  
  console.log('\n🎉 Re-Prozessierung aller Benutzer abgeschlossen!');
  console.log('💡 Die Bilder sind jetzt optimiert und sollten deutlich schneller laden.');
}

// Script ausführen
main().catch(error => {
  console.error('💥 Unbehandelter Fehler:', error);
  process.exit(1);
}); 