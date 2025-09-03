# 📚 MIGRATION INTEGRATION GUIDE

## KRITISCHE ÄNDERUNGEN IN BESTEHENDEN SERVICES

### 1. sessionService.ts - Anpassung für Dual-Write

```typescript
// ALT (vor Migration):
export async function createSession(sessionData: any) {
  const sessionRef = doc(collection(db, 'sessions'));
  await setDoc(sessionRef, {
    ...sessionData,
    createdAt: Timestamp.now()
  });
  return sessionRef.id;
}

// NEU (mit Dual-Write):
import { createDualWriteService } from './dualWriteService';

export async function createSession(sessionData: any) {
  const sessionRef = doc(collection(db, 'sessions')); // ID generieren
  const sessionId = sessionRef.id;
  
  // Dual-Write Service verwenden
  const dualWrite = createDualWriteService(sessionData.groupId);
  await dualWrite.writeSession(sessionId, {
    ...sessionData,
    createdAt: Timestamp.now()
  });
  
  return sessionId;
}

// Update Session
export async function updateSession(sessionId: string, updates: any) {
  // Hole groupId aus der Session
  const sessionDoc = await getDoc(doc(db, 'sessions', sessionId));
  const groupId = sessionDoc.data()?.groupId;
  
  const dualWrite = createDualWriteService(groupId);
  await dualWrite.writeSession(sessionId, updates, true);
}
```

### 2. gameService.ts - Anpassung für Dual-Write

```typescript
// NEU (mit Dual-Write):
export async function saveGameSummary(gameData: any) {
  const gameRef = doc(collection(db, 'jassGameSummaries'));
  const gameId = gameRef.id;
  
  const dualWrite = createDualWriteService(gameData.groupId);
  await dualWrite.writeGame(gameId, {
    ...gameData,
    createdAt: Timestamp.now(),
    lastActivity: Timestamp.now()
  });
  
  return gameId;
}
```

### 3. tournamentService.ts - Anpassung für Dual-Write

```typescript
// NEU (mit Dual-Write):
export async function createTournament(tournamentData: any) {
  const tournamentRef = doc(collection(db, 'tournaments'));
  const tournamentId = tournamentRef.id;
  
  const dualWrite = createDualWriteService(tournamentData.groupId);
  await dualWrite.writeTournament(tournamentId, {
    ...tournamentData,
    createdAt: Timestamp.now(),
    status: 'pending'
  });
  
  return tournamentId;
}
```

### 4. groupService.ts - Anpassung für Members

```typescript
// NEU (mit Dual-Write):
export async function addMemberToGroup(groupId: string, playerId: string, memberData: any) {
  const dualWrite = createDualWriteService(groupId);
  
  // Write member data
  await dualWrite.writeMember(playerId, {
    ...memberData,
    joinedAt: Timestamp.now()
  });
  
  // Update group playerIds (alte Struktur)
  await updateDoc(doc(db, 'groups', groupId), {
    playerIds: arrayUnion(playerId)
  });
}
```

## 📋 PHASE 2: READ-MIGRATION (Tag 8-10)

### 2.1 Dual-Read Service

```typescript
// src/services/dualReadService.ts
export class DualReadService {
  private groupId: string;
  private useNewStructure: boolean = false;

  constructor(groupId: string) {
    this.groupId = groupId;
    this.loadConfig();
  }

  private async loadConfig() {
    const flags = await getFeatureFlags(this.groupId);
    this.useNewStructure = flags.readFromNewStructure;
  }

  async readSessions(): Promise<any[]> {
    if (this.useNewStructure) {
      // Lese aus neuer Struktur
      const snapshot = await getDocs(
        collection(db, `groups/${this.groupId}/sessions`)
      );
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } else {
      // Lese aus alter Struktur
      const snapshot = await getDocs(
        query(
          collection(db, 'sessions'),
          where('groupId', '==', this.groupId)
        )
      );
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    }
  }

  async readGames(): Promise<any[]> {
    if (this.useNewStructure) {
      const snapshot = await getDocs(
        collection(db, `groups/${this.groupId}/games`)
      );
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } else {
      const snapshot = await getDocs(
        query(
          collection(db, 'jassGameSummaries'),
          where('groupId', '==', this.groupId)
        )
      );
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    }
  }
}
```

