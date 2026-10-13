"""Deterministic digital transport-delay model; no physical timing/electrical claim."""
from collections import defaultdict
from dataclasses import dataclass, field
import heapq
import math
from jsonschema import ValidationError
from contracts.design_validation import validate_design_graph
from contracts.validation import validate

class SimulationError(RuntimeError): pass

@dataclass(order=True,frozen=True)
class Event:
    time_ns:int
    sequence:int
    signal:str=field(compare=False)
    value:int|str=field(compare=False)

class EventQueue:
    def __init__(self,limit):
        self.heap=[]; self.sequence=0; self.limit=limit
    def push(self,time_ns,signal,value):
        if self.sequence>=self.limit: raise SimulationError('EVENT_LIMIT')
        if type(time_ns) is not int or time_ns<0 or value not in (0,1,'X'):
            raise SimulationError('INVALID_EVENT')
        heapq.heappush(self.heap,Event(time_ns,self.sequence,signal,value)); self.sequence+=1
    def pop(self): return heapq.heappop(self.heap)

@dataclass(frozen=True)
class DigitalNet:
    source:str
    destinations:tuple[str,...]

@dataclass(frozen=True)
class DigitalDevice:
    device_id:str
    operation:str
    inputs:tuple[str,...]
    output:str
    delay_ns:int

@dataclass(frozen=True)
class ClockSource:
    signal:str
    period_ns:int

@dataclass(frozen=True)
class VirtualExecutionPlan:
    devices:tuple[DigitalDevice,...]
    nets:tuple[DigitalNet,...]
    directions:dict[str,str]
    initial_sources:dict[str,int]
    clocks:tuple[ClockSource,...]
    probes:tuple[str,...]

class DeviceRegistry:
    ports={'AND':(('A','B'),'Y'),'OR':(('A','B'),'Y'),'XOR':(('A','B'),'Y'),'NOT':(('A',),'Y')}
    @staticmethod
    def evaluate(operation,values):
        if operation=='AND': return 0 if 0 in values else 1 if all(v==1 for v in values) else 'X'
        if operation=='OR': return 1 if 1 in values else 0 if all(v==0 for v in values) else 'X'
        if operation=='NOT': return 1-values[0] if values[0] in (0,1) else 'X'
        if operation=='XOR': return values[0]^values[1] if all(v in (0,1) for v in values) else 'X'
        raise SimulationError('UNEXECUTABLE')

class VirtualCompiler:
    VISUAL={'BREADBOARD','BREADBOARD_830','BREADBOARD_630','BREADBOARD_100','BOARD','POWER_SUPPLY','GENERATOR','OSCILLOSCOPE','SIGNAL_MONITOR','ANNOTATION'}
    def compile(self,graph):
        try: validate_design_graph(graph)
        except (ValidationError,ValueError,TypeError): raise SimulationError('UNEXECUTABLE') from None
        if len(graph['modules'])>2000 or len(graph['connections'])>10000: raise SimulationError('GRAPH_LIMIT')
        ids=set(); devices=[]; directions={}; sources={}; clocks=[]; probes=[]
        for module in graph['modules']:
            mid=module['id']; kind=module['type']; props=module.get('properties',{})
            if mid in ids or '.' in mid: raise SimulationError('UNEXECUTABLE')
            ids.add(mid)
            delay=props.get('delay_ns',8)
            if type(delay) is not int or not 0<=delay<=1000000000: raise SimulationError('UNEXECUTABLE')
            if kind in self.VISUAL: continue
            if kind in ('DIGITAL_SWITCH','DIGITAL_INPUT','INPUT'):
                state=props.get('state',False)
                if 'value' not in props and type(state) is not bool: raise SimulationError('UNEXECUTABLE')
                level=props['value'] if 'value' in props else int(state)
                if type(level) is not int or level not in (0,1): raise SimulationError('UNEXECUTABLE')
                sources[mid+'.OUT']=level; directions[mid+'.OUT']='output'
            elif kind=='CLOCK':
                frequency=props.get('frequency_hz',1000)
                if type(frequency) not in (int,float) or not math.isfinite(frequency) or frequency<=0: raise SimulationError('UNEXECUTABLE')
                model_period=1000000000/frequency
                if not math.isfinite(model_period): raise SimulationError('UNEXECUTABLE')
                period=round(model_period)
                if period<2: raise SimulationError('UNEXECUTABLE')
                directions[mid+'.OUT']='output'; sources[mid+'.OUT']=0; clocks.append(ClockSource(mid+'.OUT',period))
            elif kind in ('LED','PROBE','OUTPUT'):
                directions[mid+'.IN']='input'; probes.append(mid+'.IN')
            elif kind=='74HC08':
                for index in range(1,5):
                    inputs=(f'{mid}.A{index}',f'{mid}.B{index}'); output=f'{mid}.Y{index}'
                    for signal in inputs: directions[signal]='input'
                    directions[output]='output'
                    devices.append(DigitalDevice(f'{mid}:{index}','AND',inputs,output,delay))
            elif kind in DeviceRegistry.ports:
                ports,port=DeviceRegistry.ports[kind]
                inputs=tuple(mid+'.'+p for p in ports); output=mid+'.'+port
                for signal in inputs: directions[signal]='input'
                directions[output]='output'
                devices.append(DigitalDevice(mid,kind,inputs,output,delay))
            else: raise SimulationError('UNEXECUTABLE')
        nets=defaultdict(list); destinations=set(); edges=set()
        for edge in graph['connections']:
            source,destination=edge['source'],edge['destination']
            if directions.get(source)!='output' or directions.get(destination)!='input' or destination in destinations or (source,destination) in edges:
                raise SimulationError('UNEXECUTABLE')
            destinations.add(destination); edges.add((source,destination)); nets[source].append(destination)
        return VirtualExecutionPlan(tuple(devices),tuple(DigitalNet(s,tuple(sorted(ds))) for s,ds in sorted(nets.items())),directions,sources,tuple(clocks),tuple(sorted(probes)))

