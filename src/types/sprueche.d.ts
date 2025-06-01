import type { JassSpruchParams } from './jass';

export interface SpruchMitIcon {
  text: string;
  icon: string;
}

export type SpruchGenerator = (params: JassSpruchParams) => SpruchMitIcon | null;

export interface GameEndSprueche {
  comeback: SpruchGenerator[];
  führungswechsel: SpruchGenerator[];
  aufholjagd_nötig: SpruchGenerator[];
  führung_ausgebaut: SpruchGenerator[];
  knapp_gesamt: SpruchGenerator[];
  dominierend: SpruchGenerator[];
  ehrenpunkte: SpruchGenerator[];
  matsch: SpruchGenerator[];
  schneider: SpruchGenerator[];
}

export interface JassEndSprueche {
  unentschieden: SpruchGenerator[];
  comeback: SpruchGenerator[];
  hauchdünn: SpruchGenerator[];
  knapp: SpruchGenerator[];
  deutlich: SpruchGenerator[];
  hoch: SpruchGenerator[];
  sehr_hoch: SpruchGenerator[];
  vernichtend: SpruchGenerator[];
  matsch: SpruchGenerator[];
  schneider: SpruchGenerator[];
}

export interface KombinierterSpruch {
  hauptSpruch: SpruchMitIcon;
  zusatzSpruch?: SpruchMitIcon;
  zeitSpruch?: SpruchMitIcon;
}

export interface SpruchKombinationsRegeln {
  maxSprueche: {
    [K in GameEndErgebnisKategorie | 'default']: number;
  };
  erlaubteKombinationen: {
    [K in GameEndErgebnisKategorie]?: GameEndErgebnisKategorie[];
  };
  zeitKombinierbar: {
    [K in GameEndErgebnisKategorie | 'default']: boolean;
  };
}

export type GameEndKategorie = keyof GameEndSprueche;
export type JassEndKategorie = keyof JassEndSprueche;

export type SpieltempoKategorie =
  | 'blitz_schnell'
  | 'schnell'
  | 'normal'
  | 'gemütlich'
  | 'marathon';

export interface JassEndSpielInfo {
  gesamtPunkte: {
    team1: number;
    team2: number;
  };
  matchCount: {
    team1: number;
    team2: number;
  };
  führungsWechsel: number;
  spielDauer: string;
}

export interface ErweiterterKombinierterSpruch {
  hauptSpruch: SpruchMitIcon;
  resultatDetails?: SpruchMitIcon;
  spielstatistik?: SpruchMitIcon;
  zeitSpruch?: SpruchMitIcon;
  matchDetails?: SpruchMitIcon;
}

export type ZeitSprueche = {
  gameEnd: Record<SpieltempoKategorie, SpruchGenerator[]>;
  jassEnd: Record<SpieltempoKategorie, SpruchGenerator[]>;
};

export type BedankenChargeLevel = 'none' | 'low' | 'medium' | 'high' | 'super' | 'extreme';

export interface BedankenSpruch {
  text: string;
  buttons: {
    cancel: string;
    confirm: string;
  };
}

export type BedankenSprueche = Record<BedankenChargeLevel, BedankenSpruch[]>; 