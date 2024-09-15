# api.py
from flask import Blueprint
from .players_routes import players_routes
from .player_profiles_routes import player_profiles_routes
from .auth_routes import auth_routes  # Importieren des auth_routes Blueprint
from .groups_routes import groups_routes  # Importieren des groups_routes Blueprint

# Initialisierung des 'Ober'-Blueprints mit URL-Präfix /api
api = Blueprint('api', __name__, url_prefix='/api')

# Registrierung der einzelnen Blueprints unter dem /api-Präfix
api.register_blueprint(players_routes, url_prefix='/players')  # Wird zu /api/players/[players_routes-Endpunkte]
api.register_blueprint(player_profiles_routes, url_prefix='/profiles')  # Wird zu /api/profiles/[PlayerProfiles-Endpunkte]
api.register_blueprint(auth_routes, url_prefix='/auth')  # Wird zu /api/auth/[auth_routes-Endpunkte]
api.register_blueprint(groups_routes, url_prefix='/groups')  # Wird zu /api/groups/[groups_routes-Endpunkte]