# models/relationship_tables.py
from extensions import db

# Admin von Gruppen
jass_group_admins = db.Table('jass_group_admins',
    db.Column('firebase_uid', db.String(255), db.ForeignKey('player_profiles.firebase_uid'), primary_key=True),
    db.Column('jass_group_id', db.Integer, db.ForeignKey('jass_groups.id'), primary_key=True)
)

# Die Gruppen von Spieler
player_jass_group = db.Table('player_jass_group',
    db.Column('player_id', db.Integer, db.ForeignKey('players.id'), primary_key=True),
    db.Column('jass_group_id', db.Integer, db.ForeignKey('jass_groups.id'), primary_key=True)
)

jass_capture_players = db.Table('jass_capture_players',
    db.Column('jass_capture_id', db.Integer, db.ForeignKey('jass_captures.id'), primary_key=True),
    db.Column('player_id', db.Integer, db.ForeignKey('players.id'), primary_key=True)
)
