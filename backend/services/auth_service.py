# services/auth_service.py

import logging
from itsdangerous import URLSafeTimedSerializer
from werkzeug.security import generate_password_hash, check_password_hash
from flask import current_app
from models.player_profile import PlayerProfile

logger = logging.getLogger(__name__)

class AuthService:
    def __init__(self):
        self.serializer = None

    def init_app(self, app):
        self.serializer = URLSafeTimedSerializer(app.config['SECRET_KEY'])
        logger.debug("AuthService initialized with app secret key")

    def generate_confirmation_token(self, email):
        if not self.serializer:
            raise RuntimeError("AuthService must be initialized with init_app")
        try:
            token = self.serializer.dumps(email, salt='email-confirmation-salt')
            logger.debug(f"Generated confirmation token for email: {email}")
            return token
        except Exception as e:
            logger.error(f"Failed to generate confirmation token: {str(e)}")
            return None

    def confirm_token(self, token, expiration=3600):
        if not self.serializer:
            raise RuntimeError("AuthService must be initialized with init_app")
        try:
            email = self.serializer.loads(token, salt='email-confirmation-salt', max_age=expiration)
            logger.debug(f"Token confirmed. Email: {email}")
            return email
        except SignatureExpired:
            logger.warning("The token has expired")
            return None
        except BadSignature:
            logger.warning("Invalid token")
            return None
        except Exception as e:
            logger.error(f"Error confirming token: {str(e)}")
            return None

    def hash_password(self, password):
        hashed_password = generate_password_hash(password)
        logger.debug(f"Password hashed: {hashed_password}")
        return hashed_password

    def check_password(self, hashed_password, password):
        is_valid = check_password_hash(hashed_password, password)
        logger.debug(f"Password check: {'valid' if is_valid else 'invalid'}")
        return is_valid

    def authenticate_user(self, email, password):
        profile = PlayerProfile.query.filter_by(email=email).first()
        if profile and self.check_password(profile.password_hash, password):
            logger.debug(f"User authenticated: {email}")
            return profile
        else:
            logger.warning(f"Authentication failed for user: {email}")
            return None

auth_service = AuthService()

def init_auth_service(app):
    auth_service.init_app(app)

def init_serializer(secret_key):
    """
    Initialisiert und gibt einen URLSafeTimedSerializer zurück.
    """
    try:
        serializer = URLSafeTimedSerializer(secret_key)
        logger.info("Serializer erfolgreich initialisiert.")
        return serializer
    except Exception as e:
        logger.error(f"Fehler bei der Initialisierung des Serializers: {str(e)}")
        raise
