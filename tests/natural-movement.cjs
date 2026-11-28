const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..');
const dependencies=process.env.KUMAR_QA_DEPS || '/tmp/ks-deps';
const requireDependency=createRequire(path.join(dependencies,'package.json'));
const {chromium}=requireDependency('playwright-core');
const assetDirectory=process.env.KUMAR_QA_ASSETS || '/tmp';
(async()=>{
 const chromiumPath=process.env.KUMAR_QA_CHROMIUM ||
   await (await import(pathToFileURL(requireDependency.resolve('@sparticuz/chromium')).href)).default.executablePath();
 const browser=await chromium.launch({executablePath:chromiumPath,headless:true,
  args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1480,height:1000}});
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
   if(name.endsWith('.html'))return route.fulfill({body:fs.readFileSync(process.env.KUMAR_VISUAL_HTML||file,'utf8').replace(
    'scene.add(new THREE.HemisphereLight','window.ksTest={scene,camera,renderer,controls,THREE};\nscene.add(new THREE.HemisphereLight')
      .replace('renderer.setAnimationLoop(()=>', `Object.assign(window.ksTest,{
       rig:()=>posed, gesture:setGesture, forward, scene, renderer, THREE,
       stop:()=>{seqStop();motionRestore();stop410();captureRestore();},
       setup:name=>{
        motionRestore();captureRestore();stop410();seqStop();
        if(!window.ksTest.cleanPose)window.ksTest.cleanPose=seqSnapshot();
        seqApply(window.ksTest.cleanPose);
        for(const side of ['L','R'])setGesture(side,'Open Hand');
        $('stanceNatural').click();
        if(name==='Punch')capture410();
        else if(name==='Walk to Run'||name==='Sit to Stand'){
         const pair=name==='Walk to Run'?[{name:'Walk',duration:2.4},{name:'Run',duration:1.3}]:
           [{name:'Sit Down',duration:1.8},{name:'Stand Up',duration:1.9}];
         seqItems.splice(0,seqItems.length,...pair);seqPrepare();
        }else if(name==='Recorded turn')captureInit();
        else if(name.startsWith('Grip ')){
         for(const side of ['L','R'])setGesture(side,name.slice(5));
        }else if(name==='Curl left index'){
         Object.assign(handState.L,{mode:'normal',curl:[0,0,0,0,0],spread:0,opposition:0});applyHand('L');
        }else if(name==='Curl right index'){
         Object.assign(handState.R,{mode:'normal',curl:[0,0,0,0,0],spread:0,opposition:0});applyHand('R');
        }else if(name!=='Natural Standing'){
         $('motionPreset').value=name;$('motionSteps').value='4';motionCapture();
        }
       },
       pose:(name,t)=>{
        if(name==='Punch')punch410(t);
        else if(name==='Walk to Run'||name==='Sit to Stand')seqPose(t*3.7);
        else if(name==='Recorded turn')capturePose(t*captureData.clip.duration*.35);
        else if(name.startsWith('Curl ')){
         const side=name.includes('left')?'L':'R';handState[side].curl[1]=t*100;applyHand(side);
        }else if(!name.startsWith('Grip ')&&name!=='Natural Standing')motionPose(t);
        posed.updateMatrixWorld(true);
       },
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
  await page.waitForSelector('#ksVirtualLauncher');
  await page.getByRole('button',{name:'Rigging',exact:true}).click();
  await page.locator('#buildRig').evaluate(el=>el.onclick());
  if(!await page.evaluate(()=>!!ksTest.rig()))throw Error('Official rig could not load');
  const order=['Natural Standing','Walk','Run','Jump','Sit Down','Stand Up','Angry Walk',
   'Quiet Standing','Speaking Gesture','Listening','Restrained Anger','Punch',
   'Curl left index','Curl right index','Grip Closed Fist','Grip Sword Grip','Grip Spear Grip','Grip Staff Grip','Grip Bow Grip',
   'Recorded turn','Walk to Run','Sit to Stand'];
  const selection=process.argv[2]?process.argv[2].split('|'):order;
  const directory=process.env.KUMAR_VISUAL_DIR||'/tmp/ks-natural';
  fs.mkdirSync(directory,{recursive:true});
  if(selection.includes('Recorded turn')){
   await page.locator('#bvhFile').setInputFiles(path.join(assetDirectory,'ks-pirouette.bvh'));
   await page.waitForFunction(()=>document.getElementById('bvhStatus').textContent.startsWith('Recording loaded'),null,{timeout:12000});
  }
  await page.evaluate(()=>{
   const api=ksTest,{THREE}=api;
   api.renderer.setAnimationLoop(null);
   api.renderer.setPixelRatio(1);
   api.renderer.setSize(960,720,false);
   if(api.rig())api.rig().visible=true;
   for(const object of api.scene.children)if(object.isSkeletonHelper)object.visible=false;
   // The evidence uses the actual skinned Studio mesh with a neutral clay material.
   api.rig().material=api.rig().material.clone();
   api.rig().material.color.setHex(0x94b2b9);
   const sheet=document.createElement('canvas');
   sheet.width=960;sheet.height=720;
   const camera=new THREE.PerspectiveCamera(34,480/360,.01,80);
   const floorForward=api.forward().setY(0).normalize(),up=new THREE.Vector3(0,1,0);
   const sideways=up.clone().cross(floorForward).normalize();
   api.capture=(name,t)=>{
    api.pose(name,t);
    const isHand=name.startsWith('Grip ')||name.startsWith('Curl ');
    const rig=api.rig(),point=id=>rig.skeleton.getBoneByName(id).getWorldPosition(new THREE.Vector3());
    const anchor=isHand?point(name==='Curl right index'?'wrist.R':'wrist.L')
      .lerp(point(name==='Curl right index'?'finger3-1.R':'finger3-1.L'),.65):
      new THREE.Vector3(0,name==='Jump'?1.06:.94,0);
    if(!isHand)anchor.addScaledVector(floorForward,name==='Walk to Run'?1.5:name==='Run'?1.05:
       name==='Angry Walk'?1.75:name.includes('Walk')?.47:name==='Recorded turn'?.2:0);
    const radius=isHand?.34:(name==='Angry Walk'?6.4:
      ['Run','Walk to Run','Recorded turn'].includes(name)?5.3:name==='Jump'?4.2:3.8);
    const sideView=name==='Curl right index'?sideways.clone().negate():sideways;
    api.renderer.setScissorTest(true);
    for(const [i,direction] of [floorForward,sideView,floorForward.clone().negate(),
      floorForward.clone().addScaledVector(sideView,.85).normalize()].entries()){
     const x=(i%2)*480,y=i<2?360:0;
     camera.position.copy(anchor).addScaledVector(direction,radius);
     camera.position.y+=isHand?.10:.12;
     camera.lookAt(anchor);
     api.renderer.setViewport(x,y,480,360);
     api.renderer.setScissor(x,y,480,360);
     api.renderer.render(api.scene,camera);
    }
    api.renderer.setScissorTest(false);
    const ctx=sheet.getContext('2d');
    ctx.drawImage(api.renderer.domElement,0,0);
    ctx.fillStyle='#111827';ctx.fillRect(0,0,960,30);
    ctx.fillStyle='#f7fafc';ctx.font='16px sans-serif';ctx.fillText(name+'   |   '+Math.round(t*100)+'%   |   Kumar Studio V6.0',14,21);
    ctx.font='14px sans-serif';
    for(const [i,label] of ['FRONT','SIDE','BACK','THREE-QUARTER'].entries()){
     const x=(i%2)*480+13,y=i<2?51:382;
     ctx.fillStyle='#111827';ctx.fillRect(x-4,y-15,126,20);
     ctx.fillStyle='#f7fafc';ctx.fillText(label,x,y);
    }
    ctx.strokeStyle='#283547';ctx.strokeRect(0,30,480,330);ctx.strokeRect(480,30,480,330);
    ctx.strokeRect(0,360,480,360);ctx.strokeRect(480,360,480,360);
    const root=point('root'),feet=['L','R'].map(side=>point('foot.'+side).toArray());
    return {png:sheet.toDataURL('image/png').split(',')[1],root:root.toArray(),feet};
   };
  });
  const count=Number(process.env.KUMAR_VISUAL_FRAMES||25);
  if(!Number.isInteger(count)||count<13||count>120)throw Error('Choose 13–120 visual samples per action.');
  const distance=(a,b)=>Math.hypot(...a.map((value,i)=>value-b[i]));
  const maxFootDrift=(samples,initial)=>Math.max(...samples.flatMap(sample=>
    sample.feet.map((foot,i)=>distance(foot,initial.feet[i]))));
  for(const name of selection){
   await page.evaluate(name=>ksTest.setup(name),name);
   const prefix=name.toLowerCase().replace(/[^a-z0-9]+/g,'-');
   const frames=path.join(directory,prefix);fs.mkdirSync(frames,{recursive:true});
   const samples=[];
   for(let i=0;i<count;i++){
    const t=i/(count-1),frame=await page.evaluate(([name,t])=>ksTest.capture(name,t),[name,t]);
    fs.writeFileSync(path.join(frames,String(i).padStart(3,'0')+'.png'),Buffer.from(frame.png,'base64'));
    samples.push({t,root:frame.root,feet:frame.feet});
   }
   fs.writeFileSync(path.join(frames,'samples.json'),JSON.stringify(samples));
   if(!process.env.KUMAR_VISUAL_HTML){
    if(name==='Jump') {
     assert.ok(Math.max(...samples.map(frame=>frame.root[1]))>samples[0].root[1]+.15);
     assert.ok(maxFootDrift(samples.filter(frame=>frame.t>=.80),samples[0])<.01);
    }
    if(name==='Sit Down'||name==='Stand Up'||name==='Sit to Stand'){
     assert.ok(maxFootDrift(samples,samples[0])<.01);
     if(name==='Sit to Stand')assert.ok(distance(samples.at(-1).root,samples[0].root)<.01);
    }
    if(name==='Run'){
     const support=[{side:0,from:.04,to:.17},{side:1,from:.27,to:.42},
       {side:0,from:.51,to:.67},{side:1,from:.76,to:.85}];
     for(const {side,from,to} of support){
      const frames=samples.filter(frame=>frame.t>=from&&frame.t<=to);
      for(const frame of frames)assert.ok(distance(frame.feet[side],frames[0].feet[side])<.022);
     }
    }
   }
   console.log('Rendered',name,count,'frames × four cameras');
  }
  if(errors.length)throw Error(errors.join('; '));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
