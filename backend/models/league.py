# league.py
from datetime import datetime
from sqlalchemy import Column, Integer, String
from sqlalchemy.orm import relationship
from extensions import db

class League(db.Model):
    __tablename__ = 'leagues'
    id = Column(Integer, primary_key=True)
    name = Column(String(120), unique=True, nullable=False)
    events = relationship("Event", back_populates="league", lazy='dynamic')
    jass_groups = relationship("JassGroup", back_populates="league", lazy='dynamic')
    teams = relationship("Team", back_populates="league", lazy='dynamic')
    rounds = relationship("Round", back_populates="league", lazy='dynamic')
    players = relationship("Player", back_populates="league", lazy='dynamic')

    def serialize(self):
        return {
            "id": self.id,
            "name": self.name,
            "jass_groups": [group.serialize() for group in self.jass_groups],
            "rounds": [round.serialize() for round in self.rounds]
        }
