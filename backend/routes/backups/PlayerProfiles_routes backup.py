from flask import Blueprint, request, jsonify
from extensions import db
from models import Player, PlayerProfile
from flask_login import login_required, current_user
from utils import validate_input, ValidationException
from sqlalchemy.orm import joinedload

player_profiles = Blueprint('player_profiles', __name__)

@player_profiles.route('/players/<int:player_id>/profile', methods=['GET'])
def get_player_profile(player_id):
    player = Player.query.options(joinedload('profile')).get_or_404(player_id)
    if player.profile:
        return jsonify(player.profile.serialize())
    else:
        return jsonify({"error": "Profile not found"}), 404

@player_profiles.route('/players/<int:player_id>/profile', methods=['POST'])
@login_required
def create_player_profile(player_id):
    if current_user.id != player_id:
        return jsonify({"error": "Unauthorized"}), 403

    player = Player.query.get(player_id)

    if not player:
        return jsonify({"error": "Player not found"}), 404

    if player.profile:
        return jsonify({"error": "Player already has a profile"}), 400

    data = request.get_json()

    try:
        validate_input(data, ['email'])
    except ValidationException as ve:
        return jsonify({"message": str(ve)}), 400

    new_profile = PlayerProfile(
        player_id=player_id,
        **data
    )

    db.session.add(new_profile)
    db.session.commit()
    return jsonify(new_profile.serialize()), 201

@player_profiles.route('/players/<int:player_id>/profile', methods=['PUT'])
@login_required
def update_player_profile(player_id):
    if current_user.id != player_id:
        return jsonify({"error": "Unauthorized"}), 403

    player = Player.query.get(player_id)

    if not player:
        return jsonify({"error": "Player not found"}), 404

    player_profile = player.profile
    if not player_profile:
        return jsonify({"error": "Profile not found"}), 404

    data = request.get_json()

    for key in data.keys():
        if key not in PlayerProfile.__table__.columns:
            return jsonify({"error": f"Invalid field {key}"}), 400

    for key, value in data.items():
        setattr(player_profile, key, value)

    db.session.commit()
    return jsonify({"status": "success"})

@player_profiles.route('/players/<int:player_id>/profile', methods=['DELETE'])
@login_required
def delete_player_profile(player_id):
    if current_user.id != player_id:
        return jsonify({"error": "Unauthorized"}), 403

    player = Player.query.get(player_id)

    if not player:
        return jsonify({"error": "Player not found"}), 404

    player_profile = player.profile
    if not player_profile:
        return jsonify({"error": "Profile not found"}), 404

    db.session.delete(player_profile)
    db.session.commit()
    return jsonify({"status": "success"})
