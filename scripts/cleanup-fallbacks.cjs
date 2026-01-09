const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', 'public');

try {
  const files = fs.readdirSync(publicDir);
  let deletedCount = 0;

  files.forEach(file => {
    // Matches fallback-<hash>.js and fallback-<hash>.js.LICENSE.txt
    if (/^fallback-.*\.js(\.LICENSE\.txt)?$/.test(file)) {
      const filePath = path.join(publicDir, file);
      try {
        fs.unlinkSync(filePath);
        console.log(`🧹 Deleted old fallback file: ${file}`);
        deletedCount++;
      } catch (err) {
        console.error(`❌ Error deleting file ${filePath}:`, err);
      }
    }
  });

  if (deletedCount > 0) {
    console.log(`✅ Successfully deleted ${deletedCount} old fallback file(s).`);
  } else {
    console.log(`👍 No old fallback files found to delete.`);
  }

} catch (err) {
  console.error(`❌ Could not read public directory at ${publicDir}:`, err);
  process.exit(1);
}
