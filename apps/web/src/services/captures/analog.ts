import type { AnalogCaptureDescriptor } from '../../contracts/generated/dto'
import { decodeAnalogCapture, parseAnalogCaptureDescriptor, type DecodedAnalogCapture } from '../../domain/capture/ncap'
import { ApiError } from '../api/client'

const cancelled=(signal?:AbortSignal)=>{if(signal?.aborted)throw new ApiError(0,'REQUEST_CANCELLED','Request cancelled.')}

export async function verifyAndDecodeAnalogCapture(binary:ArrayBuffer,descriptor:AnalogCaptureDescriptor,signal?:AbortSignal):Promise<DecodedAnalogCapture>{
  cancelled(signal)
  const decoded=decodeAnalogCapture(binary,descriptor)
  if(!globalThis.crypto?.subtle)throw new ApiError(0,'CAPTURE_INTEGRITY_UNAVAILABLE','Capture integrity checking is unavailable in this browser.')
  const hash=await globalThis.crypto.subtle.digest('SHA-256',binary)
  cancelled(signal)
  const hex=Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join('')
  if(hex!==decoded.descriptor.sha256)throw new ApiError(0,'CAPTURE_CORRUPT','Capture payload integrity check failed.')
  return {...decoded,integrity:'verified'}
}

export interface AnalogPayloadSource {
  /** Implementations enforce owner access, cancellation, versioned MIME and maxBytes. */
  payload(captureId:string,options:{signal?:AbortSignal;maxBytes:number}):Promise<ArrayBuffer>
}

/** Future transport must be supplied explicitly; the runtime endpoint remains v1. */
export async function loadAnalogCapture(descriptor:AnalogCaptureDescriptor,source:AnalogPayloadSource,signal?:AbortSignal):Promise<DecodedAnalogCapture>{
  cancelled(signal)
  const ownedDescriptor=parseAnalogCaptureDescriptor(descriptor)
  const binary=await source.payload(ownedDescriptor.header.capture_id,{signal,maxBytes:ownedDescriptor.payload_byte_count})
  return verifyAndDecodeAnalogCapture(binary,ownedDescriptor,signal)
}
