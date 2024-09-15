# groups_routes.py

import logging
from flask import Blueprint, request, jsonify, current_app
from marshmallow import ValidationError
from firebase_admin import auth

from services.group_service import (
    create_group, get_all_groups, get_group_by_id, 
    update_group_admins_by_id, add_player_to_group, delete_group_by_id,
    update_group_by_id
)
from schemas.group_schemas import GroupSchema, GroupUpdateSchema
from utils.errors import GroupError, AuthenticationError
from utils.errorHandlers import handle_api_error

groups_routes = Blueprint('groups_routes', __name__)

group_schema = GroupSchema()
group_update_schema = GroupUpdateSchema()

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

@groups_routes.route('/', methods=['GET'])
def get_groups():
    try:
        verify_firebase_token()
        groups = get_all_groups()
        return jsonify([group_schema.dump(group) for group in groups]), 200
    except Exception as e:
        logger.error(f"Error in /groups GET: {str(e)}")
        return handle_api_error(e)

@groups_routes.route('/', methods=['POST'])
def create_new_group():
    try:
        admin_id = verify_firebase_token()
        data = request.get_json()
        validated_data = group_schema.load(data)
        new_group = create_group(validated_data['name'], admin_id)
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
        player_id = data.get('player_id')
        if not player_id:
            raise ValueError("Player ID is missing in the request body.")

        group = add_player_to_group(player_id, group_id)
        return jsonify(group_schema.dump(group)), 200
    except ValidationError as ve:
        logger.error(f"Validation error: {ve}")
        return handle_api_error(ve)
    except GroupError as ge:
        logger.error(f"Group error: {ge}")
        return handle_api_error(ge)
    except Exception as e:
        logger.error(f"Error while adding player to group: {str(e)}")
        return handle_api_error(e)

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
        updated_group = update_group_by_id(group_id, **validated_data)
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