/* Kumar Studio character-building workspace: additive, no rig or animation overrides. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const fields=['gender','height','width','depth','skin','roughness','bodyAnatomyEnabled','anatomyShoulders','anatomyWaist','anatomyHips'];
const key='kumar-studio-character-library-v1';
const host=document.querySelector('aside');
if(!host||$('characterWorkspace'))return;
const panel=document.createElement('details');panel.id='characterWorkspace';panel.open=true;
panel.innerHTML=`<summary>CHARACTER BUILDING WORKSPACE</summary>
<p>Build and save named character designs. Sculpting and skeleton tools remain available below.</p>
<label>Character name</label><input id="cbName" type="text" maxlength="80" placeholder="Character 01">
<label>Role / notes</label><textarea id="cbNotes" rows="2" maxlength="1000" placeholder="Appearance, costume references, proportions"></textarea>
<button id="cbSave" type="button">Save Character to Library</button>
<label>Saved characters</label><select id="cbList"><option value="">Select saved character</option></select>
<button id="cbLoad" type="button">Load Selected Character</button>
<button id="cbDelete" type="button">Delete Selected Character</button>
<button id="cbExport" type="button">Export Character Library JSON</button>
<label>Import Character Library JSON</label><input id="cbImport" type="file" accept=".json,application/json">
<p id="cbStatus" aria-live="polite">Character library stores body controls and design notes, not mesh geometry or animation. For full mesh export use the existing character export tools.</p>`;
host.prepend(panel);
const say=s=>$('cbStatus').textContent=s;
let records=[];
try{const stored=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(stored))records=stored.slice(0,200);}catch(e){say('Could not read saved library.');}
function refresh(){const selected=$('cbList').value;$('cbList').replaceChildren(new Option('Select saved character',''));records.forEach((r,i)=>$('cbList').add(new Option(r.name,i)));if(selected&&records[Number(selected)])$('cbList').value=selected;}
function persist(){try{localStorage.setItem(key,JSON.stringify(records));return true;}catch(e){say('Local storage unavailable. Export JSON for backup.');return false;}}
function capture(){const values={};for(const id of fields){const el=$(id);if(el)values[id]=el.type==='checkbox'?el.checked:el.value;}return values;}
function apply(values){for(const id of fields){const el=$(id);if(!el||!(id in values))continue;const v=values[id];if(el.type==='checkbox')el.checked=Boolean(v);else if(el.tagName==='SELECT'){if([...el.options].some(o=>o.value===v))el.value=v;}else if(el.type==='range'){const n=Number(v);if(!Number.isFinite(n))continue;el.value=String(Math.max(Number(el.min),Math.min(Number(el.max),n)));}else if(el.type==='color'){if(!/^#[0-9a-fA-F]{6}$/.test(v))continue;el.value=v;}else el.value=String(v);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}}
$('cbSave').onclick=()=>{const name=$('cbName').value.trim();if(!name){say('Enter a character name first.');return;}const record={name,notes:$('cbNotes').value.slice(0,1000),values:capture()};const i=records.findIndex(x=>x.name.toLowerCase()===name.toLowerCase());if(i>=0)records[i]=record;else if(records.length<200)records.push(record);else{say('Library limit: 200 characters.');return;}persist();refresh();say('Saved design controls for '+name+'. Use full character project export for mesh data.');};
$('cbLoad').onclick=()=>{const r=records[Number($('cbList').value)];if(!r){say('Choose a character first.');return;}$('cbName').value=r.name;$('cbNotes').value=r.notes||'';apply(r.values||{});say('Applied '+r.name+' controls. If skeleton was already built, rebuild it after sculpting.');};
$('cbDelete').onclick=()=>{const i=Number($('cbList').value);if(!$('cbList').value||!records[i])return;if(!confirm('Delete this saved character?'))return;records.splice(i,1);persist();refresh();say('Character deleted from local library.');};
$('cbExport').onclick=()=>{const blob=new Blob([JSON.stringify({version:1,characters:records},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='kumar-character-library.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);say('Character library exported.');};
$('cbImport').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;try{if(file.size>1000000)throw Error('File exceeds 1 MB');const data=JSON.parse(await file.text());if(data.version!==1||!Array.isArray(data.characters)||data.characters.length>200)throw Error('Unsupported library format');const next=data.characters.map(r=>{if(typeof r.name!=='string'||!r.name.trim()||r.name.length>80||!r.values||typeof r.values!=='object')throw Error('Invalid character');const safe={};for(const id of fields){if(Object.prototype.hasOwnProperty.call(r.values,id))safe[id]=r.values[id];}return {name:r.name,notes:String(r.notes||'').slice(0,1000),values:safe};});records=next;persist();refresh();say('Imported '+records.length+' character designs.');}catch(err){say('Import failed: '+err.message);}finally{e.target.value='';}};
refresh();
})();