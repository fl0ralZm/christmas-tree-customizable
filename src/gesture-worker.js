/* MediaPipe GestureRecognizer worker pattern adapted from the official
 * google-ai-edge/mediapipe-samples-web (Apache-2.0, MediaPipe Authors).
 * The model and runtime are embedded; camera images stay on this device.
 */
'use strict';
let tracker=null,disposed=false,frames=0;const urls=[];
async function unpack(data){const raw=atob(data),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());}
function url(bytes,type){const value=URL.createObjectURL(new Blob([bytes],{type}));urls.push(value);return value;}
async function init(payload){
 const [js,loader,wasm,model]=await Promise.all(['module','loader','wasm','model'].map(key=>unpack(payload[key]))),mod=await import(url(js,'text/javascript'));
 tracker=await mod.GestureRecognizer.createFromOptions({wasmLoaderPath:url(loader,'text/javascript'),wasmBinaryPath:url(wasm,'application/wasm')},{canvas:new OffscreenCanvas(1,1),baseOptions:{modelAssetBuffer:model,delegate:'CPU'},runningMode:'VIDEO',numHands:1,minHandDetectionConfidence:.35,minHandPresenceConfidence:.35,minTrackingConfidence:.3,cannedGesturesClassifierOptions:{scoreThreshold:.22}});
 if(disposed){tracker.close();return;}self.postMessage({type:'ready'});
}
self.onmessage=async event=>{
 const data=event.data;
 if(data.type==='init'){try{await init(data.payload);}catch(error){self.postMessage({type:'error',message:String(error.message||error)});}return;}
 if(data.type==='close'){disposed=true;if(tracker)tracker.close();urls.forEach(value=>URL.revokeObjectURL(value));self.close();return;}
 if(data.type==='frame'){try{if(!tracker||disposed)return;const started=performance.now(),result=tracker.recognizeForVideo(data.frame,data.timestamp);self.postMessage({type:'result',hand:result.landmarks[0]||null,worldHand:result.worldLandmarks?.[0]||null,gesture:result.gestures?.[0]?.[0]||null,timestamp:data.timestamp,ms:performance.now()-started,frames:++frames});}catch(error){self.postMessage({type:'frame-error',message:String(error.message||error)});}finally{data.frame.close();}}
};
