"""Run versioned upgrades before production startup: python -m app.migrate."""
import argparse
from sqlalchemy import create_engine, text
from app.config import settings
from app.migrations import HEAD, migrate

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check',action='store_true')
    args=parser.parse_args(); engine=create_engine(settings.database_url)
    try:
        if args.check:
            with engine.connect() as db:
                if db.execute(text('SELECT version_num FROM alembic_version')).scalar()!=HEAD: raise SystemExit('Database schema is not current; run python -m app.migrate.')
        else: migrate(engine)
    finally: engine.dispose()

if __name__=='__main__': main()
