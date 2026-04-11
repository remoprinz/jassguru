/**
 * Auswertung abgeschlossener Spiele (Firestore Collection Group `completedGames`):
 *
 * A) Einfache Jass-Punkte (Kartenwert, ohne Trumpf-Multiplikator auf der Kreide):
 *    Pro Jass-Runde: gespeicherte jassPoints / Multiplikator laut Trumpf (Defaults wie FARBE_MODES).
 *    - Durchschnitt pro Runde: höhere einfache Punktzahl vs. niedrigere (typ. ~80 vs ~77).
 *    - Durchschnitt pro Spiel: Summe einfacher Punkte über alle Runden, Gewinner- vs. Verlierer-Team.
 *
 * B) Kreidetafel-Summen (wie verbucht, inkl. Multiplikator): Gewinner vs. Verlierer pro Spiel.
 *
 * Auth: serviceAccountKey.json im Jasstafel-Root, GOOGLE_APPLICATION_CREDENTIALS oder
 *       FIREBASE_SERVICE_ACCOUNT_JSON (reines JSON).
 *
 * Aufruf:
 *   node scripts/analyze-completed-game-jass-points.cjs
 *   node scripts/analyze-completed-game-jass-points.cjs --max-docs=500
 *   node scripts/analyze-completed-game-jass-points.cjs --group-id=DEINE_GRUPPEN_ID
 *   node scripts/analyze-completed-game-jass-points.cjs --target-winner-points=1000  (Default 1000)
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

function parseArgInt(flag, fallback) {
  const raw = process.argv.find((a) => a.startsWith(`${flag}=`));
  if (raw) {
    const v = parseInt(raw.split('=')[1], 10);
    return Number.isFinite(v) ? v : fallback;
  }
  return fallback;
}

function parseArgString(flag) {
  const raw = process.argv.find((a) => a.startsWith(`${flag}=`));
  return raw ? raw.slice(flag.length + 1).trim() : '';
}

const MAX_DOCS = parseArgInt('--max-docs', 0);
const GROUP_ID_FILTER = parseArgString('--group-id');
/** Zielpunktzahl Gewinner-Team (Kreide Jass) für Gegenrechnung «was hätte der Verlierer bei …» */
const TARGET_WINNER_KREIDE = parseArgInt('--target-winner-points', 1000);

/**
 * Pro Runde: Multiplikator aus der Kreidesumme ableiten (ohne Session-Einstellungen in der DB).
 * Normale Ansage: einfache Stichsummen ergeben 157 pro Runde → jp.top + jp.bottom = 157 * m.
 * (Spezialfälle wie Matsch können abweichen; dann ist diese Näherung ungenau.)
 */
/** Normale Ansage: einfache Summe beider Teams = 157 (Schweizer Jass). */
const SIMPLE_TOTAL_NORMAL = 157;
/**
 * Matsch/Kontermatsch mit matschBonus (Calculator: scoreSettings.matschBonus): 257 = 157 + 100.
 * Ohne Bonus bliebe 157 — in alten Daten ohne strichInfo nicht unterscheidbar.
 */
const SIMPLE_TOTAL_MATSCH_BONUS = 257;

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function inferredMultiplierFromRoundTotals(jpTop, jpBottom, simpleTotal) {
  const sum = (Number(jpTop) || 0) + (Number(jpBottom) || 0);
  if (sum <= 0) return null;
  const m = sum / simpleTotal;
  if (m < 0.5 || m > 24) return null;
  return m;
}

/** Matsch/Kontermatsch-Runde laut History (Strich wurde in dieser Runde gesetzt). */
function isMatschStrichRound(r) {
  const t = r.strichInfo?.type;
  return t === 'matsch' || t === 'kontermatsch';
}

function simpleTotalForRound(r) {
  return isMatschStrichRound(r) ? SIMPLE_TOTAL_MATSCH_BONUS : SIMPLE_TOTAL_NORMAL;
}

