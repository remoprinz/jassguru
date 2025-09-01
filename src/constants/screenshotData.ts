export interface ScreenshotData {
  id: string;
  src: string;
  title: string;
  description: string;
  order: number;
}

export const SCREENSHOT_DATA: ScreenshotData[] = [
  {
    id: '0a_jassstarten',
    src: '/assets/screenshots/0a_Jassstarten.PNG',
    title: 'Deine Jassgruppe',
    description: 'Gründe deine eigene Jassgruppe! Hier siehst du alle Partien, Siege und legendären Momente deiner Runde auf einen Blick.',
    order: 1
  },
  {
    id: '0a2_strichdifferenz',
    src: '/assets/screenshots/0a2_Strichdifferenz.PNG',
    title: 'Ranglisten, Tabellen und Statistiken',
    description: 'Wer führt die Rangliste an? Alle wichtigen Jass-Statistiken, Vergleiche und Rekorde deiner Gruppe übersichtlich aufbereitet.',
    order: 3
  },
  {
    id: '0b1_profil',
    src: '/assets/screenshots/0b1_Profil.PNG',
    title: 'Dein Profil',
    description: 'Auf deinem Profil sind alle deine Jasswerte gruppenübergreifend erfasst. Von deinen Trumpfansagen bis hin zu Rekorden und Serien.',
    order: 5
  },
  {
    id: '0b3_siegquote',
    src: '/assets/screenshots/0b3_Siegquote.PNG',
    title: 'Partner- und Gegner-Bilanzen',
    description: 'In welcher Disziplin harmonierst du mit wem? Egal ob Siegquote, Matsch- oder Schneider-Bilanz – mit der Zeit lügt die Statistik nie.',
    order: 6
  },
  {
    id: '0c_multidevice',
    src: '/assets/screenshots/0c_Multidevice.PNG',
    title: 'Multi-Device',
    description: 'Starte einen Jass oder trete einer Partie bei! Jeder Spieler am Tisch kann mitlesen und mitschreiben. Der aktuelle Stand wird auf allen Geräten in Echtzeit synchronisiert.',
    order: 8
  },
  {
    id: '1_spielererfassen',
    src: '/assets/screenshots/1_spielererfassen.PNG',
    title: 'Spieler auswählen',
    description: 'Wer ist heute am Start? Deine Jassfreunde sind schon bereit – einfach antippen und auswählen.',
    order: 9
  },
  {
    id: '2_spielererfassen2',
    src: '/assets/screenshots/2_spielererfassen2.PNG',
    title: 'Startspieler wählen',
    description: 'Wer darf heute beginnen? Bestimme den Startspieler und los geht\'s!',
    order: 10  
  },
  {
    id: '3_jasstafel',
    src: '/assets/screenshots/3_Jasstafel.PNG',
    title: 'Digitale Jasstafel',
    description: 'Wie früher beim Grossvater – nur ohne Kreidestaub! Ein Tipp auf die Z-Linie und schon steht dein erster Weis.',
    order: 11
  },
  {
    id: '4_menue',
    src: '/assets/screenshots/4_menue.PNG',
    title: 'Swipe-Menü',
    description: 'Ein Swipe nach unten und das Menü öffnet sich. Eine laufende Partie kann jederzeit verlassen oder fortgesetzt werden. Der Stand ist auf der Cloud gespeichert.',
    order: 12
  },
  {
    id: '5_kalkulator',
    src: '/assets/screenshots/5_Kalkulator.PNG',
    title: 'Runde erfassen',
    description: 'Ein langer Klick: Der Kalkulator öffnet sich. Gebe die gespielte Farbe und Punktzahl ein. Die Resultate werden gemäss der individuellen Gruppen-Einstellung für beide Teams automatisch berechnet.',
    order: 13
  },
  {
    id: '6_matsch',
    src: '/assets/screenshots/6_Matsch.PNG',
    title: 'Gamification',
    description: 'Maaaatsch! Solche Momente verdienen manchmal eine richtige Feier. Die App überrascht dich mit kleinen Highlights – zum Jubeln oder Ärgern!',
    order: 14
  },
  {
    id: '7_berg',
    src: '/assets/screenshots/7_Berg.PNG',
    title: 'Berg und Sieg',
    description: 'Doppelklick: Die Übersicht öffnet. Schreibe hier Berg und Sieg. Aber Achtung: Bedanken musst du dich immer noch selber! Dafür sind die Restpunkte zu Berg oder Sieg stets vorberechnet. Welch Zeitersparnis.',
    order: 15
  },
  {
    id: '7a_navigation',
    src: '/assets/screenshots/7a_DigitaleJasstafel.PNG',
    title: 'Navigation',
    description: 'Swipe nach links & rechts: So navigierst du zurück und vorwärts durch die Runden. Wurde etwa ein Fehler gemacht? Kein Problem. Einfach zurückswipen und korrigieren.',
    order: 16
  },
  {
    id: '8_runden',
    src: '/assets/screenshots/8_Runden.PNG',
    title: 'Runden-Ansicht',
    description: 'Wer kennt es nicht: War geschoben? Wurden die Stöck geschrieben? Schluss damit! Jede Runde ist nachvollziehbar und dokumentiert.',
    order: 17
  },
  {
    id: '8a_zwischenstand',
    src: '/assets/screenshots/8a_Zwischenstand.PNG',
    title: 'Zwischenstand',
    description: 'Behalte den Zwischenstand stets im Blick. Entscheide hier, ob noch ein Spiel angehängt wird oder ob die Partie beendet werden soll.',
    order: 18
  },
  {
    id: '8b_striche',
    src: '/assets/screenshots/8b_Striche.PNG',
    title: 'Resultat-Übersicht',
    description: 'Gespeichert! Das Endergebnis ist sauber dargestellt und archiviert.',
    order: 19
  },
  {
    id: '8c_spruchgenerator',
    src: '/assets/screenshots/8c_Spruchgenerator.PNG',
    title: 'Spruchgenerator',
    description: 'Kleine Freuden: Klicke auf den Teilen-Knopf oben rechts und der Jassguru kommentiert die Partie im Stile eines Sportmoderators.',
    order: 20
  },
  {
    id: '8d_archiv',
    src: '/assets/screenshots/8d_Archiv.PNG',
    title: 'Archiv',
    description: 'Das Archiv: Die Basis für alle möglichen Statistiken, Ranglisten und Tabellen. Alle Partien sind archiviert und können jederzeit wieder aufgerufen werden.',
    order: 21
  },
  {
    id: '8e_turnier',
    src: '/assets/screenshots/8e_Turnier.PNG',
    title: 'Turniere',
    description: 'Turniere haben ihre eigene Seite. Ranglisten werden live aktualisiert. Ergebnisse sind bis auf die Ebene jeder einzelnen Passe abrufbar.',
    order: 22
  },
  {
    id: '9a_mitspielereinladen',
    src: '/assets/screenshots/9a_MitspielerEinladen.PNG',
    title: 'Mitspieler einladen',
    description: 'Schon eine Gruppe? Lade deine Jassfreunde ein! Per Einladungs-Link oder via QR-Code zum Scannen direkt am Tisch.',
    order: 23
  },
  {
    id: '9_gruppeerfassen',
    src: '/assets/screenshots/9_GruppeErfassen.PNG',
    title: 'Gruppe erstellen oder beitreten',
    description: 'Neu hier? Starte deine eigene Gruppe oder tritt einer bestehenden Gruppe bei indem du den Link einfügst oder den QR-Code scannst.',
    order: 24
  },
  {
    id: '9b1_profilbildhochladen',
    src: '/assets/screenshots/9b1_ProfilbildHochladen.PNG',
    title: 'Gruppenbild hochladen',
    description: 'Lade ein Gruppenbilder und ein persönliches Profilbild hoch. Mache deine Gruppe und dein Profil persönlicher und erkennbarer.',
    order: 25
  },
  {
    id: '9b2_einstellung',
    src: '/assets/screenshots/9b2_Einstellung.PNG',
    title: 'Gruppe benennen',
    description: 'Benenne und beschreibe deine Gruppe. Gib ihr Charakter und eine eigene Identität.',
    order: 26
  },
  {
    id: '9c_einstellungen',
    src: '/assets/screenshots/9c_Einstellungen.PNG',
    title: 'Einstellungen',
    description: 'Deine Regeln, dein Jass! Stelle DE/FR Karten, Farben, Multiplikatoren, Zielpunkte etc. gemäss den Präferenzen deiner Jassgruppe ein.',
    order: 27
  },
  {
    id: '10_mitglieder',
    src: '/assets/screenshots/10_Mitglieder.PNG',
    title: 'Mitglieder-Rechte',
    description: 'Verwalte die Rechte der Gruppenmitglieder. Wer darf was und was nicht?',
    order: 28
  },
  {
    id: '11_regelchat',
    src: '/assets/screenshots/11_Regelchat.PNG',
    title: 'Jassguru Chat',
    description: 'Chatte mit dem Jassguru persönlich! Er kennt jede Regel aus dem modernen Regelwerk «Stöck, Wys, Stich: Der neue Schweizer Jassführer» und vieles mehr. Er versteht und spricht fliessend Schweizerdeutsch.',
    order: 29
  }
];

// Hilfsfunktionen für einfachen Zugriff
export const getScreenshotById = (id: string): ScreenshotData | undefined => {
  return SCREENSHOT_DATA.find(screenshot => screenshot.id === id);
};

export const getScreenshotByOrder = (order: number): ScreenshotData | undefined => {
  return SCREENSHOT_DATA.find(screenshot => screenshot.order === order);
};

export const getTotalScreenshots = (): number => {
  return SCREENSHOT_DATA.length;
};
