import test from 'node:test';
import assert from 'node:assert/strict';
import {youtubeError} from '../dist/youtube-player.mjs';
import {parseURL} from '../dist/audio-input.mjs';
test('YouTube errors distinguish embed prohibition and missing origin',()=>{
  assert.match(youtubeError(101),/禁止页内播放/);assert.match(youtubeError(150),/禁止页内播放/);assert.match(youtubeError(153),/来源验证/);assert.match(youtubeError(100),/不可访问/);
  const p=parseURL('https://www.youtube.com/watch?v=4X2U8COvkzw&list=private-list&si=private-share');
  assert.equal(p.id,'4X2U8COvkzw');assert.ok(!p.embed.includes('private'));
});
