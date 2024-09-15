import os
from dotenv import load_dotenv

# Laden der .env Datei
load_dotenv()

BASE_DIR = os.path.abspath(os.path.dirname(__file__))

class Config:
    """Basis Konfigurationsklasse mit allgemeinen Konfigurationsparametern."""
    
    DEBUG = False
    TESTING = False
    CSRF_ENABLED = True
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'default-secret-key-for-development'
    SECURITY_PASSWORD_SALT = os.environ.get('SECURITY_PASSWORD_SALT', 'default-salt-for-development')
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or f'sqlite:///{os.path.join(BASE_DIR, "instance/jassapp.db")}'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ECHO = True
    FRONTEND_URL = os.environ.get('FRONTEND_URL', 'http://localhost:8080')
    FIREBASE_ADMIN_SDK_PATH = os.environ.get('FIREBASE_ADMIN_SDK_PATH')

    @classmethod
    def init_app(cls, app):
        # Warnungen für fehlende Konfigurationen
        if not cls.SECRET_KEY or cls.SECRET_KEY == 'default-secret-key-for-development':
            app.logger.warning("SECRET_KEY ist nicht gesetzt oder verwendet den Standardwert. Dies ist unsicher für die Produktion.")
        
        if not cls.FIREBASE_ADMIN_SDK_PATH:
            app.logger.warning("FIREBASE_ADMIN_SDK_PATH ist nicht gesetzt. Firebase-Funktionalität wird nicht verfügbar sein.")

class ProductionConfig(Config):
    """Einstellungen speziell für die Produktionsumgebung."""
    SQLALCHEMY_ECHO = False

    @classmethod
    def init_app(cls, app):
        Config.init_app(app)
        assert cls.SECRET_KEY != 'default-secret-key-for-development', "Produktions-SECRET_KEY muss gesetzt sein"
        assert cls.FIREBASE_ADMIN_SDK_PATH, "FIREBASE_ADMIN_SDK_PATH muss für die Produktion gesetzt sein"

class DevelopmentConfig(Config):
    """Einstellungen speziell für die Entwicklungsumgebung."""
    DEBUG = True
    HOST = 'localhost'
    PORT = 5000

class TestingConfig(Config):
    """Einstellungen speziell für Tests."""
    TESTING = True
    SQLALCHEMY_DATABASE_URI = 'sqlite:///:memory:'

config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestingConfig,
    'default': DevelopmentConfig
}