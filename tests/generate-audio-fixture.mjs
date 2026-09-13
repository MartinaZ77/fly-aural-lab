// Small locally generated PCM fixture for browser file-input verification.
import {writeFileSync} from 'node:fs';
const rate=48000,seconds=12,count=rate*seconds,out=Buffer.alloc(44+count*2);
out.write('RIFF',0);out.writeUInt32LE(out.length-8,4);out.write('WAVEfmt ',8);out.writeUInt32LE(16,16);out.writeUInt16LE(1,20);out.writeUInt16LE(1,22);out.writeUInt32LE(rate,24);out.writeUInt32LE(rate*2,28);out.writeUInt16LE(2,32);out.writeUInt16LE(16,34);out.write('data',36);out.writeUInt32LE(count*2,40);
for(let i=0;i<count;i++){const t=i/rate,f=t<5?150:600;const envelope=t>10?0:Math.min(1,t/.02);out.writeInt16LE(Math.round(.15*envelope*Math.sin(2*Math.PI*f*t)*32767),44+i*2);}
if(!process.argv[2])throw new Error('Provide a temporary output WAV path');writeFileSync(process.argv[2],out);
