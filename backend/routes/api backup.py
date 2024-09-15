from flask import Blueprint
from .players_routes import players_routes
from .PlayerProfiles_routes import player_profiles
from .games_routes import games_routes
from .rounds_routes import rounds_routes
from .JassResults_routes import jass_results_routes
from .groups_routes import groups_routes
from .events_routes import events_routes
from .tournaments_routes import tournaments_routes
from .leagues_routes import leagues_routes
from .leaderboards_routes import leaderboards_routes
from .statistics_routes import statistics_routes
from .settings_routes import settings_routes
from .messages_routes import messages_routes

api = Blueprint('api', __name__)

api.register_blueprint(players_routes, url_prefix='/api/players')
api.register_blueprint(player_profiles, url_prefix='/api/playerprofiles')
api.register_blueprint(games_routes, url_prefix='/api/games')
api.register_blueprint(rounds_routes, url_prefix='/api/rounds')
api.register_blueprint(jass_results_routes, url_prefix='/api/jassresults')
api.register_blueprint(groups_routes, url_prefix='/api/groups')
api.register_blueprint(events_routes, url_prefix='/api/events')
api.register_blueprint(tournaments_routes, url_prefix='/api/tournaments')
api.register_blueprint(leagues_routes, url_prefix='/api/leagues')
api.register_blueprint(leaderboards_routes, url_prefix='/api/leaderboards')
api.register_blueprint(statistics_routes, url_prefix='/api/statistics')
api.register_blueprint(settings_routes, url_prefix='/api/settings')
api.register_blueprint(messages_routes, url_prefix='/api/messages')
