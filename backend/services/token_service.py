# services/token_service.py

from itsdangerous import URLSafeTimedSerializer, SignatureExpired, BadSignature
import logging

logger = logging.getLogger(__name__)

class TokenService:
    def __init__(self):
        self.serializer = None

    def init_app(self, app):
        """Initialisiert den TokenService mit der Flask-App."""
        self.serializer = URLSafeTimedSerializer(app.config['SECRET_KEY'])

    def generate_token(self, data, salt='default-salt'):
        """Erzeugt einen sicheren Token aus den übergebenen Daten."""
        if not self.serializer:
            raise RuntimeError("TokenService must be initialized with init_app")
        try:
            token = self.serializer.dumps(data, salt=salt)
            logger.debug(f"Generated token for data: {data} with salt: {salt}")
            return token
        except Exception as e:
            logger.error(f"Failed to generate token: {str(e)}")
            return None

    def verify_token(self, token, salt='default-salt', max_age=3600):
        """Verifiziert einen Token und gibt die enthaltenen Daten zurück."""
        if not self.serializer:
            raise RuntimeError("TokenService must be initialized with init_app")
        try:
            data = self.serializer.loads(token, salt=salt, max_age=max_age)
            logger.debug(f"Verified token. Data: {data} with salt: {salt}")
            return data
        except SignatureExpired:
            logger.warning("Token expired")
            return None
        except BadSignature:
            logger.warning("Invalid token")
            return None
        except Exception as e:
            logger.error(f"Error verifying token: {str(e)}")
            return None

    def decode_confirmation_token(self, token, salt='default-salt', max_age=3600):
        """Dekodiert einen Bestätigungstoken und gibt die enthaltenen Daten zurück."""
        return self.verify_token(token, salt=salt, max_age=max_age)

# Initialisierung der Singleton-Instanz des TokenService
token_service = TokenService()

def init_token_service(app):
    """Initialisiert den TokenService mit der Flask-App."""
    token_service.init_app(app)

def generate_confirmation_token(data):
    """Erzeugt einen Bestätigungstoken für die übergebenen Daten."""
    return token_service.generate_token(data, salt='email-confirmation-salt')

def confirm_token(token, max_age=3600):
    """Verifiziert einen Bestätigungstoken und gibt die enthaltenen Daten zurück."""
    return token_service.verify_token(token, salt='email-confirmation-salt', max_age=max_age)

def decode_confirmation_token(token, max_age=3600):
    """Dekodiert einen Bestätigungstoken und gibt die enthaltenen Daten zurück."""
    return token_service.decode_confirmation_token(token, salt='email-confirmation-salt', max_age=max_age)
