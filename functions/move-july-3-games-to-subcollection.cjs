const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc, setDoc, deleteDoc, collection } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: "AIzaSyBmvHu1pNzTLJhLWF2KdmJuXlPUJqKrxUo",
  authDomain: "jassguru-7a213.firebaseapp.com",
  projectId: "jassguru-7a213",
  storageBucket: "jassguru-7a213.appspot.com",
  messagingSenderId: "266239362897",
  appId: "1:266239362897:web:e0b8b7d8a9d9a8b5dc6c6f"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function moveJuly3GamesToSubcollection() {
  console.log('🔄 Verschiebe Juli 3. Spiele in die korrekte Subcollection-Struktur...');
  
  const sessionId = 'GvshcbgPDCtbhCeqHApvk';
  const gameIds = ['BddFeTmedf7hipTcMcGk', 'viQQv1biZzrahe1iQ4Cd', 'KqErTLHxrfe5IMQKAGTW'];
  
  console.log(`📁 Ziel-Subcollection: jassGameSummaries/${sessionId}/completedGames/`);
  
  for (const gameId of gameIds) {
    console.log(`\n=== Verschiebe Game ${gameId} ===`);
    
    try {
      // 1. Lade das ursprüngliche Dokument aus der Hauptebene
      console.log('📖 Lade ursprüngliches Dokument...');
      const originalGameRef = doc(db, 'jassGameSummaries', gameId);
      const originalGameDoc = await getDoc(originalGameRef);
      
      if (!originalGameDoc.exists()) {
        console.log('❌ Originaldokument existiert nicht');
        continue;
      }
      
      const gameData = originalGameDoc.data();
      console.log('✅ Originaldokument geladen');
      console.log(`   - finalScores: ${JSON.stringify(gameData.finalScores)}`);
      console.log(`   - finalStriche top: ${JSON.stringify(gameData.finalStriche?.top)}`);
      console.log(`   - finalStriche bottom: ${JSON.stringify(gameData.finalStriche?.bottom)}`);
      console.log(`   - roundHistory: ${gameData.roundHistory?.length || 0} Runden`);
      
      // 2. Erstelle das neue Dokument in der Subcollection
      console.log('💾 Erstelle Dokument in Subcollection...');
      const newGameRef = doc(db, 'jassGameSummaries', sessionId, 'completedGames', gameId);
      await setDoc(newGameRef, gameData);
      console.log('✅ Dokument in Subcollection erstellt');
      
      // 3. Verifiziere, dass das neue Dokument korrekt erstellt wurde
      console.log('🔍 Verifiziere neues Dokument...');
      const newGameDoc = await getDoc(newGameRef);
      if (!newGameDoc.exists()) {
        console.log('❌ FEHLER: Neues Dokument wurde nicht korrekt erstellt!');
        continue;
      }
      
      const newGameData = newGameDoc.data();
      console.log('✅ Neues Dokument verifiziert');
      console.log(`   - finalScores: ${JSON.stringify(newGameData.finalScores)}`);
      console.log(`   - finalStriche top: ${JSON.stringify(newGameData.finalStriche?.top)}`);
      console.log(`   - finalStriche bottom: ${JSON.stringify(newGameData.finalStriche?.bottom)}`);
      
      // 4. Lösche das ursprüngliche Dokument aus der Hauptebene
      console.log('🗑️ Lösche ursprüngliches Dokument...');
      await deleteDoc(originalGameRef);
      console.log('✅ Ursprüngliches Dokument gelöscht');
      
      // 5. Final-Verifikation - prüfe, dass das ursprüngliche Dokument weg ist
      console.log('🔍 Final-Verifikation...');
      const deletedCheck = await getDoc(originalGameRef);
      if (deletedCheck.exists()) {
        console.log('❌ WARNUNG: Ursprüngliches Dokument existiert noch!');
      } else {
        console.log('✅ Ursprüngliches Dokument erfolgreich gelöscht');
      }
      
      console.log(`🎉 Game ${gameId} erfolgreich verschoben!`);
      
    } catch (error) {
      console.error(`❌ Fehler beim Verschieben von Game ${gameId}:`, error);
      console.log('⚠️ ACHTUNG: Operation abgebrochen. Manuelle Überprüfung erforderlich!');
      break; // Stoppe bei Fehlern, um Datenverlust zu vermeiden
    }
  }
  
  console.log('\n🎯 Zusammenfassung:');
  console.log('Die Juli 3. Spiele sollten jetzt in der korrekten Subcollection-Struktur sein:');
  console.log(`- jassGameSummaries/${sessionId}/completedGames/BddFeTmedf7hipTcMcGk`);
  console.log(`- jassGameSummaries/${sessionId}/completedGames/viQQv1biZzrahe1iQ4Cd`);
  console.log(`- jassGameSummaries/${sessionId}/completedGames/KqErTLHxrfe5IMQKAGTW`);
  console.log('\n✅ Die fetchAllGamesForSession Funktion sollte die Spiele jetzt finden!');
}

moveJuly3GamesToSubcollection().catch(console.error); 