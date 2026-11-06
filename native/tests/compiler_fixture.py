"""Generate pure Stage 4 oracle cases using the installed Python r8 artifact."""
import json, sys
from pathlib import Path
from copy import deepcopy
from itertools import product
from app.services.infrastructure_routing import allocate_routes
from app.services.topology_resolver import TopologyResolver
from app.services.lab_compiler import LabExecutionCompiler
from app.services.verification import TopologyVerificationService, FunctionalVerificationService
from app.services.execution_policy import ExecutionPolicy
from app.services.assessment import AssessmentService

def graph(prefix,identities=("74HC08","74HC32"),wire=("U1.3","U2.1")):
    def node(pin):return prefix+"_"+pin.replace(".","_")
    components=[{"component_id":prefix+"_U"+str(i+1),"kind":"OBSERVED_PHYSICAL_COMPONENT",
        "identity":identity,"package":"DIP14","node_ids":[node(f"U{i+1}.{p}") for p in (1,2,3)],
        "pins":[{"pin_id":str(p),"node_id":node(f"U{i+1}.{p}")} for p in (1,2,3)]} for i,identity in enumerate(identities)]
    return {"schema_version":"1.0","scan_id":prefix,"nodes":[{"node_id":n} for c in components for n in c["node_ids"]],
        "components":components,"connections":[{"node_ids":[node(p) for p in wire]}] if wire else [],"ambiguities":[]}
def assignment(reference=None):
    return {"schema_version":"1.0","assignment_id":"placement","title":"Placement",
        "lab_endpoints":[{"endpoint_id":"x","role":"INPUT_SOURCE","reference_node_id":"REF_U1_1"},
                         {"endpoint_id":"y","role":"OUTPUT_SENSE","reference_node_id":"REF_U2_3"}],
        "reference_topology_graph":reference or graph("REF"),"component_resolution_mode":"HYBRID",
        "assessment_policy":"STRICT_TOPOLOGY"}
def caps():
    return {"mode":"hardware","hardware_profile_version":"profile-1","component_resolution_modes":["HYBRID","INSTRUCTOR_PROFILE"],
        "instrument_capabilities":{n:{"channels":4,"runtime_reconfiguration_supported":False} for n in ("logic_analyzer","oscilloscope","generator")},
        "routing_resources":[{"resource_id":"r1","roles":["INPUT_SOURCE"],"node_ids":["STUDENT_U1_1"]},
                             {"resource_id":"r2","roles":["OUTPUT_SENSE"],"node_ids":["STUDENT_U2_3"]}]}

cases=[]
def case(kind,name,inputs,compute):
    try:expected={"value":compute()}
    except (ValueError,KeyError) as error:expected={"error":str(error).strip("'")}
    cases.append({"kind":kind,"name":name,"inputs":inputs,**expected})
def topology_case(name,a=None,g=None,c=None):
    a=deepcopy(a or assignment());g=deepcopy(g or graph("STUDENT"));c=deepcopy(c or caps())
    resolution=TopologyResolver().resolve(a,g,c)
    case("resolve",name,{"assignment":a,"observed":g,"caps":c},lambda:resolution)
    case("topology",name,{"assignment":a,"observed":g,"resolution":resolution},
         lambda:TopologyVerificationService().verify(a,g,resolution))
    experiment={"station_id":"p1","experiment_id":"e1","_configuration":{}}
    case("compile",name,{"experiment":experiment,"assignment":a,"caps":c,"resolution":resolution},
         lambda:LabExecutionCompiler().compile(experiment,a,c,resolution))

topology_case("placement")
topology_case("wrong-pin",g=graph("STUDENT",wire=("U1.3","U2.2")))
topology_case("separated",g=graph("STUDENT",wire=None))
topology_case("repeated-distinct",a=assignment(graph("REF",("74HC08","74HC08"))),g=graph("STUDENT",("74HC08","74HC08")))
topology_case("ambiguous",a=assignment(graph("REF",("74HC08","74HC08"),None)),g=graph("STUDENT",("74HC08","74HC08"),None))
topology_case("missing",g=graph("STUDENT",("74HC08",),None))
unknown=graph("STUDENT");unknown["components"][0]["identity"]="UNKNOWN";unknown["components"][0]["kind"]="OPAQUE_PHYSICAL_COMPONENT"
topology_case("unknown",g=unknown)
uncertain=graph("STUDENT");uncertain["components"][0]["pins"][0]["confidence"]=0
topology_case("uncertain-pin",g=uncertain)
uncertain=graph("STUDENT");uncertain["connections"][0]["confidence"]=0
topology_case("uncertain-net",g=uncertain)
unsupported=caps();unsupported["component_resolution_modes"]=[]
topology_case("unsupported-mode",c=unsupported)
profile=assignment();profile["component_resolution_mode"]="INSTRUCTOR_PROFILE"
topology_case("missing-profiles",a=profile)
profile["instructor_pin_profiles"]=[{"component_type":identity,"pins":[{"pin_id":str(i),"role":"INPUT"} for i in (1,2,3)]} for identity in ("74HC08","74HC32")]
topology_case("instructor-profiles",a=profile)
large=graph("STUDENT",("74HC08",)*33,None);large_ref=graph("REF",("74HC08",)*33,None)
topology_case("component-bound",a=assignment(large_ref),g=large)
chain=graph("STUDENT",("74HC08",)*5,None);chain_ref=graph("REF",("74HC08",)*5,None)
for prefix,item in (("STUDENT",chain),("REF",chain_ref)):
    item["connections"]=[{"node_ids":[f"{prefix}_U{i}_3",f"{prefix}_U{i+1}_1"]} for i in range(1,5)]
