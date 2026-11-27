/* Touch-first controls for Kumar Studio. Non-destructive UI enhancements. */
(()=>{'use strict';
if(document.getElementById('ksTouchStyles'))return;
const css=document.createElement('style');css.id='ksTouchStyles';css.textContent=`
:root{--ks-hit:46px}
main>aside button,main>aside select,main>aside input[type=text],main>aside input[type=number],main>aside input[type=color]{min-height:var(--ks-hit)}
main>aside input[type=range]{height:38px;min-height:38px;touch-action:pan-y;cursor:pointer}
main>aside input[type=range]::-webkit-slider-thumb{width:27px;height:27px}
main>aside summary{min-height:48px;display:list-item;align-content:center}
#blockingStudio .blkKeys button{min-height:46px;min-width:52px}
#ksTouchToolbar{position:absolute;bottom:14px;right:12px;z-index:5;display:flex;gap:7px;align-items:center;max-width:calc(100% - 24px);flex-wrap:wrap;justify-content:flex-end;pointer-events:none}
#ksTouchToolbar button{pointer-events:auto;border:1px solid #607998;background:#1b2c44eb;color:white;border-radius:12px;min-width:49px;min-height:49px;padding:10px;font:600 13px Arial;box-shadow:0 3px 14px #0005}
#ksTouchToolbar button:active{background:#876331}
#ksTouchHint{position:absolute;bottom:73px;right:12px;z-index:4;background:#15243bc9;color:#f3cf91;border-radius:9px;padding:6px 9px;font:11px Arial;pointer-events:none}
@media(max-width:640px){main>aside{min-width:155px;width:43vw;max-width:43vw}#ksTouchToolbar{bottom:8px;right:6px;gap:4px}#ksTouchToolbar button{min-height:45px;min-width:45px;padding:8px}#ksTouchHint{display:none}main>aside button{min-height:46px}}
`;document.head.appendChild(css);
const view=document.getElementById('view');if(!view)return;
const bar=document.createElement('div');bar.id='ksTouchToolbar';bar.setAttribute('aria-label','Finger touch quick controls');
const make=(label,title,action)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.title=title;b.setAttribute('aria-label',title);b.addEventListener('click',action);bar.appendChild(b);return b;};
make('Front','Front camera view',()=>document.getElementById('front')?.click());
make('Side','Side camera view',()=>document.getElementById('side')?.click());
make('Full','Full body camera view',()=>document.getElementById('full')?.click());
make('−','Decrease selected joint axis',()=>adjust(-1));
make('+','Increase selected joint axis',()=>adjust(1));
view.appendChild(bar);
const hint=document.createElement('div');hint.id='ksTouchHint';hint.textContent='Drag: orbit • Pinch: zoom • Two fingers: pan';view.appendChild(hint);
const axisControls=['rx','ry','rz'];let activeAxis='rx',step=1;
const settings=document.createElement('div');settings.id='ksTouchFine';settings.style.cssText='display:flex;align-items:center;gap:6px;margin:8px 0;flex-wrap:wrap';
settings.innerHTML='<span style="font-size:12px;color:#f3cf91">Finger fine control</span><select id="ksTouchAxis" aria-label="Rotation axis" style="width:auto;flex:1;min-width:65px"><option value="rx">X</option><option value="ry">Y</option><option value="rz">Z</option></select><select id="ksTouchStep" aria-label="Rotation step" style="width:auto;flex:1;min-width:75px"><option value="0.1">0.1°</option><option value="1" selected>1°</option><option value="5">5°</option></select>';
const joint=document.getElementById('joint');if(joint){joint.parentNode.insertBefore(settings,joint.nextSibling);document.getElementById('ksTouchAxis').onchange=e=>activeAxis=e.target.value;document.getElementById('ksTouchStep').onchange=e=>step=Number(e.target.value);}
function adjust(direction){const input=document.getElementById(activeAxis);if(!input||input.disabled)return;const min=Number(input.min),max=Number(input.max),v=Math.max(min,Math.min(max,Number(input.value)+direction*step));input.value=String(Number(v.toFixed(3)));input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));}
})();