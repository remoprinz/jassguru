from datetime import datetime
from sqlalchemy import Column, Integer, ForeignKey
from sqlalchemy.orm import relationship
from extensions import db

class Game(db.Model):
    __tablename__ = 'games'
    id = db.Column(db.Integer, primary_key=True)
    jass_group_id = db.Column(db.Integer, db.ForeignKey('jass_groups.id'))
    jass_group = db.relationship("JassGroup", back_populates="games")
    players = db.relationship("Player", secondary="player_game", back_populates="games", lazy='dynamic')
    round_id = db.Column(db.Integer, db.ForeignKey('rounds.id'), nullable=True)
    round = db.relationship("Round", back_populates="games")
    team1_id = db.Column(db.Integer, db.ForeignKey('teams.id'), nullable=False)
    team1 = db.relationship("Team", foreign_keys=[team1_id])
    team2_id = db.Column(db.Integer, db.ForeignKey('teams.id'), nullable=False)
    team2 = db.relationship("Team", foreign_keys=[team2_id])
    start_time = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    def serialize(self):
        return {
            "id": self.id,
            "round_id": self.round_id,
            "jass_group_id": self.jass_group_id,
            "team1_id": self.team1_id,
            "team2_id": self.team2_id,
            "start_time": self.start_time.isoformat(),
        }
