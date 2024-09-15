from flask import Blueprint, request, jsonify
from services.firebase_service import verify_firebase_token
from services import player_service, group_service
from utils.errors import AuthenticationError, ResourceNotFoundError
from schemas.player_schemas import PlayerSchema
from schemas.group_schemas import GroupSchema
from utils.utils import validate_input
import logging

players_routes = Blueprint('players_routes', __name__)
player_schema = PlayerSchema()
players_schema = PlayerSchema(many=True)
groups_schema = GroupSchema(many=True)

logger = logging.getLogger(__name__)

# Endpoint to create or get all players
@players_routes.route('/', methods=['GET', 'POST'])
def players_endpoint():
    if request.method == 'POST':
        try:
            data = request.get_json()
            validate_input(data, ['nickname'])
            
            auth_header = request.headers.get("Authorization")
            if auth_header and "Bearer " in auth_header:
                id_token = auth_header.split("Bearer ")[1]
                firebase_uid = verify_firebase_token(id_token)
                if firebase_uid:
                    data['firebase_uid'] = firebase_uid['uid']  # Annahme: verify_firebase_token gibt ein dict zurück
            
            player = player_service.create_player(data)
            logger.info(f"Neuer {'Gast' if player.is_guest else ''} Spieler erstellt: {player.nickname}")
            return jsonify(player_schema.dump(player)), 201
        except Exception as e:
            logger.error(f"Fehler beim Erstellen eines Spielers: {str(e)}")
            return jsonify({"error": str(e)}), 500

    elif request.method == 'GET':
        try:
            players = player_service.get_all_players()
            logger.info(f"Alle Spieler abgerufen. Anzahl: {len(players)}")
            return jsonify(players_schema.dump(players)), 200
        except Exception as e:
            logger.error(f"Fehler beim Abrufen aller Spieler: {str(e)}")
            return jsonify({"error": "Ein Fehler ist beim Abrufen der Spieler aufgetreten"}), 500

# Endpoint to handle individual player operations (GET, PUT, DELETE)
@players_routes.route('/<string:player_identifier>', methods=['GET', 'PUT', 'DELETE'])
def individual_player_endpoint(player_identifier):
    try:
        player = player_service.get_player(player_identifier)
        if not player:
            logger.warning(f"Spieler nicht gefunden: {player_identifier}")
            return jsonify({"error": "Spieler nicht gefunden"}), 404

        if request.method == 'GET':
            logger.info(f"Spieler abgerufen: {player_identifier}")
            return jsonify(player_schema.dump(player)), 200

        elif request.method == 'PUT':
            data = request.get_json()
            validate_input(data, ['nickname'])
            updated_player = player_service.update_player_nickname(player, data['nickname'])
            logger.info(f"Spieler aktualisiert: {player_identifier}")
            return jsonify(player_schema.dump(updated_player)), 200

        elif request.method == 'DELETE':
            player_service.delete_player(player)
            logger.info(f"Spieler gelöscht: {player_identifier}")
            return jsonify({"message": "Spieler erfolgreich gelöscht"}), 200

    except Exception as e:
        logger.error(f"Fehler bei Spieler-Operation für ID {player_identifier}: {str(e)}")
        return jsonify({"error": "Ein unerwarteter Fehler ist aufgetreten"}), 500

# Endpoint to get groups for a player
@players_routes.route('/<string:player_identifier>/groups', methods=['GET'])
def get_groups_for_player_endpoint(player_identifier):
    try:
        logger.info(f"Gruppen für Spieler abrufen: {player_identifier}")
        groups = player_service.get_groups_for_player(player_identifier)
        return jsonify(groups_schema.dump(groups)), 200
    except ResourceNotFoundError as e:
        logger.warning(f"Spieler nicht gefunden: {player_identifier}")
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        logger.error(f"Fehler beim Abrufen der Gruppen für Spieler {player_identifier}: {str(e)}")
        return jsonify({"error": "Ein unerwarteter Fehler ist aufgetreten"}), 500

# Endpoint to get all players from the database
@players_routes.route('/', methods=['GET'])
def get_all_players():
    try:
        players = player_service.get_all_players()
        return jsonify(players_schema.dump(players)), 200
    except Exception as e:
        logger.error(f"Fehler beim Abrufen aller Spieler: {str(e)}")
        return jsonify({"error": "Ein Fehler ist beim Abrufen der Spieler aufgetreten"}), 500

# Endpoint to search for players
@players_routes.route('/search', methods=['GET'])
def search_players():
    try:
        search_term = request.args.get('term')
        if not search_term:
            return jsonify({"error": "Search term is required"}), 400
        
        players = player_service.search_players(search_term)
        return jsonify(players_schema.dump(players)), 200
    except Exception as e:
        logger.error(f"Error searching players: {str(e)}")
        return jsonify({"error": "An error occurred while searching for players"}), 500

# Endpoint to convert guest player to registered player
@players_routes.route('/<string:player_id>/convert', methods=['POST'])
def convert_guest_player(player_id):
    try:
        auth_header = request.headers.get("Authorization")
        if not auth_header or "Bearer " not in auth_header:
            raise AuthenticationError("Ungültiger Authorization Header")
        id_token = auth_header.split("Bearer ")[1]

        firebase_uid = verify_firebase_token(id_token)
        if not firebase_uid:
            raise AuthenticationError("Ungültiger Token oder nicht authentifiziert")

        player = player_service.convert_guest_to_registered(player_id, firebase_uid['uid'])
        logger.info(f"Spieler {player_id} erfolgreich konvertiert")
        return jsonify(player_schema.dump(player)), 200
    except AuthenticationError as e:
        logger.error(f"Authentifizierungsfehler bei Konvertierung: {str(e)}")
        return jsonify({"error": str(e)}), 401
    except ValueError as e:
        logger.error(f"Fehler bei Konvertierung: {str(e)}")
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        logger.error(f"Unerwarteter Fehler bei Konvertierung von Spieler {player_id}: {str(e)}")
        return jsonify({"error": "Ein unerwarteter Fehler ist aufgetreten"}), 500
