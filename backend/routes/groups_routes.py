import logging
from flask import Blueprint, request, jsonify, current_app
from marshmallow import ValidationError
from firebase_admin import auth

from services.group_service import (
    create_group, get_all_groups, get_group_by_id, 
    update_group_admins_by_id, add_player_to_group, delete_group_by_id,
    update_group, get_user_groups
)
from services import player_service
from schemas.group_schemas import GroupSchema, GroupUpdateSchema
from schemas.player_schemas import PlayerSchema
from utils.errors import GroupError, AuthenticationError, ResourceNotFoundError
from utils.errorHandlers import handle_api_error

groups_routes = Blueprint('groups_routes', __name__)

group_schema = GroupSchema()
group_update_schema = GroupUpdateSchema()
players_schema = PlayerSchema(many=True)

logger = logging.getLogger(__name__)

def verify_firebase_token():
    if not current_app.config.get('FIREBASE_INITIALIZED', False):
        logger.error("Firebase is not initialized")
        raise AuthenticationError("Firebase is not initialized")

    auth_header = request.headers.get('Authorization')
    if not auth_header:
        logger.warning("No Authorization header present")
        raise AuthenticationError("No Authorization header")

    id_token = auth_header.split('Bearer ')[1]
    try:
        decoded_token = auth.verify_id_token(id_token)
        return decoded_token['uid']
    except Exception as e:
        logger.error(f"Error verifying Firebase token: {str(e)}")
        raise AuthenticationError("Invalid token")

def get_groups():
    try:
        verify_firebase_token()
        groups = get_all_groups()
        return jsonify(group_schema.dump(groups, many=True)), 200
    except Exception as e:
        logger.error(f"Fehler beim Abrufen der Gruppen: {str(e)}")
        return handle_api_error(e)

@groups_routes.route('/', methods=['GET', 'POST'])
def groups():
    if request.method == 'GET':
        return get_groups()
    elif request.method == 'POST':
        return create_new_group()

def create_new_group():
    try:
        logger.info("Attempting to create new group")
        admin_id = verify_firebase_token()
        logger.info(f"Admin ID verified: {admin_id}")
        data = request.get_json()
        logger.info(f"Received data: {data}")
        validated_data = group_schema.load(data)
        logger.info(f"Validated data: {validated_data}")
        new_group = create_group(validated_data['name'], admin_id)
        logger.info(f"New group created: {new_group}")
        return jsonify(group_schema.dump(new_group)), 201
    except ValidationError as ve:
        logger.error(f"Validation error: {ve}")
        return handle_api_error(ve)
    except Exception as e:
        logger.error(f"Error in /groups POST: {str(e)}")
        return handle_api_error(e)

@groups_routes.route('/<int:group_id>/players', methods=['POST'])
def add_player(group_id):
    try:
        verify_firebase_token()
        data = request.get_json()
        player_id = data.get('playerId')
        if not player_id:
            raise ValueError("Player ID is missing in the request body.")

        group, added = add_player_to_group(player_id, group_id)
        if added:
            return jsonify(group_schema.dump(group)), 201  # Status code set to 201
        else:
            return jsonify({"error": "Player already in group"}), 409  # Status code set to 409
    except ValueError as ve:
        logger.error(f"Validation error: {ve}")
        return jsonify({"error": str(ve)}), 400
    except ResourceNotFoundError as nfe:
        logger.error(f"Resource not found: {nfe}")
        return jsonify({"error": str(nfe)}), 404
    except GroupError as ge:
        logger.error(f"Group error: {ge}")
        return jsonify({"error": str(ge)}), 400
    except Exception as e:
        logger.error(f"Error while adding player to group: {str(e)}")
        return jsonify({"error": "An unexpected error occurred"}), 500

@groups_routes.route('/<int:group_id>', methods=['GET'])
def get_single_group(group_id):
    try:
        verify_firebase_token()
        group = get_group_by_id(group_id)
        return jsonify(group_schema.dump(group)), 200
    except GroupError as ge:
        logger.error(f"Group error: {ge}")
        return handle_api_error(ge)
    except Exception as e:
        logger.error(f"Error in /groups/{group_id} GET: {str(e)}")
        return handle_api_error(e)

