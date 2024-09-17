# models/weis.py

from sqlalchemy import Column, Integer, ForeignKey, Enum as SQLAlchemyEnum
from sqlalchemy.orm import relationship
from extensions import db
from enum import Enum

class WeisTyp(Enum):
    DREI_BLATT = 'Drei Blatt'
    VIER_BLATT = 'Vier Blatt'
    FUENF_BLATT = 'Fünf Blatt'
    SECHS_BLATT = 'Sechs Blatt'
    SIEBEN_BLATT = 'Sieben Blatt'
    ACHT_BLATT = 'Acht Blatt'
    NEUN_BLATT = 'Neun Blatt'
    VIER_GLEICHE = 'Vier Gleiche'
    VIER_NELL = 'Vier Nell'
    VIER_PUURE = 'Vier Puure'

class Weis(db.Model):
    __tablename__ = 'weise'
    
    id = Column(Integer, primary_key=True)
    runde_id = Column(Integer, ForeignKey('runden.id'), nullable=False)
    player_id = Column(Integer, ForeignKey('players.id'), nullable=False)
    typ = Column(SQLAlchemyEnum(WeisTyp), nullable=False)
    anzahl = Column(Integer, default=1)  # Anzahl der gleichen Weise, z.B. 2x Dreiblatt
    punkte = Column(Integer, nullable=False)

    runde = relationship("Runde", back_populates="weise")
    player = relationship("Player")

    def serialize(self):
        return {
            "id": self.id,
            "runde_id": self.runde_id,
            "player_id": self.player_id,
            "typ": self.typ.value,
            "anzahl": self.anzahl,
            "punkte": self.punkte
        }

    @property
    def get_runde(self):
        return self.runde

    @property
    def get_player(self):
        return self.player

    def update_runde_score(self):
        self.runde.update_spiel_scores()