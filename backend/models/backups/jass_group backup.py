from datetime import datetime
from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from extensions import db

class JassGroup(db.Model):
    __tablename__ = 'jass_groups'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), unique=True, nullable=False)
    games = db.relationship("Game", back_populates="jass_group", lazy='dynamic')

    def serialize(self):
        return {
            "id": self.id,
            "name": self.name,
            "games": [game.serialize() for game in self.games],
        }