@groups_routes.route('/<int:group_id>/admins', methods=['PUT'])
def update_group_admins(group_id):
    try:
        verify_firebase_token()
        data = request.get_json()
        admin_ids = data.get('admin_ids')
        if admin_ids is None:
            raise ValueError("Missing 'admin_ids' in request body.")
            
        updated_group = update_group_admins_by_id(group_id, admin_ids)
        return jsonify(group_schema.dump(updated_group)), 200
    except ValidationError as ve:
        logger.error(f"Validation error: {ve}")
        return handle_api_error(ve)
    except Exception as e:
        logger.error(f"Error in /groups/{group_id}/admins PUT: {str(e)}")
        return handle_api_error(e)

@groups_routes.route('/<int:group_id>', methods=['PUT'])
def update_single_group(group_id):
    try:
        verify_firebase_token()
        data = request.get_json()
        validated_data = group_update_schema.load(data)
        updated_group = update_group(group_id, **validated_data)
        return jsonify(group_schema.dump(updated_group)), 200
    except ValidationError as ve:
        logger.error(f"Validation error: {ve}")
        return handle_api_error(ve)
    except GroupError as ge:
        logger.error(f"Group error: {ge}")
        return handle_api_error(ge)
    except Exception as e:
        logger.error(f"Error in /groups/{group_id} PUT: {str(e)}")
        return handle_api_error(e)

@groups_routes.route('/<int:group_id>', methods=['DELETE'])
def delete_single_group(group_id):
    try:
        verify_firebase_token()
        delete_group_by_id(group_id)
        return jsonify({"status": "success"}), 200
    except GroupError as ge:
        logger.error(f"Group error: {ge}")
        return handle_api_error(ge)
    except Exception as e:
        logger.error(f"Error in /groups/{group_id} DELETE: {str(e)}")
        return handle_api_error(e)

@groups_routes.route('/user_groups', methods=['GET'])
def get_user_groups_route():
    try:
        firebase_uid = verify_firebase_token()
        logger.info(f"Gruppen für Benutzer mit firebase_uid werden abgerufen: {firebase_uid}")
        groups = get_user_groups(firebase_uid)
        logger.info(f"{len(groups)} Gruppen für Benutzer gefunden")
        logger.info(f"Gruppen: {groups}")
        return jsonify(groups), 200
    except Exception as e:
        logger.error(f"Fehler in /groups/user_groups GET: {str(e)}", exc_info=True)
        return jsonify({"error": "Benutzergruppen konnten nicht abgerufen werden", "details": str(e)}), 500

@groups_routes.route('/<int:group_id>/players', methods=['GET'])
def get_players_for_group(group_id):
    try:
        verify_firebase_token()
        logger.info(f"Spieler für Gruppe mit ID {group_id} werden abgerufen")
        players = player_service.get_players_for_group(group_id)
        logger.debug(f"Abgerufene Spieler: {players}")
        if not players:
            logger.info(f"Keine Spieler für Gruppe {group_id} gefunden")
            return jsonify({"message": "Keine Spieler für diese Gruppe gefunden"}), 404
        logger.info(f"{len(players)} Spieler für Gruppe {group_id} erfolgreich abgerufen")
        serialized_players = players_schema.dump(players)
        logger.debug(f"Serialisierte Spieler: {serialized_players}")
        return jsonify(serialized_players), 200
    except AuthenticationError as e:
        logger.warning(f"Authentifizierungsfehler beim Abrufen der Spieler für Gruppe {group_id}: {str(e)}")
        return jsonify({"error": "Authentifizierung fehlgeschlagen"}), 401
    except ResourceNotFoundError as e:
        logger.warning(f"Gruppe {group_id} nicht gefunden beim Versuch, Spieler abzurufen: {str(e)}")
        return jsonify({"error": str(e)}), 404
    except GroupError as e:
        logger.error(f"Gruppenfehler beim Abrufen der Spieler für Gruppe {group_id}: {str(e)}")
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        logger.error(f"Unerwarteter Fehler beim Abrufen der Spieler für Gruppe {group_id}: {str(e)}", exc_info=True)
        return jsonify({"error": "Ein unerwarteter Fehler ist aufgetreten", "details": str(e)}), 500
