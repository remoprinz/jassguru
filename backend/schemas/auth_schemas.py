from marshmallow import Schema, fields, validate

class EmailRegistrationSchema(Schema):
    email = fields.Email(required=True, validate=validate.Email(error="Ungültige E-Mail-Adresse"))
    password = fields.Str(required=True, validate=validate.Length(min=8, error="Das Passwort muss mindestens 8 Zeichen lang sein"))

class JassnameRegistrationSchema(Schema):
    jassname = fields.Str(required=True, validate=validate.Length(min=3, max=50, error="Der Jassname muss zwischen 3 und 50 Zeichen lang sein"))
    token = fields.Str(required=True)

class LoginSchema(Schema):
    email = fields.Email(required=True, validate=validate.Email(error="Ungültige E-Mail-Adresse"))
    password = fields.Str(required=True)

class PasswordResetSchema(Schema):
    email = fields.Email(required=True, validate=validate.Email(error="Ungültige E-Mail-Adresse"))

class AddPlayerSchema(Schema):
    nickname = fields.Str(required=True, validate=validate.Length(min=3, max=50, error="Nickname muss zwischen 3 und 50 Zeichen lang sein"))
    inviteEmail = fields.Email(required=False, validate=validate.Email(error="Ungültige E-Mail-Adresse"))

class ConfirmAddedPlayerSchema(Schema):
    token = fields.Str(required=True)
    jassname = fields.Str(required=True, validate=validate.Length(min=3, max=50, error="Jassname muss zwischen 3 und 50 Zeichen lang sein"))
    password = fields.Str(required=True, validate=validate.Length(min=8, max=128, error="Passwort muss zwischen 8 und 128 Zeichen lang sein"))