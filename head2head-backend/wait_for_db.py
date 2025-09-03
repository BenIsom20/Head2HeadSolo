import os
import time
import sys
from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError


def wait_for_db(url: str, timeout: int = 60, interval: float = 1.5) -> None:
    start = time.time()
    engine = create_engine(url, pool_pre_ping=True)
    while True:
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
                print("Database is ready.")
                return
        except OperationalError as e:
            elapsed = time.time() - start
            if elapsed > timeout:
                print(f"Timed out waiting for DB after {timeout}s: {e}")
                sys.exit(1)
            print("Waiting for DB...")
            time.sleep(interval)


if __name__ == "__main__":
    db_url = os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg2://app:app@db:5432/app",
    )
    wait_for_db(db_url)
