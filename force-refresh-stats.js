// Force-Refresh Script für die Frontend-Stores
// Führe dies in der Browser-Konsole aus

console.log("🔄 === FORCE REFRESH: PLAYER STATS ===");

// 1. Alle Zustand-Stores resetten
if (window.zustandStores) {
  console.log("🗑️ Resetting Zustand stores...");
  Object.keys(window.zustandStores).forEach(key => {
    if (window.zustandStores[key]?.getState?.()?.reset) {
      window.zustandStores[key].getState().reset();
    }
  });
}

// 2. Firestore-Cache leeren (falls möglich)
if (window.firebase?.firestore) {
  console.log("🔥 Clearing Firestore cache...");
  try {
    // Versuche den Cache zu leeren
    window.firebase.firestore().clearPersistence()
      .then(() => console.log("✅ Firestore persistence cleared"))
      .catch(err => console.log("⚠️ Could not clear persistence:", err.message));
  } catch (error) {
    console.log("⚠️ Firestore cache clear not available:", error.message);
  }
}

// 3. LocalStorage für Firebase leeren
console.log("💾 Clearing Firebase LocalStorage...");
Object.keys(localStorage).forEach(key => {
  if (key.includes('firebase') || key.includes('firestore')) {
    localStorage.removeItem(key);
    console.log(`🗑️ Removed: ${key}`);
  }
});

// 4. Page-Reload nach kurzer Verzögerung
console.log("🔄 Reloading page in 2 seconds...");
setTimeout(() => {
  window.location.reload(true); // Hard reload
}, 2000); 