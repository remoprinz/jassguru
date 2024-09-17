# models/runde.py

from sqlalchemy import Column, Integer, ForeignKey, String, Float, Boolean, Enum as SQLAlchemyEnum
from sqlalchemy.orm import relationship
from extensions import db
from enum import Enum

class Farbe(Enum):
    SCHAELLE = 'Schälle'
    SCHILTE = 'Schilte'
    ROSE = 'Rose'
    EICHLE = 'Eichle'
    OBENABE = 'Obenabe'
    UNDENUFE = 'Undenufe'
    QUAER = 'Quär'
    SLALOM = 'Slalom'
    GUSCHTI = 'Guschti'
    MISERE = 'Misère'
    MISERE_MISERE = 'Misère-Misère'

class Runde(db.Model):
    __tablename__ = 'runden'
    
    id = Column(Integer, primary_key=True)
    spiel_id = Column(Integer, ForeignKey('spiele.id'), nullable=False)
    farbe = Column(SQLAlchemyEnum(Farbe), nullable=False)
    team1_score = Column(Integer, default=0)
    team2_score = Column(Integer, default=0)
    multiplier = Column(Float, default=1.0)
    
    # Stöck für jeden Spieler
    stoeck_team1_player1 = Column(Boolean, default=False)
    stoeck_team1_player2 = Column(Boolean, default=False)
    stoeck_team2_player1 = Column(Boolean, default=False)
    stoeck_team2_player2 = Column(Boolean, default=False)

    spiel = relationship("Spiel", back_populates="runden")
    weise = relationship("Weis", back_populates="runde", cascade="all, delete-orphan")

    def serialize(self):
        return {
            "id": self.id,
            "spiel_id": self.spiel_id,
            "farbe": self.farbe.value,
            "team1_score": self.team1_score,
            "team2_score": self.team2_score,
            "multiplier": self.multiplier,
            "stoeck_team1_player1": self.stoeck_team1_player1,
            "stoeck_team1_player2": self.stoeck_team1_player2,
            "stoeck_team2_player1": self.stoeck_team2_player1,
            "stoeck_team2_player2": self.stoeck_team2_player2,
            "weise_count": len(self.weise)
        }

    @property
    def get_weise(self):
        return self.weise

    def add_weis(self, weis):
        self.weise.append(weis)

    def set_stoeck(self, team, player):
        if team == 1:
            if player == 1:
                self.stoeck_team1_player1 = True
            elif player == 2:
                self.stoeck_team1_player2 = True
        elif team == 2:
            if player == 1:
                self.stoeck_team2_player1 = True
            elif player == 2:
                self.stoeck_team2_player2 = True

    def calculate_total_score(self):
        base_score = self.team1_score + self.team2_score
        weis_score = sum(weis.punkte * weis.anzahl for weis in self.weise)
        stoeck_score = (self.stoeck_team1_player1 + self.stoeck_team1_player2 + 
                        self.stoeck_team2_player1 + self.stoeck_team2_player2) * 20
        return (base_score + weis_score + stoeck_score) * self.multiplier

    def update_spiel_scores(self):
        self.spiel.update_scores()