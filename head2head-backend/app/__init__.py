from flask import Flask
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate


db = SQLAlchemy()
migrate = Migrate()


def create_app():
    app = Flask(__name__)
    app.config.from_object("app.config.Config")

    CORS(app)

    # Initialize extensions
    db.init_app(app)
    migrate.init_app(app, db)

    # Import models so they are registered with SQLAlchemy
    from app import models  # noqa: F401

    # Create tables on first run (safe if already exist)
    with app.app_context():
        db.create_all()

    # Register routes
    from app.routes import bp as api_bp
    app.register_blueprint(api_bp, url_prefix="/api")

    return app
