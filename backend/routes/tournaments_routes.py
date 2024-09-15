from flask import Blueprint, request, jsonify
from models import Tournament, Player, Team
from extensions import db

tournaments_routes = Blueprint('tournaments_routes', __name__)

@tournaments_routes.route('/api/tournaments', methods=['GET'])
def get_tournaments():
    tournaments = Tournament.query.all()
    return jsonify([tournament.serialize for tournament in tournaments])

@tournaments_routes.route('/api/tournaments', methods=['POST'])
def create_tournament():
    data = request.get_json()
    name = data.get('name')
    date = data.get('date')

    if not name or not date:
        return jsonify({"error": "Name and date are required"}), 400

    tournament = Tournament(name=name, date=date)
    db.session.add(tournament)
    db.session.commit()

    return jsonify(tournament.serialize), 201

@tournaments_routes.route('/api/tournaments/<int:tournament_id>', methods=['GET'])
def get_tournament(tournament_id):
    tournament = Tournament.query.get_or_404(tournament_id)
    return jsonify(tournament.serialize)

@tournaments_routes.route('/api/tournaments/<int:tournament_id>', methods=['PUT'])
def update_tournament(tournament_id):
    tournament = Tournament.query.get(tournament_id)
    data = request.get_json()

    if not tournament:
        return jsonify({"error": "Tournament not found"}), 404

    tournament.name = data.get('name', tournament.name)
    tournament.date = data.get('date', tournament.date)
    db.session.commit()

    return jsonify(tournament.serialize)

@tournaments_routes.route('/api/tournaments/<int:tournament_id>', methods=['DELETE'])
def delete_tournament(tournament_id):
    tournament = Tournament.query.get(tournament_id)

    if not tournament:
        return jsonify({"error": "Tournament not found"}), 404

    db.session.delete(tournament)
    db.session.commit()

    return jsonify({"status": "success"})

@tournaments_routes.route('/api/tournaments/<int:tournament_id>/players', methods=['POST'])
def add_player_to_tournament(tournament_id):
    tournament = Tournament.query.get_or_404(tournament_id)
    data = request.get_json()
    player_id = data.get('player_id')

    if not player_id:
        return jsonify({"error": "Player ID is required"}), 400

    player = Player.query.get(player_id)

    if not player:
        return jsonify({"error": "Player not found"}), 404

    if player not in tournament.players:
        tournament.players.append(player)
        db.session.commit()
        return jsonify({"status": "success"})
    else:
        return jsonify({"error": "Player is already part of the tournament"}), 400

@tournaments_routes.route('/api/tournaments/<int:tournament_id>/players/<int:player_id>', methods=['DELETE'])
def remove_player_from_tournament(tournament_id, player_id):
    tournament = Tournament.query.get_or_404(tournament_id)
    player = Player.query.get_or_404(player_id)

    if player in tournament.players:
        tournament.players.remove(player)
        db.session.commit()
        return jsonify({"status": "success"})
    else:
        return jsonify({"error": "Player is not part of the tournament"}), 400

@tournaments_routes.route('/api/tournaments/<int:tournament_id>/teams', methods=['GET'])
def get_tournament_teams(tournament_id):
    tournament = Tournament.query.get_or_404(tournament_id)
    return jsonify([team.serialize for team in tournament.teams])

@tournaments_routes.route('/api/tournaments/<int:tournament_id>/teams', methods=['POST'])
def add_team_to_tournament(tournament_id):
    tournament = Tournament.query.get_or_404(tournament_id)
    data = request.get_json()
    team_id = data.get('team_id')

    if not team_id:
        return jsonify({"error": "Team ID is required"}), 400

    team = Team.query.get(team_id)

    if not team:
        return jsonify({"error": "Team not found"}), 404

    if team not in tournament.teams:
        tournament.teams.append(team)
        db.session.commit()
        return jsonify({"status": "success"})
    else:
        return jsonify({"error": "Team is already part of the tournament"}), 400

@tournaments_routes.route('/api/tournaments/<int:tournament_id>/teams/<int:team_id>', methods=['DELETE'])
def remove_team_from_tournament(tournament_id, team_id):
    tournament = Tournament.query.get_or_404(tournament_id)
    team = Team.query.get_or_404(team_id)

    if team in tournament.teams:
        tournament.teams.remove(team)
        db.session.commit()
        return jsonify({"status": "success"})
    else:
        return jsonify({"error": "Team is not part of the tournament"}), 400
