from flask import Blueprint, request, jsonify
from extensions import db
from models import Player, PlayerProfile
from services import email_service
from utils import validate_input, ValidationException

players_routes = Blueprint('players_routes', __name__)

@players_routes.route('/players', methods=['GET'])
def get_players():
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    players = Player.query.paginate(page, per_page, error_out=False).items
    return jsonify({"players": [player.serialize() for player in players]}), 200

@players_routes.route('/players', methods=['POST'])
def create_player():
    print("create_player Funktion wurde aufgerufen")
    data = request.get_json()

    try:
        validate_input(data, ['nickname'])
    except ValidationException as ve:
        return jsonify({"message": str(ve)}), 400

    existing_player = Player.query.filter_by(nickname=data['nickname']).first()
    if existing_player:
        return jsonify({"message": "Jassname ist schon vergeben"}), 400

    player = Player(nickname=data['nickname'])
    db.session.add(player)
    db.session.commit()

    return jsonify({"player": player.serialize()}), 201

@players_routes.route('/players/<int:player_id>', methods=['GET'])
def get_player(player_id):
    player = Player.query.get(player_id)

    if not player:
        return jsonify({"message": "Jasser wurde nicht gefunden"}), 404

    return jsonify({"player": player.serialize()}), 200

@players_routes.route('/players/<int:player_id>', methods=['PUT'])
def update_player(player_id):
    player = Player.query.get(player_id)
    data = request.get_json()

    if not player:
        return jsonify({"message": "Jasser wurde nicht gefunden"}), 404

    if 'nickname' in data and data['nickname'] != '':
        player.nickname = data['nickname']

    db.session.commit()

    return jsonify({"player": player.serialize()}), 200

@players_routes.route('/players/<int:player_id>', methods=['DELETE'])
def delete_player(player_id):
    player = Player.query.get(player_id)

    if not player:
        return jsonify({"message": "Jasser wurde nicht gefunden"}), 404

    db.session.delete(player)
    db.session.commit()

    return jsonify({"message": "Player deleted"}), 200

@players_routes.route('/players/invite', methods=['POST'])
def invite_player():
    data = request.get_json()

    try:
        validate_input(data, ['email', 'invitee_id'])
    except ValidationException as ve:
        return jsonify({"message": str(ve)}), 400

    existing_profile = PlayerProfile.query.filter_by(email=data['email']).first()
    if existing_profile:
        return jsonify({"message": "Email ist schon registriert"}), 400

    player = Player.query.get(data['invitee_id'])

    if not player:
        return jsonify({"message": "Jasser wurde nicht gefunden"}), 404

    try:
        email_service.send_invite(data['email'], player.nickname)
    except Exception as e:
        return jsonify({"message": "Fehler beim Senden der Einladung"}), 500

    return jsonify({"message": "Einladung erfolgreich gesendet"}), 200
