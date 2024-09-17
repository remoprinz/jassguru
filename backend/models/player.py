# models/player.py

from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from extensions import db
from .relationship_tables import player_jass_group
from datetime import datetime
from zoneinfo import ZoneInfo

class Player(db.Model):
    __tablename__ = 'players'
    
    id = Column(Integer, primary_key=True)
    firebase_uid = Column(String(120), unique=True, nullable=True)
    nickname = Column(String(120), nullable=False, unique=True)
    created_at = Column(DateTime, default=lambda: datetime.now(ZoneInfo("Europe/Zurich")))
    is_guest = Column(Boolean, default=False)
    invited_by = Column(String(120), nullable=True)

    # Beziehungen
    profile = relationship("PlayerProfile", back_populates="player", uselist=False)
    jass_groups = relationship('JassGroup', secondary='player_jass_group', back_populates='players', lazy='dynamic')
    jass_sessions = relationship('Jass', secondary='jass_players', back_populates='players')
    teams_as_player1 = relationship("Team", foreign_keys="[Team.player1_id]", back_populates="player1")
    teams_as_player2 = relationship("Team", foreign_keys="[Team.player2_id]", back_populates="player2")
    jass_captures = relationship('JassCapture', secondary='jass_capture_players', back_populates='players', lazy='dynamic')

    # Weise
    weise = relationship('Weis', back_populates='player')

    # Rosen10 Beziehung
    rosen10_jass = relationship('Jass', foreign_keys='[Jass.rosen10_player_id]', back_populates='rosen10_player')

    def serialize(self):
        return {
            "id": self.id,
            "firebase_uid": self.firebase_uid,
            "nickname": self.nickname,
            "created_at": self.created_at.isoformat(),
            "is_guest": self.is_guest,
            "invited_by": self.invited_by,
            "jass_group_ids": [group.id for group in self.jass_groups],
            "team_ids": [team.id for team in self.teams]
        }

    @property
    def get_profile(self):
        return self.profile

    @property
    def get_jass_groups(self):
        return self.jass_groups.all()

    @property
    def get_teams(self):
        return self.teams

    @property
    def get_jass_sessions(self):
        return self.jass_sessions

    @property
    def get_weise(self):
        return self.weise

    @property
    def teams(self):
        return self.teams_as_player1 + self.teams_as_player2