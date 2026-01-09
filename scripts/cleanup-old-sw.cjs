const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', 'public');

try {
  const files = fs.readdirSync(publicDir);
  let deletedCount = 0;

  files.forEach(file => {
    // This regex matches "sw ", followed by one or more digits, and ending with ".js"
    // e.g., "sw 2.js", "sw 10.js"
    if (/^sw \d+\.js$/.test(file)) {
      const filePath = path.join(publicDir, file);
      try {
        fs.unlinkSync(filePath);
        console.log(`🧹 Deleted old service worker: ${file}`);
        deletedCount++;
      } catch (err) {
        console.error(`❌ Error deleting file ${filePath}:`, err);
      }
    }
  });

  if (deletedCount > 0) {
    console.log(`✅ Successfully deleted ${deletedCount} old service worker file(s).`);
  } else {
    console.log(`👍 No old service worker files found to delete.`);
  }

} catch (err) {
  console.error(`❌ Could not read public directory at ${publicDir}:`, err);
  process.exit(1);
}
