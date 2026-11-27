
(()=>{
'use strict';
const cfg=TREE_CONFIG,$=id=>document.getElementById(id),video=$('camera-video');let canvas=$('sky');
let w=1,h=1,dpr=1,t=0,spread=0,target=0,yaw=0,yawTarget=0,paused=!!cfg.paused,disposed=false,raf=0,last=0,drag=false;
let hex=/^#[\da-f]{6}$/i.test(cfg.color)?cfg.color:'#f2cf89',rgb=[];
const body=document.body;
function createGestureGuide({changed=()=>{},completed=()=>{}}={}){
 let stage='waiting',visible=false,candidate=false,since=0,votes=0,openHits=[];const sizes=[];
 function publish(){changed(stage,visible);}
 function update(ready,cameraState){
  if(cameraState==='unavailable'){cancel();return;}
  const next=!!ready&&stage!=='done'&&stage!=='cancelled';
  if(next&&stage==='waiting')stage='fist';
  if(next!==visible){visible=next;publish();}
 }
 function cancel(){if(stage==='done'||stage==='cancelled')return;stage='cancelled';visible=false;candidate=false;votes=0;publish();}
 function process(features,now){
  if(stage==='done'||stage==='cancelled')return false;
  if(stage==='open'){
   openHits=openHits.filter(time=>now-time<=220);
   if(features?.folded>=3&&!features.open)openHits=[];
   if(features?.open){openHits.push(now);if(Number.isFinite(features.size)){sizes.push(features.size);if(sizes.length>24)sizes.shift();}}
   if(openHits.length>=2&&now-openHits[0]>=20){stage='done';visible=false;publish();const sorted=sizes.slice().sort((a,b)=>a-b);completed(sorted.length?sorted[Math.floor(sorted.length/2)]:.18);}
   return true;
  }
  if(!features){candidate=false;votes=0;return true;}
  if(stage==='waiting'){stage='fist';visible=true;publish();}
  const accepted=stage==='fist'?features.fist&&features.size>=.06:features.open;
  if(!accepted){candidate=false;votes=0;return true;}
  if(!candidate){candidate=true;since=now;votes=1;}else votes++;
  if(Number.isFinite(features.size)){sizes.push(features.size);if(sizes.length>24)sizes.shift();}
  if(votes>=2&&now-since>=45){
   candidate=false;votes=0;
   if(stage==='fist'){stage='open';publish();}
   else{stage='done';visible=false;publish();const sorted=sizes.slice().sort((a,b)=>a-b);completed(sorted.length?sorted[Math.floor(sorted.length/2)]:.18);}
  }
  return true;
 }
 return {update,process,cancel,get active(){return stage!=='done'&&stage!=='cancelled';},get stage(){return stage;}};
}
const handGuide=createGestureGuide({
 changed:(stage,visible)=>{const guide=$('gesture-guide');body.dataset.guideStage=stage;guide.dataset.stage=stage;if(stage==='fist'||stage==='open'){$('gesture-guide-step').textContent=stage==='open'?'2 / 2':'1 / 2';$('gesture-guide-text').textContent=stage==='open'?'打开拳头':'握着拳头靠近摄像头';}if(visible){guide.hidden=false;guide.classList.add('guide-visible');}else{guide.classList.remove('guide-visible');if(stage==='done')setTimeout(()=>{guide.hidden=true;},260);else guide.hidden=true;}},
 completed:size=>{handControls.calibrate(size);body.dataset.handCalibration=size.toFixed(3);rotationInertia.stop();mode(1);}
});
let snowTime=0;body.dataset.snowIntensity='medium';
// A single active-time clock keeps GPU particles, photos and input readiness in sync.
function sampleTreeEntrance(elapsed){
 const clamp=value=>Math.max(0,Math.min(1,value)),smooth=value=>{const t=clamp(value);return t*t*(3-2*t);};
 return {elapsed,done:elapsed>=5.2,tree:smooth((elapsed-1.5)/2.7),photos:smooth((elapsed-3.9)/.9)};
}
function createTreeEntrance({reducedMotion=false,onPhase=()=>{}}={}){
 let elapsed=-1,phase='waiting';onPhase(phase);
 function step(dt,ready,paused=false){
  if(phase==='waiting'&&ready){elapsed=reducedMotion?4.92:0;phase='playing';onPhase(phase);return sampleTreeEntrance(elapsed);}
  if(phase==='playing'&&!paused){elapsed=Math.min(5.2,elapsed+Math.max(0,Number.isFinite(dt)?dt:0));if(elapsed>=5.2){phase='done';onPhase(phase);}}
  return sampleTreeEntrance(elapsed);
 }
 return {step,isDone:()=>phase==='done',get elapsed(){return elapsed;},get phase(){return phase;}};
}
const entrance=createTreeEntrance({
 reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,
 onPhase:phase=>{body.dataset.entryPhase=phase;body.classList.toggle('tree-entering',phase==='playing');body.classList.toggle('tree-waiting',phase==='waiting');$('tree-entrance').hidden=phase!=='playing';}
});
let entryState=sampleTreeEntrance(-1);

// Horizontal rotation momentum, shared by hand tracking and pointer dragging.
function createRotationInertia(applyRotation){
 const damping=1.6,maxSpeed=3.8,quietMs=80;
 let velocity=0,lastSample=null,lastMotion=-Infinity,lastSource=null;
 function stop(){velocity=0;lastSample=null;lastMotion=-Infinity;lastSource=null;}
 function input(delta,now,source='hand'){
  if(!Number.isFinite(delta)||!Number.isFinite(now))return;
  applyRotation(delta);
  const dt=lastSource===source&&lastSample!==null?Math.max(.008,Math.min(.1,(now-lastSample)/1000)):1/30;
  lastSample=now;lastSource=source;
  // Still-hand landmark noise must not continually restart or brake a fling.
  if(Math.abs(delta)<.0035)return;
  const speed=Math.max(-maxSpeed,Math.min(maxSpeed,delta/dt));
  if(speed*velocity<0)velocity+=(speed-velocity)*.85;
  else if(Math.abs(speed)>=Math.abs(velocity)*.7)velocity+=(speed-velocity)*.65;
  else velocity*=Math.exp(-damping*dt*.55);
  lastMotion=now;
 }
 function release(now){if(lastMotion>-Infinity)lastMotion=Math.min(lastMotion,now-quietMs);}
 function step(now,dt,{blocked=false,holding=false}={}){
  if(blocked){stop();return;}
  if(holding||now-lastMotion<=quietMs||Math.abs(velocity)<.015)return;
  const elapsed=Math.max(0,Math.min(dt,(now-lastMotion-quietMs)/1000)),decay=Math.exp(-damping*elapsed);
  applyRotation(velocity*(1-decay)/damping);velocity*=decay;
  if(Math.abs(velocity)<.015)velocity=0;
 }
 return {input,step,release,stop,get velocity(){return velocity;}};
}

const rotationInertia=createRotationInertia(delta=>{yawTarget+=delta;});
// FLIP from the real thumbnail rectangle; interrupted transitions retain their visible pose.
function createPhotoFocus({records,changed=()=>{}}){
 const photo=document.getElementById('focus-photo'),note=document.getElementById('focus-note'),cover=document.getElementById('photo-focus'),shade=document.getElementById('focus-backdrop'),body=document.body;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 let image=photo,index=-1,phase='closed',serial=0,imageAnimation=null,shadeAnimation=null,closing=null;
 function publish(){cover.dataset.phase=phase;body.dataset.photoPhase=phase;body.dataset.photoFocus=index<0?'closed':'open';if(index>=0)body.dataset.photoIndex=String(index);changed(index,phase);}
 function cancelAnimations(){imageAnimation?.cancel();shadeAnimation?.cancel();imageAnimation=shadeAnimation=null;}
 function animate(element,frames,duration,easing){
  if(!element.animate){const end=frames[frames.length-1];for(const key of ['transform','opacity'])if(end[key]!==undefined)element.style[key]=end[key];return {finished:Promise.resolve(),cancel(){}};}
  const animation=element.animate(frames,{duration:reduced?0:duration,easing,fill:'both'});animation.finished.catch(()=>{});return animation;
 }
 function restoreCard(){if(records[index])records[index].card.style.visibility='';}
 function reset(){
  restoreCard();index=-1;phase='closed';cover.hidden=true;photo.removeAttribute('src');photo.removeAttribute('width');photo.removeAttribute('height');image.style.transform='';image.style.opacity='';shade.style.opacity='';photo.hidden=true;if(note)note.hidden=true;body.dataset.photoKind='none';body.classList.remove('photo-open');publish();
 }
 function thumbnailTransform(record){
  const from=record?.card.getBoundingClientRect(),to=image.getBoundingClientRect();
  if(!from||!from.width||!from.height||!to.width||!to.height)return 'translateY(12px) scale(.94)';
  const dx=from.left+from.width/2-to.left-to.width/2,dy=from.top+from.height/2-to.top-to.height/2;
  return `translate(${dx}px,${dy}px) scale(${from.width/to.width},${from.height/to.height})`;
 }
 async function open(next){
  if(!records.length||phase==='closing'||phase==='opening'||phase==='switching')return false;
  next=(next%records.length+records.length)%records.length;if(next===index)return false;
  const switching=index>=0,token=++serial,record=records[next];
  if(!switching)index=next;phase=switching?'switching':'opening';publish();
  try{if(record.kind==='wish'){await document.fonts?.load?.('36px ChristmasCalligraphy');}else{const decoded=new Image();decoded.src=record.fullURL;await decoded.decode();}}catch(error){if(token===serial){if(switching){phase='open';publish();}else reset();}return false;}
  if(token!==serial)return false;
  if(switching){imageAnimation=animate(image,[{opacity:1},{opacity:0}],140,'ease-out');await imageAnimation.finished.catch(()=>{});if(token!==serial)return false;cancelAnimations();restoreCard();index=next;}
  photo.hidden=true;if(note)note.hidden=true;image=record.kind==='wish'?note:photo;image.hidden=false;
  if(record.kind==='wish'){document.getElementById('focus-wish-text').textContent=record.wish.text;}else{photo.src=record.fullURL;photo.width=record.width;photo.height=record.height;}
  body.dataset.photoKind=record.kind==='wish'?'wish':'photo';image.style.transform='none';image.style.opacity='1';
  document.getElementById('focus-count').textContent=(index+1)+' / '+records.length;
  cover.hidden=false;body.classList.add('photo-open');record.card.style.visibility='hidden';phase='opening';publish();
  const from=switching?'translateY(10px) scale(.985)':thumbnailTransform(record);
  if(!switching)shadeAnimation=animate(shade,[{opacity:0},{opacity:1}],360,'ease-out');
  imageAnimation=animate(image,[{transform:from,opacity:switching?0:1},{transform:'translate(0px,0px) scale(1)',opacity:1}],switching?320:620,'cubic-bezier(.16,1,.3,1)');
  await imageAnimation.finished.catch(()=>{});if(token!==serial)return false;
  cancelAnimations();image.style.transform='';image.style.opacity='';shade.style.opacity='';phase='open';publish();return true;
 }
 function close(immediate=false){
  if(immediate||index<0||cover.hidden){serial++;cancelAnimations();reset();closing=null;return Promise.resolve();}
  if(phase==='closing')return closing;
  const token=++serial,current=getComputedStyle(image),transform=current.transform==='none'?'translate(0px,0px) scale(1)':current.transform,opacity=current.opacity,shadeOpacity=getComputedStyle(shade).opacity;
  cancelAnimations();image.style.transform='none';image.style.opacity='1';const destination=thumbnailTransform(records[index]);image.style.transform=transform;image.style.opacity=opacity;shade.style.opacity=shadeOpacity;
  phase='closing';body.classList.remove('photo-open');publish();
  shadeAnimation=animate(shade,[{opacity:shadeOpacity},{opacity:0}],440,'cubic-bezier(.4,0,.2,1)');
  imageAnimation=animate(image,[{transform,opacity},{transform:destination,opacity:1}],480,'cubic-bezier(.4,0,.2,1)');
  closing=imageAnimation.finished.catch(()=>{}).then(()=>{if(token!==serial)return;cancelAnimations();reset();closing=null;});return closing;
 }
 return {open,close,get phase(){return phase;}};
}

/* Photo TREE / SCATTER / FOCUS layout adapted in concept and spiral placement
 * from lecrix/my-christmas (MIT, Copyright (c) 2025 Christmas Tree Particle System).
 * Reimplemented as compositor-backed cards to retain the existing WebGL renderer.
 * Changes: local import, fit-preserving photos, nearest-card selection, single-file export.
 */
// Original wording inspired by the warmth/hope themes in Hallmark's Christmas-card guide:
// https://ideas.hallmark.com/articles/christmas-ideas/christmas-wishes/
const CHRISTMAS_WISHES=Object.freeze([
 {text:'May this Christmas leave a little light in your heart, and may that light stay with you long after winter.'},
 {text:'I hope the coming year brings you unhurried mornings, unexpected laughter, and people who make ordinary days feel warm.'},
 {text:'Some gifts never fit beneath a tree: a familiar voice, a shared smile, and the quiet joy of being remembered.'},
 {text:'Wherever the season finds you, I hope you feel close to someone who cares, and a little more at home.'},
 {text:'Here\u2019s to the wishes you haven\u2019t spoken yet, the places you\u2019ll discover, and the beautiful days still on their way.'}
]);
function christmasWishSlots(photoCount){return CHRISTMAS_WISHES.slice(0,Math.max(0,5-photoCount));}
function createPhotoWall(options){
 const $=id=>document.getElementById(id),layer=$('photo-layer'),gate=$('photo-entry'),input=$('photo-input'),status=$('photo-import-status');
 const records=[],ownedURLs=new Set();let loading=false,focused=-1,hover=-1,lastDraw=-Infinity,version=0,pendingImport=Promise.resolve();
 const focus=createPhotoFocus({records,changed:index=>{focused=index;}});
 const imageURL=blob=>{const url=URL.createObjectURL(blob);ownedURLs.add(url);return url;};
 const toBlob=(canvas,quality)=>new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('图片处理失败')),'image/jpeg',quality));
 const decode=async url=>{const image=new Image();image.src=url;await image.decode();return image;};
 const setStatus=text=>{status.textContent=text;};
 function enterScene(){if(gate.hidden)return;gate.classList.add('entry-leaving');setTimeout(()=>{gate.hidden=true;gate.classList.remove('entry-leaving');},matchMedia('(prefers-reduced-motion: reduce)').matches?0:430);}
 function close(immediate=false){return focus.close(immediate);}
 function clear(){close(true);records.forEach(record=>record.card.remove());records.length=0;hover=-1;ownedURLs.forEach(url=>URL.revokeObjectURL(url));ownedURLs.clear();}
 function fillWishes(){
  const photoCount=records.filter(record=>record.kind!=='wish').length;
  for(const wish of christmasWishSlots(photoCount)){
   const card=document.createElement('button');card.type='button';card.className='memory-card wish-card';card.lang='en';card.setAttribute('aria-label','Open a Christmas wish');
   const text=document.createElement('span');text.className='wish-card-text';text.textContent=wish.text;card.appendChild(text);
   const signature=document.createElement('span');signature.className='wish-card-signature';signature.textContent='Merry Christmas';card.appendChild(signature);
   const index=records.length;card.addEventListener('click',event=>{event.stopPropagation();select(index);});card.style.width='100px';card.style.height='78px';layer.appendChild(card);
   records.push({kind:'wish',wish,width:1000,height:780,baseW:100,baseH:78,card,index,screen:null});
  }
  document.body.dataset.photoCount=String(photoCount);document.body.dataset.wishCount=String(records.length-photoCount);document.body.dataset.memoryCount=String(records.length);
  return photoCount;
 }
 function select(index){
  return focus.open(index);
 }
 function nearest(pointer){
  if(!records.length)return -1;const w=innerWidth,h=innerHeight,x=(pointer?.x??.5)*w,y=(pointer?.y??.5)*h;
  let chosen=0,best=Infinity;
  for(let i=0;i<records.length;i++){const record=records[i];if(!record.screen)continue;const p=record.screen;if(p.x< -80||p.x>w+80||p.y< -80||p.y>h+80)continue;const score=Math.hypot(p.x-x,p.y-y)+(p.z<0?35:0);if(score<best){chosen=i;best=score;}}
  return chosen;
 }
 function toggle(pointer){if(loading||!gate.hidden||focus.phase==='closing')return false;if(focused>=0){close();return true;}const index=nearest(pointer);if(index<0)return false;select(index);return true;}
 function point(pointer){if(focused>=0||!gate.hidden)return;const next=nearest(pointer);if(next===hover)return;if(records[hover])records[hover].card.classList.remove('photo-hover');hover=next;if(records[hover])records[hover].card.classList.add('photo-hover');}
 function addRecord(fullBlob,thumbBlob,width,height,name){
  const fullURL=imageURL(fullBlob),thumbURL=imageURL(thumbBlob),card=document.createElement('button');card.type='button';card.className='memory-card';card.setAttribute('aria-label','打开照片 '+(records.length+1));
  const image=document.createElement('img');image.src=thumbURL;image.alt='';image.draggable=false;card.appendChild(image);
  const index=records.length;card.addEventListener('click',event=>{event.stopPropagation();select(index);});layer.appendChild(card);
  const ratio=width/height,baseW=ratio>=1?100:100*ratio,baseH=ratio>=1?100/ratio:100;card.style.width=baseW+'px';card.style.height=baseH+'px';
  records.push({kind:'photo',fullBlob,thumbBlob,fullURL,thumbURL,width,height,baseW,baseH,card,index,name:name||'照片',screen:null});
 }
 async function importImages(files){
  if(loading)return;const list=Array.from(files);if(!list.length)return;
  if(list.length>30){setStatus('一次最多导入 30 张照片，请重新选择。');gate.hidden=false;return;}
  const supported=list.filter(file=>['image/jpeg','image/png','image/webp','image/gif','image/avif'].includes(file.type)&&file.size>0&&file.size<=25*1024*1024);
  if(!supported.length){setStatus('请选择 JPG、PNG、WebP、GIF 或 AVIF 图片，每张不超过 25 MB。');gate.hidden=false;return;}
  loading=true;input.disabled=true;gate.hidden=false;const token=++version;const prepared=[];let failed=list.length-supported.length;
  try{
   for(let i=0;i<supported.length;i++){
    setStatus('正在导入 '+(i+1)+' / '+supported.length+'…');const file=supported[i],source=URL.createObjectURL(file);
    try{
     const image=await decode(source);if(token!==version)return;
     const ratio=Math.min(1,1280/Math.max(image.naturalWidth,image.naturalHeight)),width=Math.max(1,Math.round(image.naturalWidth*ratio)),height=Math.max(1,Math.round(image.naturalHeight*ratio));
     const full=document.createElement('canvas');full.width=width;full.height=height;const ctx=full.getContext('2d');ctx.fillStyle='#10100d';ctx.fillRect(0,0,width,height);ctx.drawImage(image,0,0,width,height);
     const thumb=document.createElement('canvas'),r=Math.min(1,280/Math.max(width,height));thumb.width=Math.max(1,Math.round(width*r));thumb.height=Math.max(1,Math.round(height*r));thumb.getContext('2d').drawImage(full,0,0,thumb.width,thumb.height);
     prepared.push({full:await toBlob(full,.88),thumb:await toBlob(thumb,.82),width,height,name:file.name});
    }catch(error){failed++;}finally{URL.revokeObjectURL(source);}
   }
   if(!prepared.length){setStatus('这些图片暂时无法读取，请换一组图片。');return;}
   clear();prepared.forEach(record=>addRecord(record.full,record.thumb,record.width,record.height,record.name));const photoCount=fillWishes();
   enterScene();document.body.dataset.photoFocus='closed';
   options.photosChanged?.(photoCount);setStatus(failed?'已导入 '+photoCount+' 张，'+failed+' 张无法读取。':'照片已导入');
  }finally{loading=false;input.disabled=false;input.value='';}
 }
 async function restore(encoded){
  if(!Array.isArray(encoded)||!encoded.length)return;
  const list=[];for(const value of encoded.slice(0,30))if(typeof value==='string'&&/^data:image\/(jpeg|png|webp);base64,/.test(value)){const blob=await(await fetch(value)).blob();list.push(new File([blob],'照片.jpg',{type:blob.type}));}
  if(list.length)await importImages(list);
 }
 function draw(now,scene){
  if(now-lastDraw<16||!records.length)return;lastDraw=now;
  const {w,h,spread,angle,entry=1}=scene,ca=Math.cos(angle),sa=Math.sin(angle),scale=Math.min(w*(.74-.41*spread),h*(.445-.12*spread));
  for(let i=0;i<records.length;i++){
   const record=records[i],q=.15+(i+.5)/records.length*.78,a=q*Math.PI*6+Math.PI/4,treeR=.12+q*.7;
   // The reference spiral becomes a cylindrical photo wall in SCATTER mode.
   const rows=Math.min(3,Math.max(records.length>3?2:1,Math.ceil(records.length/8))),row=i%rows,column=Math.floor(i/rows),columns=Math.ceil(records.length/rows),wallA=columns===1?0:(column/(columns-1)-.5)*Math.PI*1.3;
   const treeX=Math.sin(a)*treeR,treeZ=Math.cos(a)*treeR,treeY=(q-.5)*1.85;
   const wallX=Math.sin(wallA)*1.38,wallZ=Math.cos(wallA)*.9,wallY=rows===1?0:(row/(rows-1)-.5)*1.55;
   const x=treeX+(wallX-treeX)*spread,y=treeY+(wallY-treeY)*spread,z=treeZ+(wallZ-treeZ)*spread;
   const xx=x*ca+z*sa,zz=z*ca-x*sa,perspective=3.8/(3.8-zz),screenX=w*.5+xx*scale*perspective,screenY=h*.50+y*scale*Math.max(.9,Math.min(1.1,perspective));
   const edge=Math.max(27,Math.min(78,Math.min(w*(.64-.31*spread),h*(.425-.10*spread))*(.15+.10*spread)*perspective)),ratio=record.width/record.height;
   const width=ratio>=1?edge:edge*ratio,height=ratio>=1?edge/ratio:edge;
   record.screen={x:screenX,y:screenY,z:zz,width,height};record.card.style.transform=`translate3d(${screenX-record.baseW/2}px,${screenY-record.baseH/2}px,0) rotate(${Math.sin(i*2.3)*3*(1-spread)}deg) scale(${edge/100*(.78+.22*entry)})`;
   record.card.style.zIndex=String(Math.round(100+zz*20));record.card.style.opacity=String(entry*(.65+.35*Math.max(0,Math.min(1,(zz+1)/2))));
  }
 }
 function readBlob(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});}
 async function encodedPhotos(){await pendingImport;return Promise.all(records.filter(record=>record.kind!=='wish').map(record=>readBlob(record.fullBlob)));}
 function queueImages(files){pendingImport=importImages(files);return pendingImport;}
 $('choose-photos').onclick=()=>input.click();$('add-photos').onclick=()=>input.click();$('skip-photos').onclick=enterScene;
 input.onchange=()=>queueImages(input.files);$('close-photo').onclick=()=>close();$('previous-photo').onclick=()=>select(focused-1);$('next-photo').onclick=()=>select(focused+1);
 $('photo-focus').addEventListener('click',event=>{if(event.target===$('photo-focus'))close();});
 addEventListener('keydown',event=>{if(focused>=0){if(event.key==='Escape'){close();event.stopImmediatePropagation();}if(event.key==='ArrowLeft')select(focused-1);if(event.key==='ArrowRight')select(focused+1);}});
 addEventListener('pagehide',()=>{version++;clear();});
 fillWishes();
 if(options.initialPhotos?.length)pendingImport=restore(options.initialPhotos);
 return {draw,toggle,point,close,encodedPhotos,importImages:queueImages,isFocused:()=>focused>=0,isReady:()=>gate.hidden&&!loading,count:()=>records.length};
}

