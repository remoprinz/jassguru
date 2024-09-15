from datetime import datetime
from sqlalchemy import Column, Integer, ForeignKey, DateTime
from extensions import db

# M:N Tables
player_jass_group = db.Table('player_jass_group',
    db.Column('player_id', db.Integer, db.ForeignKey('players.id'), primary_key=True),
    db.Column('jass_group_id', db.Integer, db.ForeignKey('jass_groups.id'), primary_key=True),
    db.Column('joined_at', db.DateTime, default=datetime.utcnow)
)

jass_group_player_profile = db.Table('jass_group_player_profile',
    db.Column('jass_group_id', db.Integer, db.ForeignKey('jass_groups.id'), primary_key=True),
    db.Column('player_profile_id', db.Integer, db.ForeignKey('player_profiles.id'), primary_key=True),
    db.Column('joined_at', db.DateTime, default=datetime.utcnow)
)

# New M:N Table for Admins
jass_group_admins = db.Table('jass_group_admins',
    db.Column('player_profile_id', db.Integer, db.ForeignKey('player_profiles.id'), primary_key=True),
    db.Column('jass_group_id', db.Integer, db.ForeignKey('jass_groups.id'), primary_key=True),
    db.Column('joined_at', db.DateTime, default=datetime.utcnow)
)
