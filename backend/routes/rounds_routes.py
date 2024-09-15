from flask import Blueprint, jsonify, request
from models import Round, Player, Game, JassResults

rounds_routes = Blueprint('rounds_routes', __name__)

@rounds_routes.route('/api/rounds', methods=['GET'])
def get_all_rounds():
    rounds = Round.query.all()
    rounds_list = [round.to_dict() for round in rounds]
    return jsonify(rounds_list)

@rounds_routes.route('/api/rounds/<int:round_id>', methods=['GET'])
def get_round(round_id):
    round = Round.query.get(round_id)
    if round:
        return jsonify(round.to_dict())
    else:
        return jsonify({"error": "Round not found"}), 404

@rounds_routes.route('/api/rounds', methods=['POST'])
def create_round():
    data = request.get_json()

    game_id = data.get('game_id')
    game = Game.query.get(game_id)
    if not game:
        return jsonify({"error": "Game not found"}), 404

    player_id = data.get('player_id')
    player = Player.query.get(player_id)
    if not player:
        return jsonify({"error": "Player not found"}), 404

    score = data.get('score')
    if score is None:
        return jsonify({"error": "Score is required"}), 400

    new_round = Round(game_id=game_id, player_id=player_id, score=score)
    db.session.add(new_round)
    db.session.commit()

    return jsonify(new_round.to_dict()), 201

@rounds_routes.route('/api/rounds/<int:round_id>', methods=['PUT'])
def update_round(round_id):
    data = request.get_json()
    round = Round.query.get(round_id)

    if round:
        if 'score' in data:
            round.score = data['score']

        db.session.commit()
        return jsonify(round.to_dict())
    else:
        return jsonify({"error": "Round not found"}), 404

@rounds_routes.route('/api/rounds/<int:round_id>', methods=['DELETE'])
def delete_round(round_id):
    round = Round.query.get(round_id)

    if round:
        db.session.delete(round)
        db.session.commit()
        return jsonify({"message": "Round deleted successfully"})
    else:
        return jsonify({"error": "Round not found"}), 404
