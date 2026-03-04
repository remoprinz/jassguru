const fs = require('fs');
const path = require('path');

function updateFile(filePath, updateLogic) {
  try {
    const fullPath = path.join(__dirname, filePath);
    const content = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    const { updatedContent, count } = updateLogic(content);
    fs.writeFileSync(fullPath, JSON.stringify(updatedContent, null, 2) + '\n', 'utf8');
    console.log(`✅ ${filePath}: ${count} URLs korrigiert.`);
    return count;
  } catch (e) {
    console.error(`❌ Fehler bei der Verarbeitung von ${filePath}:`, e);
    return 0;
  }
}

console.log('🔧 Starte URL-Anpassung für die neue Struktur ohne /wissen/...');

// 1. knowledgebase.json aktualisieren
updateFile('../src/data/knowledgebase.json', (kb) => {
  let count = 0;
  kb.forEach(entry => {
    if (entry.url && entry.url.includes('/wissen/')) {
      entry.url = entry.url.replace('/wissen/', '/');
      count++;
    }
  });
  return { updatedContent: kb, count };
});

// 2. jass-content-v2.json aktualisieren
updateFile('../src/data/jass-content-v2.json', (content) => {
  let count = 0;
  const linkRegex = /\(\/wissen\//g;
  for (const key in content) {
    if (content.hasOwnProperty(key) && content[key] && typeof content[key].text === 'string' && content[key].text.match(linkRegex)) {
      const originalText = content[key].text;
      const matches = originalText.match(linkRegex);
      if (matches) {
          count += matches.length;
      }
      content[key].text = originalText.replace(linkRegex, '(/');
    }
  }
  return { updatedContent: content, count };
});

console.log('✅ URL-Anpassung abgeschlossen.');
