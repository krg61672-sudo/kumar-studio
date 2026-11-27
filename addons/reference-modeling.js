/* Reference-guided modeling: local image overlay and editable primitive blocks. */
(()=>{'use strict';
const $=id=>document.getElementById(id),bridge=window.KumarShapeBridge,aside=document.querySelector('main>aside'),view=$('view');
if(!bridge||!aside||!view||$('referenceModeling'))return;
const panel=document.createElement('details');panel.id='referenceModeling';panel.open=true;
panel.innerHTML=`<summary>REFERENCE IMAGE & SHAPE MODELING</summary>
<p>Use a local reference photo to guide manual 3D blockout. The photo stays in your browser.</p>
<label>Upload reference image <input id="refFile" type="file" accept="image/png,image/jpeg,image/webp"></label>
<label><input id="refVisible" type="checkbox" checked> Show reference</label>
<label>Reference image overlay <select id="refImageBlend"><option value="normal">Normal</option><option value="multiply">Multiply</option><option value="screen">Screen</option><option value="difference">Difference</option></select></label><label>Image opacity <input id="refOpacity" type="range" min="5" max="100" value="45"></label>
<label>Image size <input id="refSize" type="range" min="20" max="150" value="80"></label>
<label>Image left/right <input id="refX" type="range" min="-100" max="100" value="0"></label>
<label>Image up/down <input id="refY" type="range" min="-100" max="100" value="0"></label>
<button id="refClear" type="button">Remove Reference Image</button><section id="refScaleSection"><h4>Scale & Selection</h4><label>Resize target <select id="refScaleTarget"><option value="image">Reference image only</option><option value="shape">Selected 3D shape only</option><option value="both">Image + selected shape together</option></select></label><label>Scale <strong id="refScaleLabel">100%</strong><input id="refScaleSlider" type="range" min="20" max="300" step="1" value="100"></label><div class="refButtons"><button id="refScaleDown" type="button">− Smaller</button><button id="refScaleUp" type="button">+ Bigger</button></div><button id="refScaleReset" type="button">Reset Scale to 100%</button><p id="refScaleHelp">Select image, shape, or both. The slider changes only your chosen target.</p></section>
<h4>Human Character Blockout</h4><p>Create a proportioned editable human blockout as a starting point. This is not a finished detailed character or rigged mesh.</p><button id="refHumanBase" type="button">+ Human Base Blockout (A-Pose)</button><p id="refHumanStatus" aria-live="polite">Use Front and Side views to refine proportions after creation.</p>
<h4>3D Blockout Shapes</h4><div class="refButtons"><button id="refModelUndo" type="button">↶ Undo Shape</button><button id="refModelRedo" type="button">↷ Redo Shape</button></div>
<div class="refButtons"><button data-shape="box" type="button">+ Box</button><button data-shape="sphere" type="button">+ Sphere</button><button data-shape="cylinder" type="button">+ Cylinder</button><button data-shape="capsule" type="button">+ Capsule</button></div>
<label>Selected block <select id="refBlocks"><option value="">Choose block</option></select></label><section id="refShapeVisibility"><h4>Shape Visibility</h4><label><input id="refShapeVisible" type="checkbox" checked> Show selected shape</label><label>Shape overlay mode <select id="refShapeMode"><option value="solid">Solid</option><option value="transparent">Transparent</option><option value="wireframe">Wireframe / Mesh Lines</option><option value="xray">X-Ray (through other shapes)</option><option value="ghost">Ghost (light overlay)</option></select></label><label>Shape opacity <output id="refShapeOpacityValue">100%</output><input id="refShapeOpacity" type="range" min="10" max="100" value="100"></label><div id="refShapeVisibilityList"></div><p id="refShapeVisibilityHint">Add a shape to control its visibility independently from the reference photo.</p></section>
<div id="refTransform"></div>
<section id="refDeformSection"><h4>Shape Stretch & Sculpt</h4><p>Turn a sphere into a head, torso or limb. Select a shape first; adjustments affect only that shape.</p><label>Stretch Width (X) <output id="refOutWidth">100%</output><input id="refStretchWidth" type="range" min="20" max="350" value="100"></label><label>Stretch Height (Y) <output id="refOutHeight">100%</output><input id="refStretchHeight" type="range" min="20" max="350" value="100"></label><label>Stretch Depth (Z) <output id="refOutDepth">100%</output><input id="refStretchDepth" type="range" min="20" max="350" value="100"></label><label>Top / Bottom Taper <output id="refOutTaper">0</output><input id="refTaper" type="range" min="-80" max="80" value="0"></label><label>Middle Bulge / Pinch <output id="refOutBulge">0</output><input id="refBulge" type="range" min="-80" max="80" value="0"></label><div class="refButtons"><button id="refHeadPreset" type="button">Head Shape</button><button id="refTorsoPreset" type="button">Torso Shape</button><button id="refLimbPreset" type="button">Limb Shape</button><button id="refDeformReset" type="button">Reset Shape</button></div><p id="refDeformStatus" aria-live="polite">Select a block to start shaping.</p></section><button id="refRemove" type="button">Delete Selected Block</button>
<button id="refExport" type="button">Export Blockout JSON</button>
<p id="refStatus" aria-live="polite">Start with a reference image and simple shapes. This is manual blockout, not automatic image-to-3D conversion.</p>`;
const nav=$('ksWorkflowNav');if(nav)nav.after(panel);else aside.prepend(panel);
// Keep the reference editor first in Character, before library and legacy controls.
const library=$('characterWorkspace');if(library)library.open=false;
const css=document.createElement('style');css.textContent=`
#referenceModeling .refButtons{display:grid;grid-template-columns:1fr 1fr;gap:5px}
#referenceModeling .refButtons button{margin:0;font-size:12px}
#refImageOverlay{position:absolute;left:50%;top:50%;max-width:none;max-height:none;object-fit:contain;transform:translate(-50%,-50%);pointer-events:none;z-index:1}
#referenceModeling h4{margin:15px 0 5px;color:#f3cf91}\n#refShapeVisibilityList .refVisibilityRow{display:flex;align-items:center;gap:8px;padding:4px 0}
`;document.head.appendChild(css);
if(nav){const tabs=[...nav.querySelectorAll('button')],character=tabs.find(b=>b.textContent.trim()==='Character');if(character){const sync=()=>{const active=character.classList.contains('active');panel.hidden=!active;if(active&&panel.open!==true)panel.open=true;};tabs.forEach(b=>b.addEventListener('click',()=>queueMicrotask(sync)));sync();}}
const overlay=document.createElement('img');overlay.id='refImageOverlay';overlay.alt='Uploaded reference image';overlay.hidden=true;view.appendChild(overlay);
let url=null,selected=-1;
const say=s=>$('refStatus').textContent=s;
function imageStyle(){overlay.style.opacity=String(Number($('refOpacity').value)/100);overlay.style.mixBlendMode=$('refImageBlend').value;overlay.style.width=$('refSize').value+'%';overlay.style.left=(50+Number($('refX').value)/2)+'%';overlay.style.top=(50+Number($('refY').value)/2)+'%';overlay.hidden=!url||!$('refVisible').checked;}
for(const id of ['refVisible','refOpacity','refSize','refX','refY','refImageBlend'])$(id).addEventListener('input',imageStyle);
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
function refresh(){const list=bridge.list(),sel=$('refBlocks');sel.replaceChildren(new Option('Choose block',''));list.forEach((b,i)=>sel.add(new Option((i+1)+'. '+b.type,i)));if(selected>=0&&selected<list.length){sel.value=String(selected);bridge.select(selected);const b=list[selected];$('refShapeVisible').checked=b.visible!==false;$('refShapeMode').value=b.displayMode||'solid';$('refShapeOpacity').value=String(Math.round((b.opacity??1)*100));$('refShapeOpacityValue').textContent=$('refShapeOpacity').value+'%';const vals={px:b.position[0],py:b.position[1],pz:b.position[2],sx:b.scale[0],sy:b.scale[1],sz:b.scale[2],ry:b.rotation[1]*180/Math.PI};for(const [id,val] of Object.entries(vals)){const el=$('ref_'+id);el.value=String(val);$('refVal_'+id).textContent=Number(val).toFixed(2);}}else{selected=-1;sel.value='';}renderShapeVisibility();}
$('refShapeMode').onchange=()=>{if(selected<0){say('Select a shape first.');return;}bridge.setDisplayMode(selected,$('refShapeMode').value);};
function renderShapeVisibility(){
 const host=$('refShapeVisibilityList');host.replaceChildren();
 bridge.list().forEach((b,i)=>{
  const line=document.createElement('label');line.className='refVisibilityRow';
  const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=b.visible!==false;
  checkbox.setAttribute('aria-label','Show shape '+(i+1));
  checkbox.onchange=()=>{bridge.setVisible(i,checkbox.checked);if(i===selected)$('refShapeVisible').checked=checkbox.checked;};
  const name=document.createElement('span');name.textContent=' Shape '+(i+1)+' · '+b.type.replace('Geometry','');
  line.append(checkbox,name);host.append(line);
 });
}
$('refShapeVisible').onchange=()=>{if(selected<0){say('Select a shape first.');return;}bridge.setVisible(selected,$('refShapeVisible').checked);renderShapeVisibility();};
$('refShapeOpacity').oninput=()=>{if(selected<0){say('Select a shape first.');return;}const value=Number($('refShapeOpacity').value);bridge.setOpacity(selected,value/100);$('refShapeOpacityValue').textContent=value+'%';};

$('refHumanBase').onclick=()=>{
 const parts=[
  ['sphere',0,1.68,0,.25,.32,.23], // head
  ['cylinder',0,1.42,0,.105,.12,.11], // neck
  ['box',0,1.16,0,.47,.56,.26], // chest torso
  ['box',0,.82,0,.36,.22,.25], // pelvis
  ['capsule',-.36,1.16,0,.16,.43,.16],['capsule',.36,1.16,0,.16,.43,.16], // arms
  ['capsule',-.52,.85,0,.13,.36,.13],['capsule',.52,.85,0,.13,.36,.13], // forearms
  ['sphere',-.55,.54,0,.10,.16,.09],['sphere',.55,.54,0,.10,.16,.09], // hands
  ['capsule',-.19,.48,0,.22,.60,.22],['capsule',.19,.48,0,.22,.60,.22], // thighs
  ['capsule',-.19,-.15,0,.16,.51,.16],['capsule',.19,-.15,0,.16,.51,.16], // shins
  ['box',-.19,-.48,.13,.18,.14,.34],['box',.19,-.48,.13,.18,.14,.34] // feet
 ];
 for(const [type,x,y,z,sx,sy,sz] of parts){
  bridge.add(type);
  bridge.transform({position:{x,y:y+.55,z},scale:{x:sx/.35,y:sy/.35,z:sz/.35}});
 }
 selected=bridge.list().length-1;refresh();captureScaleBaseline();
 $('refHumanStatus').textContent='Human blockout created with '+parts.length+' individually editable shapes. Select a part in Selected block to refine it.';
};
panel.querySelectorAll('[data-shape]').forEach(b=>b.onclick=()=>{bridge.add(b.dataset.shape);selected=bridge.list().length-1;refresh();captureScaleBaseline();setDeform();say('3D '+b.dataset.shape+' added. Adjust its position, size and rotation.');});
$('refBlocks').onchange=e=>{selected=e.target.value===''?-1:Number(e.target.value);refresh();captureScaleBaseline();deformIds.forEach((id,i)=>{$(id).value=String([100,100,100,0,0][i]);});};
$('refModelUndo').onclick=()=>{if(!bridge.undo()){say('Nothing to undo yet.');return;}selected=bridge.list().length-1;refresh();captureScaleBaseline();say('Last shape add/delete undone.');};
$('refModelRedo').onclick=()=>{if(!bridge.redo()){say('Nothing to redo yet.');return;}selected=bridge.list().length-1;refresh();captureScaleBaseline();say('Shape action redone.');};
function deleteSelectedShape(){
 const shapes=bridge.list();
 if(!shapes.length){say('No 3D blockout shape exists to delete.');return;}
 if(selected<0||selected>=shapes.length){selected=shapes.length-1;}
 bridge.select(selected);
 if(!bridge.remove()){say('Could not delete the selected shape.');return;}
 selected=Math.min(selected,bridge.list().length-1);
 refresh();captureScaleBaseline();say('Shape deleted. '+bridge.list().length+' remaining.');
}
$('refRemove').onclick=deleteSelectedShape;
const quickDelete=document.createElement('button');
quickDelete.id='refQuickDelete';quickDelete.type='button';quickDelete.textContent='🗑 Delete Selected Shape';
quickDelete.style.cssText='background:#743338;border:1px solid #d96c72;color:white;font-weight:700;min-height:44px';
$('refBlocks').closest('label').after(quickDelete);
quickDelete.onclick=deleteSelectedShape;



// Non-destructive local geometry deformation on a selected primitive.
// The original vertex coordinates are retained so moving sliders does not compound distortions.
const deformCache=new WeakMap();
const deformIds=['refStretchWidth','refStretchHeight','refStretchDepth','refTaper','refBulge'];
function deformBlock(){
 const obj=bridge.edit.active();
 if(!obj){$('refDeformStatus').textContent='Choose a block first.';return;}
 const geometry=obj.geometry,attr=geometry.attributes.position;
 if(!attr)return;
 let baseline=deformCache.get(obj);
 if(!baseline||baseline.geometry!==geometry){baseline={geometry,coords:Float32Array.from(attr.array),count:attr.count};deformCache.set(obj,baseline);}
 const w=Number($('refStretchWidth').value)/100,h=Number($('refStretchHeight').value)/100,d=Number($('refStretchDepth').value)/100;
 const taper=Number($('refTaper').value)/100,bulge=Number($('refBulge').value)/100;
 let minY=Infinity,maxY=-Infinity;
 for(let i=0;i<baseline.count;i++){const y=baseline.coords[i*3+1];minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
 const span=Math.max(.0001,maxY-minY);
 for(let i=0;i<baseline.count;i++){
  const j=i*3,y=baseline.coords[j+1],t=(y-minY)/span;
  const profile=Math.max(.1,1+taper*(2*t-1)+bulge*4*t*(1-t));
  attr.setXYZ(i,baseline.coords[j]*w*profile,y*h,baseline.coords[j+2]*d*profile);
 }
 attr.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingSphere();geometry.computeBoundingBox();
 for(const [id,out] of [['refStretchWidth','refOutWidth'],['refStretchHeight','refOutHeight'],['refStretchDepth','refOutDepth'],['refTaper','refOutTaper'],['refBulge','refOutBulge']])$(out).textContent=$(id).value+(id.startsWith('refStretch')?'%':'');
 $('refDeformStatus').textContent='Shape reshaped. Use touch Mesh Edit for finer adjustments.';
}
function setDeform(values){
 const defaults=[100,100,100,0,0];
 deformIds.forEach((id,i)=>{$(id).value=String(values?.[i]??defaults[i]);});
 deformBlock();
}
deformIds.forEach(id=>$(id).addEventListener('input',deformBlock));
$('refHeadPreset').onclick=()=>setDeform([90,115,85,-18,15]);
$('refTorsoPreset').onclick=()=>setDeform([135,185,85,-24,35]);
$('refLimbPreset').onclick=()=>setDeform([65,250,65,8,0]);
$('refDeformReset').onclick=()=>setDeform();

// Finger-first vertex editing: select a point by tapping a mesh and drag it in camera plane.
const meshEdit=document.createElement('section');meshEdit.id='refMeshEdit';
meshEdit.innerHTML=`<h4>Freehand Sculpt · Finger Brush</h4>
<label><input id="refEditOn" type="checkbox"> Enable finger sculpt</label>
<label>Brush action <select id="refBrushMode"><option value="grab">Grab / Stretch (drag any direction)</option><option value="inflate">Pull Out (raise surface)</option><option value="deflate">Push In (dent surface)</option></select></label>
<label>Brush size <input id="refBrushRadius" type="range" min="5" max="100" value="38"></label>
<label>Brush strength <input id="refBrushStrength" type="range" min="5" max="100" value="60"></label>
<label><input id="refMirror" type="checkbox"> Mirror left / right (optional)</label>
<p>Choose a shape, enable sculpt, then drag your finger anywhere on its surface. Grab stretches freely; Pull Out and Push In raise or indent the touched area. Switch off sculpt to orbit the camera.</p>
<div class="refButtons"><button id="refUndoVertex" type="button">Undo Last Stroke</button><button id="refSmooth" type="button">Smooth Mesh</button></div>
<p id="refEditStatus" aria-live="polite">Select a shape and enable finger sculpt.</p>`;
$('refExport').before(meshEdit);
captureScaleBaseline();
const edit=bridge.edit;let gesture=null,lastEdit=null;
const canvas=edit.canvas,editStatus=msg=>$('refEditStatus').textContent=msg;
function endGesture(){gesture=null;edit.setOrbit(true);}
function applyStroke(e){
 if(!gesture||gesture.pointer!==e.pointerId)return;
 const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;
 if(Math.abs(dx)+Math.abs(dy)<.1)return;
 const mode=$('refBrushMode').value;
 const radius=Number($('refBrushRadius').value)/100*.9+.04;
 const strength=Number($('refBrushStrength').value)/100*1.8;
 let delta;
 if(mode==='grab')delta=edit.screenDeltaToLocal(dx,dy,gesture.world);
 else {
  const magnitude=Math.max(.002,Math.hypot(dx,dy)*.0035);
  const normal=gesture.normal;
  const sign=mode==='inflate'?1:-1;
  delta=[normal[0]*magnitude*sign,normal[1]*magnitude*sign,normal[2]*magnitude*sign];
 }
 if(edit.brushMove(gesture.center,delta,radius,strength,$('refMirror').checked)){
  gesture.x=e.clientX;gesture.y=e.clientY;
  // Three.js is module-scoped in the main studio, so this addon must not use a global THREE.
  // Keep the original hit point for stable camera-plane drag conversion.
 }
}
canvas.addEventListener('pointerdown',e=>{
 if(!$('refEditOn').checked||(e.pointerType==='mouse'&&e.button!==0)||!edit.active()||!e.isPrimary)return;
 const hit=edit.brushAt(e.clientX,e.clientY);if(!hit)return;
 e.preventDefault();e.stopImmediatePropagation();
 const mesh=edit.active();
 gesture={pointer:e.pointerId,center:hit.local,world:hit.world,normal:hit.normal,x:e.clientX,y:e.clientY,mesh,geometry:mesh.geometry.attributes.position.array.slice()};
 edit.setOrbit(false);canvas.setPointerCapture(e.pointerId);editStatus('Sculpting · drag to reshape surface');
},true);
canvas.addEventListener('pointermove',e=>{
 if(!gesture||gesture.pointer!==e.pointerId)return;
 e.preventDefault();e.stopImmediatePropagation();applyStroke(e);
},true);
canvas.addEventListener('pointerup',e=>{
 if(!gesture||gesture.pointer!==e.pointerId)return;
 e.preventDefault();e.stopImmediatePropagation();applyStroke(e);
 lastEdit={mesh:gesture.mesh,geometry:gesture.geometry};endGesture();editStatus('Stroke applied. Undo is available.');
},true);
canvas.addEventListener('pointercancel',endGesture,true);
$('refEditOn').onchange=()=>{endGesture();editStatus($('refEditOn').checked?'Drag directly on your selected shape to sculpt.':'Sculpt off; camera navigation restored.');};
$('refUndoVertex').onclick=()=>{
 if(!lastEdit||lastEdit.mesh!==edit.active()){editStatus('No stroke to undo on this shape.');return;}
 const attr=lastEdit.mesh.geometry.attributes.position;
 if(attr.array.length!==lastEdit.geometry.length){editStatus('Geometry changed; cannot undo that stroke.');return;}
 attr.array.set(lastEdit.geometry);attr.needsUpdate=true;lastEdit.mesh.geometry.computeVertexNormals();lastEdit.mesh.geometry.computeBoundingSphere();lastEdit.mesh.geometry.computeBoundingBox();
 lastEdit=null;editStatus('Last sculpt stroke undone.');
};
$('refSmooth').onclick=()=>{if(edit.smooth(1))editStatus('Mesh smoothing applied.');else editStatus('Select an indexed 3D mesh first.');};

$('refExport').onclick=()=>{const data={format:'kumar-blockout-v1',blocks:bridge.list()};const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download='kumar-character-blockout.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1200);say('Blockout JSON exported. Reference image is not included.');};
})();
