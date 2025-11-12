#!/usr/bin/env node

/**
 * Vereinfachtes Admin-Script: Profilbilder herunterladen und optimieren
 * 
 * Dieses Script lädt die Bilder herunter, optimiert sie und speichert sie lokal.
 * Sie können sie dann manuell in Firebase hochladen.
 * 
 * Usage: node scripts/reprocess-profile-images-simple.mjs
 */

import fetch from 'node-fetch';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

// Die drei Benutzer und ihre aktuellen Bild-URLs
const USERS_TO_REPROCESS = [
  {
    userId: '0QXvICHVH9cW60EQyZsNs1CRjtI2',
    name: 'Karim',
    imageUrl: 'https://firebasestorage.googleapis.com/v0/b/jassguru.firebasestorage.app/o/profilePictures%2F0QXvICHVH9cW60EQyZsNs1CRjtI2%2Fkarim.png?alt=media&token=1d75a31e-7a2b-4f9d-90eb-a445f4747b75'
  },
  {
    userId: 'j6joaEvLqKayu4GV580Dt7EsZQg1',
    name: 'User2',
    imageUrl: 'https://firebasestorage.googleapis.com/v0/b/jassguru.firebasestorage.app/o/profilePictures%2Fj6joaEvLqKayu4GV580Dt7EsZQg1%2Fprofile.jpeg?alt=media&token=3d6c3f04-92fd-4832-a060-be0d566de153'
  },
  {
    userId: 'kncNFPFutUPu3sLnbiiDBOjer0v2',
    name: 'User3',
    imageUrl: 'https://firebasestorage.googleapis.com/v0/b/jassguru.firebasestorage.app/o/profilePictures%2FkncNFPFutUPu3sLnbiiDBOjer0v2%2Fprofile.png?alt=media&token=b587ad55-f0db-4114-b1b9-82291ca2f815'
  }
];

/**
 * Crop Bild zu quadratischem Format
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
      .jpeg({ quality: 90 })
      .toBuffer();
    
    return croppedBuffer;
  } catch (error) {
    console.error('Crop-Fehler:', error);
    throw error;
  }
}

/**
 * Komprimiere Bild
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
 * Prozessiere ein Profilbild
 */
async function processUserProfileImage(user) {
  try {
    console.log(`\n🔄 Beginne Re-Prozessierung für ${user.name} (${user.userId})`);
    
    console.log(`📥 Lade Bild herunter: ${user.imageUrl}`);
    
    // 1. Bild herunterladen
    const response = await fetch(user.imageUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const originalBuffer = Buffer.from(await response.arrayBuffer());
    const originalSizeMB = (originalBuffer.length / 1024 / 1024).toFixed(2);
    console.log(`📊 Original-Bildgröße: ${originalSizeMB}MB`);
    
    // 2. Crop zu quadratischem Format
    console.log(`✂️ Crop zu quadratischem Format...`);
    const croppedBuffer = await cropImageToSquare(originalBuffer);
    const croppedSizeMB = (croppedBuffer.length / 1024 / 1024).toFixed(2);
    console.log(`📊 Nach Crop: ${croppedSizeMB}MB`);
    
    // 3. Komprimierung
    console.log(`🗜️ Komprimiere auf 800px, 80% Qualität...`);
    const compressedBuffer = await compressImage(croppedBuffer, 800, 0.8);
    const finalSizeMB = (compressedBuffer.length / 1024 / 1024).toFixed(2);
    console.log(`📊 Nach Komprimierung: ${finalSizeMB}MB`);
    
    // 4. Lokal speichern
    const outputDir = './optimized-profiles';
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const outputPath = path.join(outputDir, `${user.userId}_${user.name}_optimized.jpg`);
    fs.writeFileSync(outputPath, compressedBuffer);
    
    console.log(`💾 Optimiertes Bild gespeichert: ${outputPath}`);
    console.log(`📈 Optimierung: ${originalSizeMB}MB → ${finalSizeMB}MB (${((1 - finalSizeMB/originalSizeMB) * 100).toFixed(1)}% kleiner)`);
    
  } catch (error) {
    console.error(`❌ Fehler bei ${user.name} (${user.userId}):`, error);
  }
}

/**
 * Hauptfunktion
 */
async function main() {
  console.log('🚀 Vereinfachtes Admin-Script: Profilbild-Optimierung');
  console.log('=' .repeat(60));
  
  console.log(`📋 ${USERS_TO_REPROCESS.length} User(s) zur Re-Prozessierung:`);
  USERS_TO_REPROCESS.forEach((user, index) => {
    console.log(`   ${index + 1}. ${user.name} (${user.userId})`);
  });
  
  for (const user of USERS_TO_REPROCESS) {
    await processUserProfileImage(user);
  }
  
  console.log('\n🎉 Re-Prozessierung aller Benutzer abgeschlossen!');
  console.log('📁 Optimierte Bilder befinden sich im Ordner: ./optimized-profiles/');
  console.log('📝 Nächster Schritt: Laden Sie die optimierten Bilder manuell in Firebase Storage hoch:');
  console.log('   - Firebase Console → Storage → profileImages/{userId}/profile.jpg');
  console.log('   - Dann die photoURL in Firebase Auth + Firestore aktualisieren');
}

// Script ausführen
main().catch(error => {
  console.error('💥 Unbehandelter Fehler:', error);
  process.exit(1);
}); 