# models/jass_capture.py

from sqlalchemy import Column, Integer, String, DateTime, Float, ForeignKey
from sqlalchemy.orm import relationship
from extensions import db
from datetime import datetime
from zoneinfo import ZoneInfo
from .relationship_tables import jass_capture_players

class JassCapture(db.Model):
    __tablename__ = 'jass_captures'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    jass_group_id = Column(Integer, ForeignKey('jass_groups.id'), nullable=False)
    start_time = Column(DateTime, nullable=False)  # Entfernen Sie den default-Wert
    end_time = Column(DateTime)
    mode = Column(String(50), nullable=False)
    status = Column(String(20), default='active')
    jass_code = Column(String(10), unique=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    location_name = Column(String(255), nullable=True)

    jass_group = relationship('JassGroup', back_populates='captures')
    players = relationship('Player', secondary=jass_capture_players, back_populates='jass_captures', lazy='dynamic')
    rosen10_player_id = Column(Integer, ForeignKey('players.id'))
    rosen10_player = relationship('Player', foreign_keys=[rosen10_player_id])

    def serialize(self):
        return {
            "id": self.id,
            "jass_group_id": self.jass_group_id,
            "start_time": self.start_time.isoformat(),
            "end_time": self.end_time.isoformat() if self.end_time else None,
            "mode": self.mode,
            "status": self.status,
            "jass_code": self.jass_code,
            "player_ids": [player.id for player in self.players],
            "rosen10_player_id": self.rosen10_player_id,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "location_name": self.location_name
        }

    @property
    def get_players(self):
        return self.players.all()

    @property
    def get_jass_group(self):
        return self.jass_group