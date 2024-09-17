# Standard Libraries
import logging

# Third-Party Libraries
from sqlalchemy.exc import SQLAlchemyError, IntegrityError

# Local Modules
from extensions import db
from models.jass_group import JassGroup
from models.player_profile import PlayerProfile
from models.player import Player
from models.relationship_tables import jass_group_admins, player_jass_group
from utils.errors import GroupError, ResourceNotFoundError

# Initialize Logger
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

def get_all_groups():
    try:
        return JassGroup.query.all()
    except Exception as e:
        logger.error(f"Error while fetching all groups: {e}")
        raise GroupError("Failed to fetch all groups.")

def get_group_by_id(group_id):
    try:
        group = JassGroup.query.get(group_id)
        if not group:
            raise ResourceNotFoundError(f"Group with id {group_id} not found.")
        return group
    except ResourceNotFoundError as e:
        logger.error(f"Group not found: {e}")
        raise
    except Exception as e:
        logger.error(f"Error while fetching group by id: {e}")
        raise GroupError("Failed to fetch group.")

def create_group(name, firebase_uid):
    try:
        if not firebase_uid:
            raise GroupError("Firebase UID must be provided.")

        player_profile = PlayerProfile.query.filter_by(firebase_uid=firebase_uid).one()
        player_id = player_profile.profile_id

        new_group = JassGroup(name=name)
        db.session.add(new_group)
        db.session.flush()

        db.session.execute(jass_group_admins.insert().values(firebase_uid=firebase_uid, jass_group_id=new_group.id))
        db.session.execute(player_jass_group.insert().values(player_id=player_id, jass_group_id=new_group.id))
        
        db.session.commit()
        return new_group
    except (SQLAlchemyError, IntegrityError) as e:
        db.session.rollback()
        logger.error(f"Database error while creating group: {e}")
        raise GroupError("Failed to create group.")
    except Exception as e:
        db.session.rollback()
        logger.error(f"Unknown error while creating group: {e}")
        raise GroupError("Failed to create group.")

def add_player_to_group(player_id, group_id):
    try:
        player = Player.query.get(player_id)
        if not player:
            raise ResourceNotFoundError("Player not found.")

        group = JassGroup.query.get(group_id)
        if not group:
            raise ResourceNotFoundError("Group not found.")
        
        if player in group.players:
            return group, False 
        
        group.players.append(player)
        db.session.commit()
        
        logger.info(f"Player {player.nickname} (ID: {player.id}) added to group {group.name} (ID: {group.id})")
        return group, True
    except ResourceNotFoundError as e:
        logger.error(f"Resource not found: {e}")
        raise
    except Exception as e:
        db.session.rollback()
        logger.error(f"Unexpected error while adding player to group: {e}")
        raise GroupError("Failed to add player to group.")

def update_group_admins_by_id(group_id, firebase_uids):
    try:
        group = JassGroup.query.get(group_id)
        if not group:
            raise ResourceNotFoundError(f"Group with id {group_id} not found.")
        
        db.session.execute(jass_group_admins.delete().where(jass_group_admins.c.jass_group_id == group_id))
        
        for firebase_uid in firebase_uids:
            player_profile = PlayerProfile.query.filter_by(firebase_uid=firebase_uid).first()
            if player_profile:
                db.session.execute(jass_group_admins.insert().values(firebase_uid=firebase_uid, jass_group_id=group_id))

        db.session.commit()
        return group
    except ResourceNotFoundError as e:
        logger.error(f"Group not found: {e}")
        raise
    except (SQLAlchemyError, IntegrityError) as e:
        db.session.rollback()
        logger.error(f"Database error while updating group admins: {e}")
        raise GroupError("Failed to update group admins.")
    except Exception as e:
        db.session.rollback()
        logger.error(f"Unknown error while updating group admins: {e}")
        raise GroupError("Failed to update group admins.")

def delete_group_by_id(group_id):
    try:
        group = JassGroup.query.get(group_id)
        if not group:
            raise ResourceNotFoundError(f"Group with id {group_id} not found.")
        db.session.delete(group)
        db.session.commit()
    except ResourceNotFoundError as e:
        logger.error(f"Group not found: {e}")
        raise
    except (SQLAlchemyError, IntegrityError) as e:
        db.session.rollback()
        logger.error(f"Database error while deleting group: {e}")
        raise GroupError("Failed to delete group.")
    except Exception as e:
        db.session.rollback()
        logger.error(f"Unknown error while deleting group: {e}")
        raise GroupError("Failed to delete group.")

def update_group(group_id, **kwargs):
    try:
        group = JassGroup.query.get(group_id)
        if not group:
            raise ResourceNotFoundError(f"Group with id {group_id} not found.")
        
        for key, value in kwargs.items():
            if hasattr(group, key):
                setattr(group, key, value)
        
        db.session.commit()
        return group
    except ResourceNotFoundError as e:
        logger.error(f"Group not found: {e}")
        raise
    except (SQLAlchemyError, IntegrityError) as e:
        db.session.rollback()
        logger.error(f"Database error while updating group: {e}")
        raise GroupError("Failed to update group.")
    except Exception as e:
        db.session.rollback()
        logger.error(f"Unknown error while updating group: {e}")
        raise GroupError("Failed to update group.")

def get_user_groups(firebase_uid):
    try:
        logger.debug(f"Attempting to fetch groups for firebase_uid: {firebase_uid}")
        player_profile = PlayerProfile.query.filter_by(firebase_uid=firebase_uid).first()
        if not player_profile:
            logger.warning(f"No PlayerProfile found for firebase_uid: {firebase_uid}")
            return []
        
        if not player_profile.player:
            logger.warning(f"PlayerProfile found, but no associated Player for firebase_uid: {firebase_uid}")
            return []
        
        # Explizit nur die benötigten Felder laden
        groups = db.session.query(JassGroup.id, JassGroup.name).join(player_jass_group).filter(player_jass_group.c.player_id == player_profile.player.id).all()
        
        logger.info(f"Found {len(groups)} groups for user with firebase_uid: {firebase_uid}")
        result = [{"id": group[0], "name": group[1]} for group in groups]
        logger.debug(f"Returning groups: {result}")
        return result
    except Exception as e:
        logger.error(f"Error fetching user groups: {e}", exc_info=True)
        raise GroupError("Failed to fetch user groups.")
