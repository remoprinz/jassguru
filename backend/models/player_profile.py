# models/player_profile.py

from extensions import db  # Make sure "extensions" is correctly imported
from models.relationship_tables import jass_group_admins  # Import for jass_group_admins

class PlayerProfile(db.Model):
    __tablename__ = 'player_profiles'
    __table_args__ = {'extend_existing': True}
    
    id = db.Column(db.Integer, primary_key=True)
    firebase_uid = db.Column(db.String(255), unique=True, nullable=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    profile_id = db.Column(db.Integer, db.ForeignKey('players.id'))
    player = db.relationship("Player", back_populates="profile")
    
    # Use of the jass_group_admins linking table for the many-to-many relationship
    administered_groups = db.relationship('JassGroup', secondary=jass_group_admins, back_populates='admins')
    
    email_confirmed = db.Column(db.Boolean, default=False)

    def serialize(self):
        return {
            "id": self.id,
            "firebase_uid": self.firebase_uid,
            "profile_id": self.profile_id,
            "email": self.email,
            "email_confirmed": self.email_confirmed,
        }

    def is_email_confirmed(self):
        return self.email_confirmed

    def confirm_email(self):
        self.email_confirmed = True
        db.session.commit()  # Make sure db.session is correctly imported
