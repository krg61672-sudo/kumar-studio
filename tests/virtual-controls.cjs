const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');
const {pathToFileURL}=require('node:url');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const os=require('node:os');
const root=path.resolve(__dirname,'..');
const dependencies=process.env.KUMAR_QA_DEPS || '/tmp/ks-deps';
const requireDependency=createRequire(path.join(dependencies,'package.json'));
const {chromium}=requireDependency('playwright-core');
const assetDirectory=process.env.KUMAR_QA_ASSETS || '/tmp';
const device=process.argv[2];
const extended=process.env.KUMAR_QA_EXTENDED==='1';
(async()=>{
 const chromiumPath=process.env.KUMAR_QA_CHROMIUM ||
   await (await import(pathToFileURL(requireDependency.resolve('@sparticuz/chromium')).href)).default.executablePath();
 const browser=await chromium.launch({executablePath:chromiumPath,headless:true,
  args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const sizes={phone:[412,915],tablet:[820,1180],landscape:[915,412],desktop:[1480,1000]};
  const [width,height]=sizes[device||'desktop'];
  const touch=!!device;
  const page=await browser.newPage({viewport:{width,height},hasTouch:touch,isMobile:touch});
  const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('ERROR',e.message);});
  await page.route('https://cdn.jsdelivr.net/npm/**',route=>{
   const name=new URL(route.request().url()).pathname.replace(/^\/npm\/([^@/]+)@[^/]+\//,'$1/');
   const file=path.join(dependencies,'node_modules',name);
   return fs.existsSync(file)?route.fulfill({path:file,contentType:name.endsWith('.wasm')?'application/wasm':
    'application/javascript',headers:{'access-control-allow-origin':'*'}}):route.continue();
  });
  await page.route('http://ks.local/**',route=>{
   const name=new URL(route.request().url()).pathname;
   const file=path.join(root,name);
   if(!fs.existsSync(file))return route.fulfill({status:404,body:''});
   const type=name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':'application/javascript';
   if(name.endsWith('.html'))return route.fulfill({body:fs.readFileSync(file,'utf8').replace(
    'scene.add(new THREE.HemisphereLight','window.ksTest={scene,camera,renderer,controls,THREE};\nscene.add(new THREE.HemisphereLight')
      .replace('renderer.setAnimationLoop(()=>', `Object.assign(window.ksTest,{
       rig:()=>posed, gesture:setGesture, punchAt:t=>{if(t===0)capture410();punch410(t);},
       walkAt:t=>{if(t===0){motionRestore();motionCapture();}motionPose(t);},
       restore:motionRestore, preview:()=>blenderPreview
      });
renderer.setAnimationLoop(()=>`),
    contentType:type});
   return route.fulfill({path:file,contentType:type});
  });
  await page.route('https://raw.githubusercontent.com/makehumancommunity/**',route=>{
   const file=path.join(assetDirectory,'ks-'+new URL(route.request().url()).pathname.split('/').pop());
   return fs.existsSync(file)?route.fulfill({path:file,headers:{'access-control-allow-origin':'*'}}):route.abort();
  });
  await page.route('**/contents/makehuman/data/targets/bodyshapes',route=>route.fulfill({body:'[]',contentType:'application/json',
   headers:{'access-control-allow-origin':'*'}}));
  await page.goto('http://ks.local/studio-v5.0.html');
  const id=x=>page.locator('#'+x), panel=k=>id('ksVirtual-'+k);
  const button=(k,name)=>panel(k).getByRole('button',{name,exact:true});
  const mouseButton=name=>button('mouse',name);
  const settings=id('ksVirtualSettings');
  const field=key=>id('ksVirtualSetting-'+key);
  const look=mode=>id('ksComponentMode').evaluate((el,mode)=>{
    el.value=mode;el.dispatchEvent(new Event('change',{bubbles:true}));
  },mode);
  const click=async el=>{
    if(!touch) return el.click();
    await el.tap();
    await page.waitForTimeout(60);
  };
  const clickByName=(name)=>settings.getByRole('button',{name,exact:true});
  const state=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('kumar-virtual-controls-v1')));
  const model=()=>page.evaluate(()=>{
    const m=KumarShapeBridge.edit.active(),p=m.geometry.attributes.position;
    return {pos:m.position.toArray(),rot:m.rotation.toArray(),scale:m.scale.toArray(),vertices:Array.from(p.array),
     tris:(m.geometry.index?.count??p.count)/3};
  });
  const camera=()=>page.evaluate(()=>[...ksTest.camera.position.toArray(),...ksTest.controls.target.toArray()]);
  const center=async locator=>{const b=await locator.boundingBox();assert.ok(b);return [b.x+b.width/2,b.y+b.height/2];};
  const client=await page.context().newCDPSession(page);
  const fingers=(type,points)=>client.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([x,y],i)=>({x,y,id:i+1}))});
  const drag=async (start,end,hold=0)=>{
    if(touch){
      await fingers('touchStart',[start]);await fingers('touchMove',[end]);
      if(hold)await page.waitForTimeout(hold);
      await fingers('touchEnd',[]);
    }else{
      await page.mouse.move(...start);await page.mouse.down();await page.mouse.move(...end);
      if(hold)await page.waitForTimeout(hold);
      await page.mouse.up();
    }
  };
  const pad=k=>panel(k).locator('.ks-pad');
  const stick=async(k,dx,dy,hold=190)=>{
   const [x,y]=await center(pad(k));await drag([x,y],[x+dx,y+dy],hold);
  };
  const select=(k,label,value)=>panel(k).getByRole('combobox',{name:label,exact:true}).selectOption(value);
  const getCursor=()=>id('ksVirtualCursor').evaluate(el=>[el.getBoundingClientRect().left,el.getBoundingClientRect().top]);
  async function pointAt(target) {
    for(let step=0;step<16;step++){
      const actual=await getCursor();
      const offset=target.map((v,i)=>v-actual[i]);
      if(Math.hypot(...offset)<1.5) return;
      const start=await center(pad('mouse'));
      const end=start.map((v,i)=>Math.max(2,Math.min((i===0?width:height)-2,v+Math.max(-45,Math.min(45,offset[i])))));
      await drag(start,end);
    }
    const actual=await getCursor();
    assert.ok(Math.hypot(...target.map((v,i)=>v-actual[i]))<2);
  }

  async function add(type='box'){
   await look('off');await page.evaluate(()=>KumarShapeBridge.clear());
   await page.locator('#referenceModeling [data-shape="'+type+'"]').evaluate(el=>el.click());
   await id('front').evaluate(el=>el.click());
   await page.waitForTimeout(100);
  }
  const project=xyz=>page.evaluate(xyz=>{
    const {camera,renderer,THREE}=ksTest,m=KumarShapeBridge.edit.active();
    m.updateMatrixWorld(true);
    const p=m.localToWorld(new THREE.Vector3(...xyz)).project(camera);
    const rect=renderer.domElement.getBoundingClientRect();
    return [rect.left+(1+p.x)*rect.width/2,rect.top+(1-p.y)*rect.height/2];
  },xyz);
  const status=()=>id('ksComponentStatus').textContent();
  const setValue=async (key,value)=>field(key).evaluate((el,v)=>{
    el.closest('details')?.setAttribute('open','');el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));
  },value);
  async function toggleSettings(){await click(id('ksVirtualLauncher'));}
  await id('ksVirtualLauncher').waitFor();
  for(const k of ['mouse','left','right'])assert.equal(await panel(k).isVisible(),false);
  await toggleSettings();
  await field('left').check();
  assert.equal(await panel('left').isVisible(),true);
  for(const k of ['mouse','right'])assert.equal(await panel(k).isVisible(),false);
  await field('left').uncheck();
  for(const k of ['mouse','left','right'])await field(k).check();
  await setValue('acceleration',0);
  await setValue('smoothing',0);
  await setValue('deadZone',.1);
  await toggleSettings();
  await add();
  const initial=await model();
  await page.evaluate(()=>{
    window.eventLog=[];
    const canvas=ksTest.renderer.domElement;
    for(const type of ['pointerdown','pointerup','click','auxclick','dblclick','contextmenu','wheel'])
      document.addEventListener(type,e=>{if(e.target===canvas)eventLog.push([type,e.button,e.ctrlKey,e.shiftKey,e.altKey]);},true);
  });
  await look('object');
  const modelCursor=await project([-.07,.05,.175]);
  await pointAt(modelCursor);
  await click(mouseButton('Left mouse button'));
  assert.match(await status(),/Object selected/i);
  await click(mouseButton('Right mouse button'));
  assert.equal(await id('ksVirtualMenu').isVisible(),true);
  await click(id('ksVirtualMenu').getByRole('button',{name:'Front view'}));
  await click(mouseButton('Middle mouse button'));
  await click(mouseButton('Double click'));
  const log=await page.evaluate(()=>eventLog);
  assert.ok(log.some(([type,b])=>type==='pointerdown'&&b===0));
  assert.ok(log.some(([type,b])=>type==='auxclick'&&b===1));
  assert.ok(log.some(([type,b])=>type==='contextmenu'&&b===2));
  assert.ok(log.some(([type])=>type==='dblclick'));
  const beforeZoom=await camera();
  await click(mouseButton('Zoom in'));assert.notDeepEqual(await camera(),beforeZoom);
  const zoomed=await camera();
  await click(mouseButton('Zoom out'));assert.notDeepEqual(await camera(),zoomed);
  await click(mouseButton('Scroll up'));await click(mouseButton('Scroll down'));
  assert.ok((await page.evaluate(()=>eventLog)).filter(([name])=>name==='wheel').length>=4);
  await id('front').evaluate(el=>el.click());
  const samplePad=async()=>{
    const from=await getCursor(), [x,y]=await center(pad('mouse'));
    await drag([x,y],[x+18,y]);
    return (await getCursor())[0]-from[0];
  };
  const baseSpeed=await samplePad();
  await click(mouseButton('Precision mode'));
  await page.waitForFunction(()=>document.getElementById('ksVirtualCursor').hasAttribute('data-precision'));
  const fineSpeed=await samplePad();
  await click(mouseButton('Precision mode'));
  await click(mouseButton('Speed boost'));
  const boostSpeed=await samplePad();
  await click(mouseButton('Speed boost'));
  assert.ok(fineSpeed>0 && fineSpeed<baseSpeed*.5 && boostSpeed>baseSpeed*1.5,[baseSpeed,fineSpeed,boostSpeed]);
  for(const [mode,location] of [['vertex',[-.16,.15,.175]],['edge',[-.17,.07,.175]],
    ['face',[-.05,.03,.175]],['polygon',[-.05,.04,.175]]]){
    await look(mode);
    await pointAt(await project(location));
    await click(mouseButton('Left mouse button'));
    assert.match(await status(),new RegExp(mode==='face'?'Triangle selected':mode+' selected','i'));
  }
  await click(mouseButton('Ctrl modifier'));await click(mouseButton('Shift modifier'));await click(mouseButton('Alt modifier'));
  await pointAt(await project([-.05,.04,.175]));
  await click(mouseButton('Left mouse button'));
  const flags=await page.evaluate(()=>eventLog.filter(r=>r[0]==='pointerdown').at(-1));
  assert.deepEqual(flags.slice(2),[true,true,true]);
  for(const name of ['Ctrl','Shift','Alt'])await click(mouseButton(name+' modifier'));
  await look('vertex');
  if(touch){
    await id('ksComponentDrag').uncheck();
    const viewport=await id('view').boundingBox();
    const start=[viewport.x+viewport.width*.5,viewport.y+viewport.height*.42];
    const before=await camera();
    await fingers('touchStart',[start]);
    await fingers('touchMove',[[start[0]+42,start[1]+18]]);
    assert.deepEqual(await camera(),before,'touch component editing must not orbit the camera');
    await fingers('touchEnd',[]);
    assert.deepEqual(await camera(),before,'camera must remain fixed after the edit touch ends');
  }
  await pointAt(await project([-.15,.15,.175]));await click(mouseButton('Left mouse button'));
  await click(mouseButton('Ctrl modifier'));
  await pointAt(await project([.15,.15,.175]));await click(mouseButton('Left mouse button'));
  await click(mouseButton('Ctrl modifier'));
  await select('right','Editing joystick mode','move');
  await select('right','Joystick axis lock','x');
  const beforeEdit=await model();
  await stick('right',34,0);
  const afterEdit=await model();assert.notDeepEqual(afterEdit.vertices,beforeEdit.vertices);
  const updated=afterEdit.vertices.map((v,i)=>Math.abs(v-beforeEdit.vertices[i])>1e-7?i:-1).filter(i=>i>=0);
  assert.ok(updated.length>=2 && updated.every(i=>i%3===0));
  await page.waitForTimeout(120);
  assert.deepEqual((await model()).vertices,afterEdit.vertices);
  await page.evaluate(()=>KumarShapeBridge.undo());
  assert.deepEqual((await model()).vertices,beforeEdit.vertices);
  await page.evaluate(()=>KumarShapeBridge.redo());
  assert.deepEqual((await model()).vertices,afterEdit.vertices);
  await add();await look('object');
  const stationary=await model();
  await stick('right',1,1,120);
  assert.deepEqual((await model()).pos,stationary.pos);
  for(const [mode,axisName,property,dx,dy] of [
    ['move','x','pos',35,0],['rotate','y','rot',0,-35],['scale','z','scale',35,0]
  ]){
    await select('right','Editing joystick mode',mode);await select('right','Joystick axis lock',axisName);
    const before=await model();await stick('right',dx,dy);
    assert.notDeepEqual((await model())[property],before[property],mode);
  }
  for(const [mode,dx,dy] of [['orbit',28,8],['pan',23,-14],['zoom',0,29]]){
    await select('left','Camera joystick mode',mode);
    const before=await camera();await stick('left',dx,dy);assert.notDeepEqual(await camera(),before,mode);
    const after=await camera();await page.waitForTimeout(80);assert.ok((await camera()).every((v,i)=>Math.abs(v-after[i])<1e-9));
  }
  await add();await look('object');
  if(touch){
    await select('left','Camera joystick mode','orbit');await select('right','Editing joystick mode','move');
    const a=await center(pad('left')),b=await center(pad('right')),mousePad=await center(pad('mouse'));
    const before=await model(), view=await camera(), pointerBefore=await getCursor();
    await fingers('touchStart',[a,b,mousePad]);
    await fingers('touchMove',[[a[0]+26,a[1]],[b[0]+26,b[1]],[mousePad[0]-15,mousePad[1]+5]]);
    await page.waitForTimeout(220);await fingers('touchEnd',[]);
    assert.notDeepEqual(await camera(),view);assert.notDeepEqual((await model()).pos,before.pos);
    assert.notDeepEqual(await getCursor(),pointerBefore);
  }
  await add();await look('object');
  await id('refEditOn').evaluate(el=>{el.checked=true;el.dispatchEvent(new Event('change'));});
  await pointAt(await project([-.07,.04,.17]));
  const oldSculpt=await model();
  await click(mouseButton('Drag lock'));
  const start=await getCursor();await pointAt([start[0]+22,start[1]+3]);
  await click(mouseButton('Drag lock'));
  assert.notDeepEqual((await model()).vertices,oldSculpt.vertices);
  if(touch) {
    await pointAt(await project([-.07,.04,.17]));
    const beforeHold=await model();
    const leftButton=await center(mouseButton('Left mouse button'));
    const surface=await center(pad('mouse'));
    await fingers('touchStart',[leftButton,surface]);
    await fingers('touchMove',[leftButton,[surface[0]+24,surface[1]+6]]);
    await fingers('touchEnd',[]);
    assert.notDeepEqual((await model()).vertices,beforeHold.vertices);
  }
  await pointAt(await project([-.06,.03,.17]));
  await select('right','Editing joystick mode','sculpt');
  const brush=await model();await stick('right',26,-4);
  assert.notDeepEqual((await model()).vertices,brush.vertices);
  await id('refEditOn').evaluate(el=>{el.checked=false;el.dispatchEvent(new Event('change'));});
  await look('off');
  const directBefore=await camera();
  const viewportTarget=await project([0,0,.175]);
  await drag(viewportTarget,[viewportTarget[0]-22,viewportTarget[1]+11]);
  assert.notDeepEqual(await camera(),directBefore);
  console.log(device||'desktop','mouse actions, precision/boost, geometry selection, locks, both joysticks, sculpting, native viewport drag and Undo/Redo passed');
  if (!touch) {
    await add();await look('edge');
    const physical=await project([.171,.04,.175]);
    await page.mouse.click(...physical);
    const op=async name=>{
      const b=id('ksModelingTools').getByRole('button',{name,exact:true});
      await b.evaluate(el=>el.closest('details').open=true);
      await b.click();
      await page.waitForFunction(label=>document.getElementById('ksComponentStatus').textContent.includes(label),
        name+' applied.',{timeout:3500});
    };
    await op('Bevel edge');assert.ok((await model()).tris>12);
    await op('Undo geometry');assert.equal((await model()).tris,12);
    await look('edge');await page.mouse.click(...physical);
    await op('Loop Cut');assert.ok((await model()).tris>12);
    await op('Undo geometry');assert.equal((await model()).tris,12);
    await look('knife');
    for(const xyz of [[-.12,-.10,.175],[0,.06,.175],[.11,-.09,.175]])await page.mouse.click(...await project(xyz));
    await op('Confirm knife cut');assert.ok((await model()).tris>12);
    await op('Undo geometry');
    await look('retopo');
    await id('ksModelingTools').getByRole('button',{name:'Generate quad retopology',exact:true}).click();
    await page.waitForFunction(()=>document.getElementById('ksComponentStatus').textContent.includes('editable quads'));
    assert.equal((await model()).tris,48);
    await op('Undo geometry');
    await add();await page.locator('#referenceModeling [data-shape="box"]').evaluate(el=>el.click());
    await page.evaluate(()=>KumarShapeBridge.transform({position:{x:.12}}));
    await id('refBlocks').selectOption('0');
    await id('ksMeshOperand').evaluate(el=>el.closest('details').open=true);
    await id('ksMeshOperand').selectOption('1');
    await op('Boolean union');
    assert.equal(await page.evaluate(()=>KumarShapeBridge.list().length),1);
    console.log('Bevel, Loop Cut, Knife, quad retopology and Boolean Union regression passed');
    await add('sphere');await look('object');
    const voxelButton=id('ksVoxelRemesh');
    await voxelButton.evaluate(el=>el.closest('details').open=true);
    await id('ksVoxelResolution').selectOption('24');
    await voxelButton.click();
    await page.waitForFunction(()=>/Voxel Remesh created/.test(document.getElementById('ksComponentStatus').textContent),
      null,{timeout:30000});
    const voxel=await page.evaluate(()=>{
      const geometry=KumarShapeBridge.edit.active().geometry,p=geometry.attributes.position,index=geometry.index.array;
      const edges=new Map(),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
      for(let i=0;i<p.count;i++)for(let a=0;a<3;a++){
        const v=p.getX(i);const value=a===0?v:a===1?p.getY(i):p.getZ(i);
        min[a]=Math.min(min[a],value);max[a]=Math.max(max[a],value);
      }
      for(let i=0;i<index.length;i+=3){
        const tri=[index[i],index[i+1],index[i+2]];
        if(new Set(tri).size!==3)throw Error('Voxel remesh produced a degenerate triangle');
        for(let j=0;j<3;j++){const a=tri[j],b=tri[(j+1)%3],key=a<b?a+':'+b:b+':'+a;edges.set(key,(edges.get(key)||0)+1);}
      }
      return {vertices:p.count,triangles:index.length/3,watertight:[...edges.values()].every(count=>count===2),min,max,
        finite:Array.from(p.array).every(Number.isFinite)};
    });
    assert.ok(voxel.vertices>100&&voxel.triangles>100,voxel);
    assert.ok(voxel.watertight,voxel);
    assert.ok(voxel.finite,voxel);
    assert.ok(voxel.max.every((v,i)=>v-voxel.min[i]>.25),voxel);
    console.log('Voxel Remesh passed on a real editable sphere:',voxel);
    await page.getByRole('button',{name:'Rigging',exact:true}).click();
    await id('buildRig').evaluate(el=>el.onclick());
    const haveRig=await page.evaluate(()=>{
      ksTest.scene.traverse(o=>{if(o.isSkinnedMesh)window.testRig=o;});
      return window.testRig?.skeleton.bones.length;
    });
    assert.ok(haveRig>40);
    const bone=()=>page.evaluate(()=>testRig.skeleton.bones.flatMap(b=>b.quaternion.toArray()));
    const beforeBone=await bone();
    await select('right','Editing joystick mode','joint');await select('right','Joystick axis lock','x');
    await stick('right',30,0);assert.notDeepEqual(await bone(),beforeBone);
    await select('right','Editing joystick mode','pose');
    const beforePosition=await id('moveX').inputValue();await stick('right',28,0);
    assert.notEqual(await id('moveX').inputValue(),beforePosition);
    await page.evaluate(()=>{
      const entry=[...document.querySelectorAll('label')].find(el=>el.textContent.includes('Right Weapon Grip'));
      const slider=entry?.querySelector('input')??entry?.nextElementSibling;
      slider.value='75';slider.dispatchEvent(new Event('input'));
    });
    await page.getByRole('button',{name:'Animation',exact:true}).click();
    await select('right','Editing joystick mode','animation');
    await stick('right',27,0);assert.ok(Number(await id('motionTime').inputValue())>0);
    await id('motionPlay').evaluate(el=>el.click());
    await page.waitForFunction(()=>Number(document.getElementById('motionTime').value)>15);
    await id('motionRestore').evaluate(el=>el.click());
    await id('seqAdd').evaluate(el=>el.click());
    await toggleSettings();
    await settings.getByRole('combobox',{name:'Joystick timeline'}).selectOption('seqTime');
    await toggleSettings();
    await stick('right',30,0);assert.ok(Number(await id('seqTime').inputValue())>0);
    if (extended) {
      await id('seqStop').evaluate(el=>el.click());
      const evidence=await page.evaluate(()=>{
        const api=ksTest,{THREE}=api,rig=api.rig();
        const point=name=>rig.skeleton.getBoneByName(name).getWorldPosition(new THREE.Vector3());
        const fingerVector=side=>Array.from({length:4},(_,i)=>point('finger'+(i+2)+'-3.'+side)
          .distanceTo(point('wrist.'+side))).reduce((sum,v)=>sum+v,0)/4;
        const round=n=>Number(n.toFixed(4));
        const fingers={};
        for(const side of ['L','R']){
          api.gesture(side,'Open Hand'); const open=fingerVector(side);
          api.gesture(side,'Closed Fist'); const closed=fingerVector(side);
          fingers[side]=[round(open),round(closed)];
          api.gesture(side,'Open Hand');
        }
        api.punchAt(0);
        const open=[fingerVector('L'),fingerVector('R')];
        api.punchAt(.5);
        const punch=['L','R'].map((side,i)=>round(fingerVector(side)/open[i]));
        rig.updateMatrixWorld(true);rig.skeleton.update();
        let invalidVertices=0;
        const vertex=new THREE.Vector3();
        for(let i=0;i<rig.geometry.attributes.position.count;i++){
          if(!rig.getVertexPosition(i,vertex).toArray().every(Number.isFinite))invalidVertices++;
        }
        api.punchAt(1);
        document.getElementById('motionPreset').value='Walk';
        document.getElementById('motionSteps').value='4';
        api.walkAt(0);
        const root=point('root'), left=point('foot.L'), right=point('foot.R');
        const support=[];
        for(const [side,times] of [['R',[.06,.12,.18]],['L',[.31,.37,.43]]]){
          const samples=times.map(t=>{api.walkAt(t);return point('foot.'+side);});
          support.push(round(Math.max(...samples.map(v=>v.distanceTo(samples[0])))));
        }
        api.walkAt(1);
        const rootTravel=point('root').sub(root).setY(0).length();
        const footTravel=[point('foot.L').distanceTo(left),point('foot.R').distanceTo(right)];
        api.restore();
        return {fingers,punch,invalidVertices,support,rootTravel:round(rootTravel),footTravel:footTravel.map(round)};
      });
      console.log('Rig diagnostics',JSON.stringify(evidence));
      assert.equal(evidence.invalidVertices,0);
      for(const [open,closed] of Object.values(evidence.fingers))assert.ok(closed<open*.9);
      assert.ok(evidence.punch.every(ratio=>ratio<.9));
      assert.ok(evidence.rootTravel>.3);
      assert.ok(evidence.footTravel.every(distance=>distance>.3));
      assert.ok(evidence.support.every(drift=>drift<.025));

      const recording=path.join(assetDirectory,'ks-pirouette.bvh');
      await id('bvhFile').setInputFiles(recording);
      try {
        await page.waitForFunction(()=>document.getElementById('bvhStatus').textContent.startsWith('Recording loaded'),null,{timeout:12000});
      } catch {
        throw Error('BVH did not load: '+await id('bvhStatus').textContent());
      }
      const beforeCapture=await bone();
      await id('bvhTime').evaluate(input=>{input.value=340;input.dispatchEvent(new Event('input'));});
      assert.notDeepEqual(await bone(),beforeCapture);
      await id('bvhRestore').evaluate(el=>el.click());

      let glb;
      try {
        const [download]=await Promise.all([
          page.waitForEvent('download',{timeout:30000}),
          page.getByText('Export selected motion for Blender (.glb)',{exact:true}).evaluate(el=>el.onclick())
        ]);
        glb=fs.readFileSync(await download.path());
      } catch {
        throw Error('Animated GLB did not download: '+await id('blenderStatus').textContent());
      }
      assert.equal(glb.toString('ascii',0,4),'glTF');
      const gltf=JSON.parse(glb.toString('utf8',20,20+glb.readUInt32LE(12)));
      assert.ok(gltf.skins[0].joints.length>40);
      assert.equal(gltf.animations[0].name,'Walk');
      assert.ok(gltf.animations[0].channels.length>80);
      const blender=process.env.KUMAR_QA_BLENDER;
      let previewBuffer=glb;
      if(blender){
        const temp=fs.mkdtempSync(path.join(os.tmpdir(),'kumar-roundtrip-'));
        try {
          const source=path.join(temp,'source.glb'),output=path.join(temp,'processed.glb');
          fs.writeFileSync(source,glb);
          const result=await promisify(execFile)(blender,[
            '-b','-t','2','--python-exit-code','1','--python',
            path.join(root,'animation_engine/roundtrip.py'),'--',source,output
          ],{timeout:90000});
          assert.match(result.stdout,/Roundtrip exported: [1-9]/);
          console.log(result.stdout.split('\n').find(line=>line.includes('Roundtrip exported:')));
          previewBuffer=fs.readFileSync(output);
        } finally {
          fs.rmSync(temp,{recursive:true,force:true});
        }
      }
      const resourceCount=()=>page.evaluate(()=>({...ksTest.renderer.info.memory}));
      const beforeImport=await resourceCount();
      await id('blenderImport').setInputFiles({name:'walk.glb',mimeType:'model/gltf-binary',buffer:previewBuffer});
      try {
        await page.waitForFunction(()=>!!ksTest.preview(),null,{timeout:10000});
      } catch {
        throw Error('GLB preview did not load: '+await id('blenderStatus').textContent());
      }
      const previewPose=()=>page.evaluate(()=>{
        const pose=[];
        ksTest.preview().traverse(object=>{if(object.isBone)pose.push(...object.quaternion.toArray());});
        return pose;
      });
      const beforePreview=await previewPose();
      await page.waitForFunction(previous=>{
        const pose=[];
        ksTest.preview().traverse(object=>{if(object.isBone)pose.push(...object.quaternion.toArray());});
        return pose.some((value,i)=>value!==previous[i]);
      },beforePreview,{timeout:10000});
      await id('blenderClear').evaluate(el=>el.click());
      assert.equal(await page.evaluate(()=>ksTest.preview()),null);
      const afterClear=await resourceCount();
      assert.deepEqual(afterClear,beforeImport,'Clearing a rendered GLB preview must release its GPU resources');
      console.log('BVH retarget scrub and animated GLB export/import',JSON.stringify({
        joints:gltf.skins[0].joints.length,channels:gltf.animations[0].channels.length,bytes:glb.length
      }));
    }
    console.log('MakeHuman rig, joint and pose joystick, weapon grip, motion playback and action sequencer scrub passed');
  }
  if(extended) {
    await page.getByRole('button',{name:'Modeling',exact:true}).click();
    await add('sphere');await look('object');
    const triangleCount=await page.evaluate(()=>{
      const mesh=KumarShapeBridge.edit.active();
      mesh.geometry.dispose();mesh.geometry=new ksTest.THREE.SphereGeometry(.23,144,144);
      return mesh.geometry.index.count/3;
    });
    assert.ok(triangleCount>40000);
    const sample=()=>page.evaluate(()=>{
      const {memory}=ksTest.renderer.info;
      return {geometries:memory.geometries,textures:memory.textures};
    });
    const heap=async()=>{
      await client.send('HeapProfiler.collectGarbage');
      return Math.round((await client.send('Runtime.getHeapUsage')).usedSize/104857.6)/10;
    };
    const collect=()=>page.evaluate(()=>{
      window.stressFrames=[];
      requestAnimationFrame(function next(t){
        if(!window.stressFrames)return;
        window.stressFrames.push(t);requestAnimationFrame(next);
      });
    });
    await select('right','Editing joystick mode','move');
    await select('right','Joystick axis lock','x');
    const position=()=>page.evaluate(()=>KumarShapeBridge.edit.active().position.toArray());
    const cycles=async count=>{
      for(let i=0;i<count;i++){
        const original=await position();
        await stick('right',30,0,130);
        assert.notDeepEqual(await position(),original);
        assert.ok(await page.evaluate(()=>KumarShapeBridge.undo()));
        assert.deepEqual(await position(),original);
        assert.ok(await page.evaluate(()=>KumarShapeBridge.redo()));
        assert.ok(await page.evaluate(()=>KumarShapeBridge.undo()));
      }
    };
    await cycles(3);
    const baseline=await sample(),heapBefore=await heap();
    await collect();
    const started=Date.now();
    await cycles(40);
    const frames=await page.evaluate(()=>{
      const samples=window.stressFrames;window.stressFrames=null;
      return samples.slice(1).map((t,i)=>t-samples[i]).sort((a,b)=>a-b);
    });
    const after=await sample(),heapAfter=await heap();
    assert.ok(after.geometries<=baseline.geometries+2,{baseline,after});
    assert.ok(after.textures<=baseline.textures+1,{baseline,after});
    console.log('Dense mesh stress',JSON.stringify({triangleCount,cycles:40,seconds:(Date.now()-started)/1000,
      frameSamples:frames.length,p95Ms:frames[Math.floor(frames.length*.95)],baseline,after,heapBefore,heapAfter}));
  }
  await toggleSettings();
  await settings.locator('details').first().evaluate(el=>el.open=true);
  const preset=settings.getByRole('combobox',{name:'Sensitivity preset'});
  await preset.selectOption('Fine');assert.equal((await state()).cursor,.55);
  await preset.selectOption('Fast');assert.equal((await state()).camera,1.65);
  await preset.selectOption('Normal');assert.equal((await state()).camera,1);
  const keys=['cursor','camera','movement','rotation','scaling','sculpting','rigging','animation',
    'precision','deadZone','smoothing','acceleration','boost','speed'];
  for(const k of keys){
    const old=(await state())[k];
    const v=await field(k).evaluate(el=>Number(el.min)+(Number(el.max)-Number(el.min))*.55);
    await setValue(k,v);
    assert.notEqual((await state())[k],old,k);
  }
  await field('invertX').check();await field('invertY').check();await field('autoCenter').uncheck();
  assert.equal((await state()).preset,'Custom');
  await settings.locator('details').last().evaluate(el=>el.open=true);
  for(const k of ['mouse','left','right']){
    await setValue(k+'Width',152);await setValue(k+'Opacity',.7);
    assert.equal((await state()).panels[k].width,152);assert.equal((await state()).panels[k].opacity,.7);
  }
  await settings.getByRole('combobox',{name:'Handed layout'}).selectOption('left');
  await toggleSettings();
  {
    const handle=button('left','Drag Camera stick panel');
    const loc=await center(handle);
    await drag(loc,[loc[0]+24,loc[1]-23]);
    assert.ok(Number.isFinite((await state()).panels.left.x));
    await click(button('mouse','Minimize or expand Virtual Mouse'));
    await pad('mouse').waitFor({state:'hidden',timeout:3000});
    await click(button('mouse','Minimize or expand Virtual Mouse'));
  }
  const saved=await state();
  await page.reload();await id('ksVirtualLauncher').waitFor();
  assert.deepEqual(await state(),saved);
  assert.equal(await panel('mouse').isVisible(),true);
  await toggleSettings();await click(clickByName('Reset defaults'));
  for(const k of ['mouse','left','right'])assert.equal(await panel(k).isVisible(),false);
  assert.equal((await state()).preset,'Normal');
  assert.deepEqual(errors,[]);
  const memory=await client.send('Runtime.getHeapUsage');
  const measured=await page.evaluate(async()=>{
    await new Promise(resolve=>setTimeout(resolve,50));
    const frames=[];
    let previous=performance.now();
    await new Promise(resolve=>{function step(now){
      frames.push(now-previous);previous=now;
      if(frames.length<25)requestAnimationFrame(step);else resolve();
    }requestAnimationFrame(step);});
    return Math.round(frames.reduce((sum,v)=>sum+v,0)/frames.length*10)/10;
  });
  console.log(device||'desktop',browser.version(),'all sensitivity settings, layout, persistence, reset and zero page errors passed',
    JSON.stringify({jsHeapMiB:Math.round(memory.usedSize/104857.6)/10,meanIdleFrameMs:measured}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