class DigitalSimulator:
    def __init__(self,plan): self.plan=plan; self.stopped=False
    def stop(self): self.stopped=True
    def reset(self): self.stopped=False
    def run(self,configuration,vectors=None,clock_config=None,inputs=None):
        if self.stopped: return {'available':False,'state':'STOPPED','samples':[]}
        try: configuration=validate('CaptureConfiguration',configuration)
        except ValidationError: raise SimulationError('UNEXECUTABLE') from None
        if 'trigger' in configuration: raise SimulationError('NOT_IMPLEMENTED')
        duration=configuration['duration_ns']; limit=configuration.get('max_events',100000)
        queue=EventQueue(limit); values={p:'X' for p in self.plan.directions}
        selected=configuration['signals'] or list(self.plan.probes[:4]) or sorted(self.plan.initial_sources)[:4]
        if len(set(selected))!=len(selected) or len(selected)>4 or any(s not in values for s in selected): raise SimulationError('UNEXECUTABLE')
        nets={n.source:n.destinations for n in self.plan.nets}; dependencies=defaultdict(set)
        devices={d.device_id:d for d in self.plan.devices}
        for device in self.plan.devices:
            for signal in device.inputs: dependencies[signal].add(device.device_id)
        initial={**self.plan.initial_sources,**(inputs or {})}
        if any(s not in self.plan.initial_sources or type(v) is not int or v not in (0,1) for s,v in initial.items()): raise SimulationError('UNEXECUTABLE')
        for signal,value in sorted(initial.items()): queue.push(0,signal,value)
        clock_config=clock_config or {}
        if clock_config:
            try: clock_config=validate('ClockConfiguration',clock_config)
            except ValidationError: raise SimulationError('UNEXECUTABLE') from None
            if clock_config['signal'] not in {c.signal for c in self.plan.clocks}: raise SimulationError('UNEXECUTABLE')
        for clock in self.plan.clocks:
            period=clock_config.get('period_ns',clock.period_ns) if clock_config.get('signal')==clock.signal else clock.period_ns
            cycles=duration//period+1
            if clock_config.get('signal')==clock.signal: cycles=min(cycles,clock_config['cycles'])
            if cycles>100000: raise SimulationError('EVENT_LIMIT')
            for cycle in range(cycles):
                rise=cycle*period+period//2; fall=(cycle+1)*period
                if rise<=duration: queue.push(rise,clock.signal,1)
                if fall<=duration: queue.push(fall,clock.signal,0)
        for vector in vectors or []:
            if set(vector)!={'time_ns','inputs'} or type(vector['time_ns']) is not int or vector['time_ns']<0 or not isinstance(vector['inputs'],dict): raise SimulationError('UNEXECUTABLE')
            for signal,value in sorted(vector['inputs'].items()):
                if signal not in self.plan.initial_sources or type(value) is not int or value not in (0,1): raise SimulationError('UNEXECUTABLE')
                if vector['time_ns']<=duration: queue.push(vector['time_ns'],signal,value)
        samples=[]; last={}; initial_devices=set(devices); timestamp=0
        while timestamp<=duration:
            changed=set(); affected=initial_devices; initial_devices=set()
            while queue.heap and queue.heap[0].time_ns==timestamp:
                event=queue.pop()
                if values[event.signal]==event.value: continue
                values[event.signal]=event.value; changed.add(event.signal)
                affected.update(dependencies[event.signal])
                for destination in nets.get(event.signal,()): queue.push(timestamp,destination,event.value)
            for device_id in sorted(affected):
                device=devices[device_id]
                output=DeviceRegistry.evaluate(device.operation,[values[s] for s in device.inputs])
                queue.push(timestamp+device.delay_ns,device.output,output)
            # Zero-delay events settle at this timestamp before a single capture value is emitted.
            if queue.heap and queue.heap[0].time_ns==timestamp: continue
            for signal in selected:
                if signal not in last or last[signal]!=values[signal]:
                    samples.append({'signal':signal,'time_ns':timestamp,'value':values[signal]}); last[signal]=values[signal]
                    if len(samples)>100000: raise SimulationError('CAPTURE_LIMIT')
            if self.stopped: return {'available':bool(samples),'state':'STOPPED','samples':samples}
            if not queue.heap or queue.heap[0].time_ns>duration: break
            timestamp=queue.heap[0].time_ns
        return {'available':bool(samples),'state':'COMPLETE','duration_ns':duration,'samples':samples}

def run_plan(plan,configuration,vectors=None,clock_config=None,inputs=None):
    return DigitalSimulator(plan).run(configuration,vectors,clock_config,inputs)
