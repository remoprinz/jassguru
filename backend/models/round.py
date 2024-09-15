# round.py
from datetime import datetime
from sqlalchemy import Column, Integer, ForeignKey, DateTime
from sqlalchemy.orm import relationship, backref
from extensions import db

jassgroup_round = db.Table('jassgroup_round',
    db.Column('jassgroup_id', db.Integer, db.ForeignKey('jassgroups.id'), primary_key=True),
    db.Column('round_id', db.Integer, db.ForeignKey('rounds.id'), primary_key=True),
    db.Column('round_number', db.Integer),
    db.Column('played_at', db.DateTime, default=datetime.utcnow),
    extend_existing=True
)

class Round(db.Model):
    __tablename__ = 'rounds'
    id = Column(Integer, primary_key=True)
    event_id = db.Column(db.Integer, db.ForeignKey("events.id"), nullable=True)
    event = relationship("Event", back_populates="rounds")
    tournament_id = Column(Integer, ForeignKey('tournaments.id'), nullable=True)
    tournament = relationship("Tournament", back_populates="rounds")
    league_id = Column(Integer, ForeignKey('leagues.id'), nullable=False)
    league = relationship("League", back_populates="rounds")
    date = Column(DateTime, nullable=False)
    start_time = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    games = relationship("Game", back_populates="round", lazy='dynamic')
    jass_groups = relationship("JassGroup", secondary="jassgroup_round", back_populates="rounds", lazy='dynamic')

    def serialize(self):
        return {
            "id": self.id,
            "event_id": self.event_id,
            "tournament_id": self.tournament_id,
            "league_id": self.league_id,
            "date": self.date.isoformat(),
            "start_time": self.start_time.isoformat(),
        }
