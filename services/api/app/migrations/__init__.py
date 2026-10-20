"""Alembic migrations; the version table is the startup authority."""
from pathlib import Path
from alembic import command
from alembic.config import Config

HEAD='0007_auth_maintenance'

def migrate(engine, revision='head'):
    config=Config()
    config.set_main_option('script_location',str(Path(__file__).parent))
    with engine.begin() as connection:
        config.attributes['connection']=connection
        command.upgrade(config,revision)
