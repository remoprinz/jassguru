// Debug-Script für Frontend-Daten
// Führe dies in der Browser-Konsole aus, während du auf der Profil-Seite bist

console.log("🔍 === FRONTEND DEBUG: PARTNER-DATEN ===");

// 1. Zustand aus dem PlayerStats Store
const playerStatsStore = window.__ZUSTAND_STORES__?.playerStats;
if (playerStatsStore) {
  const state = playerStatsStore.getState();
  console.log("📊 PlayerStats Store State:", state);
  
  if (state.stats?.partnerAggregates) {
    console.log("\n👥 === PARTNER AGGREGATES AUS STORE ===");
    state.stats.partnerAggregates.slice(0, 3).forEach((partner, index) => {
      console.log(`${index + 1}. ${partner.partnerDisplayName}:`);
      console.log(`   Sessions: ${partner.sessionsPlayedWith} (Siege: ${partner.sessionsWonWith})`);
      console.log(`   Spiele: ${partner.gamesPlayedWith} (Siege: ${partner.gamesWonWith})`);
      console.log(`   sessionWinRateInfo:`, partner.sessionWinRateInfo);
      console.log(`   gameWinRateInfo:`, partner.gameWinRateInfo);
    });
  }
} else {
  console.log("❌ PlayerStats Store nicht gefunden");
}

// 2. React DevTools (falls verfügbar)
if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
  console.log("\n🔧 React DevTools verfügbar - prüfe Komponenten-State");
}

// 3. Firestore-Daten direkt prüfen
if (window.firebase && window.firebase.firestore) {
  const db = window.firebase.firestore();
  console.log("\n🔥 === DIREKTE FIRESTORE-ABFRAGE ===");
  
  db.collection('playerComputedStats').doc('b16c1120111b7d9e7d733837').get()
    .then(doc => {
      if (doc.exists) {
        const data = doc.data();
        console.log("📄 Firestore Rohdaten:", data);
        
        if (data.partnerAggregates) {
          console.log("\n👥 === PARTNER AGGREGATES AUS FIRESTORE ===");
          data.partnerAggregates.slice(0, 3).forEach((partner, index) => {
            console.log(`${index + 1}. ${partner.partnerDisplayName}:`);
            console.log(`   Sessions: ${partner.sessionsPlayedWith} (Siege: ${partner.sessionsWonWith})`);
            console.log(`   Spiele: ${partner.gamesPlayedWith} (Siege: ${partner.gamesWonWith})`);
            console.log(`   sessionWinRateInfo:`, partner.sessionWinRateInfo);
            console.log(`   gameWinRateInfo:`, partner.gameWinRateInfo);
          });
        }
      } else {
        console.log("❌ Firestore-Dokument nicht gefunden");
      }
    })
    .catch(error => {
      console.error("❌ Firestore-Fehler:", error);
    });
}

// 4. LocalStorage und Cache prüfen
console.log("\n💾 === CACHE-INFORMATIONEN ===");
console.log("LocalStorage keys:", Object.keys(localStorage));
console.log("SessionStorage keys:", Object.keys(sessionStorage));

// 5. Network-Requests prüfen
console.log("\n🌐 === NETZWERK-DEBUGGING ===");
console.log("Öffne die Network-Tab in den DevTools und schaue nach Firestore-Requests");
console.log("Suche nach Requests zu: firestore.googleapis.com"); 