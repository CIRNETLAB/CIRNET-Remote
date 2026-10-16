import { isLosslessNumber, isSafeNumber, parse } from 'lossless-json'

const integerMembers=new Set(['generation','frame_count','numerator','denominator','lost_frames','at_frame','missing_frames','first_frame'])
const integralToken=/^-?(0|[1-9][0-9]*)$/

function uniqueObjectMembers(text:string){
  // lossless-json accepts equal duplicate values. NCAP rejects every duplicate,
  // including escaped spellings, before parsing numbers or validating shape.
  const stack:(Set<string>|null)[]=[]
  for(let index=0;index<text.length;index++){
    const character=text[index]
    if(character==='"'){
      const start=index++
      for(;index<text.length;index++){
        if(text[index]==='\\')index++
        else if(text[index]==='"')break
      }
      if(text.slice(index+1).trimStart().startsWith(':')){
        const key=JSON.parse(text.slice(start,index+1)) as string,keys=stack.at(-1)
        if(key==='__proto__'||!keys||keys.has(key))throw new Error('Invalid capture member.')
        keys.add(key)
      }
    }else if(character==='{')stack.push(new Set())
    else if(character==='[')stack.push(null)
    else if(character==='}'||character===']')stack.pop()
  }
}

/** Duplicate keys and lossy numeric spellings are invalid format input. */
export function parseCaptureHeader(text:string,digital=false):unknown {
  uniqueObjectMembers(text)
  return parse(text,(key,value:unknown)=>{
    if(!isLosslessNumber(value))return value
    const token=value.value
    if(!isSafeNumber(token)||(digital||integerMembers.has(key))&&!integralToken.test(token))throw new Error('Invalid capture number.')
    const number=Number(token)
    if(!Number.isFinite(number)||(digital||integerMembers.has(key))&&!Number.isSafeInteger(number))throw new Error('Invalid capture number.')
    return number
  })
}
