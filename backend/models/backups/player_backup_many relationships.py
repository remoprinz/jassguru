from datetime import datetime
from sqlalchemy import Column, Integer, String, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from models.jass_group import jass_group_game
from extensions import db
from models.statistics import Statistic

# M:N-Tabellen
player_game = db.Table('player_game',
    db.Column('player_id', db.Integer, db.ForeignKey('players.id'), primary_key=True),
    db.Column('game_id', db.Integer, db.ForeignKey('games.id'), primary_key=True),
    db.Column('joined_at', db.DateTime, default=datetime.utcnow),
    extend_existing=True
)

player_jass_group = db.Table('player_jass_group',
    db.Column('player_id', db.Integer, db.ForeignKey('players.id'), primary_key=True),
    db.Column('jass_group_id', db.Integer, db.ForeignKey('jass_groups.id'), primary_key=True),
    db.Column('joined_at', db.DateTime, default=datetime.utcnow),
    extend_existing=True
)

player_event = db.Table('player_event',
    db.Column('player_id', db.Integer, db.ForeignKey('players.id'), primary_key=True),
    db.Column('event_id', db.Integer, db.ForeignKey('events.id'), primary_key=True),
    db.Column('joined_at', db.DateTime, default=datetime.utcnow)
)

player_tournament = db.Table('player_tournament',
    db.Column('player_id', db.Integer, db.ForeignKey('players.id'), primary_key=True),
    db.Column('tournament_id', db.Integer, db.ForeignKey('tournaments.id'), primary_key=True),
    db.Column('joined_at', db.DateTime, default=datetime.utcnow)
)

player_team = db.Table('player_team',
    db.Column('player_id', db.Integer, db.ForeignKey('players.id'), primary_key=True),
    db.Column('team_id', db.Integer, db.ForeignKey('teams.id'), primary_key=True),
    db.Column('joined_at', db.DateTime, default=datetime.utcnow)
)

player_league = db.Table('player_league',
    db.Column('player_id', db.Integer, db.ForeignKey('players.id'), primary_key=True),
    db.Column('league_id', db.Integer, db.ForeignKey('leagues.id'), primary_key=True),
    db.Column('joined_at', db.DateTime, default=datetime.utcnow)
)

class Player(db.Model):
    __tablename__ = 'players'
    id = Column(Integer, primary_key=True)
    nickname = Column(String(120), nullable=False, unique=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    profile = relationship("PlayerProfile", back_populates="player", uselist=False)
    jass_groups = relationship("JassGroup", secondary=player_jass_group, back_populates="players", lazy='dynamic', overlaps="player_profiles")
    games = db.relationship("Game", secondary=player_game, back_populates="players", lazy='dynamic')
    jass_results = relationship("JassResults", back_populates="player", lazy='dynamic')
    events = relationship("Event", secondary=player_event, back_populates="players", lazy='dynamic')
    tournaments = relationship("Tournament", secondary=player_tournament, back_populates="players", lazy='dynamic')
    teams = relationship("Team", secondary=player_team, back_populates="players", lazy='dynamic')
    leagues = relationship("League", secondary=player_league, back_populates="players", lazy='dynamic')
    messages_sent = relationship("Message", foreign_keys="Message.sender_id", back_populates="sender", lazy='dynamic')
    messages_received = relationship("Message", foreign_keys="Message.recipient_id", back_populates="recipient", lazy='dynamic')
    statistics = relationship("Statistic", back_populates="player")

    def serialize(self):
        return {
            "id": self.id,
            "nickname": self.nickname,
            "created_at": self.created_at.isoformat(),
        }
