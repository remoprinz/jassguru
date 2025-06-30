const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

// Initialize Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function fixTimestampStructures() {
    const sessionId = 'NPA6LXHaLLeeNaF49vf5l';
    const sessionRef = db.collection('jassGameSummaries').doc(sessionId);

    try {
        const session = await sessionRef.get();
        const sessionData = session.data();

        // Convert timestamps to proper Firestore Timestamp structure
        const startTime = new Date('2025-06-26T19:15:16+02:00').getTime();
        const completedTime = new Date('2025-06-27T01:27:20+02:00').getTime();

        // Update the session document with proper Firestore Timestamps
        await sessionRef.update({
            startedAt: admin.firestore.Timestamp.fromMillis(startTime),
            timestampCompleted: admin.firestore.Timestamp.fromMillis(completedTime),
            startetAt: admin.firestore.Timestamp.fromMillis(startTime) // Fix typo in field name
        });

        console.log('✅ Session timestamps fixed successfully!');
        console.log('📊 Updated timestamps:');
        console.log('   startedAt:', new Date(startTime).toISOString());
        console.log('   timestampCompleted:', new Date(completedTime).toISOString());

        // Verify the update
        const updatedSession = await sessionRef.get();
        const updatedData = updatedSession.data();
        console.log('\n🔍 Verification:');
        console.log('   startedAt type:', updatedData.startedAt.constructor.name);
        console.log('   timestampCompleted type:', updatedData.timestampCompleted.constructor.name);

    } catch (error) {
        console.error('❌ Error fixing timestamps:', error);
    }
}

// Run the fix
fixTimestampStructures()
    .then(() => console.log('🎉 Script completed!'))
    .catch(console.error); 