topology_case("repeated-chain",a=assignment(chain_ref),g=chain)
alias=graph("STUDENT");alias["nodes"].append({"node_id":"ROUTABLE"})
alias["connections"].append({"node_ids":["STUDENT_U1_1","ROUTABLE"]})
alias_caps=caps();alias_caps["routing_resources"][0]["node_ids"]=["ROUTABLE"]
topology_case("net-alias",g=alias,c=alias_caps)
for reverse,available in product((False,True),(1,2)):
    competing=caps();competing["routing_resources"]=[
        {"resource_id":"shared","roles":["INPUT_SOURCE","OUTPUT_SENSE"],"node_ids":["STUDENT_U1_1","STUDENT_U2_3"]},
        {"resource_id":"input-only","roles":["INPUT_SOURCE"],"node_ids":["STUDENT_U1_1"]}][:available]
    a=assignment()
    if reverse:a["lab_endpoints"].reverse()
    topology_case(f"competing-{reverse}-{available}",a=a,c=competing)

for status,executable,unknown in product(("SAFE","UNSAFE","INDETERMINATE"),(True,False),(True,False)):
    safety={"schema_version":"1.0","status":status,"issues":[]}
    case("decide",f"{status}-{executable}-{unknown}",{"safety":safety,"executable":executable,"unknown":unknown},
         lambda:ExecutionPolicy().decide(safety,executable,unknown))
for policy,topology,function in product(("STRICT_TOPOLOGY","FUNCTIONAL_ONLY","TOPOLOGY_AND_FUNCTION"),
        ("MATCH","MISMATCH","UNKNOWN","AMBIGUOUS"),("PASS","FAIL","PARTIAL","NO_RESPONSE","NOT_EVALUATED")):
    a={"assessment_policy":policy};t={"status":topology,"issues":["same","topology"]};f={"status":function,"issues":["same","function"]}
    case("assess",f"{policy}-{topology}-{function}",{"assignment":a,"topology":t,"function":f},
         lambda:AssessmentService().evaluate(a,t,f))
for name,samples,available,duration in (
    ("pass",[{"signal":"Y","time_ns":0,"value":0},{"signal":"Y","time_ns":5,"value":1}],True,10),
    ("late",[{"signal":"Y","time_ns":11,"value":1}],True,10),
    ("unavailable",[],False,10),("empty",[],True,10),
    ("x",[{"signal":"Y","time_ns":0,"value":"X"}],True,10),
    ("same-time",[{"signal":"Y","time_ns":0,"value":0},{"signal":"Y","time_ns":0,"value":1}],True,10),
    ("zero-window",[{"signal":"Y","time_ns":0,"value":1}],True,0)):
    a={"expected_behavior":{"expected_signals":[{"signal":"Y","time_ns":0,"value":0},{"signal":"Y","time_ns":10,"value":1}],
        "truth_table":[{"inputs":{"A":0},"outputs":{"Y":0}},{"inputs":{"A":1},"outputs":{"Y":1}},
                       {"inputs":{"A":0,"B":1},"outputs":{"Y":1}}]}}
    capture={"available":available,"duration_ns":duration,"samples":samples}
    vectors=[{"time_ns":0,"inputs":{"A":0}},{"time_ns":5,"inputs":{"A":1}},{"time_ns":5,"inputs":{"B":0}}]
    case("functional",name,{"assignment":a,"capture":capture,"vectors":vectors},
         lambda:FunctionalVerificationService().verify(a,capture,vectors))
case("functional","no-assignment",{"assignment":None,"capture":{"available":False},"vectors":[]},
     lambda:FunctionalVerificationService().verify(None,{"available":False},[]))

