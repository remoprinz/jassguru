from typing import Dict, List
from models.player_profile import PlayerProfile
from sqlalchemy.exc import SQLAlchemyError  # Import für spezifische Exception
import time
from flask import current_app as app

class ValidationException(Exception):
    """
    Benutzerdefinierte Ausnahme, die ausgelöst wird, wenn die Validierung der Anfrage fehlschlägt.
    """
    pass

def validate_input(data: Dict, required_fields: List[str]):
    """
    Überprüft, ob alle erforderlichen Felder im übergebenen Datenobjekt vorhanden und nicht leer sind.
    
    :param data: Das zu überprüfende Datenobjekt (in der Regel ein Dictionary).
    :param required_fields: Eine Liste der erforderlichen Feldnamen.
    :raises ValidationException: Wenn ein erforderliches Feld fehlt oder leer ist.
    """
    for field in required_fields:
        if field not in data or data[field] == '':
            raise ValidationException(f"{field} Feld muss ausgefüllt sein.")

def is_email_unique(email: str, context: str = "") -> bool:
    """
    Überprüft, ob die angegebene E-Mail-Adresse einzigartig ist.
    
    :param email: Die zu überprüfende E-Mail-Adresse.
    :param context: Kontextinformationen für Logging-Zwecke.
    :returns: True, wenn die E-Mail-Adresse einzigartig ist, sonst False.
    :raises SQLAlchemyError: Wenn eine Datenbankfehler auftritt.
    """
    try:
        app.logger.debug(f"{context} - About to check email uniqueness at {time.time()}")
        existing_profile = PlayerProfile.query.filter_by(email=email).first()
        app.logger.debug(f"{context} - Completed email uniqueness check at {time.time()}")
        return existing_profile is None
    except SQLAlchemyError as e:  # Verwenden Sie eine spezifische Exception
        app.logger.error(f"{context} - Exception during email uniqueness check: {str(e)}")
        raise e

def check_email_uniqueness(email: str) -> bool:
    """
    Überprüft die Einzigartigkeit einer E-Mail-Adresse und löst eine Ausnahme aus, wenn sie nicht einzigartig ist.
    
    :param email: Die zu überprüfende E-Mail-Adresse.
    :returns: True, wenn die E-Mail-Adresse einzigartig ist, sonst False.
    :raises ValidationException: Wenn die E-Mail-Adresse nicht einzigartig ist.
    """
    if not is_email_unique(email):
        raise ValidationException("Die E-Mail-Adresse existiert bereits.")
    return True
