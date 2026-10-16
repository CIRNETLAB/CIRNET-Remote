export declare function stopOwnedBackend(owned:{
 child:{stdin:{end():unknown};kill():unknown}
 closed:Promise<number>
},options?:{timeoutMs?:number;reapTimeoutMs?:number}):Promise<number>
