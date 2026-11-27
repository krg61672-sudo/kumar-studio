/* Kumar Studio Render Capture Add-on — standalone, non-invasive */
(()=>{'use strict';
const init=()=>{
 const view=document.getElementById('view');if(!view)return;
 const canvas=view.querySelector('canvas');if(!canvas)return;
 const panel=document.createElement('details');panel.id='ks-render-tools';
 panel.style.cssText='position:absolute;bottom:12px;right:12px;width:min(310px,calc(100% - 24px));background:#17243aee;color:#eee;border:1px solid #526984;border-radius:9px;padding:9px;z-index:20;max-height:70%;overflow:auto;font:13px Arial';
 panel.innerHTML='<summary style="cursor:pointer;color:#edc47c;font-weight:bold">🎬 Render & Capture Tools</summary><div style="padding-top:8px"><label>Output scale <select id="ks-scale"><option value="1">1× Native</option><option value="2">2× (upscale capture)</option></select></label><button id="ks-shot">Save PNG Frame</button><label>Recording FPS <select id="ks-fps"><option>24</option><option selected>30</option><option>60</option></select></label><button id="ks-record">Start Video Recording</button><button id="ks-stop" disabled>Stop & Save Video</button><p id="ks-capture-status" style="font-size:12px;color:#edc47c">Records the live viewport. WebM where supported; no audio.</p></div>';
 view.appendChild(panel);
 const $=id=>document.getElementById(id);const say=s=>$('ks-capture-status').textContent=s;
 let recorder=null,stream=null,chunks=[];
 $('ks-shot').onclick=()=>{
  try{
   const scale=Number($('ks-scale').value);
   const out=document.createElement('canvas');out.width=canvas.width*scale;out.height=canvas.height*scale;
   const ctx=out.getContext('2d');ctx.drawImage(canvas,0,0,out.width,out.height);
   out.toBlob(blob=>{if(!blob){say('Frame capture failed.');return;}const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download='kumar-studio-frame-'+Date.now()+'.png';a.click();setTimeout(()=>URL.revokeObjectURL(u),15000);say('PNG frame saved.');},'image/png');
  }catch(e){say('Capture error: '+e.message);}
 };
 $('ks-record').onclick=()=>{
  if(!canvas.captureStream||typeof MediaRecorder==='undefined'){say('Video recording unsupported in this browser. Try desktop Chrome/Edge.');return;}
  try{
   const fps=Number($('ks-fps').value);stream=canvas.captureStream(fps);chunks=[];
   const mime=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));
   if(!mime){say('No supported WebM recorder.');stream.getTracks().forEach(t=>t.stop());return;}
   recorder=new MediaRecorder(stream,{mimeType:mime});
   recorder.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data)};
   recorder.onerror=e=>say('Recording error: '+(e.error?.message||'unknown'));
   recorder.onstop=()=>{
    const blob=new Blob(chunks,{type:mime});stream?.getTracks().forEach(t=>t.stop());stream=null;
    if(blob.size){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download='kumar-studio-preview-'+Date.now()+'.webm';a.click();setTimeout(()=>URL.revokeObjectURL(u),30000);say('WebM preview saved ('+Math.round(blob.size/1024)+' KB).');}
    else say('No video frames captured.');
    $('ks-record').disabled=false;$('ks-stop').disabled=true;recorder=null;
   };
   recorder.start(1000);$('ks-record').disabled=true;$('ks-stop').disabled=false;say('Recording live viewport at '+fps+' FPS...');
  }catch(e){stream?.getTracks().forEach(t=>t.stop());$('ks-record').disabled=false;$('ks-stop').disabled=true;say('Recording failed: '+e.message);}
 };
 $('ks-stop').onclick=()=>{if(recorder&&recorder.state!=='inactive')recorder.stop();};
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();