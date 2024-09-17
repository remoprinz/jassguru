# api.py
from flask import Blueprint
from .players_routes import players_routes
from .player_profiles_routes import player_profiles_routes
from .auth_routes import auth_routes
from .groups_routes import groups_routes
from .jass_capture_routes import jass_capture_routes

# Initialisierung des 'Ober'-Blueprints mit URL-Präfix /api
api = Blueprint('api', __name__, url_prefix='/api')

# Registrierung der einzelnen Blueprints unter dem /api-Präfix
api.register_blueprint(players_routes, url_prefix='/players')
api.register_blueprint(player_profiles_routes, url_prefix='/profiles')
api.register_blueprint(auth_routes, url_prefix='/auth')
api.register_blueprint(groups_routes, url_prefix='/groups')
api.register_blueprint(jass_capture_routes, url_prefix='/jass')