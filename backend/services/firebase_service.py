# services/firebase_service.py

from firebase_admin import auth
import logging

logger = logging.getLogger(__name__)

def verify_firebase_token(id_token):
    try:
        decoded_token = auth.verify_id_token(id_token)
        logger.info(f"Token successfully verified for UID: {decoded_token['uid']}")
        return {'success': True, 'uid': decoded_token['uid']}
    except auth.ExpiredIdTokenError:
        logger.warning("Token verification failed: Expired ID token")
        return {'success': False, 'message': 'Expired ID token'}
    except auth.InvalidIdTokenError:
        logger.warning("Token verification failed: Invalid ID token")
        return {'success': False, 'message': 'Invalid ID token'}
    except auth.RevokedIdTokenError:
        logger.warning("Token verification failed: Revoked ID token")
        return {'success': False, 'message': 'Revoked ID token'}
    except Exception as e:
        logger.error(f"Unexpected error during token verification: {str(e)}")
        return {'success': False, 'message': 'An unexpected error occurred'}

def create_firebase_user(email, password, display_name=None):
    try:
        user = auth.create_user(
            email=email,
            email_verified=False,
            password=password,
            display_name=display_name
        )
        logger.info(f"Firebase user created successfully with UID: {user.uid}")
        return {'success': True, 'uid': user.uid}
    except auth.EmailAlreadyExistsError:
        logger.warning(f"Firebase user creation failed: Email already exists - {email}")
        return {'success': False, 'message': 'Email already exists'}
    except auth.InvalidEmailError:
        logger.warning(f"Firebase user creation failed: Invalid email - {email}")
        return {'success': False, 'message': 'Invalid email'}
    except auth.InvalidPasswordError:
        logger.warning("Firebase user creation failed: Invalid password")
        return {'success': False, 'message': 'Invalid password'}
    except Exception as e:
        logger.error(f"An unexpected error occurred in Firebase user creation: {str(e)}")
        return {'success': False, 'message': 'An unexpected error occurred'}

def send_password_reset_email(email):
    try:
        auth.generate_password_reset_link(email)
        logger.info(f"Password reset email sent successfully to {email}")
        return {'success': True, 'message': 'Password reset email sent successfully'}
    except auth.UserNotFoundError:
        logger.warning(f"Password reset failed: User not found - {email}")
        return {'success': False, 'message': 'User not found'}
    except Exception as e:
        logger.error(f"An unexpected error occurred while sending password reset email: {str(e)}")
        return {'success': False, 'message': 'An unexpected error occurred'}

def send_email_verification(email):
    try:
        auth.generate_email_verification_link(email)
        logger.info(f"Email verification link sent successfully to {email}")
        return {'success': True, 'message': 'Email verification link sent successfully'}
    except auth.UserNotFoundError:
        logger.warning(f"Email verification failed: User not found - {email}")
        return {'success': False, 'message': 'User not found'}
    except Exception as e:
        logger.error(f"An unexpected error occurred while sending email verification: {str(e)}")
        return {'success': False, 'message': 'An unexpected error occurred'}

def get_rounds(jass_id):
    logger.warning(f"Firebase-Funktion 'get_rounds' noch nicht implementiert. Simuliere Daten für Jass ID: {jass_id}")
    # Simulierte Daten zurückgeben
    return [
        {"runde": 1, "team1_score": 157, "team2_score": 0},
        {"runde": 2, "team1_score": 0, "team2_score": 157},
        {"runde": 3, "team1_score": 200, "team2_score": 0},
        {"runde": 4, "team1_score": 0, "team2_score": 180}
    ]