# statistics.py
from sqlalchemy import Column, Integer, ForeignKey, JSON
from sqlalchemy.orm import relationship
from extensions import db

class Statistic(db.Model):
    __tablename__ = 'statistics'
    id = db.Column(db.Integer, primary_key=True)
    team_id = db.Column(db.Integer, db.ForeignKey('teams.id'), nullable=False)
    points = db.Column(db.Integer, nullable=False)
    parent = relationship("Team", back_populates="statistics")
    
    # Beziehung zum Spieler
    player_id = Column(Integer, ForeignKey("players.id"), nullable=True)
    player = relationship("Player", back_populates="statistics")

    # Schema-less column for custom statistics
    data = Column(JSON)

    def serialize(self):
        return {
            "id": self.id,
            "player_id": self.player_id,
            "data": self.data
        }
