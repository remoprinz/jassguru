from datetime import datetime
from sqlalchemy.orm import relationship
from extensions import db
from enum import Enum as PyEnum

class EventType(PyEnum):
    TOURNAMENT = "TOURNAMENT"
    LEAGUE = "LEAGUE"
    FRIENDLY = "FRIENDLY"

player_event = db.Table('player_event',
    db.Column('player_id', db.Integer, db.ForeignKey('players.id'), primary_key=True),
    db.Column('event_id', db.Integer, db.ForeignKey('events.id'), primary_key=True),
    db.Column('joined_at', db.DateTime, default=datetime.utcnow),
    extend_existing=True
)

team_event = db.Table('team_event',
    db.Column('team_id', db.Integer, db.ForeignKey('teams.id'), primary_key=True),
    db.Column('event_id', db.Integer, db.ForeignKey('events.id'), primary_key=True),
    db.Column('joined_at', db.DateTime, default=datetime.utcnow),
    extend_existing=True
)

jass_group_event = db.Table('jass_group_event',
    db.Column('jass_group_id', db.Integer, db.ForeignKey('jass_groups.id'), primary_key=True),
    db.Column('event_id', db.Integer, db.ForeignKey('events.id'), primary_key=True),
    extend_existing=True
)

class Event(db.Model):
    __tablename__ = 'events'
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String, nullable=False)
    subtitle = db.Column(db.String, nullable=True) 
    description = db.Column(db.String, nullable=True)
    location = db.Column(db.String, nullable=True)
    event_type = db.Column(db.Enum(EventType), nullable=False)
    event_date = db.Column(db.DateTime, nullable=True)
    rounds = relationship("Round", back_populates="event", lazy='dynamic')
    players = relationship("Player", secondary=player_event, back_populates="events", lazy='dynamic')
    teams = relationship("Team", secondary=team_event, back_populates="events", lazy='dynamic')
    jass_groups = relationship("JassGroup", secondary=jass_group_event, back_populates="events", lazy='dynamic')

    def serialize(self):
        return {
            "id": self.id,
            "title": self.title,
            "subtitle": self.subtitle,
            "description": self.description,
            "location": self.location,
            "event_type": self.event_type.name,
            "event_date": self.event_date.isoformat() if self.event_date else None,
        }
Z