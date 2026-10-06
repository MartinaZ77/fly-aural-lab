import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {encodeConnectome,decodeConnectome} from '../dist/connectome-codec.mjs';

const input=new URL('../dist/assets/auditory-connectome.json',import.meta.url);
const output=new URL('../dist/assets/auditory-connectome.packed.json',import.meta.url);
const source=await readFile(input,'utf8'),graph=JSON.parse(source);
const serialized=JSON.stringify(encodeConnectome(graph));
// Verify the actual JSON transport, including all decimal coordinates, before writing.
assert.deepEqual(decodeConnectome(JSON.parse(serialized)),graph);
await writeFile(output,serialized);
const originalGzip=gzipSync(source).length,packedGzip=gzipSync(serialized).length;
console.log(JSON.stringify({nodes:graph.nodes.length,points:graph.nodes.reduce((sum,n)=>sum+n.skeleton.length,0),scale:JSON.parse(serialized).scale,originalBytes:Buffer.byteLength(source),packedBytes:Buffer.byteLength(serialized),originalGzipBytes:originalGzip,packedGzipBytes:packedGzip,compressedReductionPercent:Math.round((1-packedGzip/originalGzip)*1000)/10,losslessRoundTrip:true}));
