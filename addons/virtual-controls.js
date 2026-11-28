import * as THREE from 'three';

const storageKey = 'kumar-virtual-controls-v1';
const virtualId = -0x4b53;
const channels = {
  cursor: ['Mouse cursor sensitivity', .15, 3, .05, 1],
  camera: ['Camera sensitivity', .15, 3, .05, 1],
  movement: ['Movement sensitivity', .15, 3, .05, 1],
  rotation: ['Rotation sensitivity', .15, 3, .05, 1],
  scaling: ['Scaling sensitivity', .15, 3, .05, 1],
  sculpting: ['Sculpting sensitivity', .15, 3, .05, 1],
  rigging: ['Rigging sensitivity', .15, 3, .05, 1],
  animation: ['Animation sensitivity', .15, 3, .05, 1],
  precision: ['Precision sensitivity', .05, .9, .05, .25],
  deadZone: ['Joystick dead zone', 0, .5, .01, .12],
  smoothing: ['Movement smoothing', 0, .95, .05, .35],
  acceleration: ['Cursor acceleration', 0, 2, .05, .25],
  boost: ['Speed boost multiplier', 1, 4, .1, 2],
  speed: ['Movement speed', .15, 3, .05, 1]
};
const defaultSettings = {
  ...Object.fromEntries(Object.entries(channels).map(([key,row])=>[key,row[4]])),
  mouse:false, left:false, right:false, invertX:false, invertY:false, autoCenter:true,
  precisionEnabled:false, boostEnabled:false,
  hand:'right', preset:'Normal', cameraMode:'orbit', editMode:'move', axis:'free', timeline:'motionTime',
  panels:{mouse:{width:206,opacity:.94},left:{width:120,opacity:.9},right:{width:142,opacity:.9}}
};
const axes = ['x','y','z'];
const clamp = THREE.MathUtils.clamp;
const byId = id=>document.getElementById(id);
let handledTouch;

function loadSettings() {
  const defaults = structuredClone(defaultSettings);
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (!saved || typeof saved !== 'object') return defaults;
    for (const [key,[,min,max]] of Object.entries(channels)) {
      if (Number.isFinite(saved[key])) defaults[key]=clamp(saved[key],min,max);
    }
    for (const key of ['mouse','left','right','invertX','invertY','autoCenter','precisionEnabled','boostEnabled']) {
      if (typeof saved[key]==='boolean') defaults[key]=saved[key];
    }
    for (const [key,values] of Object.entries({
      hand:['left','right'],preset:['Fine','Normal','Fast','Custom'],cameraMode:['orbit','pan','zoom'],
      editMode:['move','rotate','scale','sculpt','joint','pose','animation'],
      axis:['free',...axes],timeline:['motionTime','seqTime','bvhTime']
    })) if (values.includes(saved[key])) defaults[key]=saved[key];
    for (const key of Object.keys(defaults.panels)) {
      const panel=saved.panels?.[key];
      if (!panel) continue;
      if (Number.isFinite(panel.width)) defaults.panels[key].width=clamp(panel.width,110,280);
      if (Number.isFinite(panel.opacity)) defaults.panels[key].opacity=clamp(panel.opacity,.35,1);
      if (Number.isFinite(panel.x) && Number.isFinite(panel.y)) {
        defaults.panels[key].x=clamp(panel.x,0,1); defaults.panels[key].y=clamp(panel.y,0,1);
      }
      defaults.panels[key].minimized=panel.minimized===true;
    }
  } catch {}
  return defaults;
}

function makeButton(label, parent, action, title=label) {
  const node=document.createElement('button');
  node.type='button'; node.textContent=label; node.title=title; node.setAttribute('aria-label',title);
  if (action) {
    // A touch immediately after a captured pad drag may reach pointerup
    // without a compatibility click. Handle the tap, then discard a duplicate.
    let touch;
    node.addEventListener('pointerdown',event=>{
      if (event.isTrusted && event.pointerType==='touch') {
        touch={id:event.pointerId,x:event.clientX,y:event.clientY};
      }
    });
    node.addEventListener('pointercancel',()=>{touch=null;});
    node.addEventListener('pointerup',event=>{
      if (touch?.id!==event.pointerId) return;
      const moved=Math.hypot(event.clientX-touch.x,event.clientY-touch.y);
      touch=null;
      if (moved>12 || !node.contains(document.elementFromPoint(event.clientX,event.clientY))) return;
      handledTouch={x:event.clientX,y:event.clientY,at:performance.now()};
      action(event);
    });
    node.addEventListener('click',action);
  }
  parent.append(node);
  return node;
}

