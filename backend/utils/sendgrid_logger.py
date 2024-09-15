import logging

def setup_sendgrid_logger():
    # Erstellen eines benutzerdefinierten Loggers für SendGrid
    sendgrid_logger = logging.getLogger('sendgrid_logger')

    # Setzen des Log-Level auf WARNING, um nur Warnungen und Fehler zu loggen
    sendgrid_logger.setLevel(logging.WARNING)

    # Erstellen eines Handlers, der Logeinträge in eine Datei schreibt
    f_handler = logging.FileHandler('sendgrid.log')

    # Setzen des Log-Level für diesen Handler
    f_handler.setLevel(logging.WARNING)

    # Erstellen eines Formatters
    f_format = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')

    # Hinzufügen des Formatters zum Handler
    f_handler.setFormatter(f_format)

    # Hinzufügen des Handlers zum Logger
    sendgrid_logger.addHandler(f_handler)

    return sendgrid_logger

# Konfigurieren des SendGrid-Loggers durch Aufruf der Setup-Funktion
sendgrid_logger = setup_sendgrid_logger()
