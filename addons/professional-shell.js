/* Kumar Studio professional modeling shell: non-destructive UI layout.
   Existing rig, sculpt, import/export, blocking and reference handlers remain intact. */
(()=>{'use strict';
if(document.getElementById('ksProShell'))return;
const main=document.querySelector('body>main'),aside=main?.querySelector(':scope>aside'),view=document.getElementById('view');
if(!main||!aside||!view)return;
document.body.classList.add('ks-pro');
const header=document.querySelector('body>header');
header.innerHTML='<span class="ks-logo">◢</span><span class="ks-brand">KUMAR STUDIO<small>V5.0</small></span><nav id="ksProTabs" aria-label="Workspaces"></nav><div class="ks-header-actions"><button id="ksUndo" title="Undo last vertex edit">↶</button><button id="ksExportQuick" title="Export project">▣</button><button id="ksPanelToggle" title="Toggle properties">☷</button></div>';
header.id='ksProShell';
const tabs=document.getElementById('ksProTabs');
const modes=[['Character','Character'],['Modeling','Character'],['Sculpt','Character'],['Rigging','Rig & Pose'],['Animation','Rig & Pose'],['Scene','Scene & Camera'],['Files','Files & Export']];
let mode='Modeling';
const left=document.createElement('nav');left.id='ksProTools';left.setAttribute('aria-label','Modeling tools');
const inspector=document.createElement('section');inspector.id='ksInspector';
const insHeader=document.createElement('div');insHeader.className='ks-panel-head';insHeader.innerHTML='<strong id="ksInspectorTitle">MODELING PROPERTIES</strong><button id="ksCollapseProps" title="Collapse properties">◀</button>';
inspector.append(insHeader,aside);
main.insertBefore(left,view);main.append(inspector);
const footer=document.createElement('section');footer.id='ksProTimeline';footer.innerHTML='<div class="ks-timeline-title"><span>◆ ANIMATION TIMELINE</span><button id="ksTimelineToggle" title="Show or hide timeline">⌄</button></div><div id="ksTimelineBody"></div>';document.body.append(footer);
const block=document.getElementById('blockingStudio');if(block){block.open=true;document.getElementById('ksTimelineBody').append(block);}
const nav=document.getElementById('ksWorkflowNav');if(nav)nav.hidden=true;
const ref=document.getElementById('referenceModeling');if(ref)ref.open=true;
const button=(label,title,action)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.title=title;b.setAttribute('aria-label',title);b.onclick=action;return b;};
const tools=[['↖','Select',()=>{}],['✥','Move',()=>{}],['⟳','Rotate',()=>{}],['⤢','Scale',()=>{}],['⬡','Add mesh',()=>{const p=document.querySelector('[data-shape="box"]');p?.click();}],['◌','Sculpt / vertex edit',()=>{const p=document.getElementById('refEditOn');if(p){p.checked=!p.checked;p.dispatchEvent(new Event('change'));}}],['◈','Add sphere',()=>document.querySelector('[data-shape="sphere"]')?.click()],['◫','Add cylinder',()=>document.querySelector('[data-shape="cylinder"]')?.click()],['◐','Smooth selected mesh',()=>document.getElementById('refSmooth')?.click()],['⇄','Mirror selected mesh',()=>{const p=document.getElementById('refMirror');if(p)p.checked=!p.checked;}]];
const toolLabels=['Select','Move','Rotate','Scale','Mesh','Edit','Sphere','Cylinder','Smooth','Mirror'];
tools.forEach(([glyph,title,action],i)=>{const b=button(glyph,title,()=>{left.querySelectorAll('button').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');action();});b.innerHTML='<span class="ks-tool-glyph">'+glyph+'</span><span class="ks-tool-label">'+toolLabels[i]+'</span>';if(i===0)b.classList.add('selected');left.append(b);});
const viewBar=document.createElement('div');viewBar.id='ksViewBar';viewBar.innerHTML='<div class="ks-view-modes"><button data-view="front">Front</button><button data-view="side">Side</button><button data-view="back">Back</button><button data-view="full">Full</button></div><span>◫ 3D VIEWPORT</span>';view.append(viewBar);
viewBar.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>document.getElementById(b.dataset.view)?.click());
function choose(name){
 mode=name;tabs.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.mode===name));
 const target=modes.find(x=>x[0]===name)?.[1];
 const navBtn=[...(nav?.querySelectorAll('button')||[])].find(b=>b.textContent.trim()===target);
 navBtn?.click();
 const char=name==='Character'||name==='Modeling'||name==='Sculpt';
 if(ref)ref.hidden=!char;
 if(name==='Modeling'&&ref)ref.open=true;
 const modelingOnly=name==='Modeling';
 left.hidden=!modelingOnly&&!['Sculpt','Character'].includes(name);
 document.getElementById('ksInspectorTitle').textContent=name.toUpperCase()+' PROPERTIES';
 const blockPanel=document.getElementById('blockingStudio');
 if(blockPanel)blockPanel.hidden=!['Rigging','Animation'].includes(name);
 const body=document.getElementById('ksTimelineBody');body.classList.toggle('compact',name!=='Animation');
 window.dispatchEvent(new Event('resize'));
}
modes.forEach(([name])=>{const b=button(name,name,()=>choose(name));b.dataset.mode=name;tabs.append(b);});
document.getElementById('ksCollapseProps').onclick=()=>{inspector.classList.toggle('collapsed');window.dispatchEvent(new Event('resize'));};
document.getElementById('ksPanelToggle').onclick=()=>document.getElementById('ksCollapseProps').click();
document.getElementById('ksTimelineToggle').onclick=()=>{footer.classList.toggle('collapsed');window.dispatchEvent(new Event('resize'));};
document.getElementById('ksUndo').onclick=()=>document.getElementById('refUndoVertex')?.click();
document.getElementById('ksExportQuick').onclick=()=>document.getElementById('refExport')?.click();
const css=document.createElement('style');css.id='ksProCss';css.textContent=`
html,body{height:100%;overflow:hidden}body.ks-pro{background:#11141a;color:#d9dee6;font:13px system-ui,-apple-system,Arial,sans-serif;display:flex;flex-direction:column}
body.ks-pro>header{flex:0 0 60px;height:60px;background:#171a20;border-bottom:1px solid #383c46;display:flex;align-items:center;gap:16px;padding:0 14px;color:#f2f2f2;font-size:13px}
.ks-logo{font-size:32px;color:#e9a63e;font-weight:900}.ks-brand{display:flex;flex-direction:column;min-width:145px;letter-spacing:.05em}.ks-brand small{color:#e9a63e;font-size:11px}
#ksProTabs{display:flex;align-items:stretch;gap:3px;flex:1;overflow-x:auto;scrollbar-width:none;height:100%}
#ksProTabs button{flex:0 0 auto;width:auto!important;min-width:82px;margin:7px 0!important;padding:0 12px!important;background:transparent;border:1px solid transparent;border-radius:8px;color:#c2c8d3;font-size:13px;min-height:44px}
#ksProTabs button.active{background:#49351e;border-color:#c38a37;color:#ffe0a3}
.ks-header-actions{display:flex;gap:5px}.ks-header-actions button{width:40px!important;min-width:40px!important;height:40px!important;padding:0!important;margin:0!important;border-radius:9px;background:#222832}
body.ks-pro>main{height:auto!important;flex:1;min-height:0;display:flex;background:#11151d;overflow:hidden}
#ksProTools{width:79px;flex:0 0 79px;background:#1a1d23;border-right:1px solid #3c414b;display:flex;flex-direction:column;align-items:stretch;gap:3px;padding:8px 6px;overflow-y:auto}
#ksProTools[hidden]{display:none!important}
#ksProTools button{width:100%!important;min-height:55px!important;margin:0!important;padding:4px!important;background:transparent;border:1px solid transparent;border-radius:9px;color:#cbd0d9;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:2px}
#ksProTools button.selected{background:#4c351b;border-color:#d99c3e;color:#fff1d1}
.ks-tool-glyph{font-size:22px;line-height:1.1}.ks-tool-label{font-size:10px}
body.ks-pro #view{flex:1;min-width:0;background:#1c2029;position:relative;overflow:hidden}
#ksViewBar{position:absolute;left:10px;top:8px;right:10px;z-index:6;display:flex;justify-content:space-between;align-items:center;pointer-events:none;color:#a5aab6;font-size:11px}
#ksViewBar .ks-view-modes{display:flex;gap:4px;pointer-events:auto;background:#1b2029d9;padding:4px;border:1px solid #3d444e;border-radius:10px}
#ksViewBar button{width:auto!important;min-width:52px!important;min-height:40px!important;margin:0!important;padding:6px!important;background:#282e38;border:1px solid #444d59;border-radius:7px;font-size:12px}
#ksViewBar button:first-child{border-color:#d79a3b;color:#ffdca2}
#ksInspector{width:320px;flex:0 0 320px;min-width:0;display:flex;flex-direction:column;background:#1b1e25;border-left:1px solid #3d434d;transition:width .2s,flex-basis .2s}
#ksInspector.collapsed{width:0;flex-basis:0;border:0;overflow:hidden}
.ks-panel-head{height:44px;flex:0 0 44px;display:flex;justify-content:space-between;align-items:center;padding:0 10px;border-bottom:1px solid #353b44;color:#e5b568;letter-spacing:.05em;font-size:11px}
.ks-panel-head button{width:32px!important;min-width:32px!important;min-height:32px!important;padding:0!important;margin:0!important}
body.ks-pro main>section#ksInspector>aside{width:100%!important;max-width:none!important;flex:1;min-height:0;overflow-y:auto;padding:10px!important;background:transparent;border:0!important}
#ksInspector aside>h3{display:none}
#ksInspector aside details{background:#242832!important;border:1px solid #3a404b!important;border-radius:9px!important;margin:7px 0!important;padding:0 10px 10px!important}
#ksInspector aside summary{color:#d9ac67!important}
#ksInspector aside button{background:#303844;border:1px solid #4b5564;border-radius:8px;min-height:44px}
#ksInspector aside button:hover{background:#465163}
#ksInspector aside input[type=range]{accent-color:#dca34b}
#ksWorkflowNav{display:none!important}
#ksProTimeline{flex:0 0 92px;min-height:0;background:#1b1e25;border-top:1px solid #3a4049;padding:4px 12px;overflow:auto}
#ksProTimeline.collapsed{flex-basis:28px}
.ks-timeline-title{display:flex;justify-content:space-between;align-items:center;color:#e1b16a;font-size:11px;letter-spacing:.08em;height:24px}
.ks-timeline-title button{width:30px!important;min-width:30px!important;height:24px!important;min-height:24px!important;margin:0!important;padding:0!important}
#ksProTimeline.collapsed #ksTimelineBody{display:none}
#ksTimelineBody #blockingStudio{margin:0!important;border:0!important;background:transparent!important;padding:0!important}
#ksTimelineBody #blockingStudio>summary{display:none}
#ksTimelineBody #blockingStudio>p,#ksTimelineBody #blockingStudio>label,#ksTimelineBody #blockingStudio>#blkFrame,#ksTimelineBody #blockingStudio>.blkRow,#ksTimelineBody #blockingStudio>#blkKeys{display:none}
#ksTimelineBody:not(.compact){min-height:110px}
#ksTimelineBody:not(.compact) #blockingStudio>.blkRow,#ksTimelineBody:not(.compact) #blockingStudio>#blkFrame,#ksTimelineBody:not(.compact) #blockingStudio>#blkKeys{display:flex}
#ksTimelineBody:not(.compact) #blockingStudio>label{display:block}
#ksProTimeline:has(#ksTimelineBody:not(.compact)){flex-basis:240px}
body.ks-pro #ksTouchToolbar{top:58px!important;left:8px!important;right:auto!important;bottom:auto!important}
body.ks-pro #info{display:none}
@media(max-width:1000px){#ksInspector{width:275px;flex-basis:275px}#ksProTools{width:60px;flex-basis:60px}.ks-tool-label{font-size:9px}.ks-brand{min-width:105px;font-size:11px}#ksProTabs button{min-width:70px;padding:0 8px!important}}
@media(max-width:700px){body.ks-pro>header{gap:5px;padding:0 6px;height:54px;flex-basis:54px}.ks-logo{font-size:22px}.ks-brand{min-width:75px;font-size:9px}#ksProTabs button{min-width:63px;font-size:11px;padding:0 5px!important}.ks-header-actions button{width:32px!important;min-width:32px!important}#ksInspector{width:42vw;flex-basis:42vw}#ksProTools{width:47px;flex-basis:47px;padding:5px 2px}.ks-tool-glyph{font-size:19px}.ks-tool-label{font-size:8px}#ksProTools button{min-height:49px!important}#ksViewBar{right:auto}#ksViewBar>span{display:none}#ksViewBar button{min-width:42px!important;font-size:10px}body.ks-pro #ksTouchToolbar{top:58px!important}}
`;document.head.append(css);
choose('Modeling');
setTimeout(()=>window.dispatchEvent(new Event('resize')),150);
})();