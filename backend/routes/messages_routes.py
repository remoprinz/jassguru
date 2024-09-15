from flask import Blueprint, jsonify, request
from extensions import db
from models import Message

# Erstellen Sie ein Blueprint mit dem Namen 'messages_routes', das in api.py als 'messages_routes' registriert wird.
messages_routes = Blueprint('messages_routes', __name__)

@messages_routes.route('/', methods=['GET'])
def get_messages():
    # Hier die Logik zum Abrufen von Nachrichten für einen Benutzer oder eine Gruppe implementieren
    # z. B. die player_id und/oder jass_group_id aus der Authentifizierung oder aus der Anfrage erhalten
    messages = ...
    messages_data = [
        {
            'id': message.id,
            'sender_id': message.sender_id,
            'recipient_id': message.recipient_id,
            'jass_group_id': message.jass_group_id,
            'content': message.content,
            'timestamp': message.timestamp,
        } for message in messages
    ]
    return jsonify(messages_data)

@messages_routes.route('/', methods=['POST'])
def send_message():
    message_data = request.get_json()
    message = Message(
        sender_id=message_data['sender_id'],
        recipient_id=message_data['recipient_id'],
        jass_group_id=message_data['jass_group_id'],
        content=message_data['content'],
    )
    db.session.add(message)
    db.session.commit()
    return jsonify({"message": "Message sent successfully", "message_id": message.id}), 201
