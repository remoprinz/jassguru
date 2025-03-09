import type { 
  BedankenChargeLevel, 
  BedankenSpruch, 
  BedankenSprueche 
} from '../../types/sprueche';

export const bedankenSprueche: BedankenSprueche = {
  none: [
    { 
      text: "Alles klar! Zur Übersicht?", 
      buttons: { cancel: "Nein", confirm: "Klar!" } 
    },
    { 
      text: "Passt! Auswertung anschauen?", 
      buttons: { cancel: "Nein", confirm: "Klar!" } 
    },
    { 
      text: "Fertig! Resultate?", 
      buttons: { cancel: "Nein", confirm: "Klar!" } 
    },
    { 
      text: "Sauber bedankt! Schauen wir?", 
      buttons: { cancel: "Nein", confirm: "Klar!" } 
    },
    { 
      text: "Prima! Zur Übersicht?", 
      buttons: { cancel: "Nein", confirm: "Klar!" } 
    },
    { 
      text: "Bravo! Zum Gesamtergebnis?", 
      buttons: { cancel: "Nein", confirm: "Klar!" } 
    },
    { 
      text: "Super! Resultate checken?", 
      buttons: { cancel: "Nein", confirm: "Klar!" } 
    },
    { 
      text: "Perfekt! Auswertung?", 
      buttons: { cancel: "Nein", confirm: "Klar!" } 
    },
    { 
      text: "Tiptop! Schauen wir?", 
      buttons: { cancel: "Nein", confirm: "Klar!" } 
    },
    { 
      text: "Wunderbar! Zur Gesamtauswertung?", 
      buttons: { cancel: "Nein", confirm: "Klar!" } 
    }
  ],
  low: [
    {
      text: "Ein feiner Sieg! Zur Übersicht?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Sauber gespielt! Resultate?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Gut gemacht! Schauen wir?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Schöne Runde! Weiter?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Freude herrscht! Auswertung?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Fein gemacht! Resultate checken?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Nett gespielt! Zur Übersicht?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Gut gekämpft! Schauen wir?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Saubere Sache! Auswertung?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    }
  ],
  medium: [
    {
      text: "Ohooo! Da wurde aber schön bedankt! Zur Übersicht?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Hoppla! Das war aber ein feiner Zug! Resultate?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Ui ui ui! Das kann sich sehen lassen! Weiter?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Aha! Da hat jemand Freude! Schauen wir?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Hoho! Freud herrscht! Auswertung?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Jesses! Freude muss sein! Resultate?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Aha! Da strahlt aber jemand! Weiter?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Prost! Gute Feier! Schauen wir?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Hurra! Siegen macht glücklich! Auswertung?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Juhui! Zelebrieren muss sein! Resultate angucken?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    }
  ],
  high: [
    {
      text: "Bei den Jasskarten! Was für ein Triumph! Zur Auswertung?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Donnerwetter! Das war aber ein Meisterstück! Resultate?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Heiliger Bock! Was für ein Zug! Schauen wir?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Himmel, Herrgott! Das war aber stark! Weiter?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Potzblitz! Was für eine Show! Auswertung?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Herrjemine! Das war aber grandios! Resultate?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Heiliger Trumpf! Was für ein Coup! Weiter?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Jetzt hät's geschället! Zum Resultat?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Heidewitzka! Was für ein Geniestreich! Auswertung?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Sapperlot! Das war aber meisterhaft! Weiter?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    }
  ],
  super: [
    {
      text: "Potz Blitz! Da hat aber jemand seinen Sieg zelebriert! Zur Auswertung?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Heiliger Bimbam! Was für eine Siegesfeier! Resultate?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Himmelherrgottsakrament! Das war episch! Schauen wir?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Donnerwetter und Hagelschlag! Was für ein Spektakel! Weiter?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Heiliges Kanonenrohr! Das war legendär! Auswertung?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Potzblitz und Donnerkeil! Was für ein Feuerwerk! Resultate?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Sapperlot und Holzaxt! Das war gigantisch! Weiter?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Himmel, Arsch und Zwirn! Was für eine Show! Schauen wir?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Heiliger Strohsack! Das war bombastisch! Auswertung?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Potz Blitz und Kreuzsakrament! Was für ein Triumph! Weiter?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    }
  ],
  extreme: [
    {
      text: "Himmel, Herrgott und Eichel Buur! Dieser Sieg scheint besonders süss zu sein! Zur Auswertung?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Heiliger Schilten König! Da klebt wohl jemand am Siegesknopf fest! Resultate?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Sapperlot und Obenabe! Da hat's aber jemand mit der Siegesfreude! Zur Übersicht?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Potzblitz und Trumpf Buur! Das ist ja eine Siegesparade der Extraklasse! Weiter?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Heiliges Undenufe! Da wird der Sieg aber ausgekostet bis zum letzten Tropfen! Zur Auswertung?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Himmel und Nell! Wenn das kein Grund zum Feiern ist, was dann? Resultate?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Sapperlot und Wiis! Da tanzt wohl jemand Sirtaki auf dem Jassteppich! Zur Übersicht?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Donnerwetter und Rosen König! Das nenn ich mal eine Sieges-Choreographie! Weiter?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Heiliger Match! Da wird ja mehr gefeiert als beim Schellen Ober! Zur Auswertung?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Potzblitz und Schellen Ass! Das ist ja eine Siegesfeier wie beim Stöck-Match! Resultate?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Himmel, Arsch und Wolkenbruch! Da hat's wohl jemand nicht eilig mit dem Weiterspielen! Weiter?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Heiliger Strohsack! Der Siegestanz dauert ja länger als ein Schieber! Zur Übersicht?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Sapperlot und Kreuzjass! Da wird der Sieg zelebriert wie ein Blatt mit Vier Königen! Resultate?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Donnerwetter und Slalom! Diese Siegesfreude ist ja grösser als beim Kontermatch! Weiter?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Potzblitz und Misère! Da hat's wohl jemand nicht so mit der Bescheidenheit! Zur Auswertung?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Heiliger Bock! Diese Siegesfeier ist ja länger als eine Runde Differenzler! Resultate?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Sapperlot und Gusti! Da wird ja mehr zelebriert als beim Papst sein Namenstag! Weiter?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Himmel und Hölle! Das ist ja eine Siegesfeier wie nach einem Tout! Zur Übersicht?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Heiliger Bimbam! Da wird der Sieg ausgekostet wie der letzte Tropfen im Glas! Resultate?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Potzblitz und Herrgott! Diese Siegesfreude schreit ja förmlich nach einem Jassturnier! Weiter?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Prooooost! Tanzt da jemand schon auf dem Tisch? Resultate?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Juhuiii! Die Korken knallen, die Gläser klingen! Weiter?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Olé, Olé! Das schreit nach einer Siegesrunde! Resultate?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Stimmung, Stimmung! Die Party ist noch lange nicht vorbei! Weiter?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Bier für alle! Der Sieg will begossen werden! Resultate?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "La-Ola! Die Siegesrunde geht auf's Haus! Zur Übersicht?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Fiesta, Fiesta! Der Siegestanz ist in vollem Gange! Weiter?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Auf die Tische, fertig, los! Das wird eine lange Nacht! Resultate?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Ramba Zamba! Die Siegesparty ist nicht mehr zu stoppen! Zur Übersicht?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Heute wird getanzt, gesungen und gefeiert! Weiter?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    }
  ]
};

export const getRandomBedankenSpruch = (level: BedankenChargeLevel): BedankenSpruch => {
  const sprueche = bedankenSprueche[level];
  return sprueche[Math.floor(Math.random() * sprueche.length)];
}; 