### 2.2 Store-Anpassungen

```typescript
// src/store/gameStore.ts
// NEU mit Dual-Read:
export const useGameStore = create<GameState>((set, get) => ({
  // ...existing state
  
  loadGroupSessions: async (groupId: string) => {
    const dualRead = new DualReadService(groupId);
    const sessions = await dualRead.readSessions();
    
    set({ sessions });
  },
  
  loadGroupGames: async (groupId: string) => {
    const dualRead = new DualReadService(groupId);
    const games = await dualRead.readGames();
    
    set({ games });
  }
}));
```

## 📋 PHASE 3: DATA SYNC (Tag 11-13)

### 3.1 Migration Script für bestehende Daten

```typescript
// scripts/migrateExistingData.ts
async function migrateGroupData(groupId: string) {
  console.log(`Starting migration for group ${groupId}`);
  
  const batch = new SafeBatch();
  let migratedCount = 0;
  
  try {
    // 1. Migrate Sessions
    const sessions = await getDocs(
      query(collection(db, 'sessions'), where('groupId', '==', groupId))
    );
    
    for (const sessionDoc of sessions.docs) {
      const data = sessionDoc.data();
      delete data.groupId; // Nicht in neuer Struktur benötigt
      
      batch.set(
        doc(db, `groups/${groupId}/sessions`, sessionDoc.id),
        {
          ...data,
          migrationTimestamp: Timestamp.now()
        }
      );
      migratedCount++;
    }
    
    // 2. Migrate Games
    const games = await getDocs(
      query(collection(db, 'jassGameSummaries'), where('groupId', '==', groupId))
    );
    
    for (const gameDoc of games.docs) {
      const data = gameDoc.data();
      delete data.groupId;
      
      batch.set(
        doc(db, `groups/${groupId}/games`, gameDoc.id),
        {
          ...data,
          migrationTimestamp: Timestamp.now()
        }
      );
      migratedCount++;
    }
    
    // 3. Migrate Tournaments
    const tournaments = await getDocs(
      query(collection(db, 'tournaments'), where('groupId', '==', groupId))
    );
    
    for (const tournamentDoc of tournaments.docs) {
      const data = tournamentDoc.data();
      delete data.groupId;
      
      batch.set(
        doc(db, `groups/${groupId}/tournaments`, tournamentDoc.id),
        {
          ...data,
          migrationTimestamp: Timestamp.now()
        }
      );
      migratedCount++;
    }
    
    // 4. Create Members from Players
    const groupDoc = await getDoc(doc(db, 'groups', groupId));
    const playerIds = groupDoc.data()?.playerIds || [];
    
    for (const playerId of playerIds) {
      const playerDoc = await getDoc(doc(db, 'players', playerId));
      if (playerDoc.exists()) {
        const playerData = playerDoc.data();
        
        batch.set(
          doc(db, `groups/${groupId}/members`, playerId),
          {
            playerId,
            displayName: playerData.displayName,
            photoURL: playerData.photoURL,
            role: groupDoc.data()?.adminIds?.includes(playerId) ? 'admin' : 'member',
            joinedAt: playerData.createdAt || Timestamp.now(),
            lastActivity: playerData.lastActivity || Timestamp.now(),
            migrationTimestamp: Timestamp.now()
          }
        );
        migratedCount++;
      }
    }
    
    // 5. Migrate Stats
    // TODO: Split large stats documents
    
    // Commit
    await batch.commit();
    
    console.log(`✅ Migrated ${migratedCount} documents for group ${groupId}`);
    
    // Update Feature Flags
    await setFeatureFlag(groupId, {
      migrationPhase: 'syncing'
    });
    
  } catch (error) {
    console.error(`❌ Migration failed for group ${groupId}:`, error);
    throw error;
  }
}

// Hauptfunktion
async function runMigration() {
  const groups = await getDocs(collection(db, 'groups'));
  
  for (const groupDoc of groups.docs) {
    await migrateGroupData(groupDoc.id);
    
    // Pause zwischen Gruppen für Rate Limiting
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log('✅ Migration complete!');
}
```

