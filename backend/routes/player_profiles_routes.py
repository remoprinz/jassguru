# routes/player_profiles_routes.py

from flask import Blueprint, request, jsonify
from services.firebase_service import verify_firebase_token
from services.playerprofile_service import (
    get_all_profiles,
    get_profile_by_player_id,
    create_profile_for_player,
    delete_profile_for_player
)
from schemas.player_schemas import PlayerProfileSchema
from utils.errors import AuthenticationError, ResourceNotFoundError

player_profiles_routes = Blueprint('player_profiles_routes', __name__)
profile_schema = PlayerProfileSchema()

@player_profiles_routes.route('/', methods=['GET'])
def get_all_profiles_route():
    profiles = get_all_profiles()
    return jsonify(profile_schema.dump(profiles, many=True)), 200

@player_profiles_routes.route('/<int:player_id>', methods=['GET'])
def get_player_profile_route(player_id):
    profile = get_profile_by_player_id(player_id)
    if not profile:
        raise ResourceNotFoundError("Player has no profile")
    return jsonify(profile_schema.dump(profile)), 200

@player_profiles_routes.route('/<int:player_id>', methods=['POST'])
def create_player_profile_route(player_id):
    auth_header = request.headers.get("Authorization")
    if not auth_header or "Bearer " not in auth_header:
        raise AuthenticationError("Ungültiger Authorization Header")

    id_token = auth_header.split("Bearer ")[1]
    verify_result = verify_firebase_token(id_token)
    if not verify_result['success']:
        raise AuthenticationError(verify_result['message'])

    data = request.get_json()
    data['firebase_uid'] = verify_result['uid']

    try:
        new_profile = create_profile_for_player(player_id, data)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    return jsonify(profile_schema.dump(new_profile)), 201

@player_profiles_routes.route('/<int:player_id>', methods=['DELETE'])
def delete_player_profile_route(player_id):
    delete_profile_for_player(player_id)
    return jsonify({"message": "Profil erfolgreich gelöscht"}), 200