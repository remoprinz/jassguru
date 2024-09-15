from sqlalchemy import Column, Integer, String, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from extensions import db  # Stellen Sie sicher, dass "extensions" korrekt importiert wird

class JassGroup(db.Model):
    __tablename__ = 'jass_groups'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), unique=True, nullable=False)
    
    # Many-to-many relationships
    players = relationship("Player", secondary="player_jass_group", back_populates="jass_groups", lazy='dynamic')
    player_profiles = relationship("PlayerProfile", secondary="jass_group_player_profile", back_populates="jass_groups", lazy='dynamic')
    admins = relationship("PlayerProfile", secondary="jass_group_admins", back_populates="admin_jass_groups", lazy='dynamic')
    
    def serialize(self):
        return {
            "id": self.id,
            "name": self.name,
            "players": [player.id for player in self.players],
            "player_profiles": [profile.id for profile in self.player_profiles],
            "admins": [admin.id for admin in self.admins]
        }
