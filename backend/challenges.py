from flask import Blueprint, request, jsonify
from extensions import db, Challenge

challenges_bp = Blueprint('challenges', __name__)

@challenges_bp.route('/', methods=['GET'])
def get_challenges():
    challenges = Challenge.query.all()
    return jsonify([challenge.to_dict() for challenge in challenges]), 200

@challenges_bp.route('/', methods=['POST'])
def create_challenge():
    data = request.get_json()
    # Validate and create a new Challenge object with the given data
    # Add the new Challenge object to the database and return its ID
    pass

@challenges_bp.route('/<int:challenge_id>', methods=['GET'])
def get_challenge(challenge_id):
    challenge = Challenge.query.get(challenge_id)
    if not challenge:
        return jsonify({"error": "Challenge not found"}), 404
    return jsonify(challenge.to_dict()), 200

@challenges_bp.route('/<int:challenge_id>', methods=['PUT'])
def update_challenge(challenge_id):
    challenge = Challenge.query.get(challenge_id)
    if not challenge:
        return jsonify({"error": "Challenge not found"}), 404
    data = request.get_json()
    # Validate and update the Challenge object with the new data
    # Commit the changes to the database and return the updated Challenge object
    pass

@challenges_bp.route('/<int:challenge_id>', methods=['DELETE'])
def delete_challenge(challenge_id):
    challenge = Challenge.query.get(challenge_id)
    if not challenge:
        return jsonify({"error": "Challenge not found"}), 404
    db.session.delete(challenge)
    db.session.commit()
    return jsonify({"message": "Challenge deleted successfully"}), 200

# Add any additional routes and methods as needed for your challenges module
