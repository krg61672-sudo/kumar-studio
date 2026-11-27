/* Reference-guided modeling: local image overlay and editable primitive blocks. */
(()=>{'use strict';
const $=id=>document.getElementById(id),bridge=window.KumarShapeBridge,aside=document.querySelector('main>aside'),view=$('view');
if(!bridge||!aside||!view||$('referenceModeling'))return;
const panel=document.createElement('details');panel.id='referenceModeling';panel.open=true;
panel.innerHTML=`<summary>REFERENCE IMAGE & SHAPE MODELING</summary>
<p>Use a local reference photo to guide manual 3D blockout. The photo stays in your browser.</p>
<label>Upload reference image <input id="refFile" type="file" accept="image/png,image/jpeg,image/webp"></label>
<label><input id="refVisible" type="checkbox" checked> Show reference</label>
<label>Image opacity <input id="refOpacity" type="range" min="5" max="100" value="45"></label>
<label>Image size <input id="refSize" type="range" min="20" max="150" value="80"></label>
<label>Image left/right <input id="refX" type="range" min="-100" max="100" value="0"></label>
<label>Image up/down <input id="refY" type="range" min="-100" max="100" value="0"></label>
<button id="refClear" type="button">Remove Reference Image</button><section id="refScaleSection"><h4>Scale & Selection</h4><label>Resize target <select id="refScaleTarget"><option value="image">Reference image only</option><option value="shape">Selected 3D shape only</option><option value="both">Image + selected shape together</option></select></label><label>Scale <strong id="refScaleLabel">100%</strong><input id="refScaleSlider" type="range" min="20" max="300" step="1" value="100"></label><div class="refButtons"><button id="refScaleDown" type="button">− Smaller</button><button id="refScaleUp" type="button">+ Bigger</button></div><button id="refScaleReset" type="button">Reset Scale to 100%</button><p id="refScaleHelp">Select image, shape, or both. The slider changes only your chosen target.</p></section>
<h4>3D Blockout Shapes</h4>
<div class="refButtons"><button data-shape="box" type="button">+ Box</button><button data-shape="sphere" type="button">+ Sphere</button><button data-shape="cylinder" type="button">+ Cylinder</button><button data-shape="capsule" type="button">+ Capsule</button></div>
<label>Selected block <select id="refBlocks"><option value="">Choose block</option></select></label>
<div id="refTransform"></div>
<button id="refRemove" type="button">Delete Selected Block</button>
<button id="refExport" type="button">Export Blockout JSON</button>
<p id="refStatus" aria-live="polite">Start with a reference image and simple shapes. This is manual blockout, not automatic image-to-3D conversion.</p>`;
const nav=$('ksWorkflowNav');if(nav)nav.after(panel);else aside.prepend(panel);
// Keep the reference editor first in Character, before library and legacy controls.
const library=$('characterWorkspace');if(library)library.open=false;
const css=document.createElement('style');css.textContent=`
#referenceModeling .refButtons{display:grid;grid-template-columns:1fr 1fr;gap:5px}
#referenceModeling .refButtons button{margin:0;font-size:12px}
#refImageOverlay{position:absolute;left:50%;top:50%;max-width:none;max-height:none;object-fit:contain;transform:translate(-50%,-50%);pointer-events:none;z-index:1}
#referenceModeling h4{margin:15px 0 5px;color:#f3cf91}
`;document.head.appendChild(css);
if(nav){const tabs=[...nav.querySelectorAll('button')],character=tabs.find(b=>b.textContent.trim()==='Character');if(character){const sync=()=>{const active=character.classList.contains('active');panel.hidden=!active;if(active&&panel.open!==true)panel.open=true;};tabs.forEach(b=>b.addEventListener('click',()=>queueMicrotask(sync)));sync();}}
const overlay=document.createElement('img');overlay.id='refImageOverlay';overlay.alt='Uploaded reference image';overlay.hidden=true;view.appendChild(overlay);
let url=null,selected=-1;
const say=s=>$('refStatus').textContent=s;
function imageStyle(){overlay.style.opacity=String(Number($('refOpacity').value)/100);overlay.style.width=$('refSize').value+'%';overlay.style.left=(50+Number($('refX').value)/2)+'%';overlay.style.top=(50+Number($('refY').value)/2)+'%';overlay.hidden=!url||!$('refVisible').checked;}
for(const id of ['refVisible','refOpacity','refSize','refX','refY'])$(id).addEventListener('input',imageStyle);
$('refFile').onchange=e=>{const file=e.target.files?.[0];if(!file)return;if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>12000000){say('Use JPG, PNG or WebP under 12 MB.');return;}if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(file);overlay.src=url;imageStyle();captureScaleBaseline();say('Reference loaded locally. Align shapes in the 3D viewport.');};
$('refClear').onclick=()=>{if(url)URL.revokeObjectURL(url);url=null;overlay.removeAttribute('src');imageStyle();captureScaleBaseline();$('refFile').value='';say('Reference image removed.');};
// Independent and grouped scaling with a stable baseline to avoid cumulative drift.
let scaleBaseline=null;
const scaleTarget=$('refScaleTarget'),scaleSlider=$('refScaleSlider'),scaleLabel=$('refScaleLabel');
function captureScaleBaseline(){
 const block=selected>=0?bridge.list()[selected]:null;
 scaleBaseline={image:Number($('refSize').value),blockIndex:selected,block:block?.scale?.slice()||null};
 scaleSlider.value='100';scaleLabel.textContent='100%';
}
function updateScale(){
 const factor=Number(scaleSlider.value)/100,mode=scaleTarget.value;
 scaleLabel.textContent=Math.round(factor*100)+'%';
 if(!scaleBaseline)captureScaleBaseline();
 if(mode==='image'||mode==='both'){
  $('refSize').value=String(Math.max(20,Math.min(150,scaleBaseline.image*factor)));
  imageStyle();
 }
 if(mode==='shape'||mode==='both'){
  if(selected<0||!scaleBaseline.block||scaleBaseline.blockIndex!==selected){
   $('refScaleHelp').textContent='Choose a 3D block first to resize its shape.';
   return;
  }
  const b=scaleBaseline.block.map(v=>Math.max(.05,Math.min(5,v*factor)));
  bridge.select(selected);
  bridge.transform({scale:{x:b[0],y:b[1],z:b[2]}});
  for(const [id,v] of [['sx',b[0]],['sy',b[1]],['sz',b[2]]]){
   $('ref_'+id).value=String(v);$('refVal_'+id).textContent=v.toFixed(2);
  }
 }
 $('refScaleHelp').textContent=(mode==='image'?'Reference image':mode==='shape'?'Selected 3D shape':'Image and selected shape')+' resized to '+scaleLabel.textContent+'.';
}
scaleTarget.addEventListener('change',captureScaleBaseline);
scaleSlider.addEventListener('input',updateScale);
$('refScaleDown').onclick=()=>{scaleSlider.value=String(Math.max(20,Number(scaleSlider.value)-10));updateScale();};
$('refScaleUp').onclick=()=>{scaleSlider.value=String(Math.min(300,Number(scaleSlider.value)+10));updateScale();};
$('refScaleReset').onclick=()=>{scaleSlider.value='100';updateScale();};
$('refSize').addEventListener('input',()=>{if(scaleTarget.value!=='shape')captureScaleBaseline();});
const controls=[['Position X','px',-3,3,.01,0],['Position Y','py',-1,4,.01,1],['Position Z','pz',-3,3,.01,0],['Width','sx',.05,5,.01,1],['Height','sy',.05,5,.01,1],['Depth','sz',.05,5,.01,1],['Rotate Y','ry',-180,180,1,0]];
const host=$('refTransform');for(const [label,id,min,max,step,value] of controls){const l=document.createElement('label');l.textContent=label+' ';const out=document.createElement('span');out.id='refVal_'+id;out.textContent=value;l.append(out);const input=document.createElement('input');input.id='ref_'+id;input.type='range';input.min=min;input.max=max;input.step=step;input.value=value;input.oninput=()=>{out.textContent=input.value;applyTransform();};host.append(l,input);}
function applyTransform(){if(selected<0)return;bridge.transform({position:{x:Number($('ref_px').value),y:Number($('ref_py').value),z:Number($('ref_pz').value)},scale:{x:Number($('ref_sx').value),y:Number($('ref_sy').value),z:Number($('ref_sz').value)},rotation:{y:Number($('ref_ry').value)*Math.PI/180}});}
function refresh(){const list=bridge.list(),sel=$('refBlocks');sel.replaceChildren(new Option('Choose block',''));list.forEach((b,i)=>sel.add(new Option((i+1)+'. '+b.type,i)));if(selected>=0&&selected<list.length){sel.value=String(selected);bridge.select(selected);const b=list[selected];const vals={px:b.position[0],py:b.position[1],pz:b.position[2],sx:b.scale[0],sy:b.scale[1],sz:b.scale[2],ry:b.rotation[1]*180/Math.PI};for(const [id,val] of Object.entries(vals)){const el=$('ref_'+id);el.value=String(val);$('refVal_'+id).textContent=Number(val).toFixed(2);}}else{selected=-1;sel.value='';}}
panel.querySelectorAll('[data-shape]').forEach(b=>b.onclick=()=>{bridge.add(b.dataset.shape);selected=bridge.list().length-1;refresh();captureScaleBaseline();say('3D '+b.dataset.shape+' added. Adjust its position, size and rotation.');});
$('refBlocks').onchange=e=>{selected=e.target.value===''?-1:Number(e.target.value);refresh();captureScaleBaseline();};
$('refRemove').onclick=()=>{if(selected<0)return;bridge.select(selected);bridge.remove();selected=-1;refresh();captureScaleBaseline();say('Selected shape deleted.');};

// Finger-first vertex editing: select a point by tapping a mesh and drag it in camera plane.
const meshEdit=document.createElement('section');meshEdit.id='refMeshEdit';
meshEdit.innerHTML=`<h4>Mesh Edit (Touch)</h4>
<label><input id="refEditOn" type="checkbox"> Enable vertex editing</label>
<label><input id="refMirror" type="checkbox" checked> Mirror left / right</label>
<p>Choose a block, then tap and drag its surface to reshape the nearest vertex. Two-finger navigation works when edit mode is OFF.</p>
<div class="refButtons"><button id="refUndoVertex" type="button">Undo Vertex</button><button id="refSmooth" type="button">Smooth Mesh</button></div>
<p id="refEditStatus" aria-live="polite">Select a block and enable editing.</p>`;
$('refExport').before(meshEdit);
captureScaleBaseline();
const edit=bridge.edit;let gesture=null,lastEdit=null;
const canvas=edit.canvas,editStatus=msg=>$('refEditStatus').textContent=msg;
function endGesture(){gesture=null;edit.setOrbit(true);}
canvas.addEventListener('pointerdown',e=>{
 if(!$('refEditOn').checked||e.button!==0||!edit.active()||!e.isPrimary)return;
 const hit=edit.selectAt(e.clientX,e.clientY);if(!hit)return;
 e.preventDefault();e.stopImmediatePropagation();
 gesture={pointer:e.pointerId,index:hit.index,world:hit.world,x:e.clientX,y:e.clientY,delta:[0,0,0]};
 edit.setOrbit(false);canvas.setPointerCapture(e.pointerId);editStatus('Editing vertex '+hit.index+' · drag to reshape');
},true);
canvas.addEventListener('pointermove',e=>{
 if(!gesture||gesture.pointer!==e.pointerId)return;
 e.preventDefault();e.stopImmediatePropagation();
 const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;
 const d=edit.screenDeltaToLocal(dx,dy,gesture.world);
 if(edit.moveVertex(gesture.index,d,$('refMirror').checked)){for(let i=0;i<3;i++)gesture.delta[i]+=d[i];gesture.x=e.clientX;gesture.y=e.clientY;}
},true);
canvas.addEventListener('pointerup',e=>{if(!gesture||gesture.pointer!==e.pointerId)return;e.preventDefault();e.stopImmediatePropagation();lastEdit={index:gesture.index,delta:[...gesture.delta],mirror:$('refMirror').checked,block:edit.active()};endGesture();},true);
canvas.addEventListener('pointercancel',endGesture,true);
$('refEditOn').onchange=()=>{endGesture();editStatus($('refEditOn').checked?'Tap and drag a selected block to move a vertex.':'Vertex edit disabled; camera navigation restored.');};
$('refUndoVertex').onclick=()=>{if(!lastEdit||lastEdit.block!==edit.active()){editStatus('No vertex edit to undo on this block.');return;}edit.moveVertex(lastEdit.index,lastEdit.delta.map(v=>-v),lastEdit.mirror);lastEdit=null;editStatus('Last vertex drag reversed.');};
$('refSmooth').onclick=()=>{if(edit.smooth(1))editStatus('Mesh smoothing applied. Note: sharp edges may soften.');else editStatus('Select an indexed 3D mesh first.');};

$('refExport').onclick=()=>{const data={format:'kumar-blockout-v1',blocks:bridge.list()};const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download='kumar-character-blockout.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1200);say('Blockout JSON exported. Reference image is not included.');};
})();
