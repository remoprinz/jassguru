from models.player import Player
from models.jass_group import JassGroup
from services.crud_service import save_to_db, get_all, get_by_id, delete_from_db
import logging
from sqlalchemy.exc import SQLAlchemyError, IntegrityError
from extensions import db
from utils.errors import ResourceNotFoundError

logger = logging.getLogger(__name__)

class GroupError(Exception):
    """Spezifische Ausnahme für gruppenbezogene Fehler."""
    pass

def create_player(player_data):
    """Erstellt einen neuen Spieler mit den gegebenen Daten."""
    try:
        is_guest = 'firebase_uid' not in player_data
        player = Player(
            nickname=player_data['nickname'],
            firebase_uid=player_data.get('firebase_uid'),
            is_guest=is_guest
        )
        save_to_db(player)
        logger.info(f"Neuer {'Gast' if is_guest else ''} Spieler erstellt: {player.nickname}")
        return player
    except IntegrityError:
        logger.error(f"Spieler mit Nickname {player_data['nickname']} existiert bereits")
        raise ValueError(f"Spieler mit Nickname {player_data['nickname']} existiert bereits")
    except Exception as e:
        logger.error(f"Fehler beim Erstellen des Spielers: {str(e)}")
        raise

def get_all_players():
    """Ruft alle Spieler aus der Datenbank ab."""
    try:
        players = get_all(Player)
        logger.info(f"Alle Spieler abgerufen. Anzahl: {len(players)}")
        return players
    except Exception as e:
        logger.error(f"Fehler beim Abrufen aller Spieler: {str(e)}")
        raise

def get_player(identifier):
    """Ruft einen Spieler anhand seiner ID, Firebase UID oder Nickname ab."""
    try:
        player = Player.query.filter(
            (Player.id == identifier) |
            (Player.firebase_uid == identifier) |
            (Player.nickname == identifier)
        ).first()
        if not player:
            logger.warning(f"Spieler nicht gefunden: {identifier}")
            raise ResourceNotFoundError(f"Spieler nicht gefunden: {identifier}")
        logger.info(f"Spieler abgerufen: {player.id}")
        return player
    except ResourceNotFoundError:
        raise
    except Exception as e:
        logger.error(f"Fehler beim Abrufen des Spielers {identifier}: {str(e)}")
        raise

def delete_player(player):
    """Löscht einen Spieler aus der Datenbank."""
    try:
        delete_from_db(player)
        logger.info(f"Spieler gelöscht: ID {player.id}")
    except Exception as e:
        logger.error(f"Fehler beim Löschen des Spielers {player.id}: {str(e)}")
        raise

def check_existing_player_by_nickname(nickname):
    """Überprüft, ob bereits ein Spieler mit dem gegebenen Nickname existiert."""
    try:
        player = Player.query.filter_by(nickname=nickname).first()
        if player:
            logger.info(f"Spieler mit Nickname {nickname} gefunden")
        else:
            logger.info(f"Kein Spieler mit Nickname {nickname} gefunden")
        return player
    except Exception as e:
        logger.error(f"Fehler bei der Überprüfung des Nicknamens {nickname}: {str(e)}")
        raise

def update_player_nickname(player, new_nickname):
    """Aktualisiert den Nicknamen eines Spielers."""
    try:
        player.nickname = new_nickname
        save_to_db(player)
        logger.info(f"Nickname des Spielers {player.id} aktualisiert: {new_nickname}")
        return player
    except IntegrityError:
        logger.error(f"Nickname {new_nickname} ist bereits vergeben")
        raise ValueError(f"Nickname {new_nickname} ist bereits vergeben")
    except Exception as e:
        logger.error(f"Fehler beim Aktualisieren des Nicknamens für Spieler {player.id}: {str(e)}")
        raise

def get_groups_for_player(identifier):
    """Ruft alle Gruppen ab, denen ein Spieler angehört."""
    try:
        player = get_player(identifier)
        groups = player.jass_groups
        logger.info(f"Gruppen für Spieler {player.id} abgerufen. Anzahl: {len(groups)}")
        return groups
    except ResourceNotFoundError:
        raise
    except Exception as e:
        logger.error(f"Fehler beim Abrufen der Gruppen für Spieler {identifier}: {str(e)}")
        raise

def get_players_for_group(group_id):
    """Ruft alle Spieler einer bestimmten Gruppe ab."""
    try:
        group = JassGroup.query.get(group_id)
        if not group:
            logger.warning(f"Gruppe mit ID {group_id} nicht gefunden")
            raise ResourceNotFoundError(f"Gruppe mit ID {group_id} nicht gefunden")
        logger.info(f"Spieler für Gruppe {group_id} abgerufen. Anzahl: {len(group.players)}")
        return group.players
    except ResourceNotFoundError:
        raise
    except Exception as e:
        logger.error(f"Fehler beim Abrufen der Spieler für Gruppe {group_id}: {str(e)}")
        raise

def add_player_to_group(player_id, group_id):
    try:
        player = Player.query.get(player_id)
        if not player:
            raise ResourceNotFoundError("Player not found.")

        group = JassGroup.query.get(group_id)
        if not group:
            raise ResourceNotFoundError("Group not found.")
        
        if player in group.players:
            raise GroupError("Player is already in the group.")
        
        group.players.append(player)
        db.session.commit()
        
        logger.info(f"Player {player.nickname} (ID: {player.id}) added to group {group.name} (ID: {group.id})")
        return group
    except ResourceNotFoundError as e:
        logger.error(f"Resource not found: {e}")
        raise
    except GroupError as e:
        logger.error(f"Group error: {e}")
        raise
    except Exception as e:
        db.session.rollback()
        logger.error(f"Unexpected error while adding player to group: {e}")
        raise GroupError("Failed to add player to group.")

def convert_guest_to_registered(player_id, firebase_uid):
    """Konvertiert einen Gastspieler zu einem registrierten Spieler."""
    try:
        player = get_player(player_id)
        if not player.is_guest:
            raise ValueError("Spieler ist bereits registriert")
        if Player.query.filter_by(firebase_uid=firebase_uid).first():
            raise ValueError("Firebase UID ist bereits einem anderen Spieler zugeordnet")
        
        player.firebase_uid = firebase_uid
        player.is_guest = False
        save_to_db(player)
        logger.info(f"Gastspieler {player.id} wurde zu registriertem Spieler konvertiert")
        return player
    except Exception as e:
        logger.error(f"Fehler bei der Konvertierung von Gastspieler {player_id}: {str(e)}")
        raise

def search_players(search_term):
    try:
        players = Player.query.filter(Player.nickname.ilike(f'%{search_term}%')).all()
        logger.info(f"Found {len(players)} players matching '{search_term}'")
        return players
    except Exception as e:
        logger.error(f"Error searching players: {str(e)}")
        raise