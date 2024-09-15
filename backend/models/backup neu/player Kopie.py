from datetime import datetime
from sqlalchemy import Column, Integer, String, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from extensions import db

player_game = db.Table('player_game',
    db.Column('player_id', db.Integer, db.ForeignKey('players.id'), primary_key=True),
    db.Column('game_id', db.Integer, db.ForeignKey('games.id'), primary_key=True),
    db.Column('joined_at', db.DateTime, default=datetime.utcnow),
    extend_existing=True
)

class Player(db.Model):
    __tablename__ = 'players'
    id = Column(Integer, primary_key=True)
    nickname = Column(String(120), nullable=False, unique=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    games = db.relationship("Game", secondary=player_game, back_populates="players", lazy='dynamic')
    profile = relationship("PlayerProfile", back_populates="player", uselist=False)

    def serialize(self):
        return {
            "id": self.id,
            "nickname": self.nickname,
            "created_at": self.created_at.isoformat(),
            "games": [game.id for game in self.games],
            "profile_id": self.profile.id if self.profile else None,
        }

