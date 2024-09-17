# models/team.py

from sqlalchemy import Column, Integer, ForeignKey, DateTime, UniqueConstraint
from sqlalchemy.orm import relationship
from extensions import db
from datetime import datetime
from zoneinfo import ZoneInfo
from .spiel import spiel_teams

class Team(db.Model):
    __tablename__ = 'teams'
    
    id = Column(Integer, primary_key=True)
    player1_id = Column(Integer, ForeignKey('players.id'), nullable=False)
    player2_id = Column(Integer, ForeignKey('players.id'), nullable=False)
    jass_id = Column(Integer, ForeignKey('jass.id'), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(ZoneInfo("Europe/Zurich")))

    player1 = relationship("Player", foreign_keys=[player1_id], back_populates="teams_as_player1")
    player2 = relationship("Player", foreign_keys=[player2_id], back_populates="teams_as_player2")
    jass = relationship("Jass", back_populates="teams")
    spiele = relationship('Spiel', secondary=spiel_teams, back_populates='teams')

    __table_args__ = (UniqueConstraint('player1_id', 'player2_id', 'jass_id', name='unique_team_per_jass'),)

    def team_name(self):
        return f"{self.player1.nickname} + {self.player2.nickname}"

    def serialize(self):
        return {
            "id": self.id,
            "name": self.team_name(),
            "player1_id": self.player1_id,
            "player2_id": self.player2_id,
            "jass_id": self.jass_id,
            "created_at": self.created_at.isoformat(),
            "spiele_count": len(self.spiele)
        }

    @property
    def get_players(self):
        return [self.player1, self.player2]

    @property
    def get_spiele(self):
        return self.spiele

    def add_spiel(self, spiel):
        self.spiele.append(spiel)