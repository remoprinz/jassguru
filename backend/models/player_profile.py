# models/player_profile.py

from sqlalchemy import Column, Integer, String, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from extensions import db
from models import jass_group_admins

class PlayerProfile(db.Model):
    __tablename__ = 'player_profiles'
    
    id = Column(Integer, primary_key=True)
    firebase_uid = Column(String(255), unique=True, nullable=True)
    email = Column(String(120), unique=True, nullable=False)
    profile_id = Column(Integer, ForeignKey('players.id'), unique=True)
    email_confirmed = Column(Boolean, default=False)

    player = relationship("Player", back_populates="profile")
    administered_groups = relationship('JassGroup', secondary=jass_group_admins, back_populates='admins', lazy='dynamic')

    def serialize(self):
        return {
            "id": self.id,
            "firebase_uid": self.firebase_uid,
            "email": self.email,
            "profile_id": self.profile_id,
            "email_confirmed": self.email_confirmed,
            "administered_group_ids": [group.id for group in self.administered_groups]
        }

    def is_email_confirmed(self):
        return self.email_confirmed

    def confirm_email(self):
        self.email_confirmed = True

    @property
    def get_player(self):
        return self.player

    @property
    def get_administered_groups(self):
        return self.administered_groups.all()
    