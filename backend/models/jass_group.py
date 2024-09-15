# models/jass_group.py

from sqlalchemy import Column, Integer, String, ForeignKey, Table, DateTime  # DateTime hinzugefügt
from sqlalchemy.orm import relationship
from extensions import db  # Stellen Sie sicher, dass "extensions" korrekt importiert wird
from models.relationship_tables import jass_group_admins, player_jass_group  # Import der Verknüpfungstabellen
from datetime import datetime  # Importieren der datetime-Bibliothek

# JassGroup Modell
class JassGroup(db.Model):
    __tablename__ = 'jass_groups'
    __table_args__ = {'extend_existing': True}
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), unique=True, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)  # Neue Spalte hinzugefügt

    # Viele-zu-Viele-Beziehung für Admins
    admins = db.relationship('PlayerProfile', secondary=jass_group_admins, lazy='subquery',
        back_populates='administered_groups')

    # Viele-zu-Viele-Beziehung für Spieler
    players = db.relationship('Player', secondary=player_jass_group, lazy='subquery',
        back_populates='jass_groups')

    # Serialisierungsfunktion
    def serialize(self):
        return {
            "id": self.id,
            "name": self.name,
            "created_at": self.created_at,  # Fügen Sie das Erstellungsdatum zur Serialisierung hinzu
            "admins": [admin.id for admin in self.admins],
            "players": [player.id for player in self.players]
        }