const photoWall=createPhotoWall({initialPhotos:cfg.photos,photosChanged:count=>{body.dataset.photoCount=String(count);queuePhotoSave();}});
// Runtime thumbnails are removed from this template when packing a shared file.
const originalTemplate=document.documentElement.outerHTML;
let savedURL=null,saveVersion=0,saveTimer=0;
function queuePhotoSave(){saveVersion++;clearTimeout(saveTimer);if(savedURL)URL.revokeObjectURL(savedURL);savedURL=null;const button=$('save-photo-tree');button.removeAttribute('href');button.setAttribute('aria-disabled','true');button.textContent='打包中…';saveTimer=setTimeout(preparePhotoSave,60);}
async function preparePhotoSave(){
 const button=$('save-photo-tree'),version=saveVersion;button.setAttribute('aria-disabled','true');button.textContent='打包中…';
 try{
  const photos=await photoWall.encodedPhotos(),settings={...cfg,photos,paused:false};
  const doc=new DOMParser().parseFromString(originalTemplate,'text/html'),script=doc.querySelector('script[data-tree-engine]');
  doc.querySelector('#photo-layer')?.replaceChildren();
  if(!script)throw Error('导出模板缺失');const text=script.textContent,end=text.indexOf(';\n');
  const encoded=JSON.stringify(settings).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  script.textContent='const TREE_CONFIG = '+encoded+';\n'+text.slice(end+2);
  if(version!==saveVersion)return;
  const blob=new Blob(['<!doctype html>\n'+doc.documentElement.outerHTML],{type:'text/html;charset=utf-8'});if(savedURL)URL.revokeObjectURL(savedURL);savedURL=URL.createObjectURL(blob);
  button.href=savedURL;button.download=(cfg.name?.trim().replace(/[\\/:*?"<>|\x00-\x1f]/g,'').slice(0,32)||'圣诞照片墙')+'-photo-tree.html';button.textContent='保存';button.removeAttribute('aria-disabled');document.body.dataset.photoExportBytes=String(blob.size);
 }catch(error){button.textContent='点击重新打包';button.removeAttribute('aria-disabled');document.body.dataset.photoExportError=String(error.message||error);}
}
$('save-photo-tree').onclick=event=>{if(!savedURL){event.preventDefault();queuePhotoSave();}};
addEventListener('pagehide',()=>{clearTimeout(saveTimer);if(savedURL)URL.revokeObjectURL(savedURL);});

let randomSeed=1977;const rand=()=>{randomSeed=(randomSeed*1664525+1013904223)>>>0;return randomSeed/4294967296;};
const count=8721,data=new Float32Array(count*10);
body.dataset.particleCount=String(count);
for(let i=0;i<count;i++){
 const p=i*10,q=Math.pow(rand(),.75),a=rand()*Math.PI*2,r=(.1+.9*Math.pow(rand(),.23))*.68*Math.pow(q,.82)*(1+.16*Math.sin(a*3+q*17)+.10*Math.cos(a*7-q*29))*(i%19===0?1.24:1),u=rand()*2-1,b=rand()*6.283,s=.65+rand()*.7;
 data.set([Math.sin(a)*r,(q-.5)*1.85+(rand()-.5)*.045,Math.cos(a)*r,Math.sqrt(1-u*u)*Math.cos(b)*s,u*s,Math.sqrt(1-u*u)*Math.sin(b)*s,3.8+rand()*4.0,rand()*6.283,i<260?1:i<400?2:0,i%4===0?1:0],p);
 if(i>=8200){const depth=rand();data.set([rand(),rand(),depth,rand(),rand(),0,1.35+depth*depth*4.1,rand()*6.283,4,(i-8200)/520],p);}
 if(i===8720)data.set([0,-1,0,0,-1,0,32,0,3,0],p);
}
const vertex=`
attribute vec3 aHome;attribute vec3 aAway;attribute vec4 aMeta;
uniform vec2 uViewport;uniform mediump float uTime,uAngle,uTilt,uSpread,uZoom,uDpr,uSnow,uEntry;uniform highp float uSnowTime;
varying mediump vec4 vMeta;varying mediump float vDepth,vAppear;
void main(){
 vMeta=aMeta;vDepth=1.0;vAppear=1.0;
 if(aMeta.z>3.5){
 float density=clamp(uViewport.x*uViewport.y/921600.,.32,1.);
 if(uSnow<.5||aMeta.w>density){gl_Position=vec4(2.,2.,0.,1.);gl_PointSize=1.;vAppear=0.;return;}
 float depth=aHome.z,phase=aMeta.y;
 vec2 p=aHome.xy;
 p.y=fract(p.y+uSnowTime*(.018+.055*pow(depth,1.3)));
 p.x=fract(p.x+uSnowTime*(.002+.004*aAway.y)+sin(uSnowTime*(.32+.25*depth)+phase)*(.008+.01*depth));
 gl_Position=vec4(p.x*2.-1.,1.-p.y*2.,0.,1.);
 gl_PointSize=aMeta.x*uDpr;vAppear=.42+.48*depth;return;
}
 vec3 p=mix(aHome,aAway,uSpread);
 // A separate continuous ribbon writes the silhouette before the cloud resolves.
 if(uEntry<5.2){
  float q=clamp((aHome.y+.925)/1.85,0.,1.),seed=fract(aMeta.y*1.6180339);
  if(aMeta.z>2.5){vAppear=smoothstep(4.05,4.9,uEntry);}
  else{
   float arrival=1.55+(1.-q)*1.8+seed*.22,gather=smoothstep(arrival,arrival+1.18,uEntry),ease=1.-pow(1.-gather,3.);
   float turn=(1.-gather)*2.0,cs=cos(turn),sn=sin(turn);
   vec3 source=aAway*1.4;source=vec3(source.x*cs+source.z*sn,source.y,source.z*cs-source.x*sn);
   p=mix(source,aHome,ease);vAppear=pow(gather,1.6);
  }
 }

 float ca=cos(uAngle),sa=sin(uAngle),ct=cos(uTilt),st=sin(uTilt);
 if(aMeta.z<2.5){float wander=.007+.013*uSpread;p.x+=sin(uTime*.45+aMeta.y*3.7)*wander;p.z+=cos(uTime*.37+aMeta.y*2.9)*wander;}
 p=vec3(p.x*ca+p.z*sa,p.y,p.z*ca-p.x*sa);p=vec3(p.x,p.y*ct-p.z*st,p.z*ct+p.y*st);
 float perspective=3.8/(3.8-p.z),scale=min(uViewport.x*mix(.74,.33,uSpread),uViewport.y*mix(.445,.325,uSpread))*uZoom;
 vec2 screen=vec2(uViewport.x*.5,uViewport.y*.50)+vec2(p.x*perspective,p.y*clamp(perspective,.9,1.1))*scale;
 gl_Position=vec4(screen.x/uViewport.x*2.-1.,1.-screen.y/uViewport.y*2.,0.,1.);
 float factor=clamp(scale/280.,.7,1.6)*perspective;
 gl_PointSize=clamp(aMeta.x*(aMeta.z<.5?2.2:2.5)*factor*uDpr,1.,aMeta.z>2.5?88.:42.);
 gl_PointSize*=mix(.55,1.,smoothstep(.9,3.,uEntry));
 if(aMeta.z>2.5)gl_PointSize=54.*factor*uDpr;
 vDepth=.7+p.z*.16;
}`;
const fragment=`
precision mediump float;uniform vec3 uColor;uniform float uTime,uSpread;
varying mediump vec4 vMeta;varying mediump float vDepth,vAppear;
void main(){
 vec2 p=(gl_PointCoord-.5)*2.;float r=length(p);if(r>1.)discard;
 float kind=vMeta.z,twinkle=.72+.28*sin(uTime*1.5+vMeta.y),alpha;vec3 color=uColor;
 if(kind>3.5){alpha=((1.-smoothstep(.15,.9,r))*.72+exp(-r*r*6.)*.12);color=vec3(.88,.93,1.);}
 else if(kind>2.5){float a=atan(p.x,-p.y),w=abs(mod(a+.628319,1.256637)-.628319);float edge=.27+.63*pow(1.-w/.628319,2.);alpha=((1.-smoothstep(edge-.03,edge+.025,r))*.9+exp(-r*r*5.)*.13)*(1.-uSpread);color=vec3(1.,.91,.59);}
 else if(kind>1.5){float square=max(abs(p.x),abs(p.y));alpha=1.-smoothstep(.35,.47,square);color=vMeta.w>.5?vec3(.82,.16,.12):uColor;float ribbon=1.-smoothstep(.04,.095,abs(p.x));color=mix(color,vec3(1.,.86,.51),ribbon*.85);}
 else if(kind>.5){float sphere=1.-smoothstep(.5,.61,r);float light=pow(max(0.,1.-length(p-vec2(-.15,-.2))*2.),5.);color=(vMeta.w>.5?vec3(.85,.075,.05):uColor)*(.45+.55*sqrt(max(0.,1.-r*r)));color+=vec3(light*.9);alpha=sphere*.92+exp(-r*r*5.)*.1;}
 else{float core=1.-smoothstep(.025,.22,r);alpha=(core*.85+exp(-r*r*9.)*.23)*twinkle*vDepth;float tone=fract(vMeta.y*1.618);vec3 base=tone<.22?vec3(1.,.66,.055):tone<.40?vec3(1.,.88,.18):tone<.50?vec3(1.,.93,.65):tone<.56?vec3(1.,.43,.12):tone<.61?vec3(.95,.19,.25):tone<.66?vec3(.3,.88,.62):uColor;color=mix(base,vec3(1.,.97,.86),core*.48);}
 gl_FragColor=vec4(color,alpha*vAppear);
}`;
/* Separable bloom adapted from three.js UnrealBloomPass (MIT, three.js authors).
 * Billboard ribbon / soft-edge treatment references NewKrok/three-particles
 * (MIT, Istvan Krisztian Somoracz). Paths, pacing and composition are original.
 * Full notices are embedded in the standalone HTML. No runtime dependency.
 */
function createCinematicRenderer(gl){
 const ownedPrograms=[],ownedBuffers=[],targets=[];
 let scene=null,bright=null,ping=null,width=0,height=0,entryClock=-1,starY=.945;
 const half=gl.getExtension('OES_texture_half_float'),halfRender=gl.getExtension('EXT_color_buffer_half_float'),halfLinear=gl.getExtension('OES_texture_half_float_linear');
 let hdr=!!(half&&halfRender);
 const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
 function program(vs,fs){
  const shaders=[];for(const [type,source]of [[gl.VERTEX_SHADER,vs],[gl.FRAGMENT_SHADER,fs]]){const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){const message=gl.getShaderInfoLog(shader);gl.deleteShader(shader);throw Error(message);}shaders.push(shader);}
  const p=gl.createProgram();shaders.forEach(s=>gl.attachShader(p,s));gl.linkProgram(p);shaders.forEach(s=>gl.deleteShader(s));if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));ownedPrograms.push(p);return p;
 }
 function buffer(data){const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);ownedBuffers.push(b);return b;}
 function bind(p,b,name,size){gl.useProgram(p);for(let i=0;i<4;i++)gl.disableVertexAttribArray(i);gl.bindBuffer(gl.ARRAY_BUFFER,b);const location=gl.getAttribLocation(p,name);gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,0,0);}
 function uniform(p,name){return gl.getUniformLocation(p,name);}
 const quad=buffer(new Float32Array([-1,-1,3,-1,-1,3]));
 const screenVertex=`attribute vec2 aPosition;varying vec2 vUv;void main(){vUv=aPosition*.5+.5;gl_Position=vec4(aPosition,0.,1.);}`;
 const high=program(screenVertex,`precision mediump float;varying vec2 vUv;uniform sampler2D uSource;void main(){vec3 c=texture2D(uSource,vUv).rgb;float luminance=dot(c,vec3(.2126,.7152,.0722));gl_FragColor=vec4(c*smoothstep(.64,1.1,luminance),1.);}`);
 // Pair adjacent Gaussian taps into bilinear samples, as in UnrealBloomPass.
 const coefficients=Array.from({length:6},(_,i)=>Math.exp(-.5*i*i/4)),normalizer=coefficients[0]+2*coefficients.slice(1).reduce((a,b)=>a+b,0);
 const terms=[`texture2D(uSource,vUv).rgb*${(coefficients[0]/normalizer).toFixed(8)}`];
 for(let i=1;i<6;i+=2){const a=coefficients[i],b=coefficients[i+1]||0,w=a+b,offset=(i*a+(i+1)*b)/w;terms.push(`(texture2D(uSource,vUv+uStep*${offset.toFixed(8)}).rgb+texture2D(uSource,vUv-uStep*${offset.toFixed(8)}).rgb)*${(w/normalizer).toFixed(8)}`);}
 const blur=program(screenVertex,`precision mediump float;varying vec2 vUv;uniform sampler2D uSource;uniform vec2 uStep;void main(){gl_FragColor=vec4(${terms.join('+')},1.);}`);
 const composite=program(screenVertex,`precision mediump float;varying vec2 vUv;uniform sampler2D uSource,uBloom;uniform vec2 uAspect,uStar;uniform float uEntry;void main(){vec3 light=texture2D(uSource,vUv).rgb*1.05+texture2D(uBloom,vUv).rgb*.72;vec3 mapped=light/(vec3(1.)+light);mapped=pow(mapped,vec3(.86));vec2 p=(vUv-.5)*uAspect;float mist=exp(-dot(p,p)*3.6);vec3 background=mix(vec3(.012,.018,.026),vec3(.025,.038,.047),mist);vec2 f=(vUv-uStar)*uAspect;float age=(uEntry-4.48)*5.;float flash=exp(-age*age);float flare=exp(-length(f)*65.)*.18+exp(-abs(f.y)*1300.-abs(f.x)*16.)*.38+exp(-abs(f.x)*900.-abs(f.y)*65.)*.23;gl_FragColor=vec4(background+mapped+vec3(1.,.84,.53)*flash*flare,1.);}`);
 const segments=512,bands=3,ribbonData=new Float32Array(segments*bands*6*3);let at=0;
 for(let band=0;band<bands;band++)for(let i=0;i<segments;i++){const a=i/segments,b=(i+1)/segments;for(const [s,side]of [[a,-1],[a,1],[b,1],[a,-1],[b,1],[b,-1]]){ribbonData[at++]=s;ribbonData[at++]=side;ribbonData[at++]=band;}}
 const ribbonBuffer=buffer(ribbonData);
 const ribbon=program(`
 precision highp float;attribute vec3 aParam;uniform vec2 uViewport;uniform float uEntry,uClock,uAngle;
 varying float vEdge,vS,vBand,vHead,vAlpha,vDepth;
 vec3 orbit(float s,float band){float a=s*6.283185+uClock*.13+band*2.0944;vec3 p=vec3(cos(a)*.95,sin(a)*.69,sin(a+band*1.1)*.48);float tilt=band*.48-.5;return vec3(p.x*cos(tilt)-p.y*sin(tilt),p.x*sin(tilt)+p.y*cos(tilt),p.z);}
 vec3 path(float s,float band){
  if(uEntry<0.||band>1.5)return orbit(s,band);
  float side=band<.5?1.:-1.;
  if(s<.18){float t=s/.18,a=1.-t;vec3 p0=vec3(-2.*side,.4,.2),p1=vec3(-1.35*side,-1.4,-.8),p2=vec3(.88956*side,1.06046,2.0082*side),p3=vec3(.84*side,.92,0.);return a*a*a*p0+3.*a*a*t*p1+3.*a*t*t*p2+t*t*t*p3;}
  float q=(s-.18)/.82,r=.014+.826*pow(1.-q,.82),a=q*32.67256+1.570796+band*3.141593;
  return vec3(sin(a)*r,.92-q*1.92,cos(a)*r);
 }
 vec3 project(vec3 p,float band){
  bool mobile=uViewport.x<700.;float blend=uEntry<0.?0.:smoothstep(0.,.85,uEntry);
  if(band<1.5&&uEntry>=0.)blend=1.;
  float ca=cos(uAngle),sa=sin(uAngle);p=vec3(p.x*ca+p.z*sa,p.y,p.z*ca-p.x*sa);
  float depth=3.8/(3.8-p.z),idleScale=min(uViewport.x*(mobile?.44:.32),uViewport.y*(mobile?.19:.35));
  float scale=mix(idleScale,min(uViewport.x*.74,uViewport.y*.445),blend);
  vec2 center=mix(vec2(uViewport.x*(mobile?.54:.73),uViewport.y*(mobile?.66:.5)),uViewport*.5,blend);
  return vec3(center+vec2(p.x*depth,p.y*clamp(depth,.9,1.1))*scale,p.z);
 }
 void main(){
  float s=aParam.x,side=aParam.y,band=aParam.z;vec3 here=project(path(s,band),band),next=project(path(min(1.,s+.0007),band),band),previous=project(path(max(0.,s-.0007),band),band);
  vec2 tangent=next.xy-previous.xy;float lengthT=length(tangent);vec2 perpendicular=lengthT>.001?vec2(-tangent.y,tangent.x)/lengthT:vec2(1.,0.);
  bool idle=uEntry<0.||band>1.5;float head=idle?fract(uClock*.08+band*.33):clamp((uEntry+.06-band*.13)/3.85,0.,1.);
  float tail=idle?1.:mix(.16,1.,smoothstep(.65,3.6,uEntry)),age=head-s;
  float alpha=idle?.30:smoothstep(-.001,.006,age)*smoothstep(0.,.09,tail-age)*(1.-smoothstep(4.0,5.15,uEntry));
  if(!idle)alpha*=mix(1.-smoothstep(1.3,2.35,uEntry),1.,smoothstep(.15,.21,s));
  if(band>1.5&&uEntry>=0.)alpha*=1.-smoothstep(0.,.75,uEntry);
  float halfWidth=idle?5.:8.5, taper=idle?1.:mix(.35,1.,clamp(1.-age/max(.01,tail),0.,1.));
  vec2 screen=here.xy+perpendicular*side*halfWidth*taper;
  gl_Position=vec4(screen/uViewport*vec2(2.,-2.)+vec2(-1.,1.),0.,1.);
  vEdge=side;vS=s;vBand=band;vHead=head;vAlpha=alpha;vDepth=clamp(.76+here.z*.25,.35,1.1);
 }`, `
 precision mediump float;varying float vEdge,vS,vBand,vHead,vAlpha,vDepth;
 void main(){float across=abs(vEdge),core=exp(-across*across*95.),halo=exp(-across*across*6.)*.14;
  float headDistance=min(abs(vS-vHead),1.-abs(vS-vHead))*720.,head=exp(-headDistance*headDistance);
  vec3 tint=vBand<.5?vec3(1.,.64,.24):vBand<1.5?vec3(.46,.72,1.):vec3(.84,.88,1.);
  float shimmer=.9+.1*sin(vS*160.+vBand*7.);vec3 color=tint*(core*2.1+halo*1.5)*shimmer+vec3(1.,.94,.8)*head*exp(-across*across*5.)*5.;
  gl_FragColor=vec4(color,vAlpha*vDepth);
 }`);
 const locations={ribbon:{viewport:uniform(ribbon,'uViewport'),entry:uniform(ribbon,'uEntry'),clock:uniform(ribbon,'uClock'),angle:uniform(ribbon,'uAngle')},high:uniform(high,'uSource'),blurSource:uniform(blur,'uSource'),blurStep:uniform(blur,'uStep'),scene:uniform(composite,'uSource'),bloom:uniform(composite,'uBloom'),aspect:uniform(composite,'uAspect'),entry:uniform(composite,'uEntry'),star:uniform(composite,'uStar')};
 function releaseTargets(){targets.splice(0).forEach(t=>{gl.deleteFramebuffer(t.framebuffer);gl.deleteTexture(t.texture);});scene=bright=ping=null;}
 function target(w,h,floating){const texture=gl.createTexture(),framebuffer=gl.createFramebuffer();gl.bindTexture(gl.TEXTURE_2D,texture);const filter=floating&&!halfLinear?gl.NEAREST:gl.LINEAR;gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,filter);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,filter);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,floating?half.HALF_FLOAT_OES:gl.UNSIGNED_BYTE,null);gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE){gl.deleteTexture(texture);gl.deleteFramebuffer(framebuffer);return null;}const t={texture,framebuffer,w,h};targets.push(t);return t;}
 function resize(w,h){if(w===width&&h===height)return;releaseTargets();width=w;height=h;scene=target(w,h,hdr);if(!scene&&hdr){hdr=false;scene=target(w,h,false);}if(!scene)throw Error('Frame buffer unavailable');const smallW=Math.max(1,Math.min(640,Math.round(w/3))),smallH=Math.max(1,Math.round(h*smallW/w));bright=target(smallW,smallH,false);ping=target(smallW,smallH,false);if(!bright||!ping)throw Error('Bloom buffer unavailable');document.body.dataset.effects=hdr?'hdr-ribbon-bloom':'ribbon-bloom';}
 function texture(unit,t){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,t.texture);}
 function screen(p,destination){gl.bindFramebuffer(gl.FRAMEBUFFER,destination?.framebuffer||null);gl.viewport(0,0,destination?.w||width,destination?.h||height);bind(p,quad,'aPosition',2);}
 function begin(w,h){resize(w,h);gl.bindFramebuffer(gl.FRAMEBUFFER,scene.framebuffer);gl.viewport(0,0,w,h);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);}
 function trails(viewport,entry,clock,angle){entryClock=entry;starY=.5+Math.min(viewport[0]*.74,viewport[1]*.445)/viewport[1];if(entry>=5.2)return;bind(ribbon,ribbonBuffer,'aParam',3);gl.uniform2f(locations.ribbon.viewport,viewport[0],viewport[1]);gl.uniform1f(locations.ribbon.entry,entry);gl.uniform1f(locations.ribbon.clock,reducedMotion?0:clock);gl.uniform1f(locations.ribbon.angle,angle);gl.drawArrays(gl.TRIANGLES,0,ribbonData.length/3);}
 function finish(){gl.disable(gl.BLEND);screen(high,bright);texture(0,scene);gl.uniform1i(locations.high,0);gl.drawArrays(gl.TRIANGLES,0,3);screen(blur,ping);texture(0,bright);gl.uniform1i(locations.blurSource,0);gl.uniform2f(locations.blurStep,1/bright.w,0);gl.drawArrays(gl.TRIANGLES,0,3);screen(blur,bright);texture(0,ping);gl.uniform1i(locations.blurSource,0);gl.uniform2f(locations.blurStep,0,1/bright.h);gl.drawArrays(gl.TRIANGLES,0,3);screen(composite,null);texture(0,scene);texture(1,bright);gl.uniform1i(locations.scene,0);gl.uniform1i(locations.bloom,1);gl.uniform2f(locations.aspect,width/Math.max(width,height),height/Math.max(width,height));gl.uniform1f(locations.entry,entryClock);gl.uniform2f(locations.star,.5,starY);gl.drawArrays(gl.TRIANGLES,0,3);gl.activeTexture(gl.TEXTURE0);}
 function dispose(){releaseTargets();ownedBuffers.forEach(b=>gl.deleteBuffer(b));ownedPrograms.forEach(p=>gl.deleteProgram(p));}
 return {begin,trails,finish,dispose};
}

