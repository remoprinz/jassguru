from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from extensions import db
from models.relationship_tables import player_jass_group

class Player(db.Model):
    __tablename__ = 'players'
    __table_args__ = {'extend_existing': True}
    
    id = db.Column(db.Integer, primary_key=True)
    firebase_uid = db.Column(db.String(120), unique=True, nullable=True)  # Nullable für Gastspieler
    nickname = db.Column(db.String(120), nullable=False, unique=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    is_guest = db.Column(db.Boolean, default=False)  # Neues Feld für Gastspieler
    
    invited_by = db.Column(db.String(120), nullable=True)
    profile = relationship("PlayerProfile", back_populates="player", uselist=False)
    jass_groups = relationship('JassGroup', secondary=player_jass_group, back_populates='players')
    
    def serialize(self):
        return {
            "id": self.id,
            "firebase_uid": self.firebase_uid,
            "nickname": self.nickname,
            "created_at": self.created_at.isoformat(),
            "is_guest": self.is_guest,
            "invited_by": self.invited_by,
            "jass_groups": [group.id for group in self.jass_groups]
        }