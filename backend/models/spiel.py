# models/spiel.py

from sqlalchemy import Column, Integer, ForeignKey, DateTime, Float, String, Table
from sqlalchemy.orm import relationship
from extensions import db
from datetime import datetime
from zoneinfo import ZoneInfo

spiel_teams = Table('spiel_teams', db.Model.metadata,
    Column('spiel_id', Integer, ForeignKey('spiele.id'), primary_key=True),
    Column('team_id', Integer, ForeignKey('teams.id'), primary_key=True)
)

class Spiel(db.Model):
    __tablename__ = 'spiele'
    
    id = Column(Integer, primary_key=True)
    jass_id = Column(Integer, ForeignKey('jass.id'), nullable=False)
    start_time = Column(DateTime, nullable=False, default=lambda: datetime.now(ZoneInfo("Europe/Zurich")))
    end_time = Column(DateTime)
    team1_score = Column(Integer, default=0)
    team2_score = Column(Integer, default=0)
    
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    location_name = Column(String(255), nullable=True)

    jass = relationship("Jass", back_populates="spiele")
    teams = relationship('Team', secondary=spiel_teams, back_populates='spiele')
    runden = relationship("Runde", back_populates="spiel", cascade="all, delete-orphan")

    def serialize(self):
        return {
            "id": self.id,
            "jass_id": self.jass_id,
            "start_time": self.start_time.isoformat(),
            "end_time": self.end_time.isoformat() if self.end_time else None,
            "team1_score": self.team1_score,
            "team2_score": self.team2_score,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "location_name": self.location_name,
            "runden_count": len(self.runden)
        }

    @property
    def get_runden(self):
        return self.runden

    @property
    def get_teams(self):
        return self.teams

    def add_runde(self, runde):
        self.runden.append(runde)
        self.update_scores()

    def update_scores(self):
        self.team1_score = sum(runde.team1_score for runde in self.runden)
        self.team2_score = sum(runde.team2_score for runde in self.runden)