let cinema=null,particleLayout=[];
let gl=canvas.getContext('webgl',{alpha:true,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:false,powerPreference:'high-performance'}),program,buffer,uniforms,contextLost=false,ctx2d=null,sprites=null;
function shader(type,source){const value=gl.createShader(type);gl.shaderSource(value,source);gl.compileShader(value);if(!gl.getShaderParameter(value,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(value));return value;}
function setupGL(){
 const vs=shader(gl.VERTEX_SHADER,vertex),fs=shader(gl.FRAGMENT_SHADER,fragment);program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);
 if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
 gl.useProgram(program);buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);
 for(const [name,size,offset] of [['aHome',3,0],['aAway',3,12],['aMeta',4,24]]){const location=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,40,offset);}
 uniforms={};for(const name of ['Viewport','Time','Angle','Tilt','Spread','Zoom','Dpr','Snow','SnowTime','Color','Entry'])uniforms[name]=gl.getUniformLocation(program,'u'+name);
 particleLayout=['aHome','aAway','aMeta'].map((name,i)=>({location:gl.getAttribLocation(program,name),size:i===2?4:3,offset:i*12}));
 try{cinema?.dispose();cinema=createCinematicRenderer(gl);}catch(error){cinema=null;body.dataset.effectsError=String(error.message);gl.bindFramebuffer(gl.FRAMEBUFFER,null);}
 gl.disable(gl.DEPTH_TEST);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);gl.clearColor(0,0,0,0);body.dataset.renderer='webgl';
}
function makeSprites(){sprites=[hex,'#e33f32','#ffe7ab'].map(color=>{const c=document.createElement('canvas');c.width=c.height=32;const x=c.getContext('2d'),g=x.createRadialGradient(16,16,0,16,16,16);g.addColorStop(0,'#fff4ce');g.addColorStop(.18,color);g.addColorStop(1,'transparent');x.fillStyle=g;x.fillRect(0,0,32,32);return c;});}
if(gl){try{setupGL();}catch(error){body.dataset.renderError=String(error.message);gl=null;}}
if(!gl){const replacement=canvas.cloneNode();canvas.replaceWith(replacement);canvas=replacement;ctx2d=canvas.getContext('2d',{alpha:true});makeSprites();body.dataset.renderer='canvas-fallback';}
function updateColor(){rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);}
updateColor();
function resize(){w=innerWidth;h=innerHeight;dpr=Math.min(devicePixelRatio||1,gl?1.5:1);canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);if(gl)gl.viewport(0,0,canvas.width,canvas.height);else ctx2d.setTransform(dpr,0,0,dpr,0,0);}
function draw(){
 if(!gl){
  ctx2d.clearRect(0,0,w,h);ctx2d.globalCompositeOperation='lighter';const ca=Math.cos(t*.12+yaw),sa=Math.sin(t*.12+yaw),ct=Math.cos(0),st=Math.sin(0),scale=Math.min(w*(.74-.41*spread),h*(.445-.12*spread));
  for(let i=0;i<8200;i+=3){const p=i*10,x=data[p]+(data[p+3]-data[p])*spread,y=data[p+1]+(data[p+4]-data[p+1])*spread,z=data[p+2]+(data[p+5]-data[p+2])*spread,xx=x*ca+z*sa,zz=z*ca-x*sa,yy=y*ct-zz*st,depth=3.8/(3.8-zz*ct-y*st),size=(data[p+8]?12:9)*depth;ctx2d.globalAlpha=entryState.tree*(.5+.25*Math.sin(t+data[p+7]));ctx2d.drawImage(sprites[data[p+9]&&data[p+8]?1:0],w*.5+xx*scale*depth-size/2,h*.50+yy*scale*Math.max(.9,Math.min(1.1,depth))-size/2,size,size);}
  
  if(cfg.snow){const density=Math.max(.32,Math.min(1,w*h/921600));ctx2d.fillStyle='#e0edff';for(let i=8200;i<count-1;i++){const p=i*10;if(data[p+9]>density)continue;const depth=data[p+2],phase=data[p+7],x=((data[p]+snowTime*(.002+.004*data[p+4])+Math.sin(snowTime*(.32+.25*depth)+phase)*(.008+.01*depth))%1+1)%1*w,y=((data[p+1]+snowTime*(.018+.055*Math.pow(depth,1.3)))%1+1)%1*h;ctx2d.globalAlpha=.3+.4*depth;ctx2d.beginPath();ctx2d.arc(x,y,data[p+6]*.5,0,Math.PI*2);ctx2d.fill();}}
  ctx2d.globalAlpha=1;return;
 }
 if(contextLost)return;if(cinema)cinema.begin(canvas.width,canvas.height);else{gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,canvas.width,canvas.height);gl.clear(gl.COLOR_BUFFER_BIT);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);}
 gl.useProgram(program);for(let i=0;i<4;i++)gl.disableVertexAttribArray(i);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);for(const a of particleLayout){gl.enableVertexAttribArray(a.location);gl.vertexAttribPointer(a.location,a.size,gl.FLOAT,false,40,a.offset);}
 gl.uniform2f(uniforms.Viewport,w,h);gl.uniform1f(uniforms.Time,t);gl.uniform1f(uniforms.Angle,t*.12+yaw);gl.uniform1f(uniforms.Tilt,0);gl.uniform1f(uniforms.Entry,entryState.elapsed);gl.uniform1f(uniforms.Spread,spread);gl.uniform1f(uniforms.Zoom,1);gl.uniform1f(uniforms.Dpr,dpr);gl.uniform1f(uniforms.Snow,cfg.snow?1:0);gl.uniform1f(uniforms.SnowTime,snowTime);gl.uniform3fv(uniforms.Color,rgb);gl.drawArrays(gl.POINTS,0,count);if(cinema){cinema.trails([w,h],entryState.elapsed,t,t*.12+yaw);cinema.finish();}
}
let statAt=0,statFrames=0,drawMs=0;
function loop(now){
 raf=0;if(disposed||document.hidden)return;
 const frameDt=Math.max(0,(now-last)/1000||.016),dt=Math.min(.05,frameDt);last=now;
 entryState=entrance.step(frameDt,photoWall.isReady(),paused);handGuide.update(entrance.isDone()&&photoWall.isReady(),body.dataset.handCamera);
 if(!paused)snowTime+=Math.min(.1,frameDt);if(!paused&&!photoWall.isFocused())t+=dt;
 rotationInertia.step(now,dt,{blocked:paused||!entrance.isDone()||photoWall.isFocused()||!photoWall.isReady(),holding:drag});spread+=(target-spread)*(1-Math.exp(-dt*2.4));yaw+=(yawTarget-yaw)*(1-Math.exp(-dt*38));
 const started=performance.now();draw();photoWall.draw(now,{w,h,spread,angle:t*.12+yaw,entry:entryState.photos});drawMs+=performance.now()-started;statFrames++;
 if(now-statAt>2000){body.dataset.entryElapsed=entryState.elapsed.toFixed(2);body.dataset.inertiaSpeed=rotationInertia.velocity.toFixed(3);body.dataset.renderFps=(statFrames*1000/(now-statAt)).toFixed(1);body.dataset.renderMs=(drawMs/statFrames).toFixed(2);statAt=now;statFrames=0;drawMs=0;}
 raf=requestAnimationFrame(loop);
}
function mode(value){if(!entrance.isDone())return;rotationInertia.stop();const apply=()=>{target=value;body.dataset.sceneState=value?'expanded':'tree';};if(photoWall.isFocused())photoWall.close().then(apply);else apply();}
function applyConfig(next){if(!next)return;for(const key of ['name','message'])if(typeof next[key]==='string')cfg[key]=next[key].slice(0,key==='name'?32:60);if(typeof next.snow==='boolean')cfg.snow=next.snow;if(/^#[\da-f]{6}$/i.test(next.color)){hex=cfg.color=next.color;updateColor();if(!gl)makeSprites();}document.title=(cfg.name?.trim()||'星光')+' · 圣诞树';const recipient=cfg.name?.trim()||'';$('dedication-name').textContent=recipient;$('tree-dedication').hidden=!recipient;if(photoWall.count())queuePhotoSave();}
const pointers=new Map();let moved=false;
canvas.addEventListener('pointerdown',event=>{if(!entrance.isDone())return;rotationInertia.stop();canvas.setPointerCapture(event.pointerId);pointers.set(event.pointerId,{x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY});drag=true;moved=pointers.size>1;});
canvas.addEventListener('pointermove',event=>{const old=pointers.get(event.pointerId);if(!old)return;pointers.set(event.pointerId,{x:event.clientX,y:event.clientY,startX:old.startX,startY:old.startY});if(Math.hypot(event.clientX-old.startX,event.clientY-old.startY)>4)moved=true;if(pointers.size===1)rotationInertia.input((event.clientX-old.x)*.014,performance.now(),'pointer');else moved=true;});
function release(event){if(event.type==='pointercancel')rotationInertia.stop();else if(moved)rotationInertia.release(performance.now());pointers.delete(event.pointerId);if(!moved&&event.type!=='pointercancel')mode(target?0:1);if(!pointers.size)drag=false;}
canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);
addEventListener('keydown',event=>{if(event.target.closest?.('button,input'))return;if(event.code==='Space'){event.preventDefault();mode(target?0:1);}if(event.key==='Escape'&&!photoWall.isFocused())mode(0);});
addEventListener('message',event=>{if(event.source!==parent||!event.data)return;if(event.data.type==='photo-export-request'){photoWall.encodedPhotos().then(photos=>parent.postMessage({type:'photo-export-response',id:event.data.id,photos},'*'));}if(event.data.type==='starlight-config')applyConfig(event.data.config);if(event.data.type==='starlight-motion')paused=!!event.data.paused;});
canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();contextLost=true;});canvas.addEventListener('webglcontextrestored',()=>{setupGL();resize();contextLost=false;});

