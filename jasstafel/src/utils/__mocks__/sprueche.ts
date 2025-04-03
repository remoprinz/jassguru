// Definiere eine Funktion für jeden Spruch-Typ
const comebackSpruch = () => ({text: "Was für ein Comeback!", icon: "🔄"});
const matschSpruch = () => ({text: "Matsch!", icon: "💥"});
// ... weitere Sprüche ...

// Exportiere die Sprüche als Arrays von Funktionen
export const gameEndSprueche = {
  comeback: [comebackSpruch],
  matsch: [matschSpruch],
  blitz_schnell: [() => ({text: "Das ging schnell!", icon: "⚡"})],
  führungswechsel: [() => ({text: "Führungswechsel!", icon: "🔄"})],
  aufholjagd_nötig: [() => ({text: "Aufholjagd nötig!", icon: "🏃"})],
  führung_ausgebaut: [() => ({text: "Führung ausgebaut!", icon: "📈"})],
  knapp_gesamt: [() => ({text: "Knapp!", icon: "😅"})],
  dominierend: [() => ({text: "Dominierend!", icon: "💪"})],
  ehrenpunkte: [() => ({text: "Ehrenpunkte!", icon: "🎖"})],
  schneider: [() => ({text: "Schneider!", icon: "✂️"})],
} as const;

export const jassEndSprueche = {};
export const zeitSprueche = {};
