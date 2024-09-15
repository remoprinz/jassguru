from flask import Blueprint, request, jsonify, current_app
from functools import wraps
from firebase_admin import auth as firebase_auth
from models.player import Player
from models.player_profile import PlayerProfile
from extensions import db
from services.token_service import generate_confirmation_token, confirm_token, decode_confirmation_token
from services.email_service import send_confirmation_email, send_jassname_confirmation_email, send_password_reset_email
from schemas.auth_schemas import EmailRegistrationSchema, JassnameRegistrationSchema, LoginSchema
from services.register_service import initiate_add_player, finalize_added_player_registration
from sqlalchemy.exc import SQLAlchemyError
import logging

auth_routes = Blueprint('auth_routes', __name__)
logger = logging.getLogger(__name__)

def firebase_token_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        id_token = request.headers.get('Authorization')
        if not id_token:
            return jsonify({'message': 'No token provided'}), 401
        try:
            # Remove 'Bearer ' from the token
            id_token = id_token.split('Bearer ')[1]
            # Verify the token
            decoded_token = firebase_auth.verify_id_token(id_token)
            return f(decoded_token, *args, **kwargs)
        except Exception as e:
            logger.error(f"Token verification failed: {str(e)}")
            return jsonify({'message': 'Invalid token', 'error': str(e)}), 401
    return decorated_function

@auth_routes.route('/register-email', methods=['POST'])
def register_email():
    try:
        schema = EmailRegistrationSchema()
        data = schema.load(request.get_json())
        email = data['email']
        password = data['password']

        existing_user = PlayerProfile.query.filter_by(email=email).first()
        if existing_user:
            return jsonify({'code': 'EMAIL_EXISTS', 'message': 'Diese E-Mail-Adresse ist bereits registriert.'}), 400

        firebase_user = firebase_auth.create_user(email=email, password=password)

        new_profile = PlayerProfile(email=email, firebase_uid=firebase_user.uid, email_confirmed=False)
        db.session.add(new_profile)
        
        temp_nickname = f"Player_{firebase_user.uid[:8]}"
        new_player = Player(firebase_uid=firebase_user.uid, nickname=temp_nickname)
        db.session.add(new_player)
        
        db.session.commit()

        token = generate_confirmation_token(email)

        send_confirmation_email(email, token)

        return jsonify({
            'code': 'EMAIL_REGISTRATION_SUCCESS',
            'message': 'Registrierung erfolgreich. Bitte überprüfen Sie Ihre E-Mail, um Ihr Konto zu bestätigen.'
        }), 201

    except Exception as e:
        db.session.rollback()
        logger.error(f"Registrierungsfehler: {str(e)}")
        return jsonify({'code': 'REGISTRATION_FAILED', 'message': 'Registrierung fehlgeschlagen'}), 400

@auth_routes.route('/confirm/<token>', methods=['GET'])
def confirm_email(token):
    try:
        email = confirm_token(token)
        if not email:
            return jsonify({'error': 'Invalid or expired token'}), 400

        profile = PlayerProfile.query.filter_by(email=email).first()
        if profile:
            profile.email_confirmed = True
            db.session.commit()
            return jsonify({'message': 'Email confirmed. Please set your Jassname.'}), 200
        else:
            return jsonify({'error': 'User not found'}), 404

    except Exception as e:
        logger.error(f"Confirmation error: {str(e)}")
        return jsonify({'error': 'Confirmation failed'}), 400

@auth_routes.route('/register-jassname', methods=['POST'])
def register_jassname():
    try:
        schema = JassnameRegistrationSchema()
        data = schema.load(request.get_json())
        jassname = data.get('jassname')
        token = data.get('token')

        email = confirm_token(token)
        if not email:
            logger.warning("Ungültiger oder abgelaufener Token")
            return jsonify({'code': 'INVALID_TOKEN', 'message': 'Ungültiger oder abgelaufener Token'}), 400

        existing_player = Player.query.filter_by(nickname=jassname).first()
        if existing_player:
            logger.warning(f"Jassname {jassname} ist bereits vergeben")
            return jsonify({'code': 'JASSNAME_EXISTS', 'message': 'Dieser Jassname ist bereits vergeben.'}), 400

        profile = PlayerProfile.query.filter_by(email=email).first()
        if not profile:
            logger.warning(f"Kein Profil gefunden für E-Mail: {email}")
            return jsonify({'code': 'USER_NOT_FOUND', 'message': 'Benutzer nicht gefunden.'}), 404

        existing_player = Player.query.filter_by(firebase_uid=profile.firebase_uid).first()
        
        if existing_player:
            existing_player.nickname = jassname
            profile.profile_id = existing_player.id
        else:
            new_player = Player(firebase_uid=profile.firebase_uid, nickname=jassname)
            db.session.add(new_player)
            db.session.flush()
            profile.profile_id = new_player.id
            profile.player = new_player

        profile.email_confirmed = True
        
        try:
            db.session.commit()
        except SQLAlchemyError as e:
            logger.error(f"Datenbankfehler beim Speichern des Spielers: {str(e)}")
            db.session.rollback()
            return jsonify({'code': 'DATABASE_ERROR', 'message': 'Fehler beim Speichern der Daten.'}), 500

        try:
            firebase_auth.update_user(profile.firebase_uid, display_name=jassname)
        except Exception as e:
            logger.error(f"Fehler beim Aktualisieren des Firebase-Benutzernamens: {str(e)}")

        try:
            send_jassname_confirmation_email(email, jassname)
        except Exception as e:
            logger.error(f"Fehler beim Senden der Bestätigungs-E-Mail: {str(e)}")

        logger.info(f"Jassname {jassname} erfolgreich für E-Mail {email} registriert")
        return jsonify({
            'code': 'JASSNAME_REGISTRATION_SUCCESS',
            'message': 'Jassname erfolgreich registriert. Sie können sich nun anmelden.'
        }), 200

    except Exception as e:
        logger.error(f"Unerwarteter Fehler bei der Jassname-Registrierung: {str(e)}")
        return jsonify({'code': 'JASSNAME_REGISTRATION_FAILED', 'message': 'Jassname-Registrierung fehlgeschlagen'}), 400

