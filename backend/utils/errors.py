# errors.py

class ValidationError(Exception):
    """Raised when validation of request data fails."""
    pass

class AuthenticationError(Exception):
    """Raised when authentication fails."""
    pass

class ResourceNotFoundError(Exception):
    """Raised when a requested resource is not found."""
    pass

class ConflictError(Exception):
    """Raised when a conflict occurs, e.g., duplicate data."""
    pass

class TokenExpiredError(Exception):
    """Raised when the token is expired."""
    pass

class GroupError(Exception):
    """Raised when a group-related operation fails."""
    pass

class CustomException(Exception):
    def __init__(self, code, message):
        self.code = code
        self.message = message
        super().__init__(self.message)