# Station-dependent admission and exact protobuf presence adapters.
from google.protobuf.json_format import ParseDict,MessageToDict
from contracts.generated import rpc_v2_pb2 as pb
virtual=caps();virtual["mode"]="simulation"
record={"station_id":"s1","experiment_id":"e1","_configuration":{}}
for name,a,c,e in (
    ("virtual-empty",None,virtual,record),
    ("virtual-power-skip",{"lab_endpoints":[{"endpoint_id":"v","role":"VCC"},{"endpoint_id":"g","role":"GND"}]},virtual,record),
    ("generator-no-allocation",None,virtual,{**record,"_configuration":{"generator_config":[{"channel":1,"waveform":"SINE","frequency_hz":1000,"amplitude_vpp":2,"offset_v":0,"enabled":True}]}}),
    ("generator-disabled",None,virtual,{**record,"_configuration":{"generator_config":[{"channel":1,"waveform":"SINE","frequency_hz":1000,"amplitude_vpp":2,"offset_v":0,"enabled":False}]}}),
    ("capture-channels",None,virtual,{**record,"_configuration":{"capture_config":{"signals":["a","b","c","d","e"],"duration_ns":1000}}}),
):
    case("compile",name,{"experiment":e,"assignment":a,"caps":c,"resolution":None},
         lambda a=a,c=c,e=e:LabExecutionCompiler().compile(e,a,c))
for channel,role,enabled in product((1,5),("GENERATOR","SCOPE"),(False,True)):
    a={"lab_endpoints":[{"endpoint_id":"device","role":role,"design_port":"Y","channel":channel}]}
    e={**record,"_configuration":{"generator_config":[{"channel":1,"waveform":"SINE","frequency_hz":1000,"amplitude_vpp":2,"offset_v":0,"enabled":enabled}]}}
    case("compile",f"instrument-{channel}-{role}-{enabled}",{"experiment":e,"assignment":a,"caps":virtual,"resolution":None},
         lambda a=a,e=e:LabExecutionCompiler().compile(e,a,virtual))
for limit,value in (("frequency_max_hz",999),("frequency_min_hz",1001),("amplitude_max_vpp",1),("offset_min_v",1),("offset_max_v",-1)):
    c=deepcopy(virtual);c["instrument_capabilities"]["generator"][limit]=value
    a={"lab_endpoints":[{"endpoint_id":"device","role":"GENERATOR","design_port":"Y"}]}
    e={**record,"_configuration":{"generator_config":[{"channel":1,"waveform":"SINE","frequency_hz":1000,"amplitude_vpp":2,"offset_v":0,"enabled":True}]}}
    case("compile","generator-limit-"+limit,{"experiment":e,"assignment":a,"caps":c,"resolution":None},
         lambda a=a,e=e,c=c:LabExecutionCompiler().compile(e,a,c))
for original in list(cases):
    if original["kind"]=="compile" and "value" in original:
        plan=original["value"];target={"station_id":plan["station_id"],"experiment_id":plan["experiment_id"]}
        decision={"schema_version":"1.0","decision":"RUN_GUARDED","reasons":["Unknown component identity"]}
        message=ParseDict({"target":target,"plan":plan,"decision":decision},pb.PrepareExecutionRequest())
        cases.append({"kind":"wire","name":original["name"],"inputs":{"target":target,"plan":plan,"decision":decision,
            "protobuf_hex":message.SerializeToString(deterministic=True).hex()},"value":True})
for name,source in (("defaults",{}),("present-zero",{"schema_version":"1.0","station_id":"s1","mode":"simulation",
    "instrument_capabilities":{"logic_analyzer":{"channels":0,"status":"","runtime_reconfiguration_supported":False},
                              "generator":{"channels":1,"supported_waveforms":[],"frequency_min_hz":0,"offset_max_v":0}}}),
    ("full",{"schema_version":"1.0","station_id":"s1","mode":"simulation","available":True,"virtual_digital":True,
        "instrument_capabilities":{"oscilloscope":{"channels":2,"status":"AVAILABLE","runtime_reconfiguration_supported":True},
           "generator":{"channels":2,"supported_waveforms":["SINE"],"frequency_max_hz":1000,"offset_min_v":-1}},
        "breadboards":[{"id":"b","model":"BB830"}],"hardware_rpc_version":"2.0"})):
    message=ParseDict(source,pb.StationCapabilities())
    value=MessageToDict(message,preserving_proto_field_name=True,always_print_fields_with_no_presence=True)
    generator=value.get("instrument_capabilities",{}).get("generator",{})
    if generator.get("supported_waveforms")==[]:generator.pop("supported_waveforms")
    cases.append({"kind":"capabilities","name":name,"inputs":{"protobuf_hex":message.SerializeToString(deterministic=True).hex()},"value":value})


Path(sys.argv[1]).write_text(json.dumps(cases,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print(f"Generated {len(cases)} exact-reference pure cases.")
