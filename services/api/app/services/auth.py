"""Server-side authentication. Cookies are opaque credentials, never owner IDs."""
from dataclasses import dataclass, replace
import hashlib
import hmac
import re
import secrets
import time
import uuid
from threading import BoundedSemaphore
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError, InvalidHashError
from sqlalchemy import delete, insert, select, update
from sqlalchemy.exc import IntegrityError

COOKIE_NAME='netcircuit_session'
ROLES=('STUDENT','INSTRUCTOR','ADMIN')
_PASSWORD_WORKERS=BoundedSemaphore(4)

class AuthError(ValueError):
    def __init__(self,code,status=403):
        super().__init__(code); self.code=code; self.status=status

@dataclass(frozen=True)
class SessionContext:
    session_id: str
    principal_id: str|None
    owner_id: str|None
    role: str
    authenticated: bool
    csrf_token: str
    expires_at: float
    claimable_guest_id: str|None=None
    username: str|None=None
    display_name: str|None=None
    replaced_invalid_cookie: bool=False

class AuthService:
    def __init__(self,repository,configuration,*,clock=None):
        self.repo=repository; self.config=configuration; self.clock=clock or time.time
        self.hasher=PasswordHasher(); self._dummy_hash=self.hasher.hash(secrets.token_urlsafe(32))
        self._revoke_callback=lambda session_ids:None
        self._maintenance_after=None

    def set_revoke_callback(self,callback): self._revoke_callback=callback

    def _audit(self,db,actor,action,subject):
        db.execute(insert(self.repo.audit).values(occurred_at=self.clock(),actor_id=actor,action=action,subject_id=subject))

    def verify_origin(self,origin):
        if origin not in self.config.trusted_origins: raise AuthError('ORIGIN_REJECTED')

    def verify_mutation(self,context,origin,csrf_token):
        self.verify_origin(origin)
        if not context or not self.session_active(context.session_id): raise AuthError('SESSION_EXPIRED',401)
        if not isinstance(csrf_token,str) or not hmac.compare_digest(context.csrf_token.encode('utf-8'),csrf_token.encode('utf-8')): raise AuthError('CSRF_REJECTED')

    def _admit(self,bucket,limit,window):
        now=self.clock(); table=self.repo.rate_limits
        with self.repo.lock,self.repo.engine.begin() as db:
            row=db.execute(select(table).where(table.c.bucket==bucket)).mappings().first()
            if row and row['window_start']>now-window:
                if row['attempts']>=limit: raise AuthError('RATE_LIMITED',429)
                db.execute(update(table).where(table.c.bucket==bucket).values(attempts=row['attempts']+1))
            elif row: db.execute(update(table).where(table.c.bucket==bucket).values(window_start=now,attempts=1))
            else:
                # Fail closed at a finite number of live address buckets. Old
                # buckets are collected by maintenance, never a request scan.
                if db.execute(select(table.c.bucket).limit(1).offset(self.config.auth_rate_max_buckets-1)).first():
                    raise AuthError('RATE_LIMITED',429)
                db.execute(insert(table).values(bucket=bucket,window_start=now,attempts=1))

    def admit_bootstrap(self,client_address):
        key=hashlib.sha256(str(client_address).encode()).hexdigest()
        self._admit('bootstrap:'+key,self.config.bootstrap_limit,self.config.login_window_seconds)

    def maintain(self):
        """One indexed batch; credentials only, never principal/audit evidence."""
        now=self.clock(); batch=self.config.auth_maintenance_batch
        with self.repo.lock,self.repo.engine.begin() as db:
            sessions=self.repo.auth_sessions
            candidates=select(sessions.c.session_id,sessions.c.principal_id,sessions.c.expires_at).where(
                sessions.c.expires_at<=now-self.config.auth_retention_seconds
            )
            if self._maintenance_after is not None:
                expiry,identity=self._maintenance_after
                candidates=candidates.where((sessions.c.expires_at>expiry)|
                    ((sessions.c.expires_at==expiry)&(sessions.c.session_id>identity)))
            rows=list(db.execute(candidates.order_by(sessions.c.expires_at,sessions.c.session_id).limit(batch)).mappings())
            self._maintenance_after=(rows[-1]['expires_at'],rows[-1]['session_id']) if len(rows)==batch else None
            # Retain expired/revoked read-context tombstones while an original
            # legacy proof is live. Deleting them could let that same proof
            # silently recreate revoked authority. Both reads stay batch-bound.
            principals={row['principal_id'] for row in rows if row['principal_id'] is not None}
            legacy=self.repo.sessions
            retained=set(db.execute(select(legacy.c.session_id).where(legacy.c.session_id.in_(principals),legacy.c.expires_at>now)).scalars()) if principals else set()
            ids=[row['session_id'] for row in rows if row['principal_id'] not in retained]
            if ids: db.execute(delete(sessions).where(sessions.c.session_id.in_(ids)))
            limits=self.repo.rate_limits
            buckets=list(db.execute(select(limits.c.bucket).where(
                limits.c.window_start<=now-86400).order_by(limits.c.window_start,limits.c.bucket).limit(batch)).scalars())
            if buckets: db.execute(delete(limits).where(limits.c.bucket.in_(buckets)))
        return {'sessions_removed':len(ids),'rate_buckets_removed':len(buckets)}

    def _context(self,row,user=None):
        return SessionContext(row['session_id'],row['principal_id'],row['principal_id'],user['role'] if user else 'STUDENT',bool(user),row['csrf_token'],row['expires_at'],row['claimable_guest_id'],user['username'] if user else None,user['display_name'] if user else None)

    def _resolve(self,db,*,token_hash=None,session_id=None):
        table=self.repo.auth_sessions
        row=db.execute(select(table).where(table.c.token_hash==token_hash if token_hash else table.c.session_id==session_id)).mappings().first()
        if row is None or row['revoked'] or row['expires_at']<=self.clock(): return None
        user=None
        if row['principal_id']:
            user=db.execute(select(self.repo.auth_users).where(self.repo.auth_users.c.principal_id==row['principal_id'])).mappings().first()
            if user is None and not self.config.allow_guest: return None
            if user and (not user['active'] or user['auth_revision']!=row['auth_revision']): return None
        return self._context(row,user)

    def _live_context(self,db,context,*roles):
        current=self._resolve(db,session_id=context.session_id) if context else None
        if current is None: raise AuthError('SESSION_EXPIRED',401)
        if roles and (not current.authenticated or current.role not in roles): raise AuthError('FORBIDDEN')
        return current

    def require_principal_session(self,db,session_id,owner):
        """Fence authority and writes in one transaction across DB connections.

        The no-op write acquires SQLite's writer lock / PostgreSQL's session
        row lock. Revocation and guest claim must therefore happen entirely
        before or after the authorized mutation; TTL and revision are unchanged.
        """
        table=self.repo.auth_sessions
        matched=db.execute(update(table).where(table.c.session_id==session_id,
            table.c.revoked==False,table.c.expires_at>self.clock()).values(
                auth_revision=table.c.auth_revision).returning(table.c.session_id)).first()
        if matched is None: raise AuthError('SESSION_EXPIRED',401)
        context=self._resolve(db,session_id=session_id)
        if context is None or context.principal_id is None or context.owner_id!=owner:
            raise AuthError('SESSION_EXPIRED',401)
        return context

    def _consume_session(self,db,context):
        table=self.repo.auth_sessions
        result=db.execute(update(table).where(table.c.session_id==context.session_id,table.c.revoked==False,table.c.expires_at>self.clock()).values(revoked=True))
        if result.rowcount!=1: raise AuthError('SESSION_EXPIRED',401)

    def current(self,cookie):
        if not isinstance(cookie,str) or not cookie or len(cookie)>256: return None
        with self.repo.lock,self.repo.engine.connect() as db:
            return self._resolve(db,token_hash=hashlib.sha256(cookie.encode()).hexdigest())

    def session_active(self,session_id):
        with self.repo.lock,self.repo.engine.connect() as db: return self._resolve(db,session_id=session_id) is not None

    def _new_session(self,db,principal_id=None,*,claimable_guest_id=None,expires_at=None,session_id=None):
        token=secrets.token_urlsafe(32); session_id=session_id or uuid.uuid4().hex
        revision=0
        if principal_id:
            revision=db.execute(select(self.repo.auth_users.c.auth_revision).where(self.repo.auth_users.c.principal_id==principal_id)).scalar_one_or_none() or 0
        deadline=self.clock()+self.config.session_ttl_seconds
        if expires_at is not None:deadline=min(deadline,expires_at)
        row={'session_id':session_id,'token_hash':hashlib.sha256(token.encode()).hexdigest(),'principal_id':principal_id,'csrf_token':secrets.token_urlsafe(32),'expires_at':deadline,'revoked':False,'auth_revision':revision,'claimable_guest_id':claimable_guest_id}
        db.execute(insert(self.repo.auth_sessions).values(**row))
        user=db.execute(select(self.repo.auth_users).where(self.repo.auth_users.c.principal_id==principal_id)).mappings().first() if principal_id else None
        return self._context(row,user),token

    def _guest(self,db):
        principal=None
        if self.config.allow_guest:
            principal=uuid.uuid4().hex
            db.execute(insert(self.repo.auth_principals).values(principal_id=principal,kind='GUEST',created_at=self.clock()))
        return self._new_session(db,principal)

    def ensure_session(self,cookie,*,consume_legacy=True,allow_create=True):
        context=self.current(cookie)
        if context: return context,None
        with self.repo.lock,self.repo.engine.begin() as db:
            # A still-valid legacy cookie proves ownership only of that guest's data.
            expiry=db.execute(select(self.repo.sessions.c.expires_at).where(self.repo.sessions.c.session_id==cookie)).scalar_one_or_none() if cookie else None
            if self.config.allow_guest and expiry is not None and expiry>self.clock():
                principal=db.execute(select(self.repo.auth_principals.c.principal_id).where(self.repo.auth_principals.c.principal_id==cookie)).scalar_one_or_none()
                if principal is None: db.execute(insert(self.repo.auth_principals).values(principal_id=cookie,kind='GUEST',created_at=self.clock()))
                # Ordinary reads need a live internal context for final capture
                # authorization, but cannot install its opaque credential. Keep
                # the one-time proof until explicit session bootstrap can do so.
                if consume_legacy:
                    consumed=db.execute(delete(self.repo.sessions).where(self.repo.sessions.c.session_id==cookie,self.repo.sessions.c.expires_at>self.clock()))
                    if consumed.rowcount!=1:
                        context,token=self._guest(db)
                        return replace(context,replaced_invalid_cookie=True),token
                else:
                    # One revocable read context for each still-valid legacy
                    # proof; repeated ordinary reads do not mint credentials.
                    internal=uuid.uuid5(uuid.NAMESPACE_URL,'netcircuit-legacy-read:'+cookie).hex
                    current=self._resolve(db,session_id=internal)
                    if current: return current,None
                    if db.execute(select(self.repo.auth_sessions.c.session_id).where(self.repo.auth_sessions.c.session_id==internal)).first():
                        # Expiry/revocation is a lookup failure, not permission
                        # to refresh the same deterministic session. Explicit
                        # bootstrap can still consume the original proof.
                        return None,None
                    return self._new_session(db,cookie,expires_at=expiry,session_id=internal)[0],None
                return self._new_session(db,cookie)
            if not allow_create: return None,None
            context,token=self._guest(db)
            return replace(context,replaced_invalid_cookie=cookie is not None),token

    def view(self,context):
        principal=None
        if context.principal_id:
            principal={'principal_id':context.principal_id,'kind':'USER' if context.authenticated else 'GUEST','role':context.role}
            if context.username is not None: principal['username']=context.username
            if context.display_name is not None: principal['display_name']=context.display_name
        return {'schema_version':'1.0','authenticated':context.authenticated,'principal':principal,'csrf_token':context.csrf_token,'expires_at':context.expires_at,'guest_enabled':self.config.allow_guest,'claim_available':bool(context.authenticated and context.claimable_guest_id)}

    def require_role(self,context,*roles):
        if not context or not context.authenticated: raise AuthError('FORBIDDEN')
        if not self.session_active(context.session_id): raise AuthError('SESSION_EXPIRED',401)
        if context.role not in roles: raise AuthError('FORBIDDEN')

    def _credentials(self,username,password):
        if not isinstance(username,str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.@-]{2,63}',username): raise AuthError('INVALID_USERNAME',422)
        if not isinstance(password,str) or not 12<=len(password)<=1024: raise AuthError('INVALID_PASSWORD',422)

    def _public_user(self,row): return {key:row[key] for key in ('principal_id','username','display_name','role','active')}

    def _create_user(self,username,password,role,display_name,actor):
        self._credentials(username,password)
        if role not in ROLES: raise AuthError('INVALID_ROLE',422)
        display_name=display_name or username
        if not isinstance(display_name,str) or not 1<=len(display_name)<=128: raise AuthError('INVALID_DISPLAY_NAME',422)
        principal=uuid.uuid4().hex
        value={'principal_id':principal,'username':username,'username_key':username.casefold(),'display_name':display_name,'password_hash':self.hasher.hash(password),'role':role,'active':True,'auth_revision':0}
        try:
            with self.repo.lock,self.repo.engine.begin() as db:
                if actor is not None: actor=self._live_context(db,actor,'ADMIN')
                elif db.execute(select(self.repo.auth_users.c.principal_id).where(self.repo.auth_users.c.role=='ADMIN')).first(): raise AuthError('BOOTSTRAP_ALREADY_COMPLETE',409)
                db.execute(insert(self.repo.auth_principals).values(principal_id=principal,kind='USER',created_at=self.clock()))
                db.execute(insert(self.repo.auth_users).values(**value)); self._audit(db,actor.principal_id if actor else None,'USER_CREATED',principal)
        except IntegrityError: raise AuthError('USERNAME_EXISTS',409) from None
        return self._public_user(value)

    def bootstrap_admin(self,username,password,display_name=None):
        with self.repo.lock:
            with self.repo.engine.connect() as db:
                if db.execute(select(self.repo.auth_users.c.principal_id).where(self.repo.auth_users.c.role=='ADMIN')).first(): raise AuthError('BOOTSTRAP_ALREADY_COMPLETE',409)
            return self._create_user(username,password,'ADMIN',display_name,None)

    def create_user(self,username,password,*,role='STUDENT',display_name=None,actor=None):
        self.require_role(actor,'ADMIN')
        return self._create_user(username,password,role,display_name,actor)

    def list_users(self,actor):
        self.require_role(actor,'ADMIN')
        with self.repo.lock,self.repo.engine.connect() as db: return [self._public_user(row) for row in db.execute(select(self.repo.auth_users).order_by(self.repo.auth_users.c.username_key)).mappings()]

    def login(self,context,username,password,client_address=''):
        address_key=hashlib.sha256(str(client_address).encode()).hexdigest()
        self._admit('login-address:'+address_key,self.config.login_limit,self.config.login_window_seconds)
        key=hashlib.sha256((str(client_address)+'|'+str(username).casefold()).encode()).hexdigest()
        self._admit('login:'+key,self.config.login_limit,self.config.login_window_seconds)
        with self.repo.lock,self.repo.engine.connect() as db:
            user=db.execute(select(self.repo.auth_users).where(self.repo.auth_users.c.username_key==str(username).casefold())).mappings().first()
        with _PASSWORD_WORKERS:
            try: valid=self.hasher.verify(user['password_hash'] if user else self._dummy_hash,password)
            except (VerifyMismatchError,VerificationError,InvalidHashError,TypeError): valid=False
        if not valid or not user or not user['active']: raise AuthError('INVALID_CREDENTIALS',401)
        if not self.session_active(context.session_id): raise AuthError('SESSION_EXPIRED',401)
        with self.repo.lock,self.repo.engine.begin() as db:
            context=self._live_context(db,context)
            if self.hasher.check_needs_rehash(user['password_hash']): db.execute(update(self.repo.auth_users).where(self.repo.auth_users.c.principal_id==user['principal_id']).values(password_hash=self.hasher.hash(password)))
            fresh_user=db.execute(select(self.repo.auth_users).where(self.repo.auth_users.c.principal_id==user['principal_id'])).mappings().first()
            if not fresh_user or not fresh_user['active'] or fresh_user['auth_revision']!=user['auth_revision']: raise AuthError('INVALID_CREDENTIALS',401)
            self._consume_session(db,context)
            claim=context.claimable_guest_id or (context.principal_id if not context.authenticated else None)
            result=self._new_session(db,user['principal_id'],claimable_guest_id=claim)
            self._audit(db,user['principal_id'],'LOGIN',user['principal_id'])
        self._revoke_callback([context.session_id]); return result

    def logout(self,context):
        with self.repo.lock,self.repo.engine.begin() as db:
            context=self._live_context(db,context)
            self._consume_session(db,context)
            self._audit(db,context.principal_id,'LOGOUT',context.principal_id or 'anonymous')
            result=self._guest(db)
        self._revoke_callback([context.session_id]); return result

    def update_user(self,principal_id,changes,*,actor):
        self.require_role(actor,'ADMIN')
        if set(changes)-{'role','active'} or not changes: raise AuthError('INVALID_USER_UPDATE',422)
        if 'role' in changes and changes['role'] not in ROLES: raise AuthError('INVALID_ROLE',422)
        if 'active' in changes and type(changes['active']) is not bool: raise AuthError('INVALID_USER_UPDATE',422)
        with self.repo.lock,self.repo.engine.begin() as db:
            actor=self._live_context(db,actor,'ADMIN')
            user=db.execute(select(self.repo.auth_users).where(self.repo.auth_users.c.principal_id==principal_id)).mappings().first()
            if not user: raise AuthError('USER_NOT_FOUND',404)
            if user['role']=='ADMIN' and (changes.get('role','ADMIN')!='ADMIN' or changes.get('active') is False):
                admins=db.execute(select(self.repo.auth_users.c.principal_id).where(self.repo.auth_users.c.role=='ADMIN',self.repo.auth_users.c.active==True)).all()
                if user['active'] and len(admins)<=1: raise AuthError('LAST_ADMIN_REQUIRED',409)
            revoked=list(db.execute(select(self.repo.auth_sessions.c.session_id).where(self.repo.auth_sessions.c.principal_id==principal_id,self.repo.auth_sessions.c.revoked==False)).scalars())
            db.execute(update(self.repo.auth_users).where(self.repo.auth_users.c.principal_id==principal_id).values(**changes,auth_revision=user['auth_revision']+1))
            db.execute(update(self.repo.auth_sessions).where(self.repo.auth_sessions.c.principal_id==principal_id).values(revoked=True))
            self._audit(db,actor.principal_id,'USER_UPDATED',principal_id)
            result=self._public_user({**user,**changes})
        self._revoke_callback(revoked); return result

    def claim_guest(self,context,confirm):
        if confirm is not True or not context.authenticated or not context.claimable_guest_id: raise AuthError('GUEST_CLAIM_UNAVAILABLE',409)
        guest=context.claimable_guest_id
        with self.repo.lock,self.repo.engine.begin() as db:
            context=self._live_context(db,context)
            if not context.authenticated or context.claimable_guest_id!=guest: raise AuthError('GUEST_CLAIM_UNAVAILABLE',409)
            self._consume_session(db,context)
            # Lease presence includes quarantines and stale leases pending recovery.
            ids=list(db.execute(select(self.repo.experiments.c.experiment_id).where(self.repo.experiments.c.owner_id==guest)).scalars())
            if ids and db.execute(select(self.repo.lease_table.c.experiment_id).where(self.repo.lease_table.c.experiment_id.in_(ids))).first(): raise AuthError('GUEST_CLAIM_ACTIVE_LEASE',409)
            rows=db.execute(select(self.repo.experiments.c.payload).where(self.repo.experiments.c.owner_id==guest)).scalars()
            if any(row.get('state') not in ('CREATED','COMPLETE','FAULT') for row in rows): raise AuthError('GUEST_CLAIM_ACTIVE_LEASE',409)
            try:
                db.execute(update(self.repo.operations).where(self.repo.operations.c.owner_id==guest).values(owner_id=context.principal_id))
                db.execute(update(self.repo.experiments).where(self.repo.experiments.c.owner_id==guest).values(owner_id=context.principal_id))
                # Ownership changes cascade to documents via the composite
                # project/owner FK. Historical saved_by remains an audit fact.
                db.execute(update(self.repo.projects).where(self.repo.projects.c.owner_id==guest).values(owner_id=context.principal_id))
            except IntegrityError: raise AuthError('GUEST_CLAIM_CONFLICT',409) from None
            revoked=list(db.execute(select(self.repo.auth_sessions.c.session_id).where((self.repo.auth_sessions.c.principal_id==guest)|(self.repo.auth_sessions.c.session_id==context.session_id))).scalars())
            db.execute(update(self.repo.auth_sessions).where(self.repo.auth_sessions.c.session_id.in_(revoked)).values(revoked=True))
            self._audit(db,context.principal_id,'GUEST_CLAIMED',guest)
            result=self._new_session(db,context.principal_id)
        self._revoke_callback(revoked); return result

    def authorize_assignment(self,context,assignment_id):
        policy=self.repo.assignment_policy(assignment_id)
        if context and context.authenticated and (context.role=='ADMIN' or (context.role=='INSTRUCTOR' and policy['owner_id']==context.principal_id)): return policy
        if context and context.principal_id and policy['published']: return policy
        raise AuthError('FORBIDDEN')

    def assignment_view(self,context,assignment_id):
        policy=self.authorize_assignment(context,assignment_id); value=self.repo.get_assignment(assignment_id)
        from app.services.assignment_views import legacy_assignment_view
        return legacy_assignment_view(context,policy,value)
