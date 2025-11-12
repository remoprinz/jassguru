#!/usr/bin/env node

import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCREENSHOTS_DIR = path.join(__dirname, '../public/assets/screenshots');
const BACKUP_DIR = path.join(__dirname, '../public/assets/screenshots-backup');

async function compressScreenshots() {
  console.log('🖼️  Starte Screenshot-Komprimierung...');
  
  try {
    // Backup erstellen
    console.log('📦 Erstelle Backup...');
    await fs.mkdir(BACKUP_DIR, { recursive: true });
    
    const files = await fs.readdir(SCREENSHOTS_DIR);
    const pngFiles = files.filter(file => file.endsWith('.PNG') || file.endsWith('.png'));
    
    console.log(`📁 Gefunden: ${pngFiles.length} PNG-Dateien`);
    
    let totalOriginalSize = 0;
    let totalCompressedSize = 0;
    
    for (const file of pngFiles) {
      const inputPath = path.join(SCREENSHOTS_DIR, file);
      const backupPath = path.join(BACKUP_DIR, file);
      
      // Backup erstellen
      await fs.copyFile(inputPath, backupPath);
      
      // Dateigröße vor Komprimierung
      const originalStats = await fs.stat(inputPath);
      totalOriginalSize += originalStats.size;
      
      // Komprimierung mit Sharp (temporäre Datei verwenden)
      const tempPath = inputPath + '.tmp';
      await sharp(inputPath)
        .png({
          quality: 85,        // Qualität (0-100)
          compressionLevel: 9, // Kompression (0-9, 9 = max)
          adaptiveFiltering: true,
          palette: true,      // Palette-Modus für bessere Kompression
        })
        .toFile(tempPath);
      
      // Temporäre Datei über die Originaldatei ersetzen
      await fs.rename(tempPath, inputPath);
      
      // Dateigröße nach Komprimierung
      const compressedStats = await fs.stat(inputPath);
      totalCompressedSize += compressedStats.size;
      
      const saved = originalStats.size - compressedStats.size;
      const savedPercent = ((saved / originalStats.size) * 100).toFixed(1);
      
      console.log(`✅ ${file}: ${(originalStats.size / 1024).toFixed(1)}KB → ${(compressedStats.size / 1024).toFixed(1)}KB (${savedPercent}% gespart)`);
    }
    
    const totalSaved = totalOriginalSize - totalCompressedSize;
    const totalSavedPercent = ((totalSaved / totalOriginalSize) * 100).toFixed(1);
    
    console.log('\n🎉 Komprimierung abgeschlossen!');
    console.log(`📊 Gesamt: ${(totalOriginalSize / 1024).toFixed(1)}KB → ${(totalCompressedSize / 1024).toFixed(1)}KB`);
    console.log(`💰 Gespart: ${(totalSaved / 1024).toFixed(1)}KB (${totalSavedPercent}%)`);
    console.log(`💾 Backup erstellt in: ${BACKUP_DIR}`);
    
  } catch (error) {
    console.error('❌ Fehler bei der Komprimierung:', error);
    process.exit(1);
  }
}

// Skript ausführen
compressScreenshots();