@auth_routes.route('/login', methods=['POST'])
def login():
    try:
        schema = LoginSchema()
        data = schema.load(request.get_json())
        
        id_token = request.headers.get('Authorization').split('Bearer ')[1]
        decoded_token = firebase_auth.verify_id_token(id_token)
        uid = decoded_token['uid']
        
        player = Player.query.filter_by(firebase_uid=uid).first()
        if not player:
            return jsonify({'error': 'User not found'}), 404
        
        return jsonify({
            'message': 'Login successful',
            'uid': uid,
            'jassname': player.nickname
        }), 200
    except ValidationError as ve:
        return jsonify({'error': str(ve)}), 400
    except Exception as e:
        logger.error(f"Error in login: {str(e)}")
        return jsonify({'code': 'SERVER_ERROR', 'message': 'Ein Serverfehler ist aufgetreten.'}), 500

@auth_routes.route('/reset-password', methods=['POST'])
def reset_password():
    try:
        email = request.json.get('email')
        if not email:
            return jsonify({'error': 'Email is required'}), 400
        
        result = send_password_reset_email(email)
        if result['success']:
            return jsonify({'message': result['message']}), 200
        else:
            return jsonify({'error': result['message']}), 400
    except Exception as e:
        logger.error(f"Error in password reset: {str(e)}")
        return jsonify({'code': 'SERVER_ERROR', 'message': 'Ein Serverfehler ist aufgetreten.'}), 500

@auth_routes.route('/add-player', methods=['POST'])
@firebase_token_required  # Stellt sicher, dass der Firebase-Token validiert wird
def add_player(decoded_token):
    try:
        current_user = decoded_token['uid']
        inviter = Player.query.filter_by(firebase_uid=current_user).first()

        if not inviter:
            logger.warning(f"Inviting player not found for user: {current_user}")
            return jsonify({'code': 'INVITER_NOT_FOUND', 'message': 'Inviting player not found'}), 404

        inviter_id = inviter.id  # Verwenden Sie die ID des eingeloggten Benutzers

        data = request.get_json()
        nickname = data.get('nickname')
        email = data.get('email')
        
        # Validierung der Eingaben
        if not nickname:
            return jsonify({'code': 'MISSING_FIELDS', 'message': 'Nickname is required'}), 400

        if len(nickname) < 2 or len(nickname) > 25:
            return jsonify({'code': 'INVALID_NICKNAME', 'message': 'Nickname must be between 2 and 25 characters'}), 400

        # Versuch, den Spieler hinzuzufügen
        success, message, token = initiate_add_player(nickname, email, inviter_id)

        if success:
            response_data = {
                'code': 'PLAYER_ADDED_EMAIL_SENT' if email else 'PLAYER_ADDED_NO_EMAIL_REQUIRED',
                'message': message,
                'nickname': nickname
            }
            if token:
                response_data['token'] = token
            logger.info(f"Player {nickname} added successfully by inviter {inviter_id}.")
            return jsonify(response_data), 201
        else:
            logger.warning(f"Failed to add player {nickname}: {message}")
            return jsonify({'code': 'ADD_PLAYER_FAILED', 'message': message}), 400

    except Exception as e:
        logger.error(f"Error in add_player: {str(e)}")
        return jsonify({'code': 'SERVER_ERROR', 'message': 'Ein unerwarteter Fehler ist aufgetreten.'}), 500

@auth_routes.route('/confirm-add-player', methods=['POST'])
def confirm_add_player():
    data = request.json
    nickname = data.get('nickname')
    password = data.get('password')
    token = data.get('token')
    
    if not all([nickname, password, token]):
        return jsonify({'error': 'Fehlende Daten'}), 400
    
    try:
        result = finalize_added_player_registration(nickname, password, token)
        return jsonify(result), 200
    except Exception as e:
        logger.error(f"Error in confirm_add_player: {str(e)}")
        return jsonify({'error': str(e)}), 400

@auth_routes.route('/decode-add-player-token', methods=['POST'])
def decode_add_player_token():
    token = request.json.get('token')
    try:
        decoded_data = decode_confirmation_token(token)
        return jsonify(decoded_data), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 400