function selectControl(parent,label,entries,value,change) {
  const select=document.createElement('select');
  select.setAttribute('aria-label',label);
  for (const [key,name] of entries) select.add(new Option(name,key));
  select.value=value;
  select.addEventListener('change',()=>change(select.value));
  parent.append(select);
  return select;
}

export function mountVirtualControls({canvas,camera,controls,bridge,modeling,hasRig}) {
  const header=document.querySelector('.ks-header-actions');
  if (!header || !modeling) return;
  const stylesheet=document.createElement('link');
  stylesheet.rel='stylesheet'; stylesheet.href=new URL('virtual-controls.css',import.meta.url);
  document.head.append(stylesheet);
  let settings=loadSettings();
  const widgets={}, formFields={}, livePointers=new Set(), modifiers={ctrlKey:false,shiftKey:false,altKey:false};
  let x=0,y=0,initialized=false,held=null,padPointer=null,dragLock=false;
  let lastViewPoint=null,frame=0,lastFrame=0,editGesture=null;
  const cursor=document.createElement('div');
  cursor.id='ksVirtualCursor'; cursor.hidden=true; cursor.setAttribute('aria-hidden','true');
  const menu=document.createElement('div');
  menu.id='ksVirtualMenu'; menu.hidden=true; menu.setAttribute('aria-label','Studio mouse menu');
  const options=document.createElement('section');
  options.id='ksVirtualSettings'; options.hidden=true; options.setAttribute('aria-label','Virtual controls settings');
  document.body.append(cursor,menu,options);
  const launcher=makeButton('◉',header,()=>{options.hidden=!options.hidden;},
    'Virtual mouse and joystick settings');
  launcher.id='ksVirtualLauncher';
  const status=document.createElement('div');
  status.setAttribute('role','status');
  const persist=()=>{try{localStorage.setItem(storageKey,JSON.stringify(settings));}catch{}};
  const gain=channel=>settings[channel]*settings.speed*(settings.precisionEnabled?settings.precision:1)*(settings.boostEnabled?settings.boost:1);

  // Synthetic PointerEvents cannot acquire browser-owned pointer capture.
  // Virtual drags use their own captured target. Physical pointer IDs still use native capture.
  for (const method of ['setPointerCapture','releasePointerCapture']) {
    const native=canvas[method].bind(canvas);
    canvas[method]=id=>{if (id!==virtualId) native(id);};
  }
  const pointerType=(target,type,button,buttons)=>target.dispatchEvent(new PointerEvent(type,{
    bubbles:true,cancelable:true,composed:true,clientX:x,clientY:y,button,buttons,
    pointerId:virtualId,pointerType:'mouse',isPrimary:true,pressure:buttons ? .5 : 0,...modifiers
  }));
  const mouseType=(target,type,button,buttons=0,detail=0)=>target.dispatchEvent(new MouseEvent(type,{
    bubbles:true,cancelable:true,composed:true,clientX:x,clientY:y,button,buttons,detail,...modifiers
  }));
  const buttonsMask=[1,4,2];
  const targetAt=()=>document.elementsFromPoint(x,y).find(item=>!item.closest('.ks-virtual'));
  const overCanvas=target=>target===canvas;

  function positionCursor(nx,ny) {
    x=clamp(nx,0,Math.max(0,innerWidth-1)); y=clamp(ny,0,Math.max(0,innerHeight-1));
    cursor.style.transform='translate3d('+x+'px,'+y+'px,0)';
    cursor.toggleAttribute('data-precision',settings.precisionEnabled);
    if (overCanvas(targetAt())) lastViewPoint={x,y};
  }

  function showMenu(items) {
    menu.replaceChildren();
    for (const [label,action] of items) makeButton(label,menu,()=>{menu.hidden=true;action();});
    menu.hidden=false;
    menu.style.left=clamp(x,0,innerWidth-menu.offsetWidth)+'px';
    menu.style.top=clamp(y,0,innerHeight-menu.offsetHeight)+'px';
  }

  function contextMenu(target) {
    if (!mouseType(target,'contextmenu',2) && target!==canvas) return;
    const items=[
      ['Undo geometry',()=>bridge.undo()],['Redo geometry',()=>bridge.redo()],
      ['Front view',()=>byId('front')?.click()],['Side view',()=>byId('side')?.click()],
      ['Full view',()=>byId('full')?.click()]
    ];
    if (document.body.dataset.ksMode==='Modeling') {
      for (const type of ['object','vertex','edge','face','polygon']) {
        items.push(['Select '+type,()=>{
          const select=byId('ksComponentMode'); select.value=type;
          select.dispatchEvent(new Event('change',{bubbles:true}));
        }]);
      }
    }
    showMenu(items);
  }

  function setRange(target) {
    const rect=target.getBoundingClientRect();
    const min=Number(target.min||0), max=Number(target.max||100);
    const step=Number(target.step)||0;
    const raw=min+(max-min)*clamp((x-rect.left-8)/Math.max(1,rect.width-16),0,1);
    const value=clamp(step?min+Math.round((raw-min)/step)*step:raw,min,max);
    if (Number(target.value)===value) return;
    target.value=String(value);
    target.dispatchEvent(new Event('input',{bubbles:true}));
  }

  function mouseDown(button) {
    if (held) return false;
    const target=targetAt();
    if (!target || target.closest('.ks-virtual')) return false;
    if (overCanvas(target) && (livePointers.size || editGesture)) {
      status.textContent='Finish the active viewport gesture first.';
      return false;
    }
    if (!menu.contains(target)) menu.hidden=true;
    held={button,target,x,y};
    const allowed=pointerType(target,'pointerdown',button,buttonsMask[button]);
    if (allowed) mouseType(target,'mousedown',button,buttonsMask[button]);
    if (button===0) {
      target.closest('button,input,select,textarea,a[href],[tabindex]')?.focus({preventScroll:true});
      if (target.matches('input[type="range"]')) setRange(target);
    }
    return true;
  }

  function mouseUp(cancel=false,detail=1) {
    if (!held) return;
    const {target,button,x:fromX,y:fromY}=held;
    held=null;
    pointerType(target,cancel?'pointercancel':'pointerup',button,0);
    if (cancel) return;
    mouseType(target,'mouseup',button);
    const destination=targetAt();
    const tap=Math.hypot(x-fromX,y-fromY)<6 && (destination===target || target.contains(destination));
    if (button===0 && target.matches('input[type="range"]')) {
      target.dispatchEvent(new Event('change',{bubbles:true}));
    } else if (tap && button===0) {
      const select=target.closest('select');
      if (select && !select.disabled) {
        showMenu([...select.options].filter(option=>!option.disabled).map(option=>[
          option.textContent,()=>{
            select.value=option.value;
            select.dispatchEvent(new Event('input',{bubbles:true}));
            select.dispatchEvent(new Event('change',{bubbles:true}));
          }
        ]));
      } else mouseType(target,'click',0,0,detail);
    } else if (tap && button===2) {
      mouseType(target,'auxclick',2);
      contextMenu(target);
    } else if (tap && button===1) mouseType(target,'auxclick',1);
  }

  function mouseMove(nx,ny) {
    positionCursor(nx,ny);
    const target=held?.target ?? targetAt();
    if (!target) return;
    const button=held?.button;
    const buttons=button===undefined?0:buttonsMask[button];
    pointerType(target,'pointermove',-1,buttons);
    mouseType(target,'mousemove',-1,buttons);
    if (button===0 && target.matches('input[type="range"]')) setRange(target);
  }

  function wheel(delta,zoom=false) {
    const target=zoom?canvas:targetAt();
    if (!target || (overCanvas(target) && (livePointers.size || editGesture))) return;
    const allowed=target.dispatchEvent(new WheelEvent('wheel',{
      bubbles:true,cancelable:true,composed:true,clientX:x,clientY:y,deltaY:delta,...modifiers
    }));
    if (!allowed || overCanvas(target)) return;
    for (let parent=target;parent;parent=parent.parentElement) {
      if (parent.scrollHeight>parent.clientHeight && /auto|scroll/.test(getComputedStyle(parent).overflowY)) {
        parent.scrollTop+=delta;
        break;
      }
    }
  }

  function dragPanel(key,handle,node) {
    let drag;
    handle.addEventListener('pointerdown',event=>{
      if (event.button!==0 || drag) return;
      event.preventDefault();
      const rect=node.getBoundingClientRect();
      drag={id:event.pointerId,dx:event.clientX-rect.left,dy:event.clientY-rect.top};
      handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener('pointermove',event=>{
      if (drag?.id!==event.pointerId) return;
      const panel=settings.panels[key];
      panel.x=clamp((event.clientX-drag.dx)/Math.max(1,innerWidth-node.offsetWidth),0,1);
      panel.y=clamp((event.clientY-drag.dy)/Math.max(1,innerHeight-node.offsetHeight),0,1);
      place(key);
    });
    for (const type of ['pointerup','pointercancel','lostpointercapture']) {
      handle.addEventListener(type,event=>{if(drag?.id===event.pointerId){drag=null;persist();}});
    }
  }

  function place(key) {
    const {node,body}=widgets[key], panel=settings.panels[key];
    node.hidden=!settings[key];
    body.hidden=!!panel.minimized;
    if(key==='mouse') cursor.hidden=!settings.mouse||body.hidden;
    node.style.setProperty('--control-width',panel.width+'px');
    node.style.opacity=panel.opacity;
    const leftSide=key==='left'||(key==='mouse'&&settings.hand==='left');
    const mirrored=key!=='mouse'&&settings.hand==='left';
    const left=mirrored?!leftSide:leftSide;
    const room=Math.max(0,innerWidth-node.offsetWidth);
    let defaultX=left ? .025 : .975;
    let defaultY=key==='mouse' ? .54 : .97;
    if (key==='mouse' && innerHeight<500) {
      defaultY=.18;
      // Keep all controls reachable when the mouse and the bottom stick
      // would otherwise overlap in landscape.
      if (settings.right && room>0) {
        const neighbor=settings.panels.right.width+12;
        defaultX=left?clamp(neighbor/room,0,1):clamp(1-neighbor/room,0,1);
      }
    }
    node.style.left=(panel.x??defaultX)*Math.max(0,innerWidth-node.offsetWidth)+'px';
    node.style.top=(panel.y??defaultY)*Math.max(0,innerHeight-node.offsetHeight)+'px';
  }

  function createPanel(key,label) {
    const node=document.createElement('section');
    node.className='ks-virtual'; node.id='ksVirtual-'+key; node.hidden=true;
    node.setAttribute('aria-label',label);
    const bar=document.createElement('header');
    const handle=makeButton(label,bar,null,'Drag '+label+' panel');
    makeButton('−',bar,()=>{
      settings.panels[key].minimized=!settings.panels[key].minimized;
      if (settings.panels[key].minimized) stopPanel(key);
      place(key);persist();
    },'Minimize or expand '+label);
    makeButton('×',bar,()=>{
      settings[key]=false;stopPanel(key);renderSettings();persist();
    },'Hide '+label);
    const body=document.createElement('div');
    node.append(bar,body);
    document.body.append(node);
    widgets[key]={node,body};
    dragPanel(key,handle,node);
    return body;
  }

  function row(parent) {
    const node=document.createElement('div');node.className='ks-virtual-row';parent.append(node);return node;
  }

  const mouse=createPanel('mouse','Virtual Mouse');
  const pad=document.createElement('div');
  pad.className='ks-pad';pad.textContent='Touchpad';pad.setAttribute('aria-label','Virtual mouse touchpad');
  mouse.append(pad);
  pad.addEventListener('pointerdown',event=>{
    if (event.button!==0 || padPointer) return;
    padPointer={id:event.pointerId,x:event.clientX,y:event.clientY,t:performance.now()};
    pad.setPointerCapture(event.pointerId);
  });
  pad.addEventListener('pointermove',event=>{
    if (padPointer?.id!==event.pointerId) return;
    const now=performance.now();
    const dx=event.clientX-padPointer.x,dy=event.clientY-padPointer.y;
    const acceleration=1+settings.acceleration*Math.min(2,Math.hypot(dx,dy)/Math.max(8,now-padPointer.t));
    const scale=gain('cursor')*acceleration;
    mouseMove(x+dx*scale*(settings.invertX?-1:1),y+dy*scale*(settings.invertY?-1:1));
    Object.assign(padPointer,{x:event.clientX,y:event.clientY,t:now});
  });
  for(const type of ['pointerup','pointercancel','lostpointercapture']) {
    pad.addEventListener(type,event=>{if(padPointer?.id===event.pointerId) padPointer=null;});
  }
  const mouseButtons=row(mouse);
  for (const [index,label] of ['Left','Middle','Right'].entries()) {
    const button=makeButton(label,mouseButtons,null,label+' mouse button');
    let owner;
    button.addEventListener('pointerdown',event=>{
      if (event.button!==0 || owner!==undefined || !mouseDown(index)) return;
      owner=event.pointerId;
      button.setPointerCapture(owner);
    });
    for (const type of ['pointerup','pointercancel','lostpointercapture']) {
      button.addEventListener(type,event=>{
        if (event.pointerId!==owner) return;
        owner=undefined;mouseUp(type!=='pointerup');
      });
    }
    button.addEventListener('click',event=>{if(event.detail===0&&mouseDown(index))mouseUp();});
  }
  const mouseActions=row(mouse);
  makeButton('2×',mouseActions,()=>{
    const target=targetAt();
    if (!mouseDown(0)) return;
    mouseUp(false,1);
    if (targetAt()!==target || !mouseDown(0)) return;
    mouseUp(false,2);
    if (targetAt()===target) mouseType(target,'dblclick',0,0,2);
  },'Double click');
  const lockButton=makeButton('Drag',mouseActions,()=>{
    dragLock=dragLock?false:mouseDown(0);
    if (!dragLock) mouseUp();
    lockButton.setAttribute('aria-pressed',String(dragLock));
  },'Drag lock');
  const fineButton=makeButton('Fine',mouseActions,()=>{
    settings.precisionEnabled=!settings.precisionEnabled;renderSettings();persist();
  },'Precision mode');
  const boostButton=makeButton('Boost',mouseActions,()=>{
    settings.boostEnabled=!settings.boostEnabled;renderSettings();persist();
  },'Speed boost');
  const mouseModifiers=row(mouse);
  for (const [label,key] of [['Ctrl','ctrlKey'],['Shift','shiftKey'],['Alt','altKey']]) {
    const button=makeButton(label,mouseModifiers,()=>{
      modifiers[key]=!modifiers[key];button.setAttribute('aria-pressed',String(modifiers[key]));
    },label+' modifier');
    button.setAttribute('aria-pressed','false');
  }
  const scroll=row(mouse);
  for (const [label,delta,zoom,title] of [
    ['↑',-90,false,'Scroll up'],['↓',90,false,'Scroll down'],
    ['＋',-100,true,'Zoom in'],['−',100,true,'Zoom out']
  ]) makeButton(label,scroll,()=>wheel(delta,zoom),title);

  function updateSlider(input, delta, gesture) {
    gesture.sliderValue ??= Number(input.value);
    const min=Number(input.min),max=Number(input.max);
    gesture.sliderValue=clamp(gesture.sliderValue+delta,min,max);
    const before=input.value;
    input.value=String(gesture.sliderValue);
    if (input.value!==before) input.dispatchEvent(new Event('input',{bubbles:true}));
  }

  function startEdit() {
    const mode=settings.editMode,axis=settings.axis;
    const workspace=document.body.dataset.ksMode;
    if (['joint','pose','animation'].includes(mode)) {
      if (!hasRig() || !['Rigging','Animation'].includes(workspace)) {
        throw Error('Build a rig and open Rigging or Animation first.');
      }
      const id=mode==='animation'?settings.timeline:
        mode==='joint'?'r'+(axis==='free'?'x':axis):'move'+(axis==='free'?'X':axis.toUpperCase());
      const input=byId(id);
      if (!input || input.disabled) throw Error('The selected rig or timeline control is unavailable.');
      return {mode,axis,workspace,apply(horizontal,vertical,dt){
        const value=axis==='y'?-vertical:horizontal;
        const channel=mode==='animation'?'animation':'rigging';
        const speed=mode==='joint'?75:mode==='pose'?.75:45;
        updateSlider(input,value*gain(channel)*dt*speed,this);
      },end(){input.dispatchEvent(new Event('change',{bubbles:true}));}};
    }
    if (mode==='sculpt') {
      if (!byId('refEditOn')?.checked || !bridge.edit.active() || !['Modeling','Sculpt'].includes(workspace)) {
        throw Error('Enable finger sculpt and select a modeling mesh first.');
      }
      const bounds=canvas.getBoundingClientRect();
      const point=lastViewPoint??{x:bounds.left+bounds.width/2,y:bounds.top+bounds.height/2};
      const hit=bridge.edit.brushAt(point.x,point.y);
      if (!hit) throw Error('Place the cursor on the mesh before sculpting.');
      const mesh=bridge.edit.active(), geometry=mesh.geometry;
      let checkpoint=false,elapsed=0;
      return {mode,workspace,apply(horizontal,vertical,dt){
        if (bridge.edit.active()!==mesh || mesh.geometry!==geometry || !byId('refEditOn').checked) return false;
        elapsed+=dt;
        if (elapsed < (geometry.attributes.position.count>50000 ? .06 : .027)) return true;
        const speed=150*gain('sculpting')*elapsed;
        elapsed=0;
        const brush=byId('refBrushMode').value;
        const delta=brush==='grab'?bridge.edit.screenDeltaToLocal(horizontal*speed,vertical*speed,hit.world):
          hit.normal.map(v=>v*(brush==='deflate'?-1:1)*speed*.0025);
        if (!checkpoint) {bridge.checkpoint();checkpoint=true;}
        bridge.edit.brushMove(hit.local,delta,Number(byId('refBrushRadius').value)*.009+.04,
          Number(byId('refBrushStrength').value)*.018,byId('refMirror').checked);
        return true;
      },end(){if(checkpoint)document.dispatchEvent(new Event('ks-modeling-geometry'));}};
    }
    const edit=modeling.startTransform(mode,axis);
    return {mode,workspace,apply(horizontal,vertical,dt){
      const channel={move:'movement',rotate:'rotation',scale:'scaling'}[mode];
      return edit.apply(horizontal,vertical,dt*gain(channel));
    },end:edit.end};
  }

  const sticks={};
  function addStick(key,body) {
    const pad=document.createElement('div');
    pad.className='ks-pad ks-stick';pad.setAttribute('aria-label',key==='left'?'Camera joystick pad':'Editing joystick pad');
    const thumb=document.createElement('span');
    pad.append(thumb);body.append(pad);
    const stick=sticks[key]={pad,thumb,pointer:null,x:0,y:0,fx:0,fy:0,blocked:false};
    pad.addEventListener('pointerdown',event=>{
      if (event.button!==0 || stick.pointer!==null) return;
      stick.pointer=event.pointerId;stick.origin=[event.clientX,event.clientY];stick.blocked=false;
      stick.x=stick.y=stick.fx=stick.fy=0;
      thumb.style.transform='';
      pad.setPointerCapture(event.pointerId);
    });
    pad.addEventListener('pointermove',event=>{
      if (stick.pointer!==event.pointerId) return;
      const radius=Math.max(14,Math.min(pad.clientWidth,pad.clientHeight)*.4);
      let dx=(event.clientX-stick.origin[0])/radius,dy=(event.clientY-stick.origin[1])/radius;
      const length=Math.max(1,Math.hypot(dx,dy));dx/=length;dy/=length;
      stick.x=dx;stick.y=dy;
      thumb.style.transform='translate('+dx*radius+'px,'+dy*radius+'px)';
      if (!frame) frame=requestAnimationFrame(tick);
    });
    for (const type of ['pointerup','pointercancel','lostpointercapture']) {
      pad.addEventListener(type,event=>{if(stick.pointer===event.pointerId) stopStick(key);});
    }
  }

  function stopStick(key) {
    const stick=sticks[key];
    stick.pointer=null;stick.x=stick.y=stick.fx=stick.fy=0;stick.blocked=false;
    if (settings.autoCenter) stick.thumb.style.transform='';
    if (key==='right' && editGesture) {
      const completed=editGesture;
      editGesture=null;
      completed.end();
    }
  }

  function viewportBusy() {return livePointers.size>0 || held?.target===canvas;}

  function cameraStep(horizontal,vertical,dt) {
    const strength=gain('camera')*dt;
    const offset=camera.position.clone().sub(controls.target);
    const distance=offset.length();
    const mode=settings.cameraMode;
    if (mode==='orbit') {
      const polar=new THREE.Spherical().setFromVector3(offset);
      polar.theta-=horizontal*strength*2;
      polar.phi=clamp(polar.phi+vertical*strength*2,.025,Math.PI-.025);
      camera.position.copy(controls.target).add(offset.setFromSpherical(polar));
    } else if (mode==='pan') {
      const side=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion);
      const up=new THREE.Vector3(0,1,0).applyQuaternion(camera.quaternion);
      const translation=side.multiplyScalar(horizontal*strength*distance).addScaledVector(up,-vertical*strength*distance);
      controls.target.add(translation);camera.position.add(translation);
    } else {
      const radius=clamp(distance*Math.exp(vertical*strength*2),
        Math.max(.05,controls.minDistance),Math.min(40,controls.maxDistance));
      camera.position.copy(controls.target).add(offset.setLength(radius));
    }
    camera.lookAt(controls.target);
    camera.updateMatrixWorld();
    controls.update();
  }

  function tick(now) {
    frame=0;
    const dt=lastFrame?Math.min(.05,(now-lastFrame)/1000):1/60;
    lastFrame=now;
    let running=false;
    for (const [key,stick] of Object.entries(sticks)) {
      if (stick.pointer===null || stick.blocked) continue;
      const radius=Math.hypot(stick.x,stick.y);
      if (radius<=settings.deadZone) {stick.fx=stick.fy=0;continue;}
      running=true;
      if (viewportBusy() || (key==='left' && editGesture?.mode==='sculpt')) {
        if (key==='right') {
          stopStick(key);
          status.textContent='Release the joystick before starting another viewport edit.';
        }
        continue;
      }
      const strength=(radius-settings.deadZone)/(1-settings.deadZone)/radius;
      const blend=1-Math.pow(settings.smoothing,dt*60);
      stick.fx+=(stick.x*strength*(settings.invertX?-1:1)-stick.fx)*blend;
      stick.fy+=(stick.y*strength*(settings.invertY?-1:1)-stick.fy)*blend;
      try {
        if (key==='left') cameraStep(stick.fx,stick.fy,dt);
        else {
          editGesture??=startEdit();
          if (editGesture.workspace!==document.body.dataset.ksMode || editGesture.apply(stick.fx,stick.fy,dt)===false) {
            stopStick(key);
          }
        }
      } catch(error) {
        stopStick(key);stick.blocked=true;
        status.textContent=error.message;
      }
    }
    if (running) frame=requestAnimationFrame(tick);
    else lastFrame=0;
  }

  const left=createPanel('left','Camera stick');
  const cameraMode=selectControl(left,'Camera joystick mode',[
    ['orbit','Orbit'],['pan','Pan'],['zoom','Zoom']
  ],settings.cameraMode,value=>{stopStick('left');settings.cameraMode=value;persist();});
  addStick('left',left);
  const right=createPanel('right','Editing stick');
  const editMode=selectControl(right,'Editing joystick mode',[
    ['move','Move'],['rotate','Rotate'],['scale','Scale'],['sculpt','Sculpt brush'],
    ['joint','Joint rotation'],['pose','Character position'],['animation','Animation timeline']
  ],settings.editMode,value=>{stopStick('right');settings.editMode=value;persist();});
  const axis=selectControl(right,'Joystick axis lock',[
    ['free','Free axes'],['x','Lock X'],['y','Lock Y'],['z','Lock Z']
  ],settings.axis,value=>{stopStick('right');settings.axis=value;persist();});
  addStick('right',right);
  const feedback=document.createElement('output');feedback.className='ks-virtual-feedback';
  feedback.setAttribute('aria-live','polite');
  right.append(feedback);
  new MutationObserver(()=>{feedback.textContent=status.textContent;}).observe(status,{
    childList:true,characterData:true,subtree:true
  });

  function stopPanel(key) {
    if (key==='mouse') {
      mouseUp(true);dragLock=false;padPointer=null;menu.hidden=true;
      lockButton.setAttribute('aria-pressed','false');
    } else stopStick(key);
  }

  function stopAll() {
    for (const key of ['mouse','left','right']) stopPanel(key);
    livePointers.clear();
    cancelAnimationFrame(frame);frame=0;lastFrame=0;
  }

  const heading=document.createElement('h2');heading.textContent='Virtual controls';options.append(heading);
  makeButton('Close',options,()=>{options.hidden=true;},'Close virtual controls settings');
  function field(parent,label,element) {
    const container=document.createElement('label');
    const title=document.createElement('span');title.textContent=label;
    container.append(title,element);parent.append(container);
    return container;
  }
  function check(parent,key,label,change) {
    const input=document.createElement('input');input.type='checkbox';input.id='ksVirtualSetting-'+key;
    field(parent,label,input);
    input.addEventListener('change',()=>{
      settings[key]=input.checked;change?.();
      renderSettings();persist();
    });
    formFields[key]=input;
  }

  for (const [key,label] of [['mouse','Virtual Mouse'],['left','Left camera joystick'],['right','Right editing joystick']]) {
    check(options,key,label,()=>{if(!settings[key])stopPanel(key);});
  }
  const hand=selectControl(options,'Handed layout',[['right','Right-handed'],['left','Left-handed']],
    settings.hand,value=>{
      settings.hand=value;
      for(const panel of Object.values(settings.panels)){delete panel.x;delete panel.y;}
      renderSettings();persist();
    });
  field(options,'Handed layout',hand);
  const timeline=selectControl(options,'Joystick timeline',[
    ['motionTime','Motion presets'],['seqTime','Action sequencer'],['bvhTime','Motion capture']
  ],settings.timeline,value=>{stopStick('right');settings.timeline=value;persist();});
  field(options,'Animation target',timeline);

  function details(label) {
    const node=document.createElement('details'),summary=document.createElement('summary');
    summary.textContent=label;node.append(summary);options.append(node);return node;
  }

  const sensitivity=details('Sensitivity and presets');
  const preset=selectControl(sensitivity,'Sensitivity preset',['Fine','Normal','Fast','Custom'].map(v=>[v,v]),
    settings.preset,value=>{
      settings.preset=value;
      if (value!=='Custom') {
        const multiplier={Fine:.55,Normal:1,Fast:1.65}[value];
        for (const [key,channel] of Object.entries(channels)) {
          settings[key]=['cursor','camera','movement','rotation','scaling','sculpting','rigging','animation'].includes(key)?
            multiplier:channel[4];
        }
      }
      renderSettings();persist();
    });
  field(sensitivity,'Preset',preset);
  function slider(parent,id,label,min,max,step,read,change) {
    const input=document.createElement('input');input.type='range';input.id='ksVirtualSetting-'+id;
    input.min=min;input.max=max;input.step=step;
    const labelNode=field(parent,label,input);
    const value=document.createElement('output');labelNode.append(value);
    const display=()=>{input.value=read();value.textContent=Number(input.value).toFixed(2).replace(/\.?0+$/,'');};
    input.addEventListener('input',()=>{change(Number(input.value));display();persist();});
    return display;
  }
  const sliders=Object.entries(channels).map(([key,[label,min,max,step]])=>
    slider(sensitivity,key,label,min,max,step,()=>settings[key],value=>{
      settings[key]=value;settings.preset=preset.value='Custom';
    }));
  for(const [key,label] of [['invertX','Invert X'],['invertY','Invert Y'],['autoCenter','Auto-center joysticks'],
    ['precisionEnabled','Precision mode'],['boostEnabled','Speed boost enabled']]) {
    check(sensitivity,key,label,()=>{
      settings.preset='Custom';
      if(key==='autoCenter'&&settings.autoCenter)for(const stick of Object.values(sticks))if(stick.pointer===null)stick.thumb.style.transform='';
    });
  }

  const appearance=details('Panel size, position and transparency');
  for(const [key,label] of [['mouse','Mouse'],['left','Camera joystick'],['right','Editing joystick']]) {
    sliders.push(slider(appearance,key+'Width',label+' width',110,280,1,
      ()=>settings.panels[key].width,value=>{settings.panels[key].width=value;place(key);}));
    sliders.push(slider(appearance,key+'Opacity',label+' opacity',.35,1,.01,
      ()=>settings.panels[key].opacity,value=>{settings.panels[key].opacity=value;place(key);}));
  }
  makeButton('Reset panel positions',appearance,()=>{
    for(const panel of Object.values(settings.panels)){delete panel.x;delete panel.y;}
    renderSettings();persist();
  });
  makeButton('Reset defaults',options,()=>{
    stopAll();settings=structuredClone(defaultSettings);
    for(const [key,label] of [['ctrlKey','Ctrl'],['shiftKey','Shift'],['altKey','Alt']]) {
      modifiers[key]=false;mouse.querySelector('[aria-label="'+label+' modifier"]').setAttribute('aria-pressed','false');
    }
    for(const stick of Object.values(sticks)) stick.thumb.style.transform='';
    initialized=false;renderSettings();persist();status.textContent='Defaults restored.';
  });
  options.append(status);

  function renderSettings() {
    for (const key of Object.keys(widgets)) place(key);
    for (const [key,input] of Object.entries(formFields)) input.checked=settings[key];
    for (const display of sliders) display();
    preset.value=settings.preset;hand.value=settings.hand;timeline.value=settings.timeline;
    cameraMode.value=settings.cameraMode;editMode.value=settings.editMode;axis.value=settings.axis;
    cursor.hidden=!settings.mouse||widgets.mouse.body.hidden;
    fineButton.setAttribute('aria-pressed',String(settings.precisionEnabled));
    boostButton.setAttribute('aria-pressed',String(settings.boostEnabled));
    launcher.setAttribute('aria-pressed',String(settings.mouse||settings.left||settings.right));
    if (!cursor.hidden) {
      const bounds=canvas.getBoundingClientRect();
      if (!initialized) {
        positionCursor(bounds.left+bounds.width/2,bounds.top+bounds.height/2);
        initialized=true;
      } else positionCursor(x,y);
    }
  }

  document.addEventListener('click',event=>{
    if (!handledTouch || !event.isTrusted || event.detail===0) return;
    if (performance.now()-handledTouch.at>=450 ||
        Math.hypot(event.clientX-handledTouch.x,event.clientY-handledTouch.y)>4) return;
    handledTouch=undefined;
    event.preventDefault();
    event.stopImmediatePropagation();
  },true);
  document.addEventListener('pointerdown',event=>{
    if (!event.isTrusted) return;
    handledTouch=undefined;
    if (!menu.contains(event.target) && !event.target.closest('.ks-virtual')) menu.hidden=true;
    if (event.target!==canvas) return;
    if (held?.target===canvas || editGesture) {
      event.stopImmediatePropagation();
      return;
    }
    livePointers.add(event.pointerId);
  },true);
  document.addEventListener('pointermove',event=>{
    if (event.target===canvas && event.isTrusted) lastViewPoint={x:event.clientX,y:event.clientY};
  },true);
  for(const type of ['pointerup','pointercancel']) document.addEventListener(type,event=>{
    if (event.isTrusted) livePointers.delete(event.pointerId);
  },true);
  document.addEventListener('keydown',event=>{
    if (event.key==='Escape') {
      if (dragLock) stopPanel('mouse');
      if (!menu.hidden) menu.hidden=true;
    }
  });
  window.addEventListener('blur',stopAll);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopAll();});
  window.addEventListener('resize',renderSettings);
  new MutationObserver(()=>{
    stopStick('right');
    if (held?.target===canvas) stopPanel('mouse');
  }).observe(document.body,{attributes:true,attributeFilter:['data-ks-mode']});
  renderSettings();
}
