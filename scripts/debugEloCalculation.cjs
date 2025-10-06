#!/usr/bin/env node
/**
 * 🔍 Debug Elo Calculation für Session utrnuu7q5mQXHzWkPgO8Q
 */

// Elo-Konstanten (aus calculateRatingsPerGame.cjs)
const K = 15;
const ELO_SCALE = 1000;

function expectedScore(ratingA, ratingB) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / ELO_SCALE));
}

function stricheScore(stricheA, stricheB) {
  const total = stricheA + stricheB;
  if (total === 0) return 0.5;
  return stricheA / total;
}

function teamRating(player1Rating, player2Rating) {
  return (player1Rating + player2Rating) / 2;
}

console.log('\n🔍 DEBUG ELO-BERECHNUNG - Session utrnuu7q5mQXHzWkPgO8Q');
console.log('='.repeat(70));

// Ratings VOR der Session (aus Script-Output)
const ratingMichael = 124;  // Von vorheriger Session
const ratingToby = 119;     // Von vorheriger Session  
const ratingClaudia = 72;   // Geschätzt
const ratingMarc = 105;     // Von vorheriger Session

console.log('\n📊 RATINGS VOR SESSION:');
console.log(`  Michael (Top):   ${ratingMichael}`);
console.log(`  Toby (Top):      ${ratingToby}`);
console.log(`  Claudia (Bottom): ${ratingClaudia}`);
console.log(`  Marc (Bottom):    ${ratingMarc}`);

// Striche aus der Session
const stricheTop = 9;
const stricheBottom = 8;

console.log('\n🎮 SESSION-ERGEBNIS:');
console.log(`  Top (Michael+Toby):    ${stricheTop} Striche`);
console.log(`  Bottom (Claudia+Marc): ${stricheBottom} Striche`);
console.log(`  → Gewinner: Top-Team mit +${stricheTop - stricheBottom} Strichen`);

// Team-Ratings
const ratingTeamTop = teamRating(ratingMichael, ratingToby);
const ratingTeamBottom = teamRating(ratingClaudia, ratingMarc);

console.log('\n📈 TEAM-RATINGS:');
console.log(`  Team Top:    ${ratingTeamTop.toFixed(2)}`);
console.log(`  Team Bottom: ${ratingTeamBottom.toFixed(2)}`);
console.log(`  Differenz: ${(ratingTeamTop - ratingTeamBottom).toFixed(2)}`);

// Erwartungswerte
const expectedTop = expectedScore(ratingTeamTop, ratingTeamBottom);
const expectedBottom = expectedScore(ratingTeamBottom, ratingTeamTop);

console.log('\n🎯 ERWARTUNGSWERTE (0-1 Skala):');
console.log(`  Team Top erwartet:    ${(expectedTop * 100).toFixed(1)}%`);
console.log(`  Team Bottom erwartet: ${(expectedBottom * 100).toFixed(1)}%`);

// Tatsächlicher Score (basierend auf Strichen)
const actualScoreTop = stricheScore(stricheTop, stricheBottom);
const actualScoreBottom = stricheScore(stricheBottom, stricheTop);

console.log('\n⚖️  TATSÄCHLICHER SCORE (0-1 Skala):');
console.log(`  Team Top:    ${(actualScoreTop * 100).toFixed(1)}% (${stricheTop}/${stricheTop + stricheBottom} Striche)`);
console.log(`  Team Bottom: ${(actualScoreBottom * 100).toFixed(1)}% (${stricheBottom}/${stricheTop + stricheBottom} Striche)`);

// Delta-Berechnung
const teamKAvg = K; // Beide Teams haben K=15
const deltaTop = teamKAvg * (actualScoreTop - expectedTop);
const deltaBottom = -deltaTop;

console.log('\n📊 DELTA-BERECHNUNG:');
console.log(`  K-Faktor: ${K}`);
console.log(`  Delta Top = K × (Actual - Expected)`);
console.log(`           = ${K} × (${actualScoreTop.toFixed(3)} - ${expectedTop.toFixed(3)})`);
console.log(`           = ${K} × ${(actualScoreTop - expectedTop).toFixed(3)}`);
console.log(`           = ${deltaTop.toFixed(3)}`);
console.log(`\n  Delta Bottom = -${deltaTop.toFixed(3)} = ${deltaBottom.toFixed(3)}`);

// Verteilung innerhalb der Teams (50/50)
const deltaMichael = deltaTop / 2;
const deltaToby = deltaTop / 2;
const deltaClaudia = deltaBottom / 2;
const deltaMarc = deltaBottom / 2;

console.log('\n👥 VERTEILUNG INNERHALB DER TEAMS (50/50):');
console.log(`  Michael:  ${deltaMichael > 0 ? '+' : ''}${deltaMichael.toFixed(2)} → ${(ratingMichael + deltaMichael).toFixed(2)}`);
console.log(`  Toby:     ${deltaToby > 0 ? '+' : ''}${deltaToby.toFixed(2)} → ${(ratingToby + deltaToby).toFixed(2)}`);
console.log(`  Claudia:  ${deltaClaudia > 0 ? '+' : ''}${deltaClaudia.toFixed(2)} → ${(ratingClaudia + deltaClaudia).toFixed(2)}`);
console.log(`  Marc:     ${deltaMarc > 0 ? '+' : ''}${deltaMarc.toFixed(2)} → ${(ratingMarc + deltaMarc).toFixed(2)}`);

console.log('\n🔍 ANALYSE:');
if (deltaTop < 0) {
  console.log(`  ❌ PROBLEM: Team Top hat GEWONNEN (${stricheTop}:${stricheBottom}), bekommt aber NEGATIVE Punkte!`);
  console.log(`  📊 Grund: Actual Score (${(actualScoreTop * 100).toFixed(1)}%) < Expected (${(expectedTop * 100).toFixed(1)}%)`);
  console.log(`  💡 Das passiert, weil Team Top trotz Sieg nur knapp gewonnen hat (9:8 = 52.9%),`);
  console.log(`     aber aufgrund des hohen Rating-Vorsprungs (${(ratingTeamTop - ratingTeamBottom).toFixed(1)} Punkte)`);
  console.log(`     einen viel höheren Sieg erwartet wurde (${(expectedTop * 100).toFixed(1)}%).`);
  console.log(`\n  ⚠️  DAS IST EIN DESIGN-PROBLEM: Ein Sieg sollte IMMER positive Punkte geben!`);
} else {
  console.log(`  ✅ Korrekt: Team Top hat gewonnen und bekommt positive Punkte.`);
}

console.log('\n');

