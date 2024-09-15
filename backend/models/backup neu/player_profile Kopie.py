from datetime import datetime
from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Float
from sqlalchemy.orm import relationship
from werkzeug.security import generate_password_hash, check_password_hash
from extensions import db

player_jass_group = db.Table(
    "player_jass_group",
    db.Column("player_profile_id", db.Integer, db.ForeignKey("player_profiles.id"), primary_key=True),
    db.Column("jass_group_id", db.Integer, db.ForeignKey("jass_groups.id"), primary_key=True),
    extend_existing=True,
)

class PlayerProfile(db.Model):
    __tablename__ = 'player_profiles'
    id = Column(Integer, primary_key=True)
    player_id = Column(Integer, ForeignKey('players.id'))
    jass_groups = relationship("JassGroup", secondary=player_jass_group, back_populates="player_profiles", lazy='dynamic', overlaps="players")
    player = relationship("Player", back_populates="profile")
    password_hash = Column(String(128))
    created_at = Column(DateTime, default=datetime.utcnow)
    first_name = Column(String(120), nullable=True)
    last_name = Column(String(120), nullable=True)
    address = Column(String(255), nullable=True)
    house_number = Column(String(20), nullable=True)
    postal_code = Column(String(10), nullable=True)
    city = Column(String(120), nullable=True)
    email = Column(String(120), nullable=True)
    mobile = Column(String(20), nullable=True)
    attribute_1 = Column(Float, nullable=True)
    attribute_2 = Column(Float, nullable=True)
    attribute_3 = Column(Float, nullable=True)
    attribute_4 = Column(Float, nullable=True)
    attribute_5 = Column(Float, nullable=True)
    attribute_6 = Column(Float, nullable=True)
    attribute_7 = Column(Float, nullable=True)
    attribute_8 = Column(Float, nullable=True)
    attribute_9 = Column(Float, nullable=True)
    attribute_10 = Column(Float, nullable=True)

    @property
    def password(self):
        raise AttributeError('password: write-only field')

    @password.setter
    def password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def serialize(self):
        return {
            "id": self.id,
            "player_id": self.player_id,
            "first_name": self.first_name,
            "last_name": self.last_name,
            "address": self.address,
            "house_number": self.house_number,
            "postal_code": self.postal_code,
            "city": self.city,
            "email": self.email,
            "mobile": self.mobile,
            "jass_groups": [group.id for group in self.jass_groups],
            "attribute_1": self.attribute_1,
            "attribute_2": self.attribute_2,
            "attribute_3": self.attribute_3,
            "attribute_4": self.attribute_4,
            "attribute_5": self.attribute_5,
            "attribute_6": self.attribute_6,
            "attribute_7": self.attribute_7,
            "attribute_8": self.attribute_8,
            "attribute_9": self.attribute_9,
            "attribute_10": self.attribute_10,
        }
