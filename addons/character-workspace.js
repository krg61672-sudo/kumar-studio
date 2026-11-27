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
/* Compact workflow navigation: presentation-only, never deletes or rebinds rig tools. */
(()=>{
'use strict';
const sidebar=document.querySelector('main > aside');
if(!sidebar||document.getElementById('ksWorkflowNav'))return;
const all=[...sidebar.querySelectorAll(':scope > details')];
const label=d=>(d.querySelector(':scope > summary')?.textContent||'').trim().toLowerCase();
const sections=[
{name:'Character',match:d=>d.id==='characterWorkspace'||/character preset|body dimensions|body & face sculpting|skin studio|body anatomy/.test(label(d))},
{name:'Rig & Pose',match:d=>/manual pose|skeleton|rigging|hand|finger|pose/.test(label(d))},
{name:'Scene & Camera',match:d=>/camera studio|camera & lighting|pre-production|scene|shot/.test(label(d))},
{name:'Files & Export',match:d=>/import & export|export|blender/.test(label(d))}
];
const groups=sections.map(x=>({name:x.name,items:[]}));
const other={name:'More Tools',items:[]};
for(const d of all){const g=groups.find(g=>sections.find(s=>s.name===g.name).match(d))||other;g.items.push(d);}
if(other.items.length)groups.push(other);
const nav=document.createElement('nav');nav.id='ksWorkflowNav';nav.setAttribute('aria-label','Studio workspace');
const heading=document.createElement('div');heading.className='ksNavTitle';heading.textContent='WORKSPACE';nav.appendChild(heading);
const buttons=new Map();
function select(group){
for(const g of groups){for(const d of g.items){d.hidden=g!==group;if(g===group&&d===g.items[0])d.open=true;}const b=buttons.get(g);if(b){b.classList.toggle('active',g===group);b.setAttribute('aria-pressed',String(g===group));}}
try{sessionStorage.setItem('ks-workspace-tab',group.name);}catch(e){}
}
for(const g of groups){if(!g.items.length)continue;const b=document.createElement('button');b.type='button';b.className='ksNavButton';b.textContent=g.name;b.onclick=()=>select(g);buttons.set(g,b);nav.appendChild(b);}
const title=sidebar.querySelector('h3');if(title)title.textContent='Character & Animation Tools';
sidebar.insertBefore(nav,title||sidebar.firstChild);
const css=document.createElement('style');css.textContent=`
main>aside{width:340px;max-width:48vw;background:#111d30;border-right:1px solid #33445d}
main>aside details{background:#1a2a40;border:1px solid #344860;border-radius:10px;padding:0 12px 10px;margin:10px 0}
main>aside details[hidden]{display:none!important}
main>aside summary{padding:13px 0;color:#f3cf91}
main>aside button{transition:background .15s,border-color .15s}
main>aside button:hover{background:#345174}
#ksWorkflowNav{position:sticky;top:-12px;z-index:10;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;background:#111d30;padding:12px 0;border-bottom:1px solid #344860}
.ksNavTitle{grid-column:1/-1;color:#aabed7;font-size:11px;font-weight:700;letter-spacing:.12em}
#ksWorkflowNav .ksNavButton{margin:0;padding:10px 6px;border-radius:9px;background:#20334d;border:1px solid #3d5674;font-size:12px;white-space:normal}
#ksWorkflowNav .ksNavButton.active{background:#9a6b30;color:#fff;border-color:#e2b36f}
main>aside textarea{max-width:100%;width:100%;background:#263953;color:#fff;border:1px solid #526984;border-radius:7px;padding:10px}
@media(max-width:640px){main>aside{width:44vw;max-width:44vw;padding:8px}#ksWorkflowNav{top:-8px;gap:4px}#ksWorkflowNav .ksNavButton{font-size:11px;padding:9px 3px}main>aside details{padding:0 8px 8px}main>aside button,main>aside select{font-size:12px}}
`;document.head.appendChild(css);
let saved='Character';try{saved=sessionStorage.getItem('ks-workspace-tab')||saved;}catch(e){}
select(groups.find(g=>g.name===saved&&g.items.length)||groups.find(g=>g.items.length));
})();
