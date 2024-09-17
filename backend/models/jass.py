# models/jass.py

from sqlalchemy import Column, Integer, String, DateTime, Float, ForeignKey, Table, Enum as SQLAlchemyEnum
from sqlalchemy.orm import relationship
from extensions import db
from datetime import datetime
from zoneinfo import ZoneInfo
from enum import Enum

class JassStatus(Enum):
    PENDING = 'PENDING'
    ACTIVE = 'ACTIVE'
    COMPLETED = 'COMPLETED'
    ABANDONED = 'ABANDONED'

jass_players = Table('jass_players', db.Model.metadata,
    Column('jass_id', Integer, ForeignKey('jass.id'), primary_key=True),
    Column('player_id', Integer, ForeignKey('players.id'), primary_key=True)
)

class Jass(db.Model):
    __tablename__ = 'jass'
    
    id = Column(Integer, primary_key=True)
    jass_group_id = Column(Integer, ForeignKey('jass_groups.id'), nullable=False)
    mode = Column(String(50), nullable=False)
    start_time = Column(DateTime, default=lambda: datetime.now(ZoneInfo("Europe/Zurich")))
    end_time = Column(DateTime)
    status = Column(SQLAlchemyEnum(JassStatus), default=JassStatus.PENDING)
    jass_code = Column(String(10), unique=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    location_name = Column(String(255), nullable=True)

    jass_group = relationship("JassGroup", back_populates="jass_sessions")
    spiele = relationship("Spiel", back_populates="jass", cascade="all, delete-orphan")
    players = relationship('Player', secondary=jass_players, back_populates='jass_sessions')
    rosen10_player_id = Column(Integer, ForeignKey('players.id'))
    rosen10_player = relationship('Player', foreign_keys=[rosen10_player_id], back_populates='rosen10_jass')
    teams = relationship("Team", back_populates="jass", cascade="all, delete-orphan")

    def serialize(self):
        return {
            "id": self.id,
            "jass_group_id": self.jass_group_id,
            "mode": self.mode,
            "start_time": self.start_time.isoformat(),
            "end_time": self.end_time.isoformat() if self.end_time else None,
            "status": self.status.value,
            "jass_code": self.jass_code,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "location_name": self.location_name,
            "player_ids": [player.id for player in self.players],
            "rosen10_player_id": self.rosen10_player_id,
            "team_ids": [team.id for team in self.teams]
        }

    @property
    def get_players(self):
        return self.players.all()

    @property
    def get_teams(self):
        return self.teams

    @property
    def get_spiele(self):
        return self.spiele