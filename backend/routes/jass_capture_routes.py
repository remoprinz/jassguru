# backend/routes/jass_capture_routes.py

from flask import Blueprint, request, jsonify
from extensions import db
from models import Jass, Spiel, Runde, Player
from sqlalchemy import and_
from utils.errorHandlers import handle_api_error
from utils.utils import validate_input, ValidationException
from utils.validators import validate_jass_data, validate_round_data
from services.jass_capture_services import calculate_jass_stats
import logging
from datetime import datetime
from services.firebase_service import get_rounds  # Importieren Sie diese Funktion

jass_capture_routes = Blueprint('jass_capture_routes', __name__)

logger = logging.getLogger(__name__)

def get_multiplier_for_farbe(jass_id, farbe):
    # TODO: Implementieren Sie dies später mit den tatsächlichen Gruppeneinstellungen
    default_multipliers = {
        'Schälle': 2, 'Schilte': 3, 'Rose': 4, 'Eichle': 7,
        'Obenabe': 5, 'Undenufe': 6, 'Quär': 7, 'Slalom': 7,
        'Guschti': 4, 'Misère': 1, 'Misère-Misère': 1
    }
    return default_multipliers.get(farbe, 1)

@jass_capture_routes.route('/initialize', methods=['POST'])
def initialize_jass():
    try:
        data = request.json
        logger.info(f"Received data for jass initialization: {data}")
        validate_input(data, ['mode', 'group_id', 'date', 'players'])
        
        start_time = datetime.fromisoformat(data['date'].replace('Z', '+00:00'))
        
        new_jass = Jass(
            mode=data['mode'],
            jass_group_id=data['group_id'],
            start_time=start_time,
            status='ACTIVE'  # Ändern Sie 'active' zu 'ACTIVE'
        )
        db.session.add(new_jass)
        db.session.flush()

        for player_data in data['players']:
            player = Player.query.get(player_data['id'])
            if not player:
                raise ValidationException(f'Spieler mit ID {player_data["id"]} nicht gefunden')
            new_jass.players.append(player)

        db.session.commit()
        logger.info(f"Jass initialized successfully: {new_jass.id}")
        logger.info(f"Neuer Jass erstellt: {new_jass.__dict__}")
        return jsonify({'message': 'Jass erfolgreich initialisiert', 'jass_id': new_jass.id}), 201
    except ValidationException as ve:
        logger.error(f"Validation error: {str(ve)}")
        return handle_api_error(ve, 400)
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}", exc_info=True)
        db.session.rollback()
        return handle_api_error(e, 500)

@jass_capture_routes.route('/<string:jass_code>/check', methods=['GET'])
def check_jass_initialized(jass_code):
    jass = Jass.query.filter_by(jass_code=jass_code).first()
    if jass:
        return jsonify({'isInitialized': True, 'jass': jass.serialize()}), 200
    return jsonify({'isInitialized': False}), 404

@jass_capture_routes.route('/<int:jass_id>/update_score', methods=['POST'])
def update_score(jass_id):
    try:
        data = request.json
        validate_input(data, ['team_id', 'spiel_id', 'score'])
        
        team_id = data['team_id']
        spiel_id = data['spiel_id']
        score = data['score']
        
        spiel = Spiel.query.filter(and_(
            Spiel.jass_id == jass_id,
            Spiel.id == spiel_id
        )).first()

        if spiel:
            if team_id == 1:
                spiel.team1_score = score
            elif team_id == 2:
                spiel.team2_score = score
            else:
                raise ValidationException('Ungültige Team-ID')
        else:
            new_spiel = Spiel(
                jass_id=jass_id,
                team1_score=score if team_id == 1 else 0,
                team2_score=score if team_id == 2 else 0
            )
            db.session.add(new_spiel)

        db.session.commit()
        logger.info(f'Punktzahl aktualisiert: Jass {jass_id}, Team {team_id}, Spiel {spiel_id}')
        return jsonify({'message': 'Punktzahl erfolgreich aktualisiert'}), 200
    except ValidationException as ve:
        logger.error(f'Validierungsfehler beim Aktualisieren der Punktzahl: {str(ve)}')
        db.session.rollback()
        return handle_api_error(ve, 400)
    except Exception as e:
        logger.error(f'Fehler beim Aktualisieren der Punktzahl: {str(e)}')
        db.session.rollback()
        return handle_api_error(e, 500)

@jass_capture_routes.route('/<int:jass_id>/finish', methods=['PUT'])
def finish_jass(jass_id):
    try:
        jass = Jass.query.get(jass_id)
        if not jass:
            raise ValidationException('Jass nicht gefunden')

        rounds_data = get_rounds(jass_id)

        if len(rounds_data) < 4:
            return jsonify({'message': 'Es müssen mindestens vier Runden gespielt werden, um den Jass zu erfassen.'}), 400

        # Hier können Sie die Logik zum Speichern der Runden implementieren
        for round_data in rounds_data:
            # Beispiel: Runde in der Datenbank speichern
            new_round = Runde(
                jass_id=jass_id,
                runde=round_data['runde'],
                team1_score=round_data['team1_score'],
                team2_score=round_data['team2_score']
            )
            db.session.add(new_round)

        jass.status = 'finished'
        db.session.commit()
        logger.info(f'Jass beendet und in Datenbank gespeichert: {jass_id}')
        return jsonify({'message': 'Jass erfolgreich beendet und gespeichert'}), 200

    except Exception as e:
        logger.error(f'Fehler beim Beenden des Jass: {str(e)}')
        db.session.rollback()
        return handle_api_error(e, 500)

@jass_capture_routes.route('/<int:jass_id>/add_round', methods=['POST'])
def add_round(jass_id):
    try:
        data = request.json
        validate_input(data, ['spiel_id', 'team1_score', 'team2_score', 'farbe'])
        
        # Hier würden wir die Daten in Firebase speichern
        # firebase_service.save_round(jass_id, data)
        
        logger.info(f'Neue Runde temporär gespeichert: Jass {jass_id}')
        return jsonify({'message': 'Runde erfolgreich temporär gespeichert'}), 201
    except ValidationException as ve:
        logger.error(f'Validierungsfehler beim Hinzufügen der Runde: {str(ve)}')
        return handle_api_error(ve, 400)
    except Exception as e:
        logger.error(f'Fehler beim Hinzufügen der Runde: {str(e)}')
        return handle_api_error(e, 500)

@jass_capture_routes.route('/<int:jass_id>/stats', methods=['GET'])
def get_jass_stats(jass_id):
    try:
        jass = Jass.query.get(jass_id)
        if not jass:
            raise ValidationException('Jass nicht gefunden')

        stats = calculate_jass_stats(jass)
        logger.info(f'Statistiken abgerufen für Jass: {jass_id}')
        return jsonify(stats), 200
    except ValidationException as ve:
        logger.error(f'Validierungsfehler beim Abrufen der Jass-Statistiken: {str(ve)}')
        return handle_api_error(ve, 404)
    except ValueError as ve:
        logger.error(f'Wertfehler beim Berechnen der Jass-Statistiken: {str(ve)}')
        return handle_api_error(ve, 400)
    except Exception as e:
        logger.error(f'Fehler beim Abrufen der Jass-Statistiken: {str(e)}')
        return handle_api_error(e, 500)

