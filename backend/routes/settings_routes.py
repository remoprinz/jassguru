from flask import Blueprint, jsonify, request
from models import Player

settings_routes = Blueprint('settings_routes', __name__)

@settings_routes.route('/api/settings', methods=['GET'])
def get_user_settings():
    player_id = ...  # Hier die player_id aus der Authentifizierung erhalten
    player = Player.query.get(player_id)

    if player is not None:
        settings = player.settings  # Hier die Einstellungen des Spielers abrufen
        return jsonify(settings)
    else:
        return jsonify({"error": "Player not found"}), 404

@settings_routes.route('/api/settings', methods=['PUT'])
def update_user_settings():
    player_id = ...  # Hier die player_id aus der Authentifizierung erhalten
    player = Player.query.get(player_id)
    data = request.get_json()

    if player is not None:
        # Hier die Einstellungen des Spielers aktualisieren
        for key, value in data.items():
            setattr(player.settings, key, value)
        db.session.commit()

        return jsonify({"message": "Settings updated successfully", "settings": player.settings})
    else:
        return jsonify({"error": "Player not found"}), 404
