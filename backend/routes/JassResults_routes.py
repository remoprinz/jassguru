from flask import Blueprint, request, jsonify
from sqlalchemy import and_
from extensions import db
from models import JassResults

jass_results_routes = Blueprint('jass_results_routes', __name__)

@jass_results_routes.route('/', methods=['POST'])
def add_jassresult():
    data = request.get_json()
    new_jassresult = JassResults(
        game_id=data['game_id'],
        team_id=data['team_id'],
        jass_group_id=data['jass_group_id'],
        berg=data.get('berg', 0),
        sieg=data.get('sieg', 0),
        matsch=data.get('matsch', 0),
        schniider=data.get('schniider', 0),
        kontermatsch=data.get('kontermatsch', 0)
    )

    db.session.add(new_jassresult)
    db.session.commit()
    return jsonify(new_jassresult.to_dict()), 201

@jass_results_routes.route('/<int:id>', methods=['GET'])
def get_jassresult(id):
    jassresult = JassResults.query.get(id)
    if jassresult is not None:
        return jsonify(jassresult.to_dict())
    else:
        return jsonify({"error": "JassResult not found"}), 404

@jass_results_routes.route('/<int:id>', methods=['PUT'])
def update_jassresult(id):
    data = request.get_json()
    jassresult = JassResults.query.get(id)
    if jassresult is not None:
        jassresult.update(data)
        db.session.commit()
        return jsonify(jassresult.to_dict())
    else:
        return jsonify({"error": "JassResult not found"}), 404

@jass_results_routes.route('/<int:id>', methods=['DELETE'])
def delete_jassresult(id):
    jassresult = JassResults.query.get(id)
    if jassresult is not None:
        db.session.delete(jassresult)
        db.session.commit()
        return jsonify({"success": "JassResult deleted"})
    else:
        return jsonify({"error": "JassResult not found"}), 404

@jass_results_routes.route('/', methods=['GET'])
def get_jassresults():
    team_id = request.args.get('team_id', type=int)
    game_id = request.args.get('game_id', type=int)
    jass_group_id = request.args.get('jass_group_id', type=int)

    filters = []
    if team_id is not None:
        filters.append(JassResults.team_id == team_id)
    if game_id is not None:
        filters.append(JassResults.game_id == game_id)
    if jass_group_id is not None:
        filters.append(JassResults.jass_group_id == jass_group_id)

    if filters:
        jassresults = JassResults.query.filter(and_(*filters)).all()

    else:
        jassresults = JassResults.query.all()

    return jsonify([jassresult.to_dict() for jassresult in jassresults])
