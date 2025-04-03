import type {
  GameEndSprueche,
  JassEndSprueche,
  ZeitSprueche,
} from "../../types/sprueche";

// GameEnd Imports
import {comebackSprueche} from "./gameEnd/comeback";
import {fuehrungswechselSprueche} from "./gameEnd/fuehrungswechsel";
import {aufholjagdNoetigSprueche} from "./gameEnd/aufholjagd_noetig";
import {fuehrungAusgebautSprueche} from "./gameEnd/fuehrung_ausgebaut";
import {knappGesamtSprueche} from "./gameEnd/knapp_gesamt";
import {dominierendSprueche} from "./gameEnd/dominierend";
import {ehrenpunkteSprueche} from "./gameEnd/ehrenpunkte";
import {matschSprueche as gameEndMatschSprueche} from "./gameEnd/matsch";

// JassEnd Imports
import {unentschiedenSprueche} from "./jassEnd/unentschieden";
import {comebackSprueche as jassEndComebackSprueche} from "./jassEnd/comeback";
import {hauchdünnSprueche} from "./jassEnd/hauchdünn";
import {knappSprueche} from "./jassEnd/knapp";
import {deutlichSprueche} from "./jassEnd/deutlich";
import {hochSprueche} from "./jassEnd/hoch";
import {sehrHochSprueche} from "./jassEnd/sehr_hoch";
import {vernichtendSprueche} from "./jassEnd/vernichtend";
import {matschSprueche as jassEndMatschSprueche} from "./jassEnd/matsch";

// Common Imports
import {schneiderSprueche} from "./common/schneider";

// Zeit Imports
import {gameEndZeitSprueche} from "./zeit/gameEnd";
import {jassEndZeitSprueche} from "./zeit/jassEnd";

export const gameEndSprueche: GameEndSprueche = {
  comeback: comebackSprueche,
  führungswechsel: fuehrungswechselSprueche,
  aufholjagd_nötig: aufholjagdNoetigSprueche,
  führung_ausgebaut: fuehrungAusgebautSprueche,
  knapp_gesamt: knappGesamtSprueche,
  dominierend: dominierendSprueche,
  ehrenpunkte: ehrenpunkteSprueche,
  matsch: gameEndMatschSprueche,
  schneider: schneiderSprueche,
};

export const jassEndSprueche: JassEndSprueche = {
  unentschieden: unentschiedenSprueche,
  comeback: jassEndComebackSprueche,
  hauchdünn: hauchdünnSprueche,
  knapp: knappSprueche,
  deutlich: deutlichSprueche,
  hoch: hochSprueche,
  sehr_hoch: sehrHochSprueche,
  vernichtend: vernichtendSprueche,
  matsch: jassEndMatschSprueche,
  schneider: schneiderSprueche,
};

export const zeitSprueche: ZeitSprueche = {
  gameEnd: gameEndZeitSprueche,
  jassEnd: jassEndZeitSprueche,
};
