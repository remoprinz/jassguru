const admin = require('firebase-admin');
const serviceAccount = require('../../serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

async function checkAggregatedCharts() {
  const groupId = 'Tz0wgIHMTlhvTtFastiJ';
  
  console.log(`Checking aggregated charts for group ${groupId}...`);

  const charts = ['chartData_striche', 'chartData_points'];
  
  for (const chartName of charts) {
    const docRef = db.collection(`groups/${groupId}/aggregated`).doc(chartName);
    const docSnap = await docRef.get();
    
    if (docSnap.exists) {
      const data = docSnap.data();
      console.log(`\n--- ${chartName} ---`);
      console.log('Last Updated:', data.lastUpdated ? data.lastUpdated.toDate() : 'N/A');
      console.log('Labels count:', data.labels?.length);
      console.log('Datasets count:', data.datasets?.length);
      
      // Check labels for the tournament date (13.11.)
      const labels = data.labels || [];
      const tournamentDateIndices = labels.reduce((acc, label, index) => {
        if (label.includes('13.11')) acc.push(index);
        return acc;
      }, []);
      
      console.log('Indices for 13.11.:', tournamentDateIndices);
      
      if (tournamentDateIndices.length > 0) {
        // Check Davester (4nhOwuVONajPArNERzyEj)
        const davesterDataset = data.datasets.find(d => d.label === 'Davester' || d.displayName === 'Davester');
        if (davesterDataset) {
          console.log('Davester Dataset found.');
          tournamentDateIndices.forEach(idx => {
            console.log(`Value at ${labels[idx]} (${idx}):`, davesterDataset.data[idx]);
          });
        } else {
          console.log('Davester Dataset NOT found!');
        }
      } else {
        console.log('Tournament date 13.11. NOT found in labels!');
      }
    } else {
      console.log(`\n--- ${chartName} ---`);
      console.log('Document does not exist!');
    }
  }
}

checkAggregatedCharts().catch(console.error);

