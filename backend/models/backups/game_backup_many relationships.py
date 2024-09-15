from datetime import datetime
from sqlalchemy import Column, Integer, String, ForeignKey, Float
from sqlalchemy.orm import relationship
from extensions import db

jass_group_game = db.Table('jass_group_game',
    db.Column('jass_group_id', db.Integer, db.ForeignKey('jass_groups.id'), primary_key=True),
    db.Column('game_id', db.Integer, db.ForeignKey('games.id'), primary_key=True),
    db.Column('joined_at', db.DateTime, default=datetime.utcnow),
    extend_existing=True
)

class Game(db.Model):
    __tablename__ = 'games'
    id = db.Column(db.Integer, primary_key=True)
    jass_group_id = db.Column(db.Integer, db.ForeignKey('jass_groups.id'))
    jass_group = db.relationship("JassGroup", back_populates="games")
    players = db.relationship("Player", secondary=player_game, back_populates="games", lazy='dynamic')
    round_id = Column(Integer, ForeignKey('rounds.id'), nullable=True)
    players = db.relationship("Player", secondary=player_game, back_populates="games", lazy='dynamic')
    jass_group_id = Column(Integer, ForeignKey('jass_groups.id'), nullable=True)
    league_id = Column(Integer, ForeignKey('leagues.id'), nullable=True)
    tournament_id = Column(Integer, ForeignKey('tournaments.id'), nullable=True)
    event_id = Column(Integer, ForeignKey('events.id'), nullable=True)
    team1_id = Column(Integer, ForeignKey('teams.id'), nullable=False)
    team2_id = Column(Integer, ForeignKey('teams.id'), nullable=False)
    round = relationship("Round", back_populates="games")
    jass_groups = relationship("JassGroup", secondary=jass_group_game, back_populates="games", lazy='dynamic')
    league = relationship("League", back_populates="games")
    tournament = relationship("Tournament", back_populates="games")
    event = relationship("Event", back_populates="games")
    team1 = relationship("Team", foreign_keys=[team1_id], back_populates="games")
    team2 = relationship("Team", foreign_keys=[team2_id], back_populates="games")
    jass_results = relationship("JassResults", back_populates="game", lazy='dynamic')
    start_time = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    def serialize(self):
        return {
            "id": self.id,
            "round_id": self.round_id,
            "jass_group_id": self.jass_group_id,
            "league_id": self.league_id,
            "tournament_id": self.tournament_id,
            "event_id": self.event_id,
            "team1_id": self.team1_id,
            "team2_id": self.team2_id,
            "start_time": self.start_time.isoformat(),
        }
