const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
assert.ok(html.includes('<title>圣诞树（可定制）</title>'));
assert.ok(html.includes("let config={name:''"),'Default name must be empty');
assert.ok(!/data:image\//i.test(html),'Release must not contain embedded photos');
assert.ok(!/[CE]:[\\/](?:Users|Program Files|matlab)/i.test(html),'Local paths must not be published');
for(const file of ['editor.js','scene-engine.js','gesture-worker.js']) new vm.Script(fs.readFileSync(path.join(__dirname,'src',file),'utf8'));
for(const [id,file] of [['scene-engine','scene-engine.js'],['scene-style','scene-style.css'],['gesture-worker','gesture-worker.js']]) {
 const actual=html.match(new RegExp('<script[^>]*id="'+id+'"[^>]*>([\\s\\S]*?)</script>'));
 assert.ok(actual,id+' must exist');
 assert.equal(actual[1],fs.readFileSync(path.join(__dirname,'src',file),'utf8'),id+' must match source');
}
const notices=html.match(/<script[^>]*id="third-party-notices"[^>]*>([\s\S]*?)<\/script>/);
assert.ok(notices && notices[1].includes('Apache License'),'Third-party licenses must remain');
assert.equal(notices[1].trim(),fs.readFileSync(path.join(__dirname,'THIRD_PARTY_NOTICES.txt'),'utf8').trim());
console.log('PASS: JavaScript syntax, source sync, empty default name, no embedded photos/local paths, third-party notices');
