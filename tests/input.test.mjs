import test from 'node:test';
import assert from 'node:assert/strict';
import {parseURL,inputError} from '../dist/audio-input.mjs';
test('music websites and direct audio have usable paths without assuming iframe access',()=>{
  for(const input of ['https://music.163.com/#/song?id=1','https://y.qq.com/n/ryqq/songDetail/001','https://example.com/listen','https://b23.tv/abcd']){
    const result=parseURL(input);assert.equal(result.url.href,input);assert.equal(result.embed,null);assert.equal(result.isAudio,false);
  }
  assert.equal(parseURL('sound.example/track.opus?token=test').isAudio,true);
  assert.equal(parseURL('sound.example/track.MP3?download=1').isAudio,true);
  assert.equal(parseURL('https://example.com/track.mp3.html').isAudio,false);
});
test('supported embeds are optional and use exact known provider hostnames',()=>{
  for(const input of ['https://youtu.be/4X2U8COvkzw','https://www.youtube.com/watch?v=4X2U8COvkzw','https://music.youtube.com/watch?v=4X2U8COvkzw'])assert.equal(parseURL(input).id,'4X2U8COvkzw');
  assert.match(parseURL('https://www.bilibili.com/video/BV1xx411c7mD').embed,/^https:\/\/player\.bilibili\.com\//);
  assert.match(parseURL('https://soundcloud.com/artist/track').embed,/^https:\/\/w\.soundcloud\.com\//);
  assert.match(parseURL('https://vimeo.com/123456789').embed,/^https:\/\/player\.vimeo\.com\//);
  assert.equal(parseURL('https://youtube.com.evil.example/watch?v=4X2U8COvkzw').embed,null);
  for(const input of ['javascript:alert(1)','file:///tmp/song.mp3','https://user:password@example.com/song','https://youtu.be/invalid'])assert.throws(()=>parseURL(input));
});
test('denied or unavailable microphone gives an actionable error without claiming capture',()=>{
  assert.match(inputError({name:'NotAllowedError'},'microphone'),/未获允许/);
  assert.match(inputError({name:'NotFoundError'},'microphone'),/没有找到/);
  assert.match(inputError({name:'NotReadableError'},'microphone'),/系统麦克风权限/);
  assert.match(inputError({name:'NotAllowedError'},'capture'),/共享音频/);
});
