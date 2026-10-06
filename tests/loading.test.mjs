import test from 'node:test';
import assert from 'node:assert/strict';
import {loadJSONAsset} from '../dist/load-asset.mjs';

test('loader keeps all scientific data and makes one request on success',async()=>{
  const expected={nodes:[{id:42,skeleton:[[1,2,3,4,-1]]}]},calls=[];
  const value=await loadJSONAsset('graph.json',{fetcher:async url=>{calls.push(url);return Response.json(expected);}});
  assert.deepEqual(value,expected);assert.deepEqual(calls,['graph.json']);
});
test('a transient download failure retries once and recovers',async()=>{
  const expected={geometry:[1,2,3]};let attempts=0;
  const fetcher=async()=>++attempts===1?new Response('',{status:503}):Response.json(expected);
  assert.deepEqual(await loadJSONAsset('rig.json',{fetcher}),expected);assert.equal(attempts,2);
});
test('stalled downloads abort and fail rather than leaving an endless loader',async()=>{
  let attempts=0;
  const fetcher=(_url,{signal})=>new Promise((_,reject)=>{attempts++;signal.addEventListener('abort',()=>reject(new Error('timed out')));});
  await assert.rejects(loadJSONAsset('rig.json',{fetcher,timeout:5}),/timed out/);
  assert.equal(attempts,2);
});
