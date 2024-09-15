from datetime import datetime
from sqlalchemy import Column, Integer, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from extensions import db

# Assoziationstabelle für die Many-to-Many-Beziehung zwischen Tournament und Player
tournament_players = db.Table(
    "tournament_players",
    db.Column("tournament_id", db.Integer, db.ForeignKey("tournaments.id"), primary_key=True),
    db.Column("player_id", db.Integer, db.ForeignKey("players.id"), primary_key=True)
)

class Tournament(db.Model):
    __tablename__ = 'tournaments'
    id = db.Column(Integer, primary_key=True)
    event_id = db.Column(db.Integer, db.ForeignKey("events.id"), nullable=True)
    event = relationship("Event", back_populates="tournaments")
    date = db.Column(DateTime, nullable=False)
    rounds = relationship("Round", back_populates="tournament", lazy='dynamic')
    games = relationship("Game", back_populates="tournament", lazy='dynamic')
    players = db.relationship("Player", secondary=tournament_players, back_populates="tournaments")
    teams = db.relationship('Team', back_populates='tournaments')

    def serialize(self):
        return {
            "id": self.id,
            "event_id": self.event_id,
            "date": self.date.isoformat()  # Format the datetime object as ISO 8601 string
        }