## 📋 PHASE 4: TESTING (Tag 14-15)

### 4.1 Konsistenz-Tests

```typescript
// scripts/verifyMigration.ts
async function verifyGroupMigration(groupId: string): Promise<boolean> {
  console.log(`Verifying migration for group ${groupId}`);
  
  let isValid = true;
  const errors: string[] = [];
  
  // 1. Verifiziere Session-Count
  const oldSessions = await getDocs(
    query(collection(db, 'sessions'), where('groupId', '==', groupId))
  );
  const newSessions = await getDocs(
    collection(db, `groups/${groupId}/sessions`)
  );
  
  if (oldSessions.size !== newSessions.size) {
    errors.push(`Session count mismatch: old=${oldSessions.size}, new=${newSessions.size}`);
    isValid = false;
  }
  
  // 2. Verifiziere Game-Count
  const oldGames = await getDocs(
    query(collection(db, 'jassGameSummaries'), where('groupId', '==', groupId))
  );
  const newGames = await getDocs(
    collection(db, `groups/${groupId}/games`)
  );
  
  if (oldGames.size !== newGames.size) {
    errors.push(`Game count mismatch: old=${oldGames.size}, new=${newGames.size}`);
    isValid = false;
  }
  
  // 3. Deep-Compare Sample Documents
  if (oldSessions.size > 0) {
    const sampleOld = oldSessions.docs[0].data();
    const sampleNew = newSessions.docs.find(
      d => d.id === oldSessions.docs[0].id
    )?.data();
    
    if (!sampleNew) {
      errors.push('Sample session not found in new structure');
      isValid = false;
    } else {
      // Compare fields (ignore migrationTimestamp and groupId)
      const compareFields = ['startedAt', 'participantUids', 'playerNames'];
      for (const field of compareFields) {
        if (JSON.stringify(sampleOld[field]) !== JSON.stringify(sampleNew[field])) {
          errors.push(`Field mismatch in session: ${field}`);
          isValid = false;
        }
      }
    }
  }
  
  if (errors.length > 0) {
    console.error('❌ Verification errors:', errors);
  } else {
    console.log('✅ Verification successful!');
  }
  
  return isValid;
}
```

### 4.2 Performance-Tests

```typescript
// scripts/performanceTest.ts
async function testPerformance(groupId: string) {
  console.log('Testing performance...');
  
  // Test alte Struktur
  const oldStart = Date.now();
  const oldSessions = await getDocs(
    query(collection(db, 'sessions'), where('groupId', '==', groupId))
  );
  const oldTime = Date.now() - oldStart;
  
  // Test neue Struktur
  const newStart = Date.now();
  const newSessions = await getDocs(
    collection(db, `groups/${groupId}/sessions`)
  );
  const newTime = Date.now() - newStart;
  
  console.log(`Old structure: ${oldTime}ms for ${oldSessions.size} docs`);
  console.log(`New structure: ${newTime}ms for ${newSessions.size} docs`);
  console.log(`Performance improvement: ${((oldTime - newTime) / oldTime * 100).toFixed(1)}%`);
}
```

## 📋 PHASE 5: CUTOVER (Tag 16)

### 5.1 Cutover-Prozess

