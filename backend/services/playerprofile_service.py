from extensions import db
from models.player_profile import PlayerProfile
from sqlalchemy import func
from services.crud_service import save_to_db, get_all, get_by_id, delete_from_db
from validate_email import validate_email

def get_all_profiles():
    return get_all(PlayerProfile)

def get_profile_by_player_id(player_id):
    return get_by_id(PlayerProfile, player_id)

def create_profile_for_player(player_id, data):
    email = data.get('email')
    if not email or not validate_email(email):
        raise ValueError("Ungültige E-Mail-Adresse.")

    existing_profile = PlayerProfile.query.filter(func.lower(PlayerProfile.email) == func.lower(email)).first()
    if existing_profile:
        raise ValueError("Die E-Mail-Adresse wird bereits verwendet.")

    new_profile = PlayerProfile(player_id=player_id, **data)
    save_to_db(new_profile)
    return new_profile

def delete_profile_for_player(player_id):
    player_profile = get_profile_by_player_id(player_id)
    if player_profile:
        delete_from_db(player_profile)
