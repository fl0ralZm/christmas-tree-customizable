const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const entry = path.join(root, 'index.html');
let html = fs.readFileSync(entry, 'utf8');
for (const [id, file] of [['scene-engine','scene-engine.js'],['scene-style','scene-style.css'],['gesture-worker','gesture-worker.js']]) {
  const pattern = new RegExp('(<script[^>]*id="'+id+'"[^>]*>)[\\s\\S]*?(</script>)');
  if (!pattern.test(html)) throw Error('Missing template: '+id);
  const content = fs.readFileSync(path.join(root, 'src', file), 'utf8');
  if (/<\/script/i.test(content)) throw Error('Unsafe closing script tag: '+file);
  html = html.replace(pattern, (_,open,close) => open+content+close);
}
html = html.replace(/(<template id="scene-template">)[\s\S]*?(<\/template>)/,
  (_,open,close) => open+fs.readFileSync(path.join(root,'src/scene-markup.html'),'utf8')+close);
const start = html.lastIndexOf('<script>')+8;
const end = html.indexOf('</script>',start);
if(start<8 || end<start) throw Error('Missing editor script');
const editor = fs.readFileSync(path.join(root,'src/editor.js'),'utf8');
if (/<\/script/i.test(editor)) throw Error('Unsafe closing script tag in editor');
html = html.slice(0,start)+editor+html.slice(end);
fs.writeFileSync(entry,html);
console.log('Built index.html');
