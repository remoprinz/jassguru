const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

// Initialize Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();
const SESSION_ID = 'NPA6LXHaLLeeNaF49vf5l';

async function verifyCompletedSessions() {
    try {
        // 1. Hole die Session
        const sessionRef = db.collection('jassGameSummaries').doc(SESSION_ID);
        const session = await sessionRef.get();
        const sessionData = session.data();

        console.log('\n🔍 Überprüfe Session in completedSessions:');
        
        // 2. Hole alle participantUids
        console.log('\n1️⃣ Participant UIDs:');
        console.log(sessionData.participantUids);

        // 3. Überprüfe für jeden Teilnehmer
        for (const uid of sessionData.participantUids) {
            console.log(`\n2️⃣ Überprüfe für User ${uid}:`);
            
            // Suche in sessions Collection
            const sessionsRef = db.collection('sessions');
            const userSessionsQuery = sessionsRef
                .where('participantUids', 'array-contains', uid)
                .where('status', 'in', ['completed', 'completed_empty']);
            
            const userSessions = await userSessionsQuery.get();
            console.log(`- Gefundene Sessions in 'sessions': ${userSessions.size}`);
            
            // Suche in jassGameSummaries Collection
            const summariesRef = db.collection('jassGameSummaries');
            const userSummariesQuery = summariesRef
                .where('participantUids', 'array-contains', uid)
                .where('status', 'in', ['completed', 'completed_empty']);
            
            const userSummaries = await userSummariesQuery.get();
            console.log(`- Gefundene Sessions in 'jassGameSummaries': ${userSummaries.size}`);

            // Überprüfe, ob unsere Session dabei ist
            const hasSession = userSummaries.docs.some(doc => doc.id === SESSION_ID);
            console.log(`- Unsere Session gefunden: ${hasSession}`);

            if (hasSession) {
                const ourSession = userSummaries.docs.find(doc => doc.id === SESSION_ID);
                console.log('\n3️⃣ Session Details:');
                const data = ourSession.data();
                console.log('- status:', data.status);
                console.log('- groupId:', data.groupId);
                console.log('- tournamentId:', data.tournamentId);
                console.log('- startedAt:', data.startedAt?.toDate?.());
                console.log('- timestampCompleted:', data.timestampCompleted?.toDate?.());
            }
        }

    } catch (error) {
        console.error('❌ Error checking completedSessions:', error);
        console.error('Error details:', error.stack);
    }
}

// Run the verification
verifyCompletedSessions()
    .then(() => console.log('\n🎉 Verification completed!'))
    .catch(console.error); 