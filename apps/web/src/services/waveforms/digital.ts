import type { DigitalObservation } from '../../types/lab'

export function digitalTrace(samples:DigitalObservation[],signal:string,duration:number,row:number) {
  const values=samples.filter(s=>s.signal===signal).sort((a,b)=>a.time_ns-b.time_ns)
  const y=(value:0|1|'X')=>row*36+(value===1?8:value===0?28:18)
  const x=(time:number)=>duration>0?Math.max(0,Math.min(600,time/duration*600)):0
  let path='',unknown='',edges=0
  for(let index=0;index<values.length;index++) {
    const sample=values[index],end=values[index+1]?.time_ns??duration,previous=values[index-1]
    const segment='M'+x(sample.time_ns)+','+y(sample.value)+'H'+x(end)
    if(sample.value==='X') unknown+=segment
    else {
      path+=segment
      if(previous&&previous.value!=='X'&&previous.value!==sample.value) {path+='M'+x(sample.time_ns)+','+y(previous.value)+'V'+y(sample.value);edges++}
    }
  }
  return {path,unknown,edges,last:values.at(-1)?.value??'X'}
}

export function formatTime(ns:number):string {
  if(ns>=1e9) return (ns/1e9).toLocaleString(undefined,{maximumFractionDigits:3})+' s'
  if(ns>=1e6) return (ns/1e6).toLocaleString(undefined,{maximumFractionDigits:3})+' ms'
  if(ns>=1e3) return (ns/1e3).toLocaleString(undefined,{maximumFractionDigits:3})+' µs'
  return ns.toLocaleString(undefined,{maximumFractionDigits:3})+' ns'
}
