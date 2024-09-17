# models/jass_group.py

from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.orm import relationship
from extensions import db
from models import jass_group_admins, player_jass_group
from datetime import datetime
from zoneinfo import ZoneInfo

class JassGroup(db.Model):
    __tablename__ = 'jass_groups'
    
    id = Column(Integer, primary_key=True)
    name = Column(String(120), unique=True, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(ZoneInfo("Europe/Zurich")))

    # Viele-zu-Viele-Beziehung für Admins
    admins = relationship(
        'PlayerProfile',
        secondary=jass_group_admins,
        back_populates='administered_groups',
        lazy='dynamic'
    )

    # Viele-zu-Viele-Beziehung für Spieler
    players = relationship(
        'Player',
        secondary=player_jass_group,
        back_populates='jass_groups',
        lazy='dynamic'
    )

    # Beziehung zu JassCapture
    captures = relationship('JassCapture', back_populates='jass_group')

    # Beziehung zu Jass
    jass_sessions = relationship("Jass", back_populates="jass_group")

    def serialize(self):
        return {
            "id": self.id,
            "name": self.name,
            "created_at": self.created_at.isoformat(),
            "admin_ids": [admin.id for admin in self.admins],
            "player_ids": [player.id for player in self.players]
        }

    @property
    def get_admins(self):
        return self.admins.all()

    @property
    def get_players(self):
        return self.players.all()

    @property
    def get_captures(self):
        return self.captures

    @property
    def get_jass_sessions(self):
        return self.jass_sessions