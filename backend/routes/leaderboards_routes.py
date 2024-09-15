from flask import Blueprint, jsonify, request
from sqlalchemy import func
from extensions import db
from models import JassGroup, Tournament, Event, Round, JassResults, League

leaderboard_routes = Blueprint('leaderboard_routes', __name__)

def calculate_leaderboard(event_ids, group, scoring='strokes'):
    
    # Query für Spieler-Rangliste
    player_results = db.session.query(JassResults.player_id,
                                      func.sum(JassResults.points if scoring == 'points' else JassResults.strokes).label('total_score'),
                                      func.count(JassResults.id).label('total_games')) \
        .join(Round, Round.id == JassResults.round_id) \
        .filter(Round.event_id.in_(event_ids)) \
        .filter(JassResults.player_id.in_([player.id for player in group.players])) \
        .group_by(JassResults.player_id) \
        .order_by(func.sum(JassResults.points if scoring == 'points' else JassResults.strokes).desc()) \
        .all()

    player_leaderboard = [{'player_id': result[0], 'total_score': result[1], 'total_games': result[2]} for result in player_results]

    # Query für Team-Rangliste
    team_results = db.session.query(JassResults.team_id,
                                    func.sum(JassResults.points if scoring == 'points' else JassResults.strokes).label('total_score'),
                                    func.count(JassResults.id).label('total_games')) \
        .join(Round, Round.id == JassResults.round_id) \
        .filter(Round.event_id.in_(event_ids)) \
        .filter(JassResults.team_id.in_([team.id for team in group.teams])) \
        .group_by(JassResults.team_id) \
        .order_by(func.sum(JassResults.points if scoring == 'points' else JassResults.strokes).desc()) \
        .all()

    team_leaderboard = [{'team_id': result[0], 'total_score': result[1], 'total_games': result[2]} for result in team_results]

    return {
        "player_leaderboard": player_leaderboard,
        "team_leaderboard": team_leaderboard
    }

@leaderboard_routes.route('/api/event/<int:event_id>/group/<int:group_id>/leaderboard', methods=['GET'])
def get_event_leaderboard(event_id, group_id):
    event = Event.query.get(event_id)
    group = JassGroup.query.get(group_id)
    if not event or not group:
        return jsonify({"error": "Event or group not found"}), 404

    leaderboard = calculate_leaderboard([event_id], group, scoring=event.scoring)
    return jsonify(leaderboard)

@leaderboard_routes.route('/api/tournament/<int:tournament_id>/group/<int:group_id>/leaderboard', methods=['GET'])
def get_tournament_leaderboard(tournament_id, group_id):
    tournament = Tournament.query.get(tournament_id)
    group = JassGroup.query.get(group_id)
    if not tournament or not group:
        return jsonify({"error": "Tournament or group not found"}), 404

    event_ids = [event.id for event in tournament.events]
    leaderboard = calculate_leaderboard(event_ids, group, scoring=tournament.scoring)
    return jsonify(leaderboard)

@leaderboard_routes.route('/api/league/<int:league_id>/group/<int:group_id>/leaderboard', methods=['GET'])
def get_league_leaderboard(league_id, group_id):
    league = League.query.get(league_id)
    group = JassGroup.query.get(group_id)
    if not league or not group:
        return jsonify({"error": "League or group not found"}), 404

    event_ids = [event.id for tournament in league.tournaments for event in tournament.events]
    leaderboard = calculate_leaderboard(event_ids, group, scoring=league.scoring)
    return jsonify(leaderboard)

@leaderboard_routes.route('/api/group/<int:group_id>/player_leaderboard', methods=['GET'])
def get_group_player_leaderboard(group_id):
    group = JassGroup.query.get(group_id)
    if not group:
        return jsonify({"error": "Group not found"}), 404

    player_results = db.session.query(JassResults.player_id,
                                      func.sum(JassResults.points).label('total_points'),
                                      func.count(JassResults.id).label('total_games')) \
        .join(Round, Round.id == JassResults.round_id) \
        .filter(JassResults.player_id.in_([player.id for player in group.players])) \
        .group_by(JassResults.player_id) \
        .order_by(func.sum(JassResults.points).desc()) \
        .all()

    player_leaderboard = [{'player_id': result[0], 'total_points': result[1], 'total_games': result[2]} for result in player_results]

    return jsonify(player_leaderboard)

@leaderboard_routes.route('/api/group/<int:group_id>/team_leaderboard', methods=['GET'])
def get_group_team_leaderboard(group_id):
    group = JassGroup.query.get(group_id)
    if not group:
        return jsonify({"error": "Group not found"}), 404

    team_results = db.session.query(JassResults.team_id,
                                    func.sum(JassResults.points).label('total_points'),
                                    func.count(JassResults.id).label('total_games')) \
        .join(Round, Round.id == JassResults.round_id) \
        .filter(JassResults.team_id.in_([team.id for team in group.teams])) \
        .group_by(JassResults.team_id) \
        .order_by(func.sum(JassResults.points).desc()) \
        .all()

    team_leaderboard = [{'team_id': result[0], 'total_points': result[1], 'total_games': result[2]} for result in team_results]

    return jsonify(team_leaderboard)

leaderboards_routes = Blueprint('leaderboard_routes', __name__)
