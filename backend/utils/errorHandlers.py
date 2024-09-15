from typing import Tuple
from flask import Flask, jsonify
from flask_cors import CORS
from werkzeug.exceptions import HTTPException
from utils.errors import ValidationError, AuthenticationError, ResourceNotFoundError, ConflictError

def handle_error(error: HTTPException, status_code: int) -> Tuple[dict, int]:
    """
    Grundlegender Fehlerhandler, der für unterschiedliche Arten von Fehlern verwendet werden kann.
    
    Args:
        error (HTTPException): Das Fehlerobjekt.
        status_code (int): Der HTTP-Statuscode für den Fehler.
        
    Returns:
        Tuple[dict, int]: Ein Tupel, das aus der JSON-Antwort und dem HTTP-Statuscode besteht.
    """
    response = {
        'success': False,
        'message': str(error),
        'status_code': status_code
    }
    return jsonify(response), status_code

def register_error_handlers(app: Flask):   
    """
    Registriert Fehlerhandler für die Flask-App.
    
    Args:
        app (Flask): Die Flask-App-Instanz.
    """
    app.register_error_handler(Exception, lambda e: handle_error(e, 500))
    app.register_error_handler(ValidationError, lambda e: handle_error(e, 400))
    app.register_error_handler(AuthenticationError, lambda e: handle_error(e, 401))
    app.register_error_handler(ResourceNotFoundError, lambda e: handle_error(e, 404))
    app.register_error_handler(ConflictError, lambda e: handle_error(e, 409))

def handle_api_error(error, status_code=500):
    """
    Zentrale Fehlerbehandlung für API-Fehler.
    
    Args:
        error (Exception): Das Fehlerobjekt.
        status_code (int): Der HTTP-Statuscode für den Fehler.
        
    Returns:
        Tuple[dict, int]: Ein Tupel, das aus der JSON-Antwort und dem HTTP-Statuscode besteht.
    """
    response = {
        'success': False,
        'message': str(error),
        'status_code': status_code
    }
    return jsonify(response), status_code
