import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {encodeConnectome,decodeConnectome} from '../dist/connectome-codec.mjs';

test('delta transport preserves decimal coordinates, parent IDs and all metadata',()=>{
  const graph={dataset:'example',provenance:{units:'voxels'},nodes:[{id:19,type:'JO-A',skeletonSource:'example',skeleton:[[1,1.25,-2.7,0,-1],[12,1.35,2.75,-.5,1]]}],edges:[{source:19,target:20,weight:7}]};
  const original=structuredClone(graph),packed=encodeConnectome(graph);
  assert.equal(packed.scale,100);
  assert.deepEqual(decodeConnectome(JSON.parse(JSON.stringify(packed))),original);
  assert.deepEqual(graph,original);
});

test('every original MaleCNS point and metadata field survives actual JSON transport',async()=>{
  const graph=JSON.parse(await readFile(new URL('../dist/assets/auditory-connectome.json',import.meta.url),'utf8'));
  const restored=decodeConnectome(JSON.parse(JSON.stringify(encodeConnectome(graph))));
  assert.deepEqual(restored,graph);
});

test('unsupported formats and corrupt coordinates fail instead of rendering encoded values',()=>{
  assert.throws(()=>decodeConnectome({nodes:[]}),/format/);
  const packed=encodeConnectome({nodes:[{skeleton:[[1,.1,.2,.3,-1]]}]});
  assert.throws(()=>decodeConnectome({...packed,scale:3}),/format/);
  assert.throws(()=>decodeConnectome({...packed,graph:{nodes:[{skeleton:[1,2]}]}}),/skeleton/);
  assert.throws(()=>decodeConnectome({...packed,graph:{nodes:[{skeleton:[1,.5,0,0,-1]}]}}),/delta/);
  assert.throws(()=>encodeConnectome({nodes:[{skeleton:[[1,Infinity,0,0,-1]]}]}),/row/);
});
