/* Kumar Studio manual blocking timeline. No external Blender runtime required. */
(()=>{'use strict';
const $=id=>document.getElementById(id),api=window.KumarBlockingBridge;
if(!api||$('blockingStudio'))return;
const panel=document.createElement('details');panel.id='blockingStudio';panel.open=true;
panel.innerHTML=`<summary>MANUAL ANIMATION BLOCKING</summary>
<p>Blender-style pose-to-pose blocking. Pose the character with existing joint controls, then save a keyframe.</p>
<label>Timeline frame <strong id="blkFrameLabel">1</strong></label>
<input id="blkFrame" type="range" min="1" max="240" value="1" step="1">
<div class="blkRow"><label>Frame <input id="blkFrameNum" type="number" min="1" max="240" value="1"></label><label>FPS <select id="blkFps"><option>24</option><option>30</option><option>60</option></select></label></div>
<div class="blkRow"><button id="blkKey" type="button">◆ Save Key Pose</button><button id="blkRemove" type="button">Remove Key</button></div>
<div class="blkRow"><button id="blkPrev" type="button">◀ Previous</button><button id="blkNext" type="button">Next ▶</button></div>
<div class="blkRow"><button id="blkPlay" type="button">▶ Play</button><button id="blkStop" type="button">■ Stop</button></div>
<label>Interpolation <select id="blkInterpolation"><option value="step">Stepped (Blocking)</option><option value="smooth">Smooth (Preview)</option></select></label>
<div id="blkKeys" class="blkKeys"></div>
<button id="blkExport" type="button">Export Blocking JSON</button>
<label>Import Blocking JSON <input id="blkImport" type="file" accept=".json,application/json"></label>
<p id="blkStatus" aria-live="polite">Build the skeleton first. Save key poses at different frames.</p>`;
const aside=document.querySelector('main>aside');const nav=$('ksWorkflowNav');if(nav)nav.after(panel);else aside.prepend(panel);
// Keep blocking tools inside the Rig & Pose workspace, not visible on every tab.
if(nav){const tabs=[...nav.querySelectorAll('button')];const rigTab=tabs.find(b=>b.textContent.trim()==='Rig & Pose');if(rigTab){const sync=()=>{panel.hidden=!rigTab.classList.contains('active');};tabs.forEach(b=>b.addEventListener('click',()=>queueMicrotask(sync)));sync();}}
const style=document.createElement('style');style.textContent=`
#blockingStudio .blkRow{display:flex;gap:6px;align-items:end}#blockingStudio .blkRow>*{flex:1;min-width:0}
#blockingStudio .blkRow label{font-size:12px}#blockingStudio .blkKeys{display:flex;flex-wrap:wrap;gap:5px;margin:8px 0}
#blockingStudio .blkKeys button{width:auto;margin:0;padding:6px 8px;font-size:11px}
#blockingStudio .blkKeys button.active{background:#926b39;border-color:#f0c582}
#blockingStudio input[type=number]{width:100%;min-width:0;padding:8px;background:#263953;color:white;border:1px solid #526984;border-radius:7px}
`;document.head.appendChild(style);
let keys=new Map(),frame=1,playing=false,raf=0,startTime=0,startFrame=1;
const say=s=>$('blkStatus').textContent=s;
const fps=()=>Number($('blkFps').value)||24;
function setFrame(n){frame=Math.min(240,Math.max(1,Math.round(Number(n)||1)));$('blkFrame').value=frame;$('blkFrameNum').value=frame;$('blkFrameLabel').textContent=frame;renderKeys();}
function renderKeys(){const host=$('blkKeys');host.replaceChildren();for(const k of [...keys.keys()].sort((a,b)=>a-b)){const b=document.createElement('button');b.type='button';b.textContent='◆ '+k;b.className=k===frame?'active':'';b.onclick=()=>{stop();setFrame(k);api.apply(keys.get(k));};host.appendChild(b);}}
function poseAt(n){const ordered=[...keys.keys()].sort((a,b)=>a-b);if(!ordered.length)return;
const left=ordered.filter(k=>k<=n).at(-1)??ordered[0],right=ordered.find(k=>k>=n)??ordered.at(-1);
const a=keys.get(left),b=keys.get(right);if(!a||!b)return;
if(left===right||$('blkInterpolation').value==='step'){api.apply(a);return;}
const t=(n-left)/(right-left),lookup=new Map(b.names.map((name,i)=>[name,i]));
const result={names:a.names,rotations:[],positions:[]};
for(let i=0;i<a.names.length;i++){const j=lookup.get(a.names[i]);const qa=a.rotations[i],pa=a.positions[i];if(j===undefined){result.rotations.push(qa);result.positions.push(pa);continue;}
const qb=b.rotations[j],pb=b.positions[j];if(!qa||!qb||!pa||!pb){result.rotations.push(qa);result.positions.push(pa);continue;}
let dot=qa.reduce((sum,v,k)=>sum+v*qb[k],0),sign=dot<0?-1:1;dot=Math.min(1,Math.max(-1,Math.abs(dot)));
const angle=Math.acos(dot),s=Math.sin(angle);let w0=1-t,w1=t;
if(s>1e-5){w0=Math.sin((1-t)*angle)/s;w1=Math.sin(t*angle)/s;}
const q=qa.map((v,k)=>v*w0+qb[k]*w1*sign),len=Math.hypot(...q)||1;
result.rotations.push(q.map(v=>v/len));result.positions.push(pa.map((v,k)=>v+(pb[k]-v)*t));}
api.apply(result);
}
function stop(){playing=false;if(raf)cancelAnimationFrame(raf);raf=0;$('blkPlay').textContent='▶ Play';}
function tick(now){if(!playing)return;const last=Math.max(...keys.keys());const next=startFrame+(now-startTime)*fps()/1000;if(next>=last){setFrame(last);poseAt(last);stop();return;}setFrame(next);poseAt(frame);raf=requestAnimationFrame(tick);}
$('blkFrame').oninput=v=>{stop();setFrame(v.target.value);poseAt(frame);};
$('blkFrameNum').onchange=v=>{stop();setFrame(v.target.value);poseAt(frame);};
$('blkKey').onclick=()=>{stop();const snap=api.capture();if(!snap){say('Build the skeleton before adding a keyframe.');return;}keys.set(frame,snap);renderKeys();say('Saved key pose at frame '+frame+'.');};
$('blkRemove').onclick=()=>{stop();keys.delete(frame);renderKeys();say('Removed key at frame '+frame+'.');};
$('blkPrev').onclick=()=>{stop();const k=[...keys.keys()].filter(x=>x<frame).sort((a,b)=>b-a)[0];if(k!==undefined){setFrame(k);poseAt(frame);}};
$('blkNext').onclick=()=>{stop();const k=[...keys.keys()].filter(x=>x>frame).sort((a,b)=>a-b)[0];if(k!==undefined){setFrame(k);poseAt(frame);}};
$('blkPlay').onclick=()=>{if(playing){stop();return;}if(keys.size<2){say('Save at least two key poses to preview animation.');return;}api.stopAnimations();playing=true;startFrame=frame>=Math.max(...keys.keys())?Math.min(...keys.keys()):frame;setFrame(startFrame);startTime=performance.now();$('blkPlay').textContent='Ⅱ Pause';raf=requestAnimationFrame(tick);};
$('blkStop').onclick=stop;
$('blkExport').onclick=()=>{const blob=new Blob([JSON.stringify({format:'kumar-blocking-v1',fps:fps(),interpolation:$('blkInterpolation').value,keys:[...keys].sort((a,b)=>a[0]-b[0]).map(([frame,pose])=>({frame,pose}))},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='kumar-animation-blocking.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);say('Blocking animation exported.');};
$('blkImport').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;try{if(file.size>3000000)throw Error('File too large');const data=JSON.parse(await file.text());if(data.format!=='kumar-blocking-v1'||!Array.isArray(data.keys)||data.keys.length>240)throw Error('Invalid format');const next=new Map();for(const entry of data.keys){const p=entry.pose;if(!Number.isInteger(entry.frame)||entry.frame<1||entry.frame>240||!p||!Array.isArray(p.names)||!Array.isArray(p.rotations)||!Array.isArray(p.positions)||p.names.length>1000||p.names.length!==p.rotations.length||p.names.length!==p.positions.length)throw Error('Invalid keyframe');if(!p.names.every(x=>typeof x==='string')||!p.rotations.every(q=>Array.isArray(q)&&q.length===4&&q.every(Number.isFinite))||!p.positions.every(v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite)))throw Error('Invalid bone transform');next.set(entry.frame,p);}stop();keys=next;if([24,30,60].includes(data.fps))$('blkFps').value=String(data.fps);if(['step','smooth'].includes(data.interpolation))$('blkInterpolation').value=data.interpolation;renderKeys();say('Imported '+keys.size+' key poses.');}catch(err){say('Import failed: '+err.message);}finally{e.target.value='';}};
})();
