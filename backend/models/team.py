# team.py
from datetime import datetime
from sqlalchemy import Column, Integer, String, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from extensions import db
from models.jass_result import JassResults

# M:N-Tabellen
player_team = db.Table('player_team',
    db.Column('player_id', db.Integer, db.ForeignKey('players.id'), primary_key=True),
    db.Column('team_id', db.Integer, db.ForeignKey('teams.id'), primary_key=True),
    extend_existing=True
)

team_round = db.Table('team_round',
    db.Column('team_id', db.Integer, db.ForeignKey('teams.id'), primary_key=True),
    db.Column('round_id', db.Integer, db.ForeignKey('rounds.id'), primary_key=True),
    db.Column('played_at', db.DateTime, default=datetime.utcnow),
    extend_existing=True
)

team_event = db.Table('team_event',
    db.Column('team_id', db.Integer, db.ForeignKey('teams.id'), primary_key=True),
    db.Column('event_id', db.Integer, db.ForeignKey('events.id'), primary_key=True),
    db.Column('joined_at', db.DateTime, default=datetime.utcnow),
    extend_existing=True
)

team_tournament = db.Table('team_tournament',
    db.Column('team_id', db.Integer, db.ForeignKey('teams.id'), primary_key=True),
    db.Column('tournament_id', db.Integer, db.ForeignKey('tournaments.id'), primary_key=True),
    db.Column('joined_at', db.DateTime, default=datetime.utcnow),
    extend_existing=True
)

class Team(db.Model):
    __tablename__ = 'teams'
    id = db.Column(db.Integer, primary_key=True)
    player1_id = db.Column(db.Integer, db.ForeignKey('players.id'), nullable=False)
    player2_id = db.Column(db.Integer, db.ForeignKey('players.id'), nullable=False)
    jass_results = relationship("JassResults", back_populates="team")
    events = relationship("Event", secondary=team_event, back_populates="teams", lazy='dynamic')
    tournaments = relationship("Tournament", secondary=team_tournament, back_populates="teams", lazy='dynamic')
    rounds = relationship("Round", secondary="team_round", back_populates="teams", lazy='dynamic')
    players = relationship("Player", secondary="player_team", back_populates="teams", lazy='dynamic')
    games = relationship("Game", primaryjoin="or_(Team.id==Game.team1_id, Team.id==Game.team2_id)", back_populates="team1")
    league_id = db.Column(db.Integer, db.ForeignKey('leagues.id'), nullable=False)
    league = relationship("League", back_populates="teams")
    statistics = relationship("Statistic", back_populates="parent")

    __table_args__ = (db.UniqueConstraint('player1_id', 'player2_id', name='unique_player_pair'),)

    def team_name(self):
        player1 = Player.query.get(self.player1_id)
        player2 = Player.query.get(self.player2_id)
        return f"{player1.nickname} + {player2.nickname}"

    def serialize(self):
        return {
            "id": self.id,
            "name": self.team_name(),
            "player1_id": self.player1_id,
            "player2_id": self.player2_id,
            "league_id": self.league_id,
        }
