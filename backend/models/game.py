from datetime import datetime
from sqlalchemy import Column, Integer, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from extensions import db

game_team = db.Table('game_team',
    db.Column('team_id', db.Integer, db.ForeignKey('teams.id'), primary_key=True),
    db.Column('game_id', db.Integer, db.ForeignKey('games.id'), primary_key=True),
    db.Column('played_at', db.DateTime, default=datetime.utcnow),
    extend_existing=True
)

class Game(db.Model):
    __tablename__ = 'games'
    id = db.Column(db.Integer, primary_key=True)
    jass_group_id = db.Column(db.Integer, db.ForeignKey('jass_groups.id'))
    jass_group = db.relationship("JassGroup", back_populates="games")
    players = db.relationship("Player", secondary="player_game", back_populates="games", lazy='dynamic')
    round_id = db.Column(db.Integer, db.ForeignKey('rounds.id'), nullable=True)
    round = db.relationship("Round", back_populates="games")
    team1_id = db.Column(db.Integer, db.ForeignKey('teams.id'), nullable=False)
    team1 = db.relationship("Team", foreign_keys=[team1_id])
    team2_id = db.Column(db.Integer, db.ForeignKey('teams.id'), nullable=False)
    team2 = db.relationship("Team", foreign_keys=[team2_id])
    league_id = db.Column(db.Integer, db.ForeignKey('leagues.id'), nullable=True)
    league = db.relationship("League", back_populates="games")
    tournament_id = db.Column(db.Integer, db.ForeignKey('tournaments.id'), nullable=True)
    tournament = db.relationship("Tournament", back_populates="games")
    event_id = db.Column(db.Integer, db.ForeignKey('events.id'), nullable=True)
    event = db.relationship("Event", back_populates="games")
    jass_results = db.relationship("JassResults", back_populates="game", lazy='dynamic')
    teams = db.relationship("Team", secondary=game_team, back_populates="games", lazy='dynamic')
    start_time = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    def serialize(self):
        return {
            "id": self.id,
            "round_id": self.round_id,
            "jass_group_id": self.jass_group_id,
            "team1_id": self.team1_id,
            "team2_id": self.team2_id,
            "league_id": self.league_id,
            "tournament_id": self.tournament_id,
            "event_id": self.event_id,
            "start_time": self.start_time.isoformat(),
        }
