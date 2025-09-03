import os


class Config:
    SQLALCHEMY_DATABASE_URI = os.getenv(
        "DATABASE_URL",
        # Default to Postgres service in docker-compose
        "postgresql+psycopg2://app:app@db:5432/app",
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    # Optional: echo SQL queries for debugging
    SQLALCHEMY_ECHO = os.getenv("SQLALCHEMY_ECHO", "false").lower() == "true"
