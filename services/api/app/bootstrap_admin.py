"""One-time administrator creation; credentials are never supplied as CLI arguments."""
import argparse
import getpass
import os
from app.config import settings
from app.services.auth import AuthService
from app.services.persistence import Repository

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--username',required=True)
    parser.add_argument('--display-name')
    args=parser.parse_args()
    password=os.environ.get('NETCIRCUIT_BOOTSTRAP_PASSWORD')
    if password is None:
        password=getpass.getpass('Administrator password: ')
        if password!=getpass.getpass('Repeat password: '): raise SystemExit('Passwords do not match.')
    repo=Repository(settings.database_url)
    try:
        AuthService(repo,settings).bootstrap_admin(args.username,password,args.display_name)
        print('Administrator created. Remove NETCIRCUIT_BOOTSTRAP_PASSWORD from the environment before starting the server.')
    finally: repo.close()

if __name__=='__main__': main()
