#!/usr/bin/env node
/**
 * Firestore Query Tool
 * Usage:
 *   node scripts/db.js doc  groupComputedStats/Tz0wgIHMTlhvTtFastiJ
 *   node scripts/db.js col  groupComputedStats
 *   node scripts/db.js col  sessions --limit 5
 *   node scripts/db.js col  sessions --where "groupId == abc123"
 */

const fs = require('fs');
const admin = require('firebase-admin');

// Manuelles Parsen wegen malformed dotenv-Eintrag (doppelter Key)
const envContent = fs.readFileSync('.env.local', 'utf8');
const match = envContent.match(/FIREBASE_SERVICE_ACCOUNT_JSON='?(?:FIREBASE_SERVICE_ACCOUNT_JSON='?)?(\{[\s\S]+?\})'?'?\s*$/m);
if (!match) { console.error('FIREBASE_SERVICE_ACCOUNT_JSON nicht gefunden'); process.exit(1); }
const serviceAccount = JSON.parse(match[1].replace(/\\\\n/g, '\\n'));

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

const [,, cmd, path, ...flags] = process.argv;

function parseFlags(flags) {
  const opts = { limit: 20, where: null };
  for (let i = 0; i < flags.length; i++) {
    if (flags[i] === '--limit') opts.limit = parseInt(flags[++i]);
    if (flags[i] === '--where') opts.where = flags[++i]; // "field == value"
  }
  return opts;
}

async function main() {
  if (!cmd || !path) {
    console.log('Usage: node scripts/db.js <doc|col> <path> [--limit N] [--where "field == value"]');
    process.exit(1);
  }

  if (cmd === 'doc') {
    const snap = await db.doc(path).get();
    if (!snap.exists) { console.log('Document not found:', path); return; }
    console.log(JSON.stringify(snap.data(), null, 2));
  }

  if (cmd === 'col') {
    const opts = parseFlags(flags);
    let ref = db.collection(path);

    if (opts.where) {
      const match = opts.where.match(/^(.+?)\s*(==|>=|<=|>|<|!=)\s*(.+)$/);
      if (match) {
        let [, field, op, val] = match;
        val = val.trim();
        const parsed = isNaN(val) ? (val === 'true' ? true : val === 'false' ? false : val) : Number(val);
        ref = ref.where(field.trim(), op, parsed);
      }
    }

    ref = ref.limit(opts.limit);
    const snap = await ref.get();
    console.log(`${snap.size} Dokumente in "${path}":\n`);
    snap.forEach(doc => {
      console.log(`--- ${doc.id} ---`);
      console.log(JSON.stringify(doc.data(), null, 2));
      console.log();
    });
  }
}

main().catch(console.error).finally(() => process.exit(0));
