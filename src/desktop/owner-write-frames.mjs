// Lossless bounded private-pipe framing. Disk JSON and all archive/authority semantics remain unchanged.
import {createHash} from 'node:crypto';
export const OWNER_FRAME_BYTES=2_000_000,OWNER_VALUE_BYTES=16_000_000,OWNER_CHUNK_BYTES=48_000;
export function* ownerWriteFrames(key,value,id){
 const line=JSON.stringify({action:'put',id,key,value})+'\n';
 if(Buffer.byteLength(line)<=OWNER_FRAME_BYTES){yield line;return;}
 const body=Buffer.from(JSON.stringify(value),'utf8');if(body.length>OWNER_VALUE_BYTES)throw Error('DesktopOwnerWriteUnconfirmed');
 yield JSON.stringify({action:'putBegin',id,key,bytes:body.length,sha256:createHash('sha256').update(body).digest('hex')})+'\n';
 let seq=0;for(let offset=0;offset<body.length;offset+=OWNER_CHUNK_BYTES)yield JSON.stringify({action:'putChunk',id,seq:seq++,data:body.subarray(offset,offset+OWNER_CHUNK_BYTES).toString('base64')})+'\n';
 yield JSON.stringify({action:'putCommit',id})+'\n';
}
