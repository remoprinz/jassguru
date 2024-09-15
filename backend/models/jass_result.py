from sqlalchemy import Column, Integer, ForeignKey
from sqlalchemy.orm import relationship
from extensions import db

class JassResults(db.Model):
    __tablename__ = 'jass_results'
    id = Column(Integer, primary_key=True)
    player_id = Column(Integer, ForeignKey('players.id'), nullable=False)
    team_id = Column(Integer, ForeignKey('teams.id'), nullable=False)
    game_id = Column(Integer, ForeignKey('games.id'), nullable=False)
    berg = Column(Integer, nullable=True)
    sieg = Column(Integer, nullable=True)
    matsch = Column(Integer, nullable=True)
    schniider = Column(Integer, nullable=True)
    kontermatsch = Column(Integer, nullable=True)
    points = Column(Integer, nullable=True)
    player = relationship("Player", back_populates="jass_results")
    team = relationship("Team", back_populates="jass_results")
    game = relationship("Game", back_populates="jass_results")

    def serialize(self):
        return {
            "id": self.id,
            "player_id": self.player_id,
            "team_id": self.team_id,
            "game_id": self.game_id,
            "berg": self.berg,
            "sieg": self.sieg,
            "matsch": self.matsch,
            "schniider": self.schniider,
            "kontermatsch": self.kontermatsch,
            "points": self.points
        }
