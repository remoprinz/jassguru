import type { BedankenSprueche, BedankenChargeLevel, BedankenSpruch } from '../../types/sprueche';

export const bergSprueche: BedankenSprueche = {
  none: [
    {
      text: "Berg! Zur Resultattafel?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    }
  ],
  low: [
    {
      text: "Berg geschafft! Resultate anschauen?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Berg! Weiter zur Übersicht?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    }
  ],
  medium: [
    {
      text: "Donnerwetter! Ein Berg wie aus dem Bilderbuch! Zur Resultattafel?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Potzblitz! Das war ein Berg der Extraklasse! Zur Resultattafel?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    }
  ],
  high: [
    {
      text: "Heiliger Strohsack! Was für ein Berg! Zur Resultattafel??",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Sapperlot! Der Berg ist ja höher als das Matterhorn! Zur Resultattafel?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    }
  ],
  super: [
    {
      text: "Donnerwetter und Hagelschlag! Das ist ja ein Himalaya! Resultate?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Potzblitz und Donnerkeil! Ein Berg wie der Mount Everest! Zur Resultattafel?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    }
  ],
  extreme: [
    {
      text: "Himmel, Herrgott und Eichel Buur! Das ist ja ein Berg bis in den Himmel! Resultate?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    },
    {
      text: "Heiliger Schilten König! Der Berg ragt ja bis in die Wolken! Zur Resultattafel?",
      buttons: { cancel: "Nein", confirm: "Klar!" }
    }
  ]
};

export const getRandomBergSpruch = (level: BedankenChargeLevel): BedankenSpruch => {
  const sprueche = bergSprueche[level];
  return sprueche[Math.floor(Math.random() * sprueche.length)];
}; 