from marshmallow import Schema, fields, validate

class PlayerSchema(Schema):
    id = fields.Int(required=True)
    team = fields.Int(required=True, validate=validate.OneOf([1, 2]))

class JassCaptureSchema(Schema):
    mode = fields.Str(required=True, validate=validate.OneOf(["Jassgruppe", "Turnier", "Einzelspiel", "Liga"]))
    group_id = fields.Int(required=True)
    players = fields.List(fields.Nested(PlayerSchema), required=True, validate=validate.Length(equal=4))
    rosen10_player_id = fields.Int(required=True)
    start_date = fields.Date(required=True)
    latitude = fields.Float(allow_none=True)
    longitude = fields.Float(allow_none=True)
    location_name = fields.Str(allow_none=True)
