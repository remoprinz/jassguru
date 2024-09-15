from flask import Blueprint, jsonify, request
from extensions import db
from models import League

leagues_routes = Blueprint('leagues_routes', __name__)

@leagues_routes.route('/', methods=['GET'])
def get_all_leagues():
    leagues = League.query.all()
    leagues_data = [
        {
            'id': league.id,
            'name': league.name,
        } for league in leagues
    ]
    return jsonify(leagues_data)

@leagues_routes.route('/<int:league_id>', methods=['GET'])
def get_league(league_id):
    league = League.query.get(league_id)
    if not league:
        return jsonify({"error": "League not found"}), 404
    league_data = {
        'id': league.id,
        'name': league.name,
    }
    return jsonify(league_data)

@leagues_routes.route('/', methods=['POST'])
def create_league():
    league_data = request.get_json()
    league = League(name=league_data['name'])
    db.session.add(league)
    db.session.commit()
    return jsonify({"message": "League created successfully", "league_id": league.id}), 201

@leagues_routes.route('/<int:league_id>', methods=['PUT'])
def update_league(league_id):
    league = League.query.get(league_id)
    if not league:
        return jsonify({"error": "League not found"}), 404
    league_data = request.get_json()
    league.name = league_data.get('name', league.name)
    db.session.commit()
    return jsonify({"message": "League updated successfully"})

@leagues_routes.route('/<int:league_id>', methods=['DELETE'])
def delete_league(league_id):
    league = League.query.get(league_id)
    if not league:
        return jsonify({"error": "League not found"}), 404
    db.session.delete(league)
    db.session.commit()
    return jsonify({"message": "League deleted successfully"})