function initFirebase() {
  if (admin.apps.length) return;

  const jsonEnv = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (jsonEnv && jsonEnv.trim().startsWith('{')) {
    const cred = JSON.parse(jsonEnv);
    admin.initializeApp({
      credential: admin.credential.cert(cred),
      projectId: cred.project_id || 'jassguru',
    });
    return;
  }

  const explicit = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const defaultPath = path.join(__dirname, '..', 'serviceAccountKey.json');
  const keyPath = explicit && fs.existsSync(explicit) ? explicit : defaultPath;

  if (!fs.existsSync(keyPath)) {
    console.error(
      'Keine Firebase-Admin-Credentials gefunden.\n' +
        'Lege serviceAccountKey.json im Jasstafel-Root an (gitignored) oder setze GOOGLE_APPLICATION_CREDENTIALS bzw. FIREBASE_SERVICE_ACCOUNT_JSON (reines JSON).'
    );
    process.exit(1);
  }

  // eslint-disable-next-line import/no-dynamic-require, global-require
  const serviceAccount = require(keyPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id || 'jassguru',
  });
}

function jassTotalsFromRoundHistory(roundHistory) {
  if (!Array.isArray(roundHistory)) return null;
  let top = 0;
  let bottom = 0;
  for (const r of roundHistory) {
    if (r.actionType !== 'jass') continue;
    const jp = r.jassPoints || {};
    top += Number(jp.top) || 0;
    bottom += Number(jp.bottom) || 0;
  }
  return { top, bottom };
}

function jassTotalsFromFinal(data) {
  const fs_ = data.finalScores || {};
  const wp = data.weisPoints || {};
  return {
    top: (Number(fs_.top) || 0) - (Number(wp.top) || 0),
    bottom: (Number(fs_.bottom) || 0) - (Number(wp.bottom) || 0),
  };
}

function resolveJassTotals(data) {
  const fromHist = jassTotalsFromRoundHistory(data.roundHistory);
  const fromFinal = jassTotalsFromFinal(data);
  if (fromHist && (fromHist.top !== 0 || fromHist.bottom !== 0)) {
    return { top: fromHist.top, bottom: fromHist.bottom, source: 'roundHistory' };
  }
  return { top: fromFinal.top, bottom: fromFinal.bottom, source: 'finalScores-weis' };
}

function winnerSide(data) {
  const fs = data.finalStriche || {};
  const topS = Number(fs.top?.sieg) || 0;
  const botS = Number(fs.bottom?.sieg) || 0;
  if (topS > 0 && botS === 0) return 'top';
  if (botS > 0 && topS === 0) return 'bottom';
  return null;
}

/**
 * Einfache (unmultiplizierte) Team-Punkte dieser Runde.
 * Bei Matsch/Kontermatsch: Divisor-Basis 257 (mit Bonus), sonst 157.
 */
function simplePointsForJassRound(r) {
  const jp = r.jassPoints || {};
  const base = simpleTotalForRound(r);
  const m = inferredMultiplierFromRoundTotals(jp.top, jp.bottom, base);
  if (m == null) return null;
  return {
    rawTop: (Number(jp.top) || 0) / m,
    rawBottom: (Number(jp.bottom) || 0) / m,
    matschStrich: isMatschStrichRound(r),
  };
}

async function loadAllCompletedGameDocs(db) {
  const docs = [];
  const pageSize = 400;
  let last = null;

  while (true) {
    let q = db
      .collectionGroup('completedGames')
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(pageSize);
    if (last) q = q.startAfter(last);

    const snap = await q.get();
    if (snap.empty) break;

    for (const d of snap.docs) {
      docs.push(d);
      if (MAX_DOCS > 0 && docs.length >= MAX_DOCS) return docs;
    }

    last = snap.docs[snap.docs.length - 1];
    if (snap.size < pageSize) break;
  }

  return docs;
}

