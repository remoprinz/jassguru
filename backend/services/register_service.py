import logging
from sqlalchemy.exc import SQLAlchemyError, IntegrityError
from services.firebase_service import create_firebase_user
from services.token_service import generate_confirmation_token, decode_confirmation_token
from services.email_service import send_confirm_added_player_email, EmailSendingError
from utils.utils import ValidationException
from utils.errors import TokenExpiredError
from extensions import db
from models.player_profile import PlayerProfile
from models.player import Player
from validate_email_address import validate_email

# Initialize Logger
logger = logging.getLogger(__name__)

# Initiate Add Player
def initiate_add_player(nickname, email, inviter_id):
    try:
        if email and not validate_email(email):
            logging.warning("Die E-Mail-Adresse ist ungültig.")
            return False, "Die E-Mail-Adresse ist ungültig.", None

        existing_player = db.session.query(Player).filter_by(nickname=nickname).first()
        if existing_player:
            logging.warning("Der Jassname ist bereits vergeben.")
            return False, "Der Jassname ist bereits vergeben. Wählen Sie einen anderen.", None

        with db.session.begin_nested():
            new_player = Player(
                nickname=nickname,
                is_guest=True,  # Alle neuen Spieler sind zunächst Gäste
                invited_by=inviter_id
            )
            db.session.add(new_player)
            db.session.flush()

            if email:
                new_profile = PlayerProfile(id=new_player.id, email=email, email_confirmed=False)
                db.session.add(new_profile)

                token_data = {'email': email, 'nickname': nickname}
                token = generate_confirmation_token(token_data)

        db.session.commit()
        logging.debug("Pending player and associated profile saved to the database.")

        if email:
            send_confirm_added_player_email(email, token)
            return True, "Spieler erfolgreich hinzugefügt. Bitte überprüfen Sie Ihre E-Mail für weitere Anweisungen.", token
        else:
            return True, "Gastspieler erfolgreich hinzugefügt.", None

    except SQLAlchemyError as e:
        db.session.rollback()
        logging.error(f"Ein Datenbankfehler ist aufgetreten: {e}")
        return False, "Ein Datenbankfehler ist aufgetreten. Bitte versuchen Sie es später erneut.", None
    except Exception as e:
        db.session.rollback()
        logging.error(f"Ein unerwarteter Fehler ist aufgetreten: {e}")
        return False, "Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.", None

# Confirm Added Player
def confirm_added_player_service(token: str):
    try:
        logger.debug("Bestätigungsprozess für einen hinzugefügten Spieler wird gestartet.")
        
        decoded_data = decode_confirmation_token(token)
        if decoded_data is None:
            logger.warning("Ungültiger oder abgelaufener E-Mail-Bestätigungslink.")
            raise ValidationException("Ungültiger oder abgelaufener E-Mail-Bestätigungslink.")
        
        email = decoded_data.get('email')
        nickname = decoded_data.get('nickname')
        logger.debug(f"Extrahierter Nickname: {nickname} und E-Mail: {email}")

        existing_profile = db.session.query(PlayerProfile).filter_by(email=email).first()
        if existing_profile is None:
            logger.warning("Kein entsprechendes Profil gefunden.")
            raise ValidationException("Kein entsprechendes Profil gefunden.")

        existing_player = db.session.query(Player).filter_by(id=existing_profile.id).first()
        if existing_player is None:
            logger.warning("Kein entsprechender Spieler gefunden.")
            raise ValidationException("Kein entsprechender Spieler gefunden.")

        if existing_player.nickname != nickname:
            logger.warning("Der Nickname im Token stimmt nicht mit dem gespeicherten Nickname überein.")
            raise ValidationException("Der Nickname im Token stimmt nicht mit dem gespeicherten Nickname überein.")

        logger.info("Hinzugefügter Spieler erfolgreich bestätigt.")
        return {'message': 'Hinzugefügter Spieler erfolgreich bestätigt!', 'nickname': nickname, 'email': email}
        
    except TokenExpiredError:
        logger.warning("Token ist abgelaufen.")
        raise ValidationException("Der Bestätigungslink ist abgelaufen.")
        
    except (SQLAlchemyError, IntegrityError) as e:
        logger.error(f"Bestätigung des hinzugefügten Spielers fehlgeschlagen: {e}")
        raise ValidationException("Transaktionsfehler.")
        
    except Exception as e:
        logger.error(f"Ein unerwarteter Fehler ist aufgetreten: {e}")
        raise ValidationException("Ein unerwarteter Fehler ist aufgetreten.")

# Finalize Added Player Registration
def finalize_added_player_registration(nickname: str, password: str, token: str):
    try:
        decoded_data = decode_confirmation_token(token)
        email = decoded_data.get('email')
        
        existing_profile = PlayerProfile.query.filter_by(email=email).first()
        if not existing_profile:
            raise ValidationException("Kein entsprechendes Profil gefunden.")

        existing_player = Player.query.filter_by(id=existing_profile.id).first()
        if not existing_player:
            raise ValidationException("Kein entsprechender Spieler gefunden.")
        
        if existing_player.nickname != nickname:
            raise ValidationException("Der Nickname stimmt nicht mit dem Token überein.")
        
        with db.session.begin_nested():
            existing_player.is_guest = False
            existing_profile.email_confirmed = True
            
            firebase_response = create_firebase_user(email, password)
            if firebase_response.get('success'):
                uid = firebase_response.get('uid')
                existing_profile.firebase_uid = uid
                existing_player.firebase_uid = uid
            else:
                raise ValidationException("Fehler beim Erstellen des Firebase-Benutzers.")

            existing_profile.profile_id = existing_player.id
        
        db.session.commit()
        
        return {
            'code': 'PLAYER_CONFIRMED',
            'message': 'Spieler erfolgreich bestätigt und registriert.',
            'nickname': nickname,
            'is_guest': False
        }

    except Exception as e:
        db.session.rollback()
        logger.error(f"Error in finalize_added_player_registration: {str(e)}")
        raise ValidationException(str(e))