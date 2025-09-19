#!/usr/bin/env node

/**
 * Clean Migration: Add matschBonus field to existing groups and tournaments
 * 
 * This script adds the missing `matschBonus: true` field to existing scoreSettings
 * in groups and tournament instances, making it look like it was always there.
 * 
 * Usage: node scripts/migrate-matschbonus.js
 */

import admin from 'firebase-admin';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin
const serviceAccountPath = path.join(__dirname, '../firebase-service-account.json');

if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(await import('fs').then(fs => fs.readFileSync(serviceAccountPath, 'utf8')));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id
    });
    console.log('✅ Firebase Admin initialized successfully');
  } catch (error) {
    console.error('❌ Error initializing Firebase Admin:', error.message);
    console.log('Please ensure firebase-service-account.json exists in the project root');
    process.exit(1);
  }
}

const db = admin.firestore();

/**
 * Migrate Groups: Add matschBonus to scoreSettings
 */
async function migrateGroups() {
  console.log('\n🔍 Scanning groups collection...');
  
  try {
    const groupsSnapshot = await db.collection('groups').get();
    let processedCount = 0;
    let updatedCount = 0;
    
    const batch = db.batch();
    
    for (const doc of groupsSnapshot.docs) {
      processedCount++;
      const data = doc.data();
      
      // Check if scoreSettings exists and matschBonus is missing
      if (data.scoreSettings && typeof data.scoreSettings.matschBonus === 'undefined') {
        console.log(`📝 Group "${data.name}" (${doc.id}) - Adding matschBonus field`);
        
        // Create updated scoreSettings with matschBonus
        const updatedScoreSettings = {
          ...data.scoreSettings,
          matschBonus: true
        };
        
        // Update only the scoreSettings field
        batch.update(doc.ref, {
          scoreSettings: updatedScoreSettings
        });
        
        updatedCount++;
      }
    }
    
    if (updatedCount > 0) {
      await batch.commit();
      console.log(`✅ Groups migration completed: ${updatedCount}/${processedCount} groups updated`);
    } else {
      console.log(`✅ Groups migration completed: All ${processedCount} groups already have matschBonus field`);
    }
    
  } catch (error) {
    console.error('❌ Error migrating groups:', error);
    throw error;
  }
}

/**
 * Migrate Tournament Instances: Add matschBonus to settings.scoreSettings
 */
async function migrateTournaments() {
  console.log('\n🔍 Scanning tournament_instances collection...');
  
  try {
    const tournamentsSnapshot = await db.collection('tournament_instances').get();
    let processedCount = 0;
    let updatedCount = 0;
    
    const batch = db.batch();
    
    for (const doc of tournamentsSnapshot.docs) {
      processedCount++;
      const data = doc.data();
      
      // Check if settings.scoreSettings exists and matschBonus is missing
      if (data.settings?.scoreSettings && typeof data.settings.scoreSettings.matschBonus === 'undefined') {
        console.log(`📝 Tournament "${data.name}" (${doc.id}) - Adding matschBonus field`);
        
        // Create updated scoreSettings with matschBonus
        const updatedScoreSettings = {
          ...data.settings.scoreSettings,
          matschBonus: true
        };
        
        // Update only the settings.scoreSettings field
        batch.update(doc.ref, {
          'settings.scoreSettings': updatedScoreSettings
        });
        
        updatedCount++;
      }
    }
    
    if (updatedCount > 0) {
      await batch.commit();
      console.log(`✅ Tournaments migration completed: ${updatedCount}/${processedCount} tournaments updated`);
    } else {
      console.log(`✅ Tournaments migration completed: All ${processedCount} tournaments already have matschBonus field`);
    }
    
  } catch (error) {
    console.error('❌ Error migrating tournaments:', error);
    throw error;
  }
}

/**
 * Main migration function
 */
async function runMigration() {
  console.log('🚀 Starting matschBonus field migration...');
  console.log('📋 This will add matschBonus: true to existing scoreSettings');
  console.log('🧹 Clean migration - no timestamps or metadata will be added\n');
  
  try {
    // Run migrations in sequence
    await migrateGroups();
    await migrateTournaments();
    
    console.log('\n🎉 Migration completed successfully!');
    console.log('💡 All existing groups and tournaments now have matschBonus: true');
    
  } catch (error) {
    console.error('\n💥 Migration failed:', error);
    process.exit(1);
  } finally {
    // Clean shutdown
    process.exit(0);
  }
}

// Run the migration
runMigration();