/*
 * One Euro filter and aspect-corrected pose features adapted from
 * https://github.com/leonardo-carnevalli/hand-gesture-3d
 * src/gesture/one-euro.ts, features.ts, classifier.ts and actions.ts.
 * MIT License. Copyright (c) 2026 Leonardo Carnevalli.
 * Full license is included in the document's third-party-notices block.
 * Changes: palm motion independent of pose, short-loss continuity, faster
 * hysteresis, higher rotation gain, and horizontal-only movement.
 */
// Adapted from responsive-controls.js; retain the MIT notice included in the document.
// Gesture edges and pinch hysteresis retain the MIT attribution from hand-gesture-3d.
// Finger bend angles follow the 3D curl approach in andypotato/fingerpose (MIT).
function estimateOpenHand(hand,world,aspect,recognition){
 const useWorld=Array.isArray(world)&&world.length===21&&world.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z));
 const points=useWorld?world:hand,scale=useWorld?1:aspect;
 const angles=[6,10,14,18].map((joint,i)=>{const a=points[0],b=points[joint],c=points[8+i*4],ax=(a.x-b.x)*scale,ay=a.y-b.y,az=((a.z||0)-(b.z||0))*scale,bx=(c.x-b.x)*scale,by=c.y-b.y,bz=((c.z||0)-(b.z||0))*scale,denominator=Math.hypot(ax,ay,az)*Math.hypot(bx,by,bz);return denominator>1e-9?Math.acos(Math.max(-1,Math.min(1,(ax*bx+ay*by+az*bz)/denominator)))*180/Math.PI:0;});
 const extended=angles.filter(angle=>angle>=125).length,loose=angles.filter(angle=>angle>=105).length,folded=angles.filter(angle=>angle<85).length;
 const score=recognition?.categoryName==='Open_Palm'?(recognition.score||0):0;
 return {open:extended>=3||(score>=.32&&loose>=2)||score>=.78,folded,extended,indexAngle:angles[0],confidence:Math.max(score,extended>=3?.8:loose>=3?.55:0)};
}
function measurePhotoPinch(hand,world,aspect){
 const useWorld=Array.isArray(world)&&world.length===21&&world.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z)),points=useWorld?world:hand,scale=useWorld?1:aspect;
 const distance=(a,b)=>Math.hypot((a.x-b.x)*scale,a.y-b.y,((a.z||0)-(b.z||0))*scale);
 const size=Math.max(distance(points[0],points[9]),distance(points[5],points[17])*1.12,.0001),middle={x:(points[4].x+points[8].x)/2,y:(points[4].y+points[8].y)/2,z:((points[4].z||0)+(points[8].z||0))/2};
 const palm=[0,5,9,13,17].reduce((v,i)=>({x:v.x+points[i].x/5,y:v.y+points[i].y/5,z:v.z+(points[i].z||0)/5}),{x:0,y:0,z:0});
 return {gap:distance(points[4],points[8])/size,indexSpan:distance(points[5],points[8])/size,outside:distance(middle,palm)/size,isolation:Math.min(...[12,16,20].map(i=>distance(middle,points[i])/size))};
}
function createPhotoHandControls(actions){
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),alpha=(cutoff,dt)=>1/(1+1/(2*Math.PI*cutoff*dt));
 class OneEuro{constructor(){this.x=null;this.dx=0;this.t=0;}filter(value,t){if(this.x===null){this.x=value;this.t=t;return value;}const dt=(t-this.t)/1000;if(dt<=0)return this.x;this.t=t;this.dx+=alpha(1,dt)*((value-this.x)/dt-this.dx);this.x+=alpha(4.6+22*Math.abs(this.dx),dt)*(value-this.x);return this.x;}}
 let filter=new OneEuro(),previous=null,lastSeen=-Infinity,velocity=0,predicted=0,candidate='none',candidateSince=0,votes=0,latched='none',neutralSince=null,neutralVotes=0,lastToggle=-Infinity,lastPhotoToggle=-Infinity,photoArmed=false,releaseSince=null,releaseVotes=0;
 const state={gesture:'none',tracking:false,rotations:0,reacquisitions:0,treeToggles:0,photoToggles:0};
 let referenceSize=.18,openSamples=[],lastOpenSeen=-Infinity;
 function calibrate(size){if(Number.isFinite(size))referenceSize=clamp(size,.12,.26);}
 // Inferred depth is less stable than screen position when fingertips overlap.
 function distance(a,b,aspect){return Math.hypot((a.x-b.x)*aspect,a.y-b.y,((a.z||0)-(b.z||0))*aspect*.45);}
 function process(hand,now,aspect=4/3,recognition=null,world=null){
  if(!hand||hand.length!==21||hand.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y))){actions.guide?.(null,now);releaseSince=null;releaseVotes=0;if(candidate==='two'){candidate='none';votes=0;}if(now-lastSeen>220){previous=null;state.tracking=false;velocity=0;photoArmed=false;}return state;}
  if(!actions.isReady()){photoArmed=false;releaseSince=null;releaseVotes=0;openSamples=[];lastOpenSeen=-Infinity;previous=null;filter=new OneEuro();velocity=predicted=0;candidate=latched='none';votes=neutralVotes=0;neutralSince=null;lastSeen=now;state.gesture='none';state.tracking=true;return state;}
  const palm=[0,5,9,13,17].reduce((v,i)=>({x:v.x+hand[i].x/5,y:v.y+hand[i].y/5}),{x:0,y:0});
  if(now-lastSeen>220||!previous||Math.hypot(palm.x-previous.rawX,palm.y-previous.rawY)>.43){filter=new OneEuro();previous=null;velocity=predicted=0;state.reacquisitions++;candidate='none';votes=0;photoArmed=false;releaseSince=null;releaseVotes=0;}
  const x=filter.filter(palm.x,now),wrist=hand[0],size=Math.max(distance(wrist,hand[9],aspect),distance(hand[5],hand[17],aspect)*1.12,.0001),center={x:palm.x,y:palm.y,z:[0,5,9,13,17].reduce((a,i)=>a+(hand[i].z||0)/5,0)};
  const ratios=[[6,8],[10,12],[14,16],[18,20]].map(([pip,tip])=>distance(hand[tip],wrist,aspect)/Math.max(distance(hand[pip],wrist,aspect),.0001));
  const closed=ratios.filter(value=>value<1.10).length,pinch=distance(hand[4],hand[8],aspect)/size,reach=distance(hand[8],wrist,aspect)/size;
  const tips=[4,8,12,16,20];let cluster=0;for(const a of tips)for(const b of tips)cluster=Math.max(cluster,distance(hand[a],hand[b],aspect)/size);
  const compact=Math.max(...[8,12,16,20].map(i=>distance(hand[i],wrist,aspect)/size))<1.38;
  const modelFist=recognition?.categoryName==='Closed_Fist'&&recognition.score>=.45,modelOpen=recognition?.categoryName==='Open_Palm'&&recognition.score>=.45;
  const openness=estimateOpenHand(hand,world,aspect,recognition),contact=measurePhotoPinch(hand,world,aspect);
  // Contact must be a separate thumb/index pair outside the palm, not fingers
  // folded into a fist or tips that only overlap in the camera projection.
  const pinchShape=contact.indexSpan>.18&&contact.outside>.43&&contact.isolation>.26;
  const clearPinch=contact.gap<(latched==='two'?.40:.23)&&pinchShape;
  const five=!clearPinch&&(modelFist||(!modelOpen&&((closed>=3&&compact&&distance(hand[4],center,aspect)/size<1.02)||(cluster<.80&&pinch<.42))));
  const two=!five&&clearPinch&&(!openness.open||openness.indexAngle<155||contact.gap<.16||latched==='two');
  const open=openness.open&&pinch>.24&&!two;
  if(open)lastOpenSeen=now;
  const heldOpen=!!actions.treeOpen&&!two&&latched==='open'&&now-lastOpenSeen<140&&openness.folded<3&&pinch>.24;
  const pose=actions.treeOpen&&(open||heldOpen)?'open':five?'five':two?'two':'none',pointer={x:1-(hand[4].x+hand[8].x)/2,y:(hand[4].y+hand[8].y)/2};
  if(actions.guide?.({fist:five&&!open,open,size,folded:openness.folded,confidence:openness.confidence},now)){photoArmed=false;releaseSince=null;releaseVotes=0;openSamples=[];previous=null;filter=new OneEuro();velocity=predicted=0;candidate=latched='none';votes=neutralVotes=0;neutralSince=null;lastSeen=now;state.gesture=pose;state.tracking=true;return state;}
  openSamples=openSamples.filter(time=>now-time<=220);if(openness.folded>=3&&!open)openSamples=[];
  if(contact.gap>.48&&!five){if(releaseSince===null)releaseSince=now;releaseVotes++;if(releaseVotes>=2&&now-releaseSince>=28)photoArmed=true;}else{releaseSince=null;releaseVotes=0;}
  actions.point?.(pointer);
  if(previous&&(pose==='none'||pose==='open'||(latched===pose&&now-lastToggle>=120))&&actions.canRotate()){
   const gain=10.5*clamp(referenceSize/size,.82,1.65),dt=Math.max(.012,(now-previous.t)/1000),dx=clamp(x-previous.x-predicted,-.2,.2);actions.rotate(-dx*gain,now);state.rotations++;velocity+=(clamp(-(x-previous.x)*gain/dt,-5,5)-velocity)*(1-Math.exp(-dt*18));
  }else velocity=0;
  predicted=0;
  if(pose==='open'){
   candidate='none';votes=0;neutralSince=null;neutralVotes=0;
   if(open)openSamples.push(now);
   if(latched!=='open'&&openSamples.length>=2&&now-openSamples[0]>=20){latched='open';if(actions.canRotate()&&actions.treeOpen()!==false)state.treeToggles++;}
  }else if(pose==='none'){
   const released=latched==='two'?contact.gap>.48:latched==='five'?closed<=2&&cluster>.85:true;
   if(released){if(neutralSince===null)neutralSince=now;neutralVotes++;if(neutralVotes>=2&&now-neutralSince>=28)latched='none';}else{neutralSince=null;neutralVotes=0;}
   candidate='none';votes=0;
  }else{
   neutralSince=null;neutralVotes=0;
   if(pose!==candidate){candidate=pose;candidateSince=now;votes=1;}else votes++;
   const hold=pose==='two'?65:latched==='two'?100:32,minVotes=pose==='two'?3:2,cooldown=pose==='five'?80:200,sinceToggle=now-(pose==='five'?lastToggle:lastPhotoToggle);
   if(votes>=minVotes&&now-candidateSince>=hold&&latched!==pose&&sinceToggle>=cooldown){
    latched=pose;lastToggle=now;
    if(actions.isReady()){
     if(pose==='five'){if((actions.treeClose?actions.treeClose():actions.treeToggle())!==false)state.treeToggles++;}else if(photoArmed&&actions.photoToggle(pointer)){state.photoToggles++;lastPhotoToggle=now;photoArmed=false;releaseSince=null;releaseVotes=0;}
    }
   }
  }
  previous={x,rawX:palm.x,rawY:palm.y,t:now};lastSeen=now;state.gesture=pose;state.tracking=true;return state;
 }
 function predict(now,dt){const gap=now-lastSeen;if(!previous||candidate!=='none'||!actions.canRotate()||gap<70||gap>190)return;const dx=velocity*Math.exp(-(gap-70)/45)*Math.min(dt,.03);actions.rotate(dx);predicted-=dx/6;}
 return {process,predict,state,calibrate};
}

