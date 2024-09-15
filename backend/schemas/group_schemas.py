from marshmallow import Schema, fields, validate

class GroupSchema(Schema):
    name = fields.Str(required=True, validate=validate.Length(min=2, max=25))

class GroupUpdateSchema(Schema):
    name = fields.Str(validate=validate.Length(min=2, max=25))