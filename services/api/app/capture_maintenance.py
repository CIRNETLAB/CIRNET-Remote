"""Run one bounded retention batch without initializing hardware or recovery."""
import argparse
import json
from app.config import Settings
from app.services.persistence import Repository
from app.services.capture_store import FilesystemCaptureStore
from app.services.capture_maintenance import expire_payloads
from app.services.observability import configure_logging,flush_logging

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--limit',type=int,default=100)
    parser.add_argument('--dry-run',action='store_true')
    options=parser.parse_args();configure_logging();config=Settings();repository=Repository(config.database_url)
    try:
        store=FilesystemCaptureStore(config.capture_dir,max_bytes=config.capture_max_bytes,max_files=config.capture_max_files)
        report=expire_payloads(repository,store,retention_seconds=config.capture_retention_seconds,limit=options.limit,dry_run=options.dry_run)
        print(json.dumps(report,sort_keys=True))
        return 1 if report['failed'] else 0
    finally:repository.close();flush_logging()

if __name__=='__main__':raise SystemExit(main())
