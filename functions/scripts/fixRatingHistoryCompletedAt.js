"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const admin = require("firebase-admin");
// Service Account Key laden
const serviceAccount = require('../../serviceAccountKey.json');
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();
async function fixRatingHistoryCompletedAt() {
    var _a, _b, _c, _d;
    console.log('🔧 FIXING RATING-HISTORY COMPLETEDAT...\n');
    try {
        // Alle Gruppen laden
        const groupsSnap = await db.collection('groups').get();
        console.log(`📊 Gefunden: ${groupsSnap.docs.length} Gruppen`);
        let totalFixed = 0;
        let totalSessions = 0;
        for (const groupDoc of groupsSnap.docs) {
            const groupId = groupDoc.id;
            console.log(`\n🎯 Gruppe: ${groupId}`);
            // Alle jassGameSummaries dieser Gruppe laden
            const sessionsSnap = await db.collection(`groups/${groupId}/jassGameSummaries`)
                .orderBy('completedAt', 'asc')
                .get();
            console.log(`   Sessions: ${sessionsSnap.docs.length}`);
            totalSessions += sessionsSnap.docs.length;
            for (const sessionDoc of sessionsSnap.docs) {
                const sessionId = sessionDoc.id;
                const sessionData = sessionDoc.data();
                // Nur reguläre Sessions (nicht Turniere)
                if (sessionData.eventType === 'tournament') {
                    continue;
                }
                const sessionCompletedAt = ((_b = (_a = sessionData.completedAt) === null || _a === void 0 ? void 0 : _a.toDate) === null || _b === void 0 ? void 0 : _b.call(_a)) || new Date();
                const participantPlayerIds = sessionData.participantPlayerIds || [];
                console.log(`   📅 Session ${sessionId}: ${sessionCompletedAt.toISOString()}`);
                // Für jeden Spieler die Rating-History Einträge korrigieren
                for (const playerId of participantPlayerIds) {
                    const ratingHistoryRef = db.collection(`players/${playerId}/ratingHistory`);
                    // Alle Einträge für diese Session laden (ohne orderBy um Index zu vermeiden)
                    const historySnap = await ratingHistoryRef
                        .where('sessionId', '==', sessionId)
                        .get();
                    if (historySnap.empty) {
                        continue;
                    }
                    const entries = historySnap.docs.sort((a, b) => {
                        var _a, _b, _c, _d;
                        const aData = a.data();
                        const bData = b.data();
                        const aCreatedAt = ((_b = (_a = aData.createdAt) === null || _a === void 0 ? void 0 : _a.toDate) === null || _b === void 0 ? void 0 : _b.call(_a)) || new Date(0);
                        const bCreatedAt = ((_d = (_c = bData.createdAt) === null || _c === void 0 ? void 0 : _c.toDate) === null || _d === void 0 ? void 0 : _d.call(_c)) || new Date(0);
                        return aCreatedAt.getTime() - bCreatedAt.getTime();
                    });
                    const gamesCount = entries.length;
                    // Session-Dauer berechnen (falls verfügbar)
                    const sessionStart = ((_d = (_c = sessionData.startedAt) === null || _c === void 0 ? void 0 : _c.toDate) === null || _d === void 0 ? void 0 : _d.call(_c)) || sessionCompletedAt;
                    const sessionEnd = sessionCompletedAt;
                    const sessionDuration = sessionEnd.getTime() - sessionStart.getTime();
                    console.log(`     👤 Spieler ${playerId}: ${gamesCount} Spiele`);
                    // Für jeden Eintrag das korrekte completedAt berechnen
                    const batch = db.batch();
                    entries.forEach((doc, index) => {
                        const data = doc.data();
                        // Nur Einträge ohne completedAt korrigieren
                        if (!data.completedAt) {
                            // Interpoliere die Zeit basierend auf Spiel-Nummer
                            const gameProgress = (index + 1) / gamesCount;
                            const gameTimestamp = new Date(sessionStart.getTime() + (sessionDuration * gameProgress));
                            const updateData = {
                                completedAt: admin.firestore.Timestamp.fromDate(gameTimestamp)
                            };
                            batch.update(doc.ref, updateData);
                            totalFixed++;
                            console.log(`       🎮 Spiel ${data.gameNumber}: ${gameTimestamp.toISOString()}`);
                        }
                    });
                    // Batch committen
                    if (totalFixed > 0) {
                        await batch.commit();
                    }
                }
            }
        }
        console.log(`\n✅ FERTIG!`);
        console.log(`📊 Statistiken:`);
        console.log(`   - Gruppen: ${groupsSnap.docs.length}`);
        console.log(`   - Sessions: ${totalSessions}`);
        console.log(`   - Korrigierte Einträge: ${totalFixed}`);
    }
    catch (error) {
        console.error('❌ Fehler:', error);
    }
    process.exit(0);
}
fixRatingHistoryCompletedAt().catch(console.error);
