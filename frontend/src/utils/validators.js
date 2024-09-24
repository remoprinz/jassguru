import { logError, logInfo } from './logger';

export const validateJassData = (data) => {
  logInfo('validators', 'Validating jass data', JSON.stringify(data));
  const requiredFields = ['mode', 'group_id', 'players', 'rosen10_player_id', 'start_date', 'latitude', 'longitude', 'location_name'];
  const isValid = requiredFields.every(field => field in data) && 
                  Array.isArray(data.players) && 
                  data.players.length === 4 &&
                  data.players.every(player => 'id' in player && 'team' in player);
  
  if (!isValid) {
    logError('JassValidation', 'Ungültige Jass-Daten', { data });
  }
  
  return isValid;
};

export const validateScores = (scores) => {
  const isValid = Array.isArray(scores) && scores.every(score => 
    typeof score.team1_score === 'number' && 
    typeof score.team2_score === 'number'
  );
  
  if (!isValid) {
    logError('JassValidation', 'Ungültige Punktedaten', { scores });
  }
  
  return isValid;
};

export const validateRoundData = (roundData) => {
  const requiredFields = ['spiel_id', 'team1_score', 'team2_score', 'farbe'];
  const isValid = requiredFields.every(field => field in roundData);
  
  if (!isValid) {
    logError('JassValidation', 'Ungültige Rundendaten', { roundData });
  }
  
  return isValid;
};

// Neue Funktion für die Validierung der Jass-Erfassungsdaten
export const validateJassErfassenData = (data) => {
  const requiredFields = ['mode', 'group_id', 'players', 'rosen10_player_id', 'location'];
  const isValid = requiredFields.every(field => field in data) && 
                  Array.isArray(data.players) && 
                  data.players.length === 4;

  if (!isValid) {
    logError('JassValidation', 'Ungültige Jass-Erfassungsdaten', { data });
  }

  return isValid;
};