async function main() {
  initFirebase();
  const db = admin.firestore();

  console.log('Lade completedGames (Collection Group) …');
  if (GROUP_ID_FILTER) console.log(`Filter groupId: ${GROUP_ID_FILTER}`);
  const gameDocs = await loadAllCompletedGameDocs(db);
  console.log(`Dokumente geladen: ${gameDocs.length}${MAX_DOCS ? ` (Limit ${MAX_DOCS})` : ''}\n`);

  // --- B) Kreidetafel (verbucht) pro Spiel ---
  let kUsed = 0;
  let kSkipped = 0;
  let kSumWinner = 0;
  let kSumLoser = 0;
  let histSource = 0;
  let finalSource = 0;
  /** Pro Spiel: Verlierer-Kreide, skaliert als ob Gewinner genau TARGET_WINNER_KREIDE hätte */
  /** @type {number[]} */
  const scaledLoserAtTarget = [];

  // --- A) Einfache Punkte: pro Runde ---
  let roundN = 0;
  let roundSumHigh = 0;
  let roundSumLow = 0;
  let roundsSkippedTie = 0;
  let roundsSkippedTrump = 0;
  /** @type {number[]} */
  const roundWinnerSimpleList = [];
  /** @type {number[]} */
  const roundLoserSimpleList = [];

  /** Nur «normale» Ansagen (ohne Matsch/Kontermatsch-Strich in dieser Runde) */
  let normRoundN = 0;
  let normRoundSumHigh = 0;
  let normRoundSumLow = 0;
  /** @type {number[]} */
  const normRoundWinnerSimpleList = [];
  /** @type {number[]} */
  const normRoundLoserSimpleList = [];
  let matschStrichRoundCount = 0;

  // --- A) Einfache Punkte: pro Spiel (Summe Runden) ---
  let simpleGameN = 0;
  let simpleSumWinner = 0;
  let simpleSumLoser = 0;
  let simpleGamesNoRounds = 0;
  /** Durchschnitt einfache Punkte pro Runde, bezogen auf Spiel-Gewinner / -Verlierer */
  let sumWinnerPerRoundMean = 0;
  let sumLoserPerRoundMean = 0;

  /** Wie oben, aber nur aus normalen Runden (ohne Matsch/Kontermatsch) je Spiel */
  let simpleGameNNormOnly = 0;
  let sumWinnerPerRoundMeanNormOnly = 0;
  let sumLoserPerRoundMeanNormOnly = 0;

  for (const doc of gameDocs) {
    const data = doc.data();

    if (GROUP_ID_FILTER && data.groupId !== GROUP_ID_FILTER) {
      continue;
    }

    const side = winnerSide(data);
    if (!side) {
      kSkipped++;
      continue;
    }

    const jt = resolveJassTotals(data);
    if (jt.source === 'roundHistory') histSource++;
    else finalSource++;

    const winnerK = side === 'top' ? jt.top : jt.bottom;
    const loserK = side === 'top' ? jt.bottom : jt.top;
    kSumWinner += winnerK;
    kSumLoser += loserK;
    kUsed++;

    if (winnerK > 0 && TARGET_WINNER_KREIDE > 0) {
      scaledLoserAtTarget.push(loserK * (TARGET_WINNER_KREIDE / winnerK));
    }

    // Einfache Punkte aus roundHistory
    const rh = data.roundHistory;
    if (!Array.isArray(rh) || rh.length === 0) {
      simpleGamesNoRounds++;
      continue;
    }

    let gRawTop = 0;
    let gRawBottom = 0;
    let gameHadSimpleRound = false;
    let jassRoundsOk = 0;
    let gRawTopNorm = 0;
    let gRawBottomNorm = 0;
    let jassRoundsNorm = 0;

    for (const r of rh) {
      if (r.actionType !== 'jass') continue;
      const sp = simplePointsForJassRound(r);
      if (!sp) {
        roundsSkippedTrump++;
        continue;
      }
      gameHadSimpleRound = true;
      jassRoundsOk++;
      gRawTop += sp.rawTop;
      gRawBottom += sp.rawBottom;

      if (sp.matschStrich) {
        matschStrichRoundCount++;
      } else {
        gRawTopNorm += sp.rawTop;
        gRawBottomNorm += sp.rawBottom;
        jassRoundsNorm++;
      }

      if (sp.rawTop > sp.rawBottom) {
        roundN++;
        roundSumHigh += sp.rawTop;
        roundSumLow += sp.rawBottom;
        roundWinnerSimpleList.push(sp.rawTop);
        roundLoserSimpleList.push(sp.rawBottom);
        if (!sp.matschStrich) {
          normRoundN++;
          normRoundSumHigh += sp.rawTop;
          normRoundSumLow += sp.rawBottom;
          normRoundWinnerSimpleList.push(sp.rawTop);
          normRoundLoserSimpleList.push(sp.rawBottom);
        }
      } else if (sp.rawBottom > sp.rawTop) {
        roundN++;
        roundSumHigh += sp.rawBottom;
        roundSumLow += sp.rawTop;
        roundWinnerSimpleList.push(sp.rawBottom);
        roundLoserSimpleList.push(sp.rawTop);
        if (!sp.matschStrich) {
          normRoundN++;
          normRoundSumHigh += sp.rawBottom;
          normRoundSumLow += sp.rawTop;
          normRoundWinnerSimpleList.push(sp.rawBottom);
          normRoundLoserSimpleList.push(sp.rawTop);
        }
      } else {
        roundsSkippedTie++;
      }
    }

    if (!gameHadSimpleRound) continue;

    const winnerSimple = side === 'top' ? gRawTop : gRawBottom;
    const loserSimple = side === 'top' ? gRawBottom : gRawTop;
    simpleGameN++;
    simpleSumWinner += winnerSimple;
    simpleSumLoser += loserSimple;
    sumWinnerPerRoundMean += winnerSimple / jassRoundsOk;
    sumLoserPerRoundMean += loserSimple / jassRoundsOk;

    if (jassRoundsNorm > 0) {
      const wN = side === 'top' ? gRawTopNorm : gRawBottomNorm;
      const lN = side === 'top' ? gRawBottomNorm : gRawTopNorm;
      simpleGameNNormOnly++;
      sumWinnerPerRoundMeanNormOnly += wN / jassRoundsNorm;
      sumLoserPerRoundMeanNormOnly += lN / jassRoundsNorm;
    }
  }

  console.log('=== 1) Einfache Jass-Punkte (Karten) ===\n');
  console.log(
    `Berechnung: Faktor m = Kreidesumme / einfache Soll-Summe; einfache Punkte = Kreide/m. Normale Runde: Soll = ${SIMPLE_TOTAL_NORMAL}; Matsch/Kontermatsch (matschBonus): Soll = ${SIMPLE_TOTAL_MATSCH_BONUS} (wie Calculator: 157+100).`
  );
  console.log(
    `Runden mit Strich Matsch/Kontermatsch in den Daten: ${matschStrichRoundCount} (werden mit 257-Basis umgerechnet; ohne strichInfo nicht erkennbar).\n`
  );

  if (roundN > 0) {
    console.log('— Alle Jass-Runden (inkl. Matsch/Kontermatsch mit 257-Basis) —');
    console.log(`Runden: ${roundN} | Patt übersprungen: ${roundsSkippedTie} | ohne gültige Summe: ${roundsSkippedTrump}`);
    console.log(`Ø Rundensieger / Rundenverlierer (einfach): ${(roundSumHigh / roundN).toFixed(2)} / ${(roundSumLow / roundN).toFixed(2)}`);
    console.log(
      `Median Rundensieger / Rundenverlierer: ${median(roundWinnerSimpleList).toFixed(1)} / ${median(roundLoserSimpleList).toFixed(1)}`
    );
    console.log('');
  } else {
    console.log('Keine auswertbaren Jass-Runden.\n');
  }

  if (normRoundN > 0) {
    console.log('— Nur normale Ansagen (ohne Matsch/Kontermatsch-Strich in der Runde) —');
    console.log(`Runden: ${normRoundN}`);
    console.log(`Ø Rundensieger / Rundenverlierer (einfach): ${(normRoundSumHigh / normRoundN).toFixed(2)} / ${(normRoundSumLow / normRoundN).toFixed(2)}`);
    console.log(
      `Median Rundensieger / Rundenverlierer: ${median(normRoundWinnerSimpleList).toFixed(1)} / ${median(normRoundLoserSimpleList).toFixed(1)}`
    );
    console.log(
      '(Hier siehst du den Effekt ohne die 100 Matsch-Extrapunkte-Skala; trotzdem oft kein 80/77, weil der Schieber-Stich häufig ungleich verteilt ist.)\n'
    );
  }

  if (simpleGameN > 0) {
    console.log('— Pro Spiel (Spiel-Gewinner laut Strich «Sieg», einfache Kartenpunkte) —');
    console.log(`Spiele mit auswertbaren Jass-Runden: ${simpleGameN}`);
    console.log(`Ø Summe einfache Punkte Gewinner-Team / Spiel: ${(simpleSumWinner / simpleGameN).toFixed(2)}`);
    console.log(`Ø Summe einfache Punkte Verlierer-Team / Spiel: ${(simpleSumLoser / simpleGameN).toFixed(2)}`);
    console.log(
      `Ø einfache Punkte pro Runde (Team, das das Spiel gewann): ${(sumWinnerPerRoundMean / simpleGameN).toFixed(2)}`
    );
    console.log(
      `Ø einfache Punkte pro Runde (Team, das das Spiel verlor): ${(sumLoserPerRoundMean / simpleGameN).toFixed(2)}`
    );
    console.log(
      '(Mittel über alle Jass-Runden inkl. Matsch; Matsch hebt die «Punkte pro Runde» fürs siegreiche Team stark an.)\n'
    );
  }

  if (simpleGameNNormOnly > 0) {
    console.log('— Ø einfache Punkte pro Runde (Spiel gewonnen/verloren), nur normale Runden —');
    console.log(`Spiele mit mindestens einer normalen Runde: ${simpleGameNNormOnly}`);
    console.log(
      `Ø pro Runde Gewinner-Team: ${(sumWinnerPerRoundMeanNormOnly / simpleGameNNormOnly).toFixed(2)} | Verlierer-Team: ${(sumLoserPerRoundMeanNormOnly / simpleGameNNormOnly).toFixed(2)}\n`
    );
  } else if (simpleGameN > 0) {
    console.log('— Nur normale Runden pro Spiel: keine Spiele mit getrennten normalen Runden auswertbar.\n');
  }

  if (simpleGameN === 0) {
    console.log('Keine Spiele mit auswertbarer Rundenhistorie für Spiel-Summen.\n');
  }

  if (simpleGamesNoRounds > 0) {
    console.log(`Hinweis: ${simpleGamesNoRounds} Spiele ohne roundHistory für einfache Auswertung übersprungen.\n`);
  }

  console.log('=== 2) Kreidetafel: Jass-Punkte pro Spiel (verbucht, inkl. Multiplikator) ===\n');
  console.log(`Ausgewertete Spiele: ${kUsed}`);
  console.log(`Übersprungen (kein eindeutiger Sieg-Strich): ${kSkipped}`);
  console.log(`Datenquelle — roundHistory: ${histSource}, finalScores−weis: ${finalSource}`);
  console.log(`Ø Kreide Jass-Summe Gewinner-Team / Spiel: ${kUsed ? (kSumWinner / kUsed).toFixed(2) : '—'}`);
  console.log(`Ø Kreide Jass-Summe Verlierer-Team / Spiel: ${kUsed ? (kSumLoser / kUsed).toFixed(2) : '—'}`);

  if (scaledLoserAtTarget.length > 0) {
    const sumS = scaledLoserAtTarget.reduce((a, b) => a + b, 0);
    const avgS = sumS / scaledLoserAtTarget.length;
    console.log('');
    console.log(
      `— Gegenrechnung: Gewinner-Team hätte ${TARGET_WINNER_KREIDE} Kreide-Jass-Punkte (linear aus tatsächlichem Spielstand) —`
    );
    console.log(`Ø Verlierer-Team bei diesem Szenario: ${avgS.toFixed(1)} Punkte (n=${scaledLoserAtTarget.length})`);
    console.log(`Median Verlierer-Team: ${median(scaledLoserAtTarget).toFixed(1)}`);
    console.log(
      'Hinweis: Spiele enden bei euch per Strich «Sieg», nicht bei fester Punktzahl; das ist eine rechnerische Skalierung pro Spiel (Verhältnis wie am Ende).'
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
