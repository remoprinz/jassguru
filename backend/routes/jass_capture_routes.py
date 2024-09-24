# backend/routes/jass_capture_routes.py

import random
import string
from flask import jsonify, request, Blueprint
from models.jass_capture import JassCapture
from models.player import Player
from extensions import db
from services.firebase_service import verify_firebase_token
from utils.errorHandlers import handle_api_error
from utils.utils import validate_input, ValidationException
from schemas.jass_capture_schemas import JassCaptureSchema
import logging
from werkzeug.exceptions import BadRequest, InternalServerError
from datetime import datetime

jass_capture_routes = Blueprint('jass_capture', __name__)
logger = logging.getLogger(__name__)

def generiere_einzigartigen_jass_code(laenge=6):
    while True:
        code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=laenge))
        if not JassCapture.query.filter_by(jass_code=code).first():
            return code

@jass_capture_routes.route('/initialize', methods=['POST'])
def initialize_jass():
    try:
        data = request.json
        logger.info(f"Empfangene Daten für Jass-Initialisierung: {data}")

        # Token-Verifizierung
        token = request.headers.get('Authorization').split('Bearer ')[1]
        firebase_user = verify_firebase_token(token)

        if not firebase_user['success']:
            return jsonify({'error': 'Nicht autorisiert'}), 401

        # Datenvalidierung mit dem Schema
        schema = JassCaptureSchema()
        errors = schema.validate(data)
        if errors:
            logger.error(f"Validierungsfehler: {errors}")
            return jsonify({"errors": errors}), 400

        logger.info("Validierung erfolgreich, erstelle neuen Jass")

        # Parsen des Datums
        start_date = datetime.strptime(data['start_date'], '%Y-%m-%d').date()

        neuer_jass = JassCapture(
            jass_group_id=data['group_id'],
            mode=data['mode'],
            latitude=data.get('latitude'),
            longitude=data.get('longitude'),
            location_name=data.get('location_name'),
            rosen10_player_id=data['rosen10_player_id'],
            start_date=start_date,
            jass_code=generiere_einzigartigen_jass_code()
        )

        db.session.add(neuer_jass)
        db.session.flush()  # Flush, um die ID zu generieren

        for player_data in data['players']:
            spieler = Player.query.get(player_data['id'])
            if spieler:
                neuer_jass.players.append(spieler)
            else:
                logger.warning(f"Spieler mit ID {player_data['id']} nicht gefunden")

        db.session.commit()
        logger.info(f"Neuer Jass erstellt mit ID: {neuer_jass.id}")

        return jsonify({
            'message': 'Jass erfolgreich initialisiert',
            'jass_id': neuer_jass.id,
            'jass_code': neuer_jass.jass_code
        }), 201

    except ValidationException as ve:
        logger.error(f"Validierungsfehler: {str(ve)}")
        return jsonify({"error": str(ve)}), 400
    except Exception as e:
        logger.error(f"Unerwarteter Fehler: {str(e)}", exc_info=True)
        return jsonify({"error": "Ein unerwarteter Fehler ist aufgetreten", "details": str(e)}), 500

