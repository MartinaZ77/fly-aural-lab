import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join,relative} from 'node:path';
const root=fileURLToPath(new URL('..',import.meta.url));
const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):[join(dir,e.name)]);
test('public application contains no local personal paths, credentials or sign-in callback data',()=>{
  const files=[...walk(join(root,'dist')),join(root,'README.md'),join(root,'MODEL-NOTES.md')];
  const patterns=[/\/Users\/[\w-]+\//,/\/var\/folders\//,/C:\\Users\\/i,/\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}/,/\bgh[pousr]_[A-Za-z0-9]{24,}/,/github_pat_[A-Za-z0-9_]{30,}/,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/accounts\.google\.com\/v3\/signin/,/auth\.openai\.com\/api\/accounts/,/Bearer\s+[A-Za-z0-9_.-]{20,}/,/siwc_bypass_token\s*[:=]/i];
  for(const path of files){if(!/\.(?:mjs|js|json|html|css|md|txt)$/.test(path))continue;const text=readFileSync(path,'utf8');for(const p of patterns)assert.ok(!p.test(text),`Potential private content in ${relative(root,path)}; inspect locally before sharing.`);}
});