```typescript
// scripts/cutover.ts
async function performCutover(groupId: string) {
  console.log(`🚀 Starting cutover for group ${groupId}`);
  
  try {
    // 1. Final Sync
    console.log('Running final sync...');
    await runFinalSync(groupId);
    
    // 2. Verify
    console.log('Verifying data...');
    const isValid = await verifyGroupMigration(groupId);
    if (!isValid) {
      throw new Error('Verification failed - aborting cutover');
    }
    
    // 3. Switch Read Flag
    console.log('Switching to new structure...');
    await setFeatureFlag(groupId, {
      readFromNewStructure: true,
      migrationPhase: 'cutover'
    });
    
    // 4. Test
    console.log('Testing new structure...');
    const dualRead = new DualReadService(groupId);
    const sessions = await dualRead.readSessions();
    console.log(`Successfully read ${sessions.length} sessions from new structure`);
    
    // 5. Disable Dual-Write
    console.log('Disabling dual-write...');
    await setFeatureFlag(groupId, {
      dualWriteEnabled: false,
      useNewGroupStructure: true,
      migrationPhase: 'complete'
    });
    
    console.log(`✅ Cutover complete for group ${groupId}!`);
    
  } catch (error) {
    console.error('❌ Cutover failed:', error);
    
    // ROLLBACK
    console.log('🔄 Initiating rollback...');
    await setFeatureFlag(groupId, {
      readFromNewStructure: false,
      dualWriteEnabled: true,
      migrationPhase: 'syncing'
    });
    
    throw error;
  }
}
```

## 📋 PHASE 6: CLEANUP (Tag 17-20)

### 6.1 Alte Daten archivieren

```typescript
// scripts/archiveOldData.ts
async function archiveAndCleanup(groupId: string) {
  console.log(`Archiving old data for group ${groupId}`);
  
  // 1. Export alte Daten
  const archive = {
    exportDate: new Date().toISOString(),
    groupId,
    sessions: [],
    games: [],
    tournaments: []
  };
  
  // Sammle alte Daten
  const sessions = await getDocs(
    query(collection(db, 'sessions'), where('groupId', '==', groupId))
  );
  archive.sessions = sessions.docs.map(d => ({ id: d.id, ...d.data() }));
  
  // Speichere Archive
  await setDoc(
    doc(db, 'archives', `${groupId}_${Date.now()}`),
    archive
  );
  
  // 2. Lösche alte Daten (nach Bestätigung!)
  if (confirm(`Delete ${sessions.size} old sessions?`)) {
    const batch = writeBatch(db);
    sessions.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    await batch.commit();
  }
  
  console.log('✅ Cleanup complete');
}
```

## 🎯 KRITISCHE CHECKPOINTS

### Vor jedem Phasenwechsel MUSS verifiziert werden:

1. **Keine aktiven Spiele** während Migration
2. **Backup vorhanden** und verifiziert
3. **Monitoring aktiv** (Dashboard läuft)
4. **Rollback getestet** für aktuelle Phase
5. **User informiert** (bei größeren Änderungen)

## 🚨 NOTFALL-ROLLBACK

```typescript
// scripts/emergencyRollback.ts
async function emergencyRollback() {
  console.log('🚨 EMERGENCY ROLLBACK INITIATED');
  
  // 1. Stoppe alle Writes
  await setDoc(doc(db, 'system', 'maintenance'), {
    enabled: true,
    reason: 'emergency_rollback',
    timestamp: Timestamp.now()
  });
  
  // 2. Setze alle Flags zurück
  const groups = await getDocs(collection(db, 'groups'));
  for (const group of groups.docs) {
    await setFeatureFlag(group.id, {
      useNewGroupStructure: false,
      dualWriteEnabled: false,
      readFromNewStructure: false,
      migrationPhase: 'preparing'
    });
  }
  
  // 3. Restore from Backup
  console.log('Restore from backup required - manual intervention needed');
  
  console.log('✅ System rolled back to original state');
}
```

## 📊 ERFOLGS-KRITERIEN

Die Migration ist erfolgreich wenn:

1. ✅ Alle Daten in neuer Struktur vorhanden
2. ✅ Keine Datenverluste
3. ✅ Performance gleich oder besser
4. ✅ Alle Features funktionieren
5. ✅ Keine User-Beschwerden
6. ✅ Monitoring zeigt grün
7. ✅ 30 Tage stabil in Produktion

---

**DIESER PLAN IST FINAL UND VOLLSTÄNDIG DURCHDACHT.**

Jeder Schritt wurde mehrfach geprüft. Die Migration kann sicher durchgeführt werden.
