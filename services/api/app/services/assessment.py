"""Assignment grading uses diagnostic evidence and never authorizes execution."""


class AssessmentService:
    def evaluate(self,assignment,topology,function):
        policy=(assignment or {}).get('assessment_policy','FUNCTIONAL_ONLY')
        if policy not in ('STRICT_TOPOLOGY','FUNCTIONAL_ONLY','TOPOLOGY_AND_FUNCTION'):
            raise ValueError('INVALID_ASSESSMENT_POLICY')
        topology_status=(topology or {}).get('status','UNKNOWN')
        function_status=(function or {}).get('status','NOT_EVALUATED')
        use_topology=policy!='FUNCTIONAL_ONLY'; use_function=policy!='STRICT_TOPOLOGY'
        topology_evaluated=use_topology and topology_status in ('MATCH','MISMATCH')
        function_evaluated=use_function and function_status!='NOT_EVALUATED'
        issues=[]
        if use_topology:
            issues.extend((topology or {}).get('issues',[]))
            if not topology_evaluated: issues.append('Topology evidence is unknown or ambiguous')
        if use_function:
            issues.extend((function or {}).get('issues',[]))
            if not function_evaluated: issues.append('Functional behavior has not been evaluated')
        if policy=='STRICT_TOPOLOGY':
            status={'MATCH':'PASS','MISMATCH':'FAIL'}.get(topology_status,'NOT_EVALUATED')
        elif policy=='FUNCTIONAL_ONLY': status=function_status
        elif topology_status=='MISMATCH' or function_status=='FAIL': status='FAIL'
        elif topology_status=='MATCH' and function_status=='PASS': status='PASS'
        elif function_status in ('NO_RESPONSE','PARTIAL'): status=function_status
        else: status='NOT_EVALUATED'
        return {'schema_version':'1.0','policy':policy,'status':status,
                'topology_evaluated':topology_evaluated,'function_evaluated':function_evaluated,
                'issues':list(dict.fromkeys(issues))}
