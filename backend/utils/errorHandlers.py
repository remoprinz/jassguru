from typing import Tuple
from flask import Flask, jsonify
from flask_cors import CORS
from werkzeug.exceptions import HTTPException
from utils.errors import ValidationError, AuthenticationError, ResourceNotFoundError, ConflictError, GroupError

def handle_error(error: Exception) -> Tuple[dict, int]:
    """
    Zentraler Fehlerhandler für verschiedene Arten von Fehlern.
    
    Args:
        error (Exception): Das Fehlerobjekt.
        
    Returns:
        Tuple[dict, int]: Ein Tupel, das aus der JSON-Antwort und dem HTTP-Statuscode besteht.
    """
    if isinstance(error, AuthenticationError):
        status_code = 401
        message = "Authentifizierung fehlgeschlagen"
    elif isinstance(error, ResourceNotFoundError):
        status_code = 404
        message = "Ressource nicht gefunden"
    elif isinstance(error, GroupError):
        status_code = 400
        message = "Gruppenfehler"
    elif isinstance(error, ValidationError):
        status_code = 400
        message = "Validierungsfehler"
    elif isinstance(error, ConflictError):
        status_code = 409
        message = "Konflikt"
    elif isinstance(error, HTTPException):
        status_code = error.code
        message = error.description
    else:
        status_code = 500
        message = "Ein unerwarteter Fehler ist aufgetreten"

    response = {
        'success': False,
        'message': message,
        'details': str(error),
        'status_code': status_code
    }
    return jsonify(response), status_code

def register_error_handlers(app: Flask):   
    """
    Registriert Fehlerhandler für die Flask-App.
    
    Args:
        app (Flask): Die Flask-App-Instanz.
    """
    app.register_error_handler(Exception, handle_error)

def handle_api_error(error, status_code=500):
    error_message = str(error)
    response = {
        'success': False,
        'message': 'Ein unerwarteter Fehler ist aufgetreten',
        'details': error_message,
        'status_code': status_code
    }
    return jsonify(response), status_code
