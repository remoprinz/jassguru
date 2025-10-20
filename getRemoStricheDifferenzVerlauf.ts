import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, orderBy, limit, getDocs, doc, getDoc } from 'firebase/firestore';

// Firebase-Konfiguration
const firebaseConfig = {
  apiKey: "AIzaSyB8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8",
  authDomain: "jasstafel.firebaseapp.com",
  projectId: "jasstafel",
  storageBucket: "jasstafel.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdefghijklmnop"
};

// Firebase initialisieren
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

interface PlayerHistoryEntry {
  createdAt: any;
  playerId: string;
  groupId: string;
  eventType: string;
  eventId: string;
  rating: number;
  gamesPlayed: number;
  tier: string;
  tierEmoji: string;
  delta: {
    rating: number;
    striche: number;
    games: number;
    wins: number;
    losses: number;
    points: number;
  };
  cumulative: {
    striche: number;
    wins: number;
    losses: number;
    points: number;
  };
}

async function getRemoStricheDifferenzVerlauf() {
  try {
    console.log('🔍 Suche nach Remo in allen Gruppen...\n');
    
    // Alle Gruppen durchsuchen
    const groupsRef = collection(db, 'groups');
    const groupsSnap = await getDocs(groupsRef);
    
    let remoFound = false;
    
    for (const groupDoc of groupsSnap.docs) {
      const groupId = groupDoc.id;
      const groupData = groupDoc.data();
      
      console.log(`📁 Prüfe Gruppe: ${groupData.name || groupId}`);
      
      // Spieler in dieser Gruppe durchsuchen
      const playersRef = collection(db, `groups/${groupId}/playerRatings`);
      const playersSnap = await getDocs(playersRef);
      
      for (const playerDoc of playersSnap.docs) {
        const playerId = playerDoc.id;
        const playerData = playerDoc.data();
        
        if (playerData.displayName && playerData.displayName.toLowerCase().includes('remo')) {
          console.log(`✅ Remo gefunden in Gruppe: ${groupData.name || groupId}`);
          console.log(`🆔 Player ID: ${playerId}`);
          console.log(`📊 Aktuelle Striche-Differenz: ${playerData.striche || 0}\n`);
          
          // Historie laden
          const historyRef = collection(db, `groups/${groupId}/playerRatings/${playerId}/history`);
          const historyQuery = query(historyRef, orderBy('createdAt', 'asc'));
          const historySnap = await getDocs(historyQuery);
          
          if (historySnap.empty) {
            console.log('❌ Keine Historie-Daten gefunden');
            return;
          }
          
          console.log('📈 STRICHE-DIFFERENZ-VERLAUF VON REMO:');
          console.log('=' .repeat(80));
          console.log('Datum       | Event-Typ    | Striche-Diff | Delta | Kumulativ | Rating');
          console.log('-' .repeat(80));
          
          let cumulativeStriche = 0;
          
          historySnap.forEach(doc => {
            const data = doc.data() as PlayerHistoryEntry;
            
            // Datum formatieren
            const date = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
            const dateStr = date.toLocaleDateString('de-DE', {
              day: '2-digit',
              month: '2-digit',
              year: '2-digit'
            });
            
            // Striche-Delta aus Session berechnen
            const stricheDelta = data.delta?.striche || 0;
            cumulativeStriche += stricheDelta;
            
            // Event-Typ
            const eventType = data.eventType || 'session_end';
            
            // Formatierung für bessere Lesbarkeit
            const stricheDiffStr = stricheDelta >= 0 ? `+${stricheDelta}` : `${stricheDelta}`;
            const cumulativeStr = cumulativeStriche >= 0 ? `+${cumulativeStriche}` : `${cumulativeStriche}`;
            
            console.log(
              `${dateStr} | ${eventType.padEnd(11)} | ${stricheDiffStr.padEnd(12)} | ${stricheDelta.toString().padEnd(5)} | ${cumulativeStr.padEnd(9)} | ${data.rating}`
            );
          });
          
          console.log('=' .repeat(80));
          console.log(`📊 FINALE STRICHE-DIFFERENZ: ${cumulativeStriche >= 0 ? '+' : ''}${cumulativeStriche}`);
          console.log(`🎯 AKTUELLES RATING: ${playerData.rating || 100}`);
          console.log(`🎮 GESPIELTE SPIELE: ${playerData.gamesPlayed || 0}`);
          
          remoFound = true;
          break;
        }
      }
      
      if (remoFound) break;
    }
    
    if (!remoFound) {
      console.log('❌ Remo nicht gefunden');
    }
    
  } catch (error) {
    console.error('❌ Fehler beim Laden der Daten:', error);
  }
}

// Script ausführen
getRemoStricheDifferenzVerlauf();
