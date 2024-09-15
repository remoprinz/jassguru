import os
import logging
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail

logger = logging.getLogger(__name__)

class EmailSendingError(Exception):
    pass

class EmailService:
    def __init__(self):
        self.from_email = 'willkommen@jassguru.ch'

    def get_api_key(self):
        api_key = os.environ.get('SENDGRID_API_KEY')
        if not api_key:
            raise EmailSendingError("SENDGRID_API_KEY ist nicht gesetzt.")
        return api_key

    def send_email(self, to_email, subject, content):
        message = Mail(
            from_email=self.from_email,
            to_emails=to_email,
            subject=subject,
            plain_text_content=content
        )
        try:
            sg = SendGridAPIClient(self.get_api_key())
            response = sg.send(message)
            logger.info(f"E-Mail erfolgreich gesendet an {to_email}. Statuscode: {response.status_code}")
            return True
        except Exception as e:
            logger.error(f"E-Mail-Versand fehlgeschlagen an {to_email}: {str(e)}")
            raise EmailSendingError(f"E-Mail-Versand fehlgeschlagen: {str(e)}")

    def send_confirmation_email(self, to_email, token):
        subject = "Bestätigen Sie Ihre E-Mail-Adresse für Jassguru"
        content = f"""
        Willkommen bei Jassguru!

        Bitte bestätigen Sie Ihre E-Mail-Adresse, indem Sie auf den folgenden Link klicken:

        http://localhost:8080/confirm?token={token}

        Wenn Sie diese E-Mail nicht angefordert haben, können Sie sie ignorieren.

        Viel Spass beim Jassen!
        Das Jassguru-Team
        """
        return self.send_email(to_email, subject, content)

    def send_jassname_confirmation_email(self, to_email, jassname):
        subject = "Ihr Jassname wurde erfolgreich gesetzt"
        content = f"""
        Hallo {jassname},

        Ihr Jassname wurde erfolgreich gesetzt. Sie können sich nun bei Jassguru anmelden und loslegen!

        Viel Spass beim Jassen!
        Das Jassguru-Team
        """
        return self.send_email(to_email, subject, content)

    def send_registration_email(self, to_email, token):
        subject = "Registrierung bei Jassguru"
        content = f"""
        Willkommen bei Jassguru!

        Vielen Dank für Ihre Registrierung. Bitte bestätigen Sie Ihre E-Mail-Adresse, indem Sie auf den folgenden Link klicken:

        http://localhost:8080/confirm?token={token}

        Wenn Sie diese E-Mail nicht angefordert haben, können Sie sie ignorieren.

        Viel Spass beim Jassen!
        Das Jassguru-Team
        """
        return self.send_email(to_email, subject, content)

    def send_confirm_added_player_email(self, to_email, token):
        subject = "Bestätigen Sie Ihren Jassguru-Account"
        content = f"""
        Willkommen bei Jassguru!

        Sie wurden als neuer Spieler hinzugefügt. Bitte bestätigen Sie Ihren Account, indem Sie auf den folgenden Link klicken:

        http://localhost:8080/confirm-added-player?token={token}

        Wenn Sie diese E-Mail nicht erwarten, können Sie sie ignorieren.

        Viel Spass beim Jassen!
        Das Jassguru-Team
        """
        return self.send_email(to_email, subject, content)

    def send_password_reset_email(self, to_email, token):
        subject = "Passwort zurücksetzen für Jassguru"
        content = f"""
        Sie haben eine Anfrage zum Zurücksetzen Ihres Passworts gestellt. Bitte klicken Sie auf den folgenden Link, um Ihr Passwort zurückzusetzen:

        http://localhost:8080/reset-password?token={token}

        Wenn Sie diese Anfrage nicht gestellt haben, können Sie diese E-Mail ignorieren.

        Viel Spass beim Jassen!
        Das Jassguru-Team
        """
        return self.send_email(to_email, subject, content)

# Singleton-Instanz des EmailService
email_service = None

def init_email_service():
    global email_service
    email_service = EmailService()

def send_confirmation_email(to_email, token):
    if email_service is None:
        raise RuntimeError("EmailService wurde nicht initialisiert.")
    return email_service.send_confirmation_email(to_email, token)

def send_jassname_confirmation_email(to_email, jassname):
    if email_service is None:
        raise RuntimeError("EmailService wurde nicht initialisiert.")
    return email_service.send_jassname_confirmation_email(to_email, jassname)

def send_registration_email(to_email, token):
    if email_service is None:
        raise RuntimeError("EmailService wurde nicht initialisiert.")
    return email_service.send_registration_email(to_email, token)

def send_confirm_added_player_email(to_email, token):
    if email_service is None:
        raise RuntimeError("EmailService wurde nicht initialisiert.")
    return email_service.send_confirm_added_player_email(to_email, token)

def send_password_reset_email(to_email, token):
    if email_service is None:
        raise RuntimeError("EmailService wurde nicht initialisiert.")
    return email_service.send_password_reset_email(to_email, token)
