from flask import Blueprint, jsonify
from models import Player, Team, JassResults, Game, Round

statistics_routes = Blueprint('statistics_routes', __name__)

def player_statistics(player):
    total_score_made = sum([s.score for s in player.scores_made])
    total_score_received = sum([s.score for s in player.scores_received])
    score_difference = total_score_made - total_score_received
    total_wins_game = sum([1 for g in player.games if g.winner == player])
    total_wins_round = sum([1 for r in player.rounds if r.winner == player])

    if len(player.games) > 0:
        win_rate_game = total_wins_game / len(player.games)
    else:
        win_rate_game = 0

    if len(player.rounds) > 0:
        win_rate_round = total_wins_round / len(player.rounds)
    else:
        win_rate_round = 0

    return {
        'player_id': player.id,
        'name': player.name,
        'team': player.team.name if player.team else None,
        'total_score_made': total_score_made,
        'total_score_received': total_score_received,
        'score_difference': score_difference,
        'total_wins_game': total_wins_game,
        'total_wins_round': total_wins_round,
        'win_rate_game': win_rate_game,
        'win_rate_round': win_rate_round
    }

@statistics_routes.route('/api/statistics/players', methods=['GET'])
def get_player_statistics():
    players = Player.query.all()
    player_statistics_data = [player_statistics(player) for player in players]
    return jsonify(player_statistics_data)

@statistics_routes.route('/api/statistics/teams', methods=['GET'])
def get_team_statistics():
    teams = Team.query.all()
    team_statistics = [
        {
            'team_id': team.id,
            'name': team.name,
            'players': [player.name for player in team.players],
            'total_score': team.calculate_total_score()
        } for team in teams
    ]
    return jsonify(team_statistics)
