/* AI image-to-3D integration. Requires a separately configured, trusted generation API. */
(()=>{'use strict';
const panel=document.getElementById('referenceModeling'),bridge=window.KumarAIModelBridge;
if(!panel||!bridge)return;
const section=document.createElement('section');section.id='ksAI3D';
section.innerHTML=`<h4>AI Image → 3D Model</h4>
<p>Generate an editable 3D mesh from a reference photo using your connected AI backend. No AI provider is connected by default.</p>
<label>Character reference photo <input id="ksAIPhoto" type="file" accept="image/png,image/jpeg,image/webp"></label>
<label>Generation API endpoint (HTTPS) <input id="ksAIEndpoint" type="url" placeholder="https://your-backend.example/generate-3d"></label>
<label>Instructions <textarea id="ksAIPrompt" rows="3" placeholder="Full body fantasy character, neutral A-pose, detailed face, clean topology"></textarea></label>
<button id="ksAIGenerate" type="button">Generate 3D with AI</button>
<p id="ksAIStatus" aria-live="polite">Connect an AI backend to enable generation. Never paste a secret API key here.</p>
<hr><label>Already have a generated 3D model? Import GLB <input id="ksAIGLB" type="file" accept=".glb,model/gltf-binary"></label>
<p>Imported GLB mesh parts become selectable shapes in Modeling. Use Freehand Sculpt for detail edits. Rigging and automatic retopology are not included.</p>`;
const heading=[...panel.querySelectorAll('h4')].find(x=>x.textContent.includes('3D Blockout Shapes'));
if(heading)heading.before(section);else panel.append(section);
const $=id=>document.getElementById(id),status=msg=>$('ksAIStatus').textContent=msg;
async function importBuffer(buffer){
 const count=await bridge.importGLB(buffer);
 // Refresh shape selector without recreating the editor.
 const select=$('refBlocks');
 if(select){
  const list=window.KumarShapeBridge.list();
  select.replaceChildren(new Option('Choose block',''));
  list.forEach((b,i)=>select.add(new Option((i+1)+'. '+b.type,i)));
  select.value=String(list.length-count);select.dispatchEvent(new Event('change'));
 }
 status('Imported '+count+' editable mesh part(s). Choose Freehand Sculpt to refine.');
}
$('ksAIGLB').onchange=async e=>{
 const file=e.target.files?.[0];if(!file)return;
 try{if(file.size>80e6)throw Error('GLB exceeds 80 MB');status('Loading GLB...');await importBuffer(await file.arrayBuffer());}
 catch(err){status('Import failed: '+err.message);}finally{e.target.value='';}
};
$('ksAIGenerate').onclick=async()=>{
 const file=$('ksAIPhoto').files?.[0],endpoint=$('ksAIEndpoint').value.trim();
 if(!file){status('Choose a reference photo first.');return;}
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>12e6){status('Use JPG, PNG or WebP under 12 MB.');return;}
 let url;try{url=new URL(endpoint);if(url.protocol!=='https:')throw Error('HTTPS endpoint required');}
 catch{status('Enter a valid HTTPS AI generation endpoint.');return;}
 const button=$('ksAIGenerate');button.disabled=true;status('Sending photo to the configured AI service...');
 try{
  const data=new FormData();data.append('image',file);data.append('prompt',$('ksAIPrompt').value);
  const response=await fetch(url.href,{method:'POST',body:data});
  if(!response.ok)throw Error('Generation API returned HTTP '+response.status);
  const type=response.headers.get('content-type')||'';
  let buffer;
  if(type.includes('application/json')){
   const json=await response.json();
   if(typeof json.glb_url!=='string'||!json.glb_url.startsWith('https://'))throw Error('Expected HTTPS glb_url in API response');
   const result=await fetch(json.glb_url);if(!result.ok)throw Error('Could not fetch generated GLB');buffer=await result.arrayBuffer();
  }else buffer=await response.arrayBuffer();
  if(buffer.byteLength>80e6)throw Error('Generated GLB exceeds 80 MB');
  await importBuffer(buffer);
 }catch(err){status('AI generation failed: '+err.message+'. Check endpoint, API format and CORS.');}
 finally{button.disabled=false;}
};
})();
