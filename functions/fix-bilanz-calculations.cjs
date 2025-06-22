const fs = require('fs');

// Lade die Datei
let content = fs.readFileSync('./src/groupStatsCalculator.ts', 'utf8');

// Entferne die alten Rate-Berechnungen
content = content.replace(
  /\/\/ Spieler mit höchster Schneider-Rate[\s\S]*?calculatedStats\.playerWithHighestSchneiderRate = playerSchneiderRateList;/g,
  '// ✅ ENTFERNT: Alte Schneider-Rate Berechnung wurde durch Bilanz ersetzt'
);

content = content.replace(
  /\/\/ Spieler mit höchster Kontermatsch-Rate[\s\S]*?calculatedStats\.playerWithHighestKontermatschRate = playerKontermatschRateList;/g,
  '// ✅ ENTFERNT: Alte Kontermatsch-Rate Berechnung wurde durch Bilanz ersetzt'
);

// Ersetze Team-Rate durch Team-Bilanz Berechnungen
content = content.replace(
  /teamWithHighestMatschRate/g,
  'teamWithHighestMatschBilanz'
);

content = content.replace(
  /teamWithHighestSchneiderRate/g,
  'teamWithHighestSchneiderBilanz'
);

content = content.replace(
  /teamWithHighestKontermatschRate/g,
  'teamWithHighestKontermatschBilanz'
);

// Ändere Team-Berechnungen zu absoluten Zahlen
content = content.replace(
  /const matschRate = \(stats\.matschMade - stats\.matschReceived\) \/ stats\.games;/g,
  'const matschBilanz = stats.matschMade - stats.matschReceived;'
);

content = content.replace(
  /parseFloat\(matschRate\.toFixed\(2\)\)/g,
  'matschBilanz'
);

content = content.replace(
  /const schneiderRate = \(stats\.schneiderMade - stats\.schneiderReceived\) \/ stats\.games;/g,
  'const schneiderBilanz = stats.schneiderMade - stats.schneiderReceived;'
);

content = content.replace(
  /parseFloat\(schneiderRate\.toFixed\(2\)\)/g,
  'schneiderBilanz'
);

content = content.replace(
  /const kontermatschRate = \(stats\.kontermatschMade - stats\.kontermatschReceived\) \/ stats\.games;/g,
  'const kontermatschBilanz = stats.kontermatschMade - stats.kontermatschReceived;'
);

content = content.replace(
  /parseFloat\(kontermatschRate\.toFixed\(3\)\)/g,
  'kontermatschBilanz'
);

// Füge eventsMade und eventsReceived zu Team-Berechnungen hinzu
content = content.replace(
  /value: matschBilanz,\s*eventsPlayed: stats\.games,/g,
  'value: matschBilanz,\n          eventsPlayed: stats.games,\n          eventsMade: stats.matschMade,\n          eventsReceived: stats.matschReceived,'
);

content = content.replace(
  /value: schneiderBilanz,\s*eventsPlayed: stats\.games,/g,
  'value: schneiderBilanz,\n          eventsPlayed: stats.games,\n          eventsMade: stats.schneiderMade,\n          eventsReceived: stats.schneiderReceived,'
);

content = content.replace(
  /value: kontermatschBilanz,\s*eventsPlayed: stats\.games,/g,
  'value: kontermatschBilanz,\n          eventsPlayed: stats.games,\n          eventsMade: stats.kontermatschMade,\n          eventsReceived: stats.kontermatschReceived,'
);

// Speichere die Datei
fs.writeFileSync('./src/groupStatsCalculator.ts', content);

console.log('✅ Bilanz-Berechnungen erfolgreich korrigiert!');
