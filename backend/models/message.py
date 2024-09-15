from datetime import datetime
from sqlalchemy import Column, Integer, ForeignKey, DateTime, Text
from sqlalchemy.orm import relationship
from extensions import db

class Message(db.Model):
    __tablename__ = 'messages'
    id = Column(Integer, primary_key=True)
    content = Column(Text, nullable=False)
    sender_id = Column(Integer, ForeignKey('players.id'), nullable=False)
    recipient_id = Column(Integer, ForeignKey('players.id'), nullable=False)
    timestamp = Column(DateTime, nullable=False, default=datetime.utcnow)
    sender = relationship("Player", foreign_keys=[sender_id], back_populates="messages_sent")
    recipient = relationship("Player", foreign_keys=[recipient_id], back_populates="messages_received")

    def serialize(self):
        return {
            "id": self.id,
            "content": self.content,
            "sender_id": self.sender_id,
            "recipient_id": self.recipient_id,
            "timestamp": self.timestamp.isoformat(),
        }