// Inference runs off the animation thread; at most one camera frame is in flight.
let producedFrame=0,consumedFrame=-1;let stream=null,worker=null,tracker=null,busy=false,cameraActive=false,videoFrameId=0,fallbackTimer=0,lastCapture=-Infinity,generation=0,workerReady=null;
let candidate='',candidateAt=0,lastPalm=null,pinchBase=0,zoomBase=1,handSeenAt=0,inferenceFrames=0,inferenceTotalMs=0;
const urls=[];
function say(message){$('camera-status').textContent=message;}
function objectURL(bytes,type){const value=URL.createObjectURL(new Blob([bytes],{type}));urls.push(value);return value;}
async function unpack(encoded){const raw=atob(encoded),value=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)value[i]=raw.charCodeAt(i);return new Uint8Array(await new Response(new Blob([value]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());}
const handControls=createPhotoHandControls({
 rotate:(dx,now)=>{if(entrance.isDone()&&!drag&&!photoWall.isFocused()&&photoWall.isReady())rotationInertia.input(dx,performance.now(),'hand');},
 canRotate:()=>entrance.isDone()&&!drag&&!photoWall.isFocused()&&photoWall.isReady(),isReady:()=>entrance.isDone()&&photoWall.isReady(),
 guide:(features,now)=>handGuide.process(features,now),point:pointer=>photoWall.point(pointer),treeToggle:()=>mode(target?0:1),treeClose:()=>{if(target===0)return false;mode(0);return true;},treeOpen:()=>{if(target===1)return false;mode(1);return true;},photoToggle:pointer=>{const changed=photoWall.toggle(pointer);if(changed)rotationInertia.stop();return changed;}
});
function useHand(hand,now,recognition=null,world=null){
 const state=handControls.process(hand,now,video.videoWidth&&video.videoHeight?video.videoWidth/video.videoHeight:4/3,recognition,world);
 body.dataset.treeToggles=String(state.treeToggles);body.dataset.photoToggles=String(state.photoToggles);body.dataset.handModelGesture=recognition?.categoryName||'None';body.dataset.handGestureScore=(recognition?.score||0).toFixed(2);body.dataset.handGesture=state.gesture;body.dataset.handTracking=String(state.tracking);body.dataset.handRotations=String(state.rotations);body.dataset.yawTarget=yawTarget.toFixed(3);
}

async function initializeTracker(){
 const payload=JSON.parse($('gesture-assets').textContent),started=performance.now();
 if(typeof Worker==='function'&&typeof OffscreenCanvas==='function'){
  try{
   worker=new Worker(objectURL($('gesture-worker').textContent,'text/javascript'));
   await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Worker startup timeout')),15000);worker.onmessage=event=>{if(event.data.type==='ready'){clearTimeout(timeout);resolve();}else if(event.data.type==='error'){clearTimeout(timeout);reject(Error(event.data.message));}};worker.onerror=event=>{clearTimeout(timeout);reject(Error(event.message));};worker.postMessage({type:'init',payload});});
   worker.onmessage=event=>{busy=false;if(!cameraActive||disposed)return;const result=event.data;if(result.type==='result'){inferenceFrames++;inferenceTotalMs+=result.ms;body.dataset.inferenceFrames=String(inferenceFrames);body.dataset.inferenceMs=(inferenceTotalMs/inferenceFrames).toFixed(1);useHand(result.hand,result.timestamp??performance.now(),result.gesture,result.worldHand);if(cameraActive)capture(performance.now(),false);}};
   worker.onerror=()=>{busy=false;stopCamera();body.dataset.handCamera='unavailable';handGuide.cancel();say('手势识别已停止，请刷新重试');};
   body.dataset.handThread='worker';body.dataset.handModel='ready';body.dataset.handModelMs=String(Math.round(performance.now()-started));return;
  }catch(error){if(worker)worker.terminate();worker=null;if(disposed)throw error;}
 }
 const [js,loader,wasm,model]=await Promise.all(['module','loader','wasm','model'].map(key=>unpack(payload[key])));
 const mod=await import(objectURL(js,'text/javascript'));
 tracker=await mod.GestureRecognizer.createFromOptions({wasmLoaderPath:objectURL(loader,'text/javascript'),wasmBinaryPath:objectURL(wasm,'application/wasm')},{baseOptions:{modelAssetBuffer:model,delegate:'GPU'},runningMode:'VIDEO',numHands:1,minHandDetectionConfidence:.35,minHandPresenceConfidence:.35,minTrackingConfidence:.3,cannedGesturesClassifierOptions:{scoreThreshold:.22}});
 body.dataset.handThread='main-fallback';body.dataset.handModel='ready';body.dataset.handModelMs=String(Math.round(performance.now()-started));
}
function scheduleFrames(){if(!cameraActive||disposed)return;if(typeof video.requestVideoFrameCallback==='function')videoFrameId=video.requestVideoFrameCallback(capture);else fallbackTimer=setTimeout(()=>capture(performance.now()),25);}
async function capture(now,fromVideo=true){
 if(!cameraActive||disposed)return;if(fromVideo!==false){producedFrame++;scheduleFrames();}
 if(document.hidden||busy||now-lastCapture<(worker?24:80)||video.readyState<2||producedFrame===consumedFrame)return;
 lastCapture=now;busy=true;consumedFrame=producedFrame;
 try{
  if(worker){const inputWidth=!handControls.state.tracking||handGuide.stage==='waiting'||handGuide.stage==='fist'?512:384;body.dataset.handInputWidth=String(inputWidth);const image=await createImageBitmap(video,{resizeWidth:inputWidth,resizeHeight:Math.max(1,Math.round(inputWidth*video.videoHeight/video.videoWidth)),resizeQuality:'low'});if(!cameraActive||disposed){image.close();busy=false;return;}worker.postMessage({type:'frame',frame:image,timestamp:now},[image]);}
  else{const started=performance.now(),result=tracker.recognizeForVideo(video,now);inferenceFrames++;inferenceTotalMs+=performance.now()-started;body.dataset.inferenceFrames=String(inferenceFrames);useHand(result.landmarks[0]||null,now,result.gestures?.[0]?.[0]||null,result.worldLandmarks?.[0]||null);busy=false;}
 }catch(error){busy=false;}
}
function stopCamera(){generation++;cameraActive=false;if(videoFrameId&&video.cancelVideoFrameCallback)video.cancelVideoFrameCallback(videoFrameId);clearTimeout(fallbackTimer);if(stream)stream.getTracks().forEach(track=>track.stop());stream=null;video.srcObject=null;}
async function startCamera(){
 if(disposed)return;if(!navigator.mediaDevices?.getUserMedia){body.dataset.handCamera='unavailable';handGuide.cancel();return;}const current=++generation;workerReady=initializeTracker();
 try{await Promise.all([workerReady,(async()=>{const opened=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:480},frameRate:{ideal:30,max:60},facingMode:'user'},audio:false});if(disposed||current!==generation){opened.getTracks().forEach(track=>track.stop());throw Error('Disposed');}stream=opened;video.srcObject=stream;await video.play();})()]);
  if(disposed||current!==generation)return;cameraActive=true;body.dataset.handCamera='ready';say('手势已开启');scheduleFrames();
 }catch(error){if(disposed||current!==generation)return;stopCamera();body.dataset.handCamera='unavailable';say('请在浏览器允许摄像头后刷新页面');}
}
addEventListener('pagehide',()=>{disposed=true;if(cinema)cinema.dispose();stopCamera();if(worker)worker.terminate();if(tracker)tracker.close();urls.forEach(value=>URL.revokeObjectURL(value));if(raf)cancelAnimationFrame(raf);});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!disposed&&!raf){last=performance.now();statAt=last;statFrames=0;drawMs=0;raf=requestAnimationFrame(loop);}});
addEventListener('resize',resize);resize();applyConfig(cfg);body.dataset.sceneState='tree';statAt=performance.now();last=statAt;raf=requestAnimationFrame(loop);requestAnimationFrame(()=>startCamera());
})();

