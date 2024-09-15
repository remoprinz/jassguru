from extensions import db
import logging

# Initialize logging
logging.basicConfig(level=logging.DEBUG)

def save_to_db(model_instance):
    try:
        db.session.add(model_instance)
        db.session.commit()
    except Exception as e:
        logging.error(f"Error in save_to_db: {e}")
        db.session.rollback()
        raise

def delete_from_db(model_instance):
    try:
        db.session.delete(model_instance)
        db.session.commit()
    except Exception as e:
        logging.error(f"Error in delete_from_db: {e}")
        db.session.rollback()
        raise

def get_all(Model):
    try:
        return Model.query.all()
    except Exception as e:
        logging.error(f"Error in get_all: {e}")
        raise

def get_by_id(Model, _id):
    try:
        return Model.query.get(_id)
    except Exception as e:
        logging.error(f"Error in get_by_id: {e}")
        raise

def filter_by(Model, **kwargs):
    try:
        result = Model.query.filter_by(**kwargs).all()
        logging.debug(f"Filter result for model {Model} and kwargs {kwargs}: {result}")
        return result
    except Exception as e:
        logging.error(f"Error in filter_by: {e}")
        raise

# Weitere generische Funktionen können hier hinzugefügt werden, falls erforderlich.
