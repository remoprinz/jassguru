from flask import Blueprint, request, jsonify
from extensions import db
from models import Event, Player, JassGroup

events_routes = Blueprint('events_routes', __name__)

@events_routes.route('/', methods=['GET'])
def get_events():
    events = Event.query.all()
    return jsonify([event.serialize for event in events])

@events_routes.route('/', methods=['POST'])
def create_event():
    data = request.get_json()
    name = data.get('name')
    date = data.get('date')
    location = data.get('location')

    if not name or not date or not location:
        return jsonify({"error": "Name, date, and location are required"}), 400

    event = Event(name=name, date=date, location=location)
    db.session.add(event)
    db.session.commit()

    return jsonify(event.serialize), 201

@events_routes.route('/<int:event_id>', methods=['GET'])
def get_event(event_id):
    event = Event.query.get_or_404(event_id)
    return jsonify(event.serialize)

@events_routes.route('/<int:event_id>', methods=['PUT'])
def update_event(event_id):
    event = Event.query.get(event_id)
    data = request.get_json()

    if not event:
        return jsonify({"error": "Event not found"}), 404

    event.name = data.get('name', event.name)
    event.date = data.get('date', event.date)
    event.location = data.get('location', event.location)
    db.session.commit()

    return jsonify(event.serialize)

@events_routes.route('/<int:event_id>', methods=['DELETE'])
def delete_event(event_id):
    event = Event.query.get(event_id)

    if not event:
        return jsonify({"error": "Event not found"}), 404

    db.session.delete(event)
    db.session.commit()

    return jsonify({"status": "success"})

@events_routes.route('/<int:event_id>/participants', methods=['GET'])
def get_event_participants(event_id):
    event = Event.query.get_or_404(event_id)
    return jsonify([participant.serialize for participant in event.players])

@events_routes.route('/<int:event_id>/participants', methods=['POST'])
def add_participant_to_event(event_id):
    event = Event.query.get_or_404(event_id)
    data = request.get_json()
    player_id = data.get('player_id')

    if not player_id:
        return jsonify({"error": "Player ID is required"}), 400

    player = Player.query.get(player_id)

    if not player:
        return jsonify({"error": "Player not found"}), 404

    if player not in event.players:
        event.players.append(player)
        db.session.commit()
        return jsonify({"status": "success"})
    else:
        return jsonify({"error": "Player is already a participant"}), 400

@events_routes.route('/<int:event_id>/participants/<int:player_id>', methods=['DELETE'])
def remove_participant_from_event(event_id, player_id):
    event = Event.query.get_or_404(event_id)
    player = Player.query.get_or_404(player_id)

    if player in event.players:
        event.players.remove(player)
        db.session.commit()
        return jsonify({"status": "success"})
    else:
        return jsonify({"error": "Player is not a participant"}), 400

@events_routes.route('/<int:event_id>/groups', methods=['POST'])
def add_group_to_event(event_id):
    event = Event.query.get_or_404(event_id)
    data = request.get_json()
    group_id = data.get('group_id')

    if not group_id:
        return jsonify({"error": "Group ID is required"}), 400

    group = JassGroup.query.get(group_id)

    if not group:
        return jsonify({"error": "Group not found"}), 404

    if group not in event.groups:
        event.groups.append(group)
        db.session.commit()
        return jsonify({"status": "success"})
    else:
        return jsonify({"error": "Group is already part of the event"}), 400

@events_routes.route('/<int:event_id>/groups/<int:group_id>', methods=['DELETE'])
def remove_group_from_event(event_id, group_id):
    event = Event.query.get_or_404(event_id)
    group = JassGroup.query.get_or_404(group_id)

    if group in event.groups:
        event.groups.remove(group)
        db.session.commit()
        return jsonify({"status": "success"})
    else:
        return jsonify({"error": "Group is not part of the event"}), 400

@events_routes.route('/<int:event_id>/invite/player/<int:player_id>', methods=['POST'])
def invite_player_to_event(event_id, player_id):
    # In dieser Funktion können Sie die Logik implementieren, um eine Einladung an den Spieler zu senden
    # Sie könnten beispielsweise eine E-Mail an den Spieler senden oder eine Benachrichtigung in der App auslösen
    return jsonify({"status": "Invitation sent to player"})

@events_routes.route('/<int:event_id>/invite/group/<int:group_id>', methods=['POST'])
def invite_group_to_event(event_id, group_id):
    # In dieser Funktion können Sie die Logik implementieren, um Einladungen an alle Mitglieder der Gruppe zu senden
    # Sie könnten beispielsweise eine E-Mail an jedes Mitglied senden oder eine Benachrichtigung in der App auslösen
    return jsonify({"status": "Invitations sent to group members"})
