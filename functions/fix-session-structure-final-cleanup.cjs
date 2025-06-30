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

async function cleanupSessionStructure() {
    try {
        const sessionRef = db.collection('jassGameSummaries').doc(SESSION_ID);

        // 1. Lösche die rounds Collection KOMPLETT
        const roundsRef = sessionRef.collection('rounds');
        const roundsSnapshot = await roundsRef.get();
        
        console.log(`Found ${roundsSnapshot.docs.length} documents in rounds collection`);
        
        // Lösche alle Dokumente in der rounds Collection
        const deletePromises = roundsSnapshot.docs.map(doc => doc.ref.delete());
        await Promise.all(deletePromises);
        
        console.log('✅ Deleted all documents in rounds collection');

        // 2. Setze den __statisticsTrigger neu
        const completedTime = new Date('2025-06-27T01:27:20+02:00').getTime();
        const completedAtTimestamp = admin.firestore.Timestamp.fromMillis(completedTime);

        await sessionRef.update({
            __forceStatisticsRecalculation: true,
            __statisticsTrigger: completedAtTimestamp,
            lastActivity: completedAtTimestamp,
            lastCompletedGameUpdate: completedAtTimestamp
        });

        console.log('✅ Updated session timestamps');

        // 3. Verifiziere die Struktur
        const session = await sessionRef.get();
        const collections = await sessionRef.listCollections();
        
        console.log('\n📊 Final Structure:');
        console.log('Main document fields:', Object.keys(session.data()).length);
        console.log('Collections:', collections.map(col => col.id));

    } catch (error) {
        console.error('❌ Error cleaning up session structure:', error);
        console.error('Error details:', error.stack);
    }
}

// Run the script
cleanupSessionStructure()
    .then(() => console.log('🎉 Script completed!'))
    .catch(console.error); 