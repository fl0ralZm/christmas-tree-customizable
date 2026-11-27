
(() => {
'use strict';
const $=id=>document.getElementById(id);
let config={name:'',color:'#f2cf89',message:'愿你所愿，皆有星光。',snow:true};
let paused=false,previewTimer=0,currentCode='';
const style=$('scene-style').textContent;
const markup=$('scene-template').innerHTML;
const engine=$('scene-engine').textContent;
let photoRequest=0;const photoRequests=new Map();
addEventListener('message',event=>{if(event.source!==$('preview').contentWindow||event.data?.type!=='photo-export-response')return;const entry=photoRequests.get(event.data.id);if(!entry)return;clearTimeout(entry.timer);photoRequests.delete(event.data.id);config.photos=event.data.photos;entry.resolve();});
function syncPreviewPhotos(){return new Promise((resolve,reject)=>{const id=++photoRequest,timer=setTimeout(()=>{photoRequests.delete(id);reject(Error('照片仍在处理中，请稍后再试。'));},90000);photoRequests.set(id,{resolve,reject,timer});$('preview').contentWindow.postMessage({type:'photo-export-request',id},'*');});}
async function withPreviewPhotos(action){const buttons=[$('download'),$('generate')];buttons.forEach(button=>button.disabled=true);status('正在打包照片…');try{await syncPreviewPhotos();action();}catch(error){status(error.message,true);}finally{buttons.forEach(button=>button.disabled=false);}}

const embeddedAssets=$('gesture-assets').outerHTML+$('gesture-worker').outerHTML+$('third-party-notices').outerHTML;
let previewRendered=false;
$('preview').addEventListener('load',()=>{$('preview').contentWindow.postMessage({type:'starlight-config',config},'*');});
function safeJSON(value){return JSON.stringify(value).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');}
function makeHTML(cfg,isPreview=false){
 const data={...cfg,paused:isPreview?paused:false};
 return '<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<title>星光圣诞树</title>\n<style>'+style+'</style>\n</head>\n<body>\n'+markup+'\n'+embeddedAssets+'\n<scr'+'ipt data-tree-engine>\nconst TREE_CONFIG = '+safeJSON(data)+';\n'+engine+'\n</scr'+'ipt>\n</body>\n</html>';
}
function updatePreview(immediate=false){clearTimeout(previewTimer);const render=()=>{if(!previewRendered){previewRendered=true;$('preview').srcdoc=makeHTML(config,true);}else $('preview').contentWindow.postMessage({type:'starlight-config',config},'*');};if(immediate)render();else previewTimer=setTimeout(render,120);}
function status(message,error=false){$('status').textContent=message;$('status').classList.toggle('error',error);}
function setColor(value){if(!/^#[0-9a-f]{6}$/i.test(value))return;config.color=value.toLowerCase();$('color').value=config.color;$('hex').value=value.toUpperCase();document.querySelectorAll('[data-color]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.color===config.color)));updatePreview();status('');}
$('name').addEventListener('input',()=>{config.name=$('name').value;updatePreview();status('');});

$('color').addEventListener('input',()=>setColor($('color').value));
$('hex').addEventListener('input',()=>{let value=$('hex').value.trim();if(!value.startsWith('#'))value='#'+value;if(/^#[0-9a-f]{6}$/i.test(value))setColor(value);});
$('hex').addEventListener('blur',()=>{let value=$('hex').value.trim();if(!value.startsWith('#'))value='#'+value;if(/^#[0-9a-f]{6}$/i.test(value))setColor(value);else{$('hex').value=config.color.toUpperCase();status('颜色请用 6 位代码，例如 #C294FF。',true);}});
document.querySelectorAll('[data-color]').forEach(b=>b.addEventListener('click',()=>setColor(b.dataset.color)));
$('snow').addEventListener('change',()=>{config.snow=$('snow').checked;updatePreview(true);});
function validate(){if(!config.name.trim()){status('先写下你想送给的人的名字吧。',true);$('name').focus();return false;}return true;}
function fileName(){return (config.name.trim().replace(/[\\/:*?"<>|\x00-\x1f]/g,'').slice(0,32)||'星光')+'-photo-tree.html';}
function downloadCode(code){const blob=new Blob([code],{type:'text/html;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=fileName();document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);status('已生成 '+fileName()+'，可以把这个文件发给朋友。');}
$('download').addEventListener('click',()=>{if(validate())withPreviewPhotos(()=>downloadCode(makeHTML(config)));});
$('generate').addEventListener('click',()=>{if(!validate())return;withPreviewPhotos(()=>{currentCode=makeHTML(config);$('code').value=currentCode;$('modal-status').textContent='完整代码 · '+(new Blob([currentCode]).size/1024).toFixed(0)+' KB';$('code-dialog').showModal();});});
$('close-dialog').addEventListener('click',()=>$('code-dialog').close());
$('code-dialog').addEventListener('click',event=>{if(event.target===$('code-dialog')){const r=$('code-dialog').getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)$('code-dialog').close();}});
$('copy-code').addEventListener('click',async()=>{try{if(navigator.clipboard&&window.isSecureContext)await navigator.clipboard.writeText(currentCode);else{$('code').focus();$('code').select();if(!document.execCommand('copy'))throw new Error('copy');}$('modal-status').textContent='代码已复制。';}catch(error){$('code').focus();$('code').select();$('modal-status').textContent='代码已选中，请按 Ctrl+C 复制。';}});
$('download-code').addEventListener('click',()=>downloadCode(currentCode));
$('pause').addEventListener('click',()=>{paused=!paused;$('pause').textContent=paused?'继续动画':'暂停动画';$('pause').setAttribute('aria-pressed',String(paused));$('preview').contentWindow.postMessage({type:'starlight-motion',paused},'*');});
$('reset').addEventListener('click',()=>{config={name:'',color:'#f2cf89',message:'愿你所愿，皆有星光。',snow:true};paused=false;$('name').value='';$('snow').checked=true;$('pause').textContent='暂停动画';$('pause').setAttribute('aria-pressed','false');setColor(config.color);status('已恢复默认，可以重新定制。');});
setColor(config.color);updatePreview(true);
})();
