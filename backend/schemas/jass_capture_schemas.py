from marshmallow import Schema, fields, validate

class JassCaptureSchema(Schema):
    mode = fields.Str(required=True, validate=validate.OneOf(["Jassgruppe", "Turnier", "Einzelspiel", "Liga"]))
    group_id = fields.Str(required=True)  # Änderung zu Str, da es als String gesendet wird
    players = fields.List(fields.Dict(), required=True, validate=validate.Length(equal=4))
    rosen10_player_id = fields.Int(required=True)
    date = fields.Str(required=True)  # Änderung zu Str, da es als ISO-formatierter String gesendet wird
    latitude = fields.Float(allow_none=True)
    longitude = fields.Float(allow_none=True)
    location_name = fields.Str(allow_none=True)
