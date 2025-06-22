const https = require('https');

async function triggerBatchFunction() {
  console.log('🚀 Triggering Batch Function via HTTP...\n');

  try {
    // Die URL der Cloud Function (ersetze mit der echten URL)
    const functionUrl = 'https://europe-west1-jassguru.cloudfunctions.net/triggerBatchUpdateGroupStats';
    
    console.log('Triggering function:', functionUrl);
    
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    };

    const req = https.request(functionUrl, options, (res) => {
      console.log(`Status: ${res.statusCode}`);
      console.log(`Headers: ${JSON.stringify(res.headers)}`);
      
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        console.log('Response:', data);
        console.log('✅ Function triggered successfully');
      });
    });

    req.on('error', (error) => {
      console.error('❌ Error triggering function:', error);
    });

    req.write(JSON.stringify({}));
    req.end();

  } catch (error) {
    console.error('❌ Fehler:', error);
  }
}

// Script ausführen
triggerBatchFunction(); 