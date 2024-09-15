# jass_group.py
from datetime import datetime
from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from extensions import db

# M:N-Tabellen
player_jass_group = db.Table('player_jass_group',
    db.Column('player_id', db.Integer, db.ForeignKey('players.id'), primary_key=True),
    db.Column('jass_group_id', db.Integer, db.ForeignKey('jass_groups.id'), primary_key=True),
    db.Column('joined_at', db.DateTime, default=datetime.utcnow),
    extend_existing=True
)

jass_group_player_profile = db.Table('jass_group_player_profile',
    db.Column('jass_group_id', db.Integer, db.ForeignKey('jass_groups.id'), primary_key=True),
    db.Column('player_profile_id', db.Integer, db.ForeignKey('player_profiles.id'), primary_key=True),
    db.Column('joined_at', db.DateTime, default=datetime.utcnow),
    extend_existing=True
)

jass_group_event = db.Table('jass_group_event',
    db.Column('jass_group_id', db.Integer, db.ForeignKey('jass_groups.id'), primary_key=True),
    db.Column('event_id', db.Integer, db.ForeignKey('events.id'), primary_key=True),
    db.Column('joined_at', db.DateTime, default=datetime.utcnow),
    extend_existing=True
)

jass_group_game = db.Table('jass_group_game',
    db.Column('jass_group_id', db.Integer, db.ForeignKey('jass_groups.id'), primary_key=True),
    db.Column('game_id', db.Integer, db.ForeignKey('games.id'), primary_key=True),
    db.Column('joined_at', db.DateTime, default=datetime.utcnow),
    extend_existing=True
)

jass_group_round = db.Table('jass_group_round',
    db.Column('jass_group_id', db.Integer, db.ForeignKey('jass_groups.id'), primary_key=True),
    db.Column('round_id', db.Integer, db.ForeignKey('rounds.id'), primary_key=True),
    db.Column('joined_at', db.DateTime, default=datetime.utcnow),
    extend_existing=True
)

class JassGroup(db.Model):
    __tablename__ = 'jass_groups'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), unique=True, nullable=False)
    league_id = db.Column(db.Integer, db.ForeignKey('leagues.id'), nullable=False)
    league = relationship("League", back_populates="jass_groups")
    players = relationship("Player", secondary=player_jass_group, back_populates="jass_groups", lazy='dynamic', overlaps="player_profiles")
    player_profiles = relationship("PlayerProfile", secondary=jass_group_player_profile, back_populates="jass_groups", lazy='dynamic')
    games = relationship("Game", secondary=jass_group_game, back_populates="jass_groups", lazy='dynamic')
    round_id = Column(Integer, ForeignKey('rounds.id'))
    rounds = relationship("Round", secondary=jass_group_round, back_populates="jass_groups", lazy='dynamic')
    event_id = db.Column(db.Integer, db.ForeignKey("events.id"), nullable=True)
    event = relationship("Event", back_populates="jass_groups")
    default_location = db.Column(db.String(120))

    def serialize(self):
        return {
            "id": self.id,
            "name": self.name,
            "league_id": self.league_id,
            "default_location": self.default_location,
            "players": [player.serialize() for player in self.players],
            "player_profiles": [profile.serialize() for profile in self.player_profiles],
            "events": [event.serialize() for event in self.events],
            "games": [game.serialize() for game in self.games],
            "rounds": [round.serialize() for round in self.rounds],
        }

