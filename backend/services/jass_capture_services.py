from models import JassCapture, Jass, Spiel, Runde

def calculate_jass_stats(jass: JassCapture) -> dict:
    total_score_team1 = 0
    total_score_team2 = 0
    rounds_played = 0
    
    for spiel in jass.spiele:
        total_score_team1 += spiel.team1_score
        total_score_team2 += spiel.team2_score
        rounds_played += len(spiel.runden)
    
    return {
        'total_score_team1': total_score_team1,
        'total_score_team2': total_score_team2,
        'rounds_played': rounds_played,
        'winner': 'Team 1' if total_score_team1 > total_score_team2 else 'Team 2' if total_score_team2 > total_score_team1 else 'Unentschieden'
    }