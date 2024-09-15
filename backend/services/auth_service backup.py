import logging
import jwt
from datetime import datetime, timedelta 
from models.player import Player
from models.player_profile import PlayerProfile
from services.firebase_service import verify_firebase_token, create_firebase_user
from services.crud_service import save_to_db, filter_by
from utils.utils import check_email_uniqueness, ValidationException
from werkzeug.security import generate_password_hash

# Initialisierung des Loggings
logging.basicConfig(level=logging.DEBUG)


def authenticate_user(token: str):
    """
    Authentifiziert einen Benutzer mithilfe eines Firebase-Tokens.

    :param token: Das Firebase-Token.
    :return: Das authentifizierte Benutzerobjekt.
    :raises ValueError: Wenn die Authentifizierung fehlschlägt.
    """
    try:
        user = verify_firebase_token(token)
        logging.debug("User authenticated successfully.")
        return user
    except Exception as e:
        logging.error(f"Authentication failed: {e}")
        raise ValueError("Authentication failed")


def register_user_in_firebase(email: str, password: str):
    """
    Registriert einen Benutzer in Firebase.

    :param email: Die E-Mail-Adresse des Benutzers.
    :param password: Das Passwort des Benutzers.
    :return: Die Firebase-UID des Benutzers.
    :raises ValueError: Wenn die Registrierung in Firebase fehlschlägt.
    """
    try:
        response = create_firebase_user(email, password)
        logging.debug(f"Firebase response: {response}")
        
        if response.get('success'):
            return response.get('uid')
        else:
            error_message = response.get('message')
            logging.error(f"Firebase user registration failed: {error_message}")
            raise ValueError(error_message)
    except Exception as e:
        logging.error(f"Firebase user registration failed: {e}")
        raise


def login_user(uid: str):
    """
    Meldet einen Benutzer an und holt sein Profil ab.

    :param uid: Die Firebase-UID des Benutzers.
    :return: Das Benutzerprofil.
    :raises: Generische Exception bei Fehlern.
    """
    try:
        profile = filter_by(PlayerProfile, firebase_uid=uid).first()
        logging.debug(f"Profile fetched for uid {uid}: {profile}")
        return profile
    except Exception as e:
        logging.error(f"Login failed: {e}")
        raise


def register_user(data: dict):
    """
    Registriert einen neuen Benutzer und speichert ihn in der Datenbank.

    :param data: Das Anmeldedaten-Dictionary mit Nickname, E-Mail und Passwort.
    :return: Das neu erstellte Benutzerobjekt.
    :raises: Verschiedene Exceptions für unterschiedliche Fehlerfälle.
    """
    try:
        check_email_uniqueness(data['email'])
        firebase_uid = register_user_in_firebase(data['email'], data['password'])
        
        hashed_password = generate_password_hash(data['password'])
        profile = PlayerProfile(email=data['email'], firebase_uid=firebase_uid, password_hash=hashed_password)
        new_user = Player(nickname=data['nickname'], profile=profile)
        
        save_to_db(new_user)
        
        logging.debug(f"User {data['nickname']} registered successfully.")
        return new_user
    except ValidationException as ve:
        logging.error(f"Validation failed: {ve}")
        raise
    except Exception as e:
        logging.error(f"User registration failed: {e}")
        raise
