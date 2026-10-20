"""Bounded owner-scoped relational history with explicit active snapshot paging."""
import base64
from copy import deepcopy
import json
from sqlalchemy import and_,case,or_,select

MAX_SEQUENCE=9007199254740991


def _cursor(value,owner,kind):
    if value is None:return None
    try:
        if not isinstance(value,str) or not value or len(value)>1024:raise ValueError()
        item=json.loads(base64.b64decode(value+'='*((-len(value))%4),altchars=b'-_',validate=True))
        if (not isinstance(item,dict) or set(item)!={'v','owner','kind','after','priority'}
                or type(item['v']) is not int or item['v']!=1 or item['owner']!=owner or item['kind']!=kind
                or type(item['after']) is not int or not 1<=item['after']<=MAX_SEQUENCE
                or type(item['priority']) is not int or item['priority'] not in (0,1)
                or kind=='history' and item['priority']!=1):raise ValueError()
        return item
    except (ValueError,TypeError,UnicodeError):raise ValueError('INVALID_CURSOR') from None


def page_experiments(repository,owner,*,limit=50,cursor=None,active=False):
    if type(limit) is not int or not 1<=limit<=100:raise ValueError('INVALID_PAGE_LIMIT')
    kind='active' if active else 'history';after=_cursor(cursor,owner,kind)
    table=repository.experiments;leases=repository.lease_table
    runtime=repository.experiment_runtime
    state=runtime.c.state
    held=select(leases.c.experiment_id).where(leases.c.experiment_id==table.c.experiment_id).exists()
    priority=case((and_(state=='CREATED',~held),0),else_=1) if active else case((table.c.sequence>0,1),else_=1)
    query=select(table.c.sequence,table.c.payload,priority.label('priority')).select_from(
        table.join(runtime,table.c.experiment_id==runtime.c.experiment_id)).where(table.c.owner_id==owner)
    if active:query=query.where(or_(state.not_in(('COMPLETE','FAULT')),held))
    if after:
        query=query.where(or_(priority<after['priority'],and_(priority==after['priority'],table.c.sequence<after['after'])))
    query=query.order_by(priority.desc(),table.c.sequence.desc()).limit(limit+1)
    with repository.lock,repository.engine.connect() as db:rows=list(db.execute(query).mappings())
    next_cursor=None
    if len(rows)>limit:
        last=rows[limit-1]
        value={'v':1,'kind':kind,'owner':owner,'after':last['sequence'],'priority':last['priority']}
        next_cursor=base64.urlsafe_b64encode(json.dumps(value,separators=(',',':')).encode()).decode().rstrip('=')
    return deepcopy([row['payload'] for row in rows[:limit]]),next_cursor
