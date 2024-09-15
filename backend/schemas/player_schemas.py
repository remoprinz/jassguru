from marshmallow import Schema, fields, validate  # 'validate' hinzugefügt

class PlayerSchema(Schema):
    id = fields.Int(dump_only=True)
    nickname = fields.Str(required=True, validate=validate.Length(min=3, max=50))
    created_at = fields.DateTime()
    profile_id = fields.Int(dump_only=True)

class PlayerProfileSchema(Schema):
    id = fields.Int(dump_only=True)
    firebase_uid = fields.Str(required=True)
    email = fields.Email(required=True, validate=validate.Email(error="Invalid email"))
    player_id = fields.Int(dump_only=True)
