from contracts.validation import validate
from bisect import bisect_right
from collections import defaultdict, Counter
from app.services.topology_resolver import TopologyResolver, ElectricalNets, known

def result(status,issues=None):
    return {"schema_version":"1.0","status":status,"issues":issues or []}

class SafetyVerificationService:
    def verify(self,evidence):
        return validate("SafetyVerificationResult",evidence)

class TopologyVerificationService:
    def verify(self,assignment,observed,resolution=None):
        observed=validate("DetectedTopologyGraph",observed)
        assignment=assignment or {}; reference=assignment.get('reference_topology_graph')
        resolution=resolution or TopologyResolver().resolve(assignment,observed)
        components=observed['components']; unknown=[c for c in components if not known(c)]
        expected=Counter(assignment.get('expected_component_set',
                                        [c['identity'] for c in (reference or {}).get('components',[])]))
        actual=Counter(c['identity'] for c in components if known(c))
        missing=expected-actual; unexpected=actual-expected if expected or reference else Counter()
        details={'matched_components':resolution['component_matches'],
                 'missing_components':[{'identity':identity,'count':count} for identity,count in sorted(missing.items())],
                 'unexpected_components':[{'identity':identity,'count':count} for identity,count in sorted(unexpected.items())],
                 'unknown_components':[{'identity':'UNKNOWN','component_id':c['component_id']} for c in unknown],
                 'matched_nets':[],'missing_nets':[],'unexpected_nets':[],'shorted_nets':[],
                 'pin_mapping_issues':[],'orientation_differences':[],'pin_mapping_differences':[]}
        issues=[]; mismatch=bool(unexpected or (missing and not unknown)); complete=False
        if missing or unexpected: issues.append('Component quantities differ from reference')
        if unknown: issues.append('Component identity unresolved')
        if reference and resolution['component_matches']:
            ref_nets,actual_nets=ElectricalNets(reference),ElectricalNets(observed)
            rename={m['observed_component_id']:m['reference_component_id'] for m in resolution['component_matches']}
            ref_signatures,actual_signatures=ref_nets.signatures(),actual_nets.signatures(rename)
            def diagnostic(signature,is_reference):
                ref_roots=[root for root,pins in ref_nets.pins.items() if frozenset(pins)==signature]
                actual_roots=[root for root,pins in actual_nets.pins.items()
                              if frozenset((rename.get(c,c),p) for c,p in pins)==signature]
                return {'reference_nodes':sorted(n for root in ref_roots for n in ref_nets.nodes[root]),
                        'observed_nodes':sorted(n for root in actual_roots for n in actual_nets.nodes[root]),
                        'reference_pins':sorted(c+'.'+p for c,p in signature) if is_reference else [],
                        'observed_pins':sorted(c+'.'+p for root in actual_roots for c,p in actual_nets.pins[root])}
            order=lambda signature:sorted(signature)
            details['matched_nets']=[diagnostic(net,True) for net in sorted(ref_signatures&actual_signatures,key=order)]
            details['missing_nets']=[diagnostic(net,True) for net in sorted(ref_signatures-actual_signatures,key=order)]
            details['unexpected_nets']=[diagnostic(net,False) for net in sorted(actual_signatures-ref_signatures,key=order)]
            complete=len(resolution['component_matches'])==len(reference['components'])==len(components) and all(c.get('pins') for c in components)
            # Do not call missing evidence a known wiring error. Once all component
            # anchors are mapped, compare full incidence even when counts are equal.
            if complete and ref_signatures!=actual_signatures:
                mismatch=True; issues.append('Component pin-to-net incidence differs')
                expected_net={pin:net for net in ref_signatures for pin in net}
                for net in actual_signatures:
                    partitions={expected_net[pin] for pin in net if pin in expected_net}
                    if len(partitions)>1: details['shorted_nets'].append(diagnostic(net,False))
                ref_nodes=ref_nets.pin_nodes
                for match in resolution['component_matches']:
                    ref_id,actual_id=match['reference_component_id'],match['observed_component_id']
                    for (component,pin),ref_node in ref_nodes.items():
                        if component!=ref_id: continue
                        actual_node=actual_nets.pin_nodes[(actual_id,pin)]
                        ref_net=frozenset(ref_nets.pins[ref_nets.find(ref_node)])
                        actual_net=frozenset((rename.get(c,c),p) for c,p in actual_nets.pins[actual_nets.find(actual_node)])
                        if ref_net!=actual_net:
                            details['pin_mapping_issues'].append({'reference_component_id':ref_id,'observed_component_id':actual_id,
                                'pin_id':pin,'reference_node_id':ref_node,'observed_node_id':actual_node,'issue':'Electrical pin net differs'})
                details['pin_mapping_differences']=list(details['pin_mapping_issues'])
        if mismatch: status='MISMATCH'
        elif unknown: status='UNKNOWN'
        elif resolution['status']=='AMBIGUOUS' or observed['ambiguities']: status='AMBIGUOUS'
        elif complete: status='MATCH'
        else: status='UNKNOWN'; issues.append('Insufficient supported pin/net evidence')
        return validate('TopologyVerificationResult',{**result(status,issues),**details})

class FunctionalVerificationService:
    def verify(self,assignment,capture,vectors=None):
        samples=capture.get("samples",[]) if capture and capture.get("available") else []
        behavior=(assignment or {}).get('expected_behavior',{})
        expected=list(behavior.get("expected_signals",[]))
        missing=0
        if not expected and behavior.get('truth_table'):
            vectors=sorted(vectors or [],key=lambda v:v['time_ns'])
            duration=(capture or {}).get('duration_ns',0)
            for row in behavior['truth_table']:
                matches=[i for i,v in enumerate(vectors) if all(v['inputs'].get(s)==level for s,level in row['inputs'].items())]
                if not matches:
                    missing+=len(row['outputs']); continue
                index=matches[0]
                timestamp=vectors[index+1]['time_ns']-1 if index+1<len(vectors) else duration
                if timestamp<vectors[index]['time_ns']:
                    missing+=len(row['outputs']); continue
                expected.extend({'signal':s,'time_ns':timestamp,'value':value} for s,value in row['outputs'].items())
        if not expected:
            return result("NOT_EVALUATED",["No expected signal behavior supplied"])
        if not samples: return result("NO_RESPONSE")
        duration=capture.get('duration_ns',max(s['time_ns'] for s in samples))
        grouped=defaultdict(list)
        for sample in samples: grouped[sample['signal']].append((sample['time_ns'],sample['value']))
        for values in grouped.values(): values.sort(key=lambda pair:pair[0])
        times={signal:[pair[0] for pair in values] for signal,values in grouped.items()}
        def observed_at(signal,timestamp):
            if timestamp>duration: return None
            index=bisect_right(times.get(signal,[]),timestamp)-1
            return grouped[signal][index][1] if index>=0 else None
        matched=sum(observed_at(s['signal'],s['time_ns'])==s['value'] for s in expected)
        if matched==len(expected) and not missing: return result("PASS")
        return result("PARTIAL" if matched else "FAIL",["Observed signals differ from expected behavior"])
