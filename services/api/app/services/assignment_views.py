"""One disclosure policy for legacy views and versioned authoring adapters."""
from copy import deepcopy

def is_author(context,policy):
    return bool(context and context.authenticated and (context.role=='ADMIN' or context.role=='INSTRUCTOR' and policy['owner_id']==context.principal_id))

def can_read(context,policy):
    return is_author(context,policy) or bool(context and context.principal_id and policy['published'])

def legacy_assignment_view(context,policy,definition):
    value=deepcopy(definition)
    if is_author(context,policy):
        return {**value,'document_kind':'instructor','owner_id':policy['owner_id'],'published':policy['published'],'feedback_policy':policy['feedback_policy']}
    allowed=('schema_version','assignment_id','title','lab_endpoints','assessment_policy')
    public={key:value[key] for key in allowed}
    public['lab_endpoints']=[{key:item[key] for key in ('endpoint_id','role','channel','required') if key in item} for item in value['lab_endpoints']]
    return {**public,'document_kind':'student','published':True,'feedback_policy':policy['feedback_policy']}
