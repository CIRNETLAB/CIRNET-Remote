"""Real API + Hardware Service for browser gates; isolated database and no driver doubles."""
import os
import sys
from threading import Event, Thread
import uvicorn
from artifact_paths import artifact_directory, validate_artifact_directory

def wait_for_pipe_eof(descriptor):
    """Wait for our parent's pipe without holding a blocking stdin read.

    A pending Windows CRT read on stdin prevents the simulation worker from
    completing its spawn bootstrap. Poll pipe readiness before reading instead.
    """
    if os.name=='nt':
        import _winapi
        import msvcrt
        handle=msvcrt.get_osfhandle(descriptor)
        interval=Event()
        while True:
            try:available=_winapi.PeekNamedPipe(handle)[0]
            except BrokenPipeError:return
            if available:
                if not os.read(descriptor,min(available,4096)):return
            else:interval.wait(.05)
    else:
        import select
        while True:
            readable,_,_=select.select([descriptor],[],[],.05)
            if readable and not os.read(descriptor,4096):return

def main():
    session=artifact_directory()
    data=validate_artifact_directory(os.environ['NETCIRCUIT_E2E_DATA_DIR'])
    if data==session or not data.is_relative_to(session): raise ValueError('E2E data must stay inside its owned external artifact session')
    data.mkdir(parents=True,exist_ok=True)
    os.environ['NETCIRCUIT_DATABASE_URL']='sqlite:///'+(data/'application.db').as_posix()
    os.environ['NETCIRCUIT_CAPTURE_DIR']=str(data/'captures')
    os.environ['NETCIRCUIT_ENV']='development'
    os.environ['NETCIRCUIT_ALLOW_GUEST']='true'
    os.environ['NETCIRCUIT_TRUSTED_ORIGINS']='http://127.0.0.1:14173'
    http_port=int(os.environ.get('NETCIRCUIT_E2E_HTTP_PORT','18181'))
    rpc_port=int(os.environ.get('NETCIRCUIT_E2E_RPC_PORT','15151'))
    if not 1<=http_port<=65535 or not 1<=rpc_port<=65535:raise ValueError('E2E ports must be valid loopback ports.')
    os.environ['NETCIRCUIT_HARDWARE_GRPC_TARGET']=f'127.0.0.1:{rpc_port}'
    from app.config import Settings
    from app.services.persistence import Repository
    from app.services.auth import AuthService,AuthError
    configuration=Settings()
    repository=Repository(configuration.database_url)
    try:
        try: AuthService(repository,configuration).bootstrap_admin('e2e_admin',os.environ['NETCIRCUIT_E2E_ADMIN_PASSWORD'],'Test Administrator')
        except AuthError as error:
            if error.code!='BOOTSTRAP_ALREADY_COMPLETE': raise
    finally: repository.close()
    from hardware_service.server import build_server
    from hardware_service.station.virtual import close_simulation_pool
    from app.main import create_app
    server=build_server()
    if not server.add_insecure_port(f'127.0.0.1:{rpc_port}'): raise RuntimeError('E2E hardware port is unavailable')
    server.start()
    application=uvicorn.Server(uvicorn.Config(create_app(configuration=configuration,lazy=True),host='127.0.0.1',port=http_port,log_level='warning'))
    def parent_lifetime():
        # The test runner owns this pipe. EOF requests an orderly API/RPC/worker shutdown.
        wait_for_pipe_eof(sys.stdin.fileno())
        application.should_exit=True
    Thread(target=parent_lifetime,daemon=True).start()
    try: application.run()
    finally:
        server.stop(0).wait()
        close_simulation_pool()

if __name__=='__main__': main()
