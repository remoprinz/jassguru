import os
import logging
from dotenv import load_dotenv
from flask import Flask, jsonify, request
import firebase_admin
from firebase_admin import credentials
from flask_cors import CORS

from extensions import db, migrate
from routes.api import api
from utils.errorHandlers import register_error_handlers
from services.token_service import init_token_service
from services.auth_service import init_serializer
from services.email_service import init_email_service
from utils.errors import ValidationError, AuthenticationError, ResourceNotFoundError, ConflictError
from utils.utils import validate_input, is_email_unique

# Initialisiere Logger
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Laden der .env-Datei
dotenv_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env')
load_dotenv(dotenv_path)

# Ausgabe zur Überprüfung, ob die .env-Datei richtig geladen wurde
logger.debug(f"Loaded .env from: {dotenv_path}")

# Überprüfen, ob SENDGRID_API_KEY gesetzt ist
if 'SENDGRID_API_KEY' not in os.environ:
    raise EnvironmentError("SENDGRID_API_KEY ist nicht in den Umgebungsvariablen gesetzt.")

# Ausgabe des SENDGRID_API_KEY für Debugging-Zwecke
logger.debug("SENDGRID_API_KEY ist gesetzt" if os.getenv('SENDGRID_API_KEY') else "SENDGRID_API_KEY ist nicht gesetzt")

# Überprüfen des Firebase SDK Pfads
firebase_sdk_path = os.getenv('FIREBASE_ADMIN_SDK_PATH')
logger.info(f"Firebase SDK Pfad geladen aus .env: {firebase_sdk_path}")

def init_firebase():
    """Initialisiert Firebase, falls es noch nicht initialisiert wurde."""
    if firebase_admin._apps:
        logger.info("Firebase is already initialized.")
        return True

    cred_path = os.getenv('FIREBASE_ADMIN_SDK_PATH')
    logger.info(f"Attempting to initialize Firebase with credential path: {cred_path}")
    
    if not cred_path:
        error_msg = "FIREBASE_ADMIN_SDK_PATH environment variable is not set."
        logger.error(error_msg)
        raise EnvironmentError(error_msg)
    
    if not os.path.exists(cred_path):
        error_msg = f"Firebase Admin SDK JSON file not found at path: {cred_path}"
        logger.error(error_msg)
        raise FileNotFoundError(error_msg)
    
    try:
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred)
        logger.info("Firebase Admin SDK initialized successfully.")
        return True
    except Exception as e:
        logger.error(f"Failed to initialize Firebase: {str(e)}")
        raise

def create_app(config_name=None):
    """Erstellt und konfiguriert die Flask-App."""
    logger.info("Creating a new Flask app instance...")
    
    app = Flask(__name__)

    # Laden der Konfiguration basierend auf der Umgebungsvariablen oder dem Standardwert
    config_name = config_name or f'config.{os.environ.get("FLASK_ENV", "Development").capitalize()}Config'
    app.config.from_object(config_name)

    # Registrieren von Fehler-Handlern
    register_error_handlers(app)

    # Konfigurieren der SQLAlchemy-Optionen
    app.config["SQLALCHEMY_ECHO"] = True
    app.config["SQLALCHEMY_RECORD_QUERIES"] = True

    # CORS konfigurieren
    CORS(app, resources={r"/api/*": {
        "origins": [os.environ.get('FRONTEND_URL', 'http://localhost:8080')],
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"],
        "expose_headers": ["Content-Type", "X-CSRFToken"],
        "supports_credentials": True
    }})

    # Initialisieren der Datenbank und Migrationen
    db.init_app(app)
    migrate.init_app(app, db)

    with app.app_context():
        # Datenbank erstellen, falls noch nicht vorhanden
        db.engine.echo = True
        db_path = db.engine.url.database
        logger.info(f"Actual path to SQLite database: {db_path}")
        db.create_all()

        # Registrieren der Blueprints
        app.register_blueprint(api, url_prefix='/api')

        # Firebase initialisieren
        try:
            firebase_initialized = init_firebase()
            app.config['FIREBASE_INITIALIZED'] = firebase_initialized
        except Exception as e:
            logger.error(f"Failed to initialize Firebase: {str(e)}")
            raise
        
        # Überprüfen, ob Firebase initialisiert wurde
        if not app.config['FIREBASE_INITIALIZED']:
            raise RuntimeError("Firebase could not be initialized. Check your configuration.")
        
        # Serializer initialisieren
        init_serializer(app.config.get('SECRET_KEY', 'fallback-secret-key'))
        
        # Token Service initialisieren
        init_token_service(app)
        
        # Email Service initialisieren
        init_email_service()

    @app.before_request
    def log_request_info():
        """Loggt eingehende Anfragen für Debugging-Zwecke."""
        logger.debug('Headers: %s', request.headers)
        logger.debug('Body: %s', request.get_data())
        logger.debug('URL: %s', request.url)
        logger.debug('Firebase initialized: %s', app.config.get('FIREBASE_INITIALIZED', False))

    @app.after_request
    def after_request(response):
        """Loggt die Antwort für Debugging-Zwecke."""
        logger.debug('Response Headers: %s', response.headers)
        logger.debug('Response Body: %s', response.get_data())
        return response

    return app

app = create_app()

if __name__ == '__main__':
    app.run(debug=True, port=os.getenv('PORT', 5000))
