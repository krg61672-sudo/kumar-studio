import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import {
  readMesh, writeMesh, topology, polygonRegion, boundaryEdges, mirrorMesh,
  regionOperation, mergeCorners, solidKernel, toSolid, fromSolid, bevelEdge, loopCut, splitEdge, duplicateMirror, knifeStroke, quadRetopology
} from './mesh-topology.js';

export function mountModelingTools({scene, camera, renderer, controls, bridge, group, saveHistory}) {
  const panel = document.getElementById('referenceModeling');
  if (!panel) return;
  const canvas = renderer.domElement;
  const section = document.createElement('section');
  section.id = 'ksModelingTools';
  section.innerHTML = `
    <h4>Mesh component editing</h4>
    <label>Selection <select id="ksComponentMode">
      <option value="off">Orbit</option><option value="object">Object</option>
      <option value="vertex">Vertex</option><option value="edge">Edge</option>
      <option value="face">Triangle</option><option value="polygon">Polygon</option>
      <option value="knife">Knife · draw or tap points</option><option value="retopo">Retopology · surface points</option>
    </select></label>
    <label>Gizmo <select id="ksGizmoMode">
      <option value="translate">Move</option><option value="rotate">Rotate</option><option value="scale">Scale</option>
    </select></label>
    <label>Tool amount <input id="ksComponentStep" type="number" value="0.02" min="0.001" step="0.01"></label>
    <label><input id="ksTriangleEdges" type="checkbox"> Include triangle edges when picking</label>
    <label><input id="ksComponentAccumulate" type="checkbox"> Add vertices to selection</label>
    <label><input id="ksComponentDrag" type="checkbox"> Drag component in camera plane</label>
    <div id="ksComponentMoves"></div>
    <details><summary>Bevel and Loop Cut settings</summary>
      <label>Bevel width <input id="ksBevelWidth" type="number" value="0.02" min="0.0001" step="0.005"></label>
      <label>Bevel segments <input id="ksBevelSegments" type="number" value="3" min="1" max="16" step="1"></label>
      <label>Loop cut count <input id="ksLoopCount" type="number" value="1" min="1" max="12" step="1"></label>
      <label>Loop placement <output id="ksLoopPlacementValue">50%</output>
        <input id="ksLoopPlacement" type="range" value="50" min="1" max="99" step="1"></label>
      <div data-actions="loops"></div>
    </details>
    <details id="ksKnifeTools"><summary>Knife</summary>
      <label><input id="ksKnifeSnap" type="checkbox" checked> Snap to nearby vertices and edges</label>
      <div data-actions="knife"></div>
    </details>
    <details id="ksRetopoTools"><summary>Retopology</summary>
      <label>Quad density <select id="ksRetopoDensity">
        <option value="1">Low</option><option value="2">Medium</option><option value="3">High</option>
      </select></label>
      <label><input id="ksRetopoSnap" type="checkbox" checked> Snap new quads to source surface</label>
      <div data-actions="retopo"></div>
    </details>
    <details open><summary>Components and topology</summary><div data-actions="components"></div></details>
    <details><summary>Objects and solids</summary>
      <label>Second mesh <select id="ksMeshOperand"></select></label>
      <label>Mirror side <select id="ksMirrorSide">
        <option value="x:1">+X to −X</option><option value="x:-1">−X to +X</option>
        <option value="y:1">+Y to −Y</option><option value="y:-1">−Y to +Y</option>
        <option value="z:1">+Z to −Z</option><option value="z:-1">−Z to +Z</option>
      </select></label>
      <label>Voxel remesh resolution
        <select id="ksVoxelResolution">
          <option value="24">Coarse · 24</option><option value="32">Low · 32</option>
          <option value="40" selected>Medium · 40</option><option value="48">High · 48</option>
          <option value="56">Fine · 56</option>
        </select>
      </label>
      <div data-actions="solids"></div>
    </details>
    <p id="ksComponentStatus" role="status">Add or select an editable mesh.</p>`;
  panel.append(section);

  const mode = section.querySelector('#ksComponentMode');
  const transformMode = section.querySelector('#ksGizmoMode');
  const operand = section.querySelector('#ksMeshOperand');
  const status = section.querySelector('#ksComponentStatus');
  const input = section.querySelector('#ksComponentStep');
  const gizmo = new TransformControls(camera, canvas);
  const anchor = new THREE.Object3D();
  const markers = new THREE.Group();
  const dotGeometry = new THREE.SphereGeometry(.008, 8, 6);
  const markerMaterial = new THREE.MeshBasicMaterial({color: 0xffce63, depthTest: false});
  const outlineMaterial = new THREE.LineBasicMaterial({color: 0xffce63, depthTest: false});
  scene.add(anchor, gizmo, markers);
  gizmo.setSpace('local');
  gizmo.setSize(.65);
  gizmo.enabled = false;

  const field = id => section.querySelector('#' + id);
  const knifeOverlay = document.createElement('canvas');
  knifeOverlay.hidden = true;
  knifeOverlay.setAttribute('aria-hidden', 'true');
  knifeOverlay.style.cssText = 'display:none;position:absolute;pointer-events:none;z-index:6';
  canvas.parentElement.append(knifeOverlay);
  let selection, interaction, pendingTap, knifeDrag, retopoMesh, lastLoop;
  const componentTouches = new Set();
  let knifePoints = [], knifeHover;
  const selectedObjects = new Set();
  const surfaceTrees = new WeakMap();
  let retopoPoints = [];
  let busy = false;
  const ray = new THREE.Raycaster();
  const active = () => bridge.edit.active();
  const inModeling = () => document.body.dataset.ksMode === 'Modeling';
  const editing = () => inModeling() && !document.getElementById('refEditOn')?.checked;
  const current = () => selection?.mesh === active() &&
    selection.geometry === active()?.geometry ? selection : undefined;
  const report = message => { status.textContent = message; };

  function refreshObjects() {
    const previous = operand.value;
    operand.replaceChildren(new Option('Choose mesh', ''));
    bridge.list().forEach((item, i) => {
      if (group.children[i] !== active()) {
        operand.add(new Option((i + 1) + '. ' + (item.name || item.type), i));
      }
    });
    operand.value = [...operand.options].some(option => option.value === previous) ? previous : '';
  }

  function clearMarkers() {
    for (const item of [...markers.children]) {
      markers.remove(item);
      if (item.isLine) item.geometry.dispose();
      if (item.userData.objectOutline) item.material.dispose();
    }
  }

  function addMarker(world) {
    const marker = new THREE.Mesh(dotGeometry, markerMaterial);
    marker.position.copy(world);
    marker.renderOrder = 41;
    markers.add(marker);
  }

  function drawSelection() {
    clearMarkers();
    const selected = current();
    if (!editing()) return;
    retopoPoints.forEach(addMarker);
    if (mode.value==='object' && selectedObjects.size>1) {
      for (const mesh of selectedObjects) {
        const outline=new THREE.Box3Helper(new THREE.Box3().setFromObject(mesh),0xffce63);
        outline.userData.objectOutline=true;
        markers.add(outline);
      }
    }
    if (!selected) return;
    const {mesh, corners, edges} = selected;
    if (mode.value === 'vertex') corners.forEach(v => addMarker(mesh.localToWorld(v.p.clone())));
    if (!edges.length) return;
    const points = edges.flatMap(({a, b}) => [a, b].map(v => mesh.localToWorld(v.p.clone())));
    const lines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), outlineMaterial);
    lines.renderOrder = 41;
    markers.add(lines);
  }

  function syncGizmo() {
    if (interaction) return;
    gizmo.detach();
    gizmo.enabled = false;
    const mesh = active();
    if (!editing() || !mesh?.visible || busy) return;
    if (mode.value === 'object') gizmo.attach(mesh);
    const selected = current();
    if (selected) {
      const center = selected.corners.reduce((sum, v) => sum.add(v.p), new THREE.Vector3())
        .divideScalar(selected.corners.length);
      anchor.position.copy(mesh.localToWorld(center));
      mesh.getWorldQuaternion(anchor.quaternion);
      anchor.scale.set(1, 1, 1);
      anchor.updateMatrixWorld(true);
      gizmo.attach(anchor);
    }
    gizmo.enabled = !!gizmo.object;
  }

  function resetSelection() {
    selection = undefined;
    selectedObjects.clear();
    clearKnife();
    retopoPoints = [];
    retopoMesh = undefined;
    drawSelection();
    syncGizmo();
    refreshObjects();
  }

  function updateViewport() {
    componentTouches.clear();
    controls.enabled = true;
    if (editing() && mode.value === 'retopo') {
      field('ksRetopoTools').open = true;
      report('Generate quads or tap 3–4 surface points to place a face.');
    }
    if (editing() && mode.value === 'knife') {
      field('ksKnifeTools').open = true;
      report('Drag or tap points on the viewport, then confirm the cut.');
    }
    resetSelection();
  }

  mode.addEventListener('change', () => {
    const sculpt = document.getElementById('refEditOn');
    if (mode.value !== 'off' && sculpt?.checked) {
      sculpt.checked = false;
      sculpt.dispatchEvent(new Event('change'));
    }
    updateViewport();
  });
  transformMode.addEventListener('change', () => gizmo.setMode(transformMode.value));
  document.getElementById('refEditOn')?.addEventListener('change', () => {
    if (document.getElementById('refEditOn').checked) mode.value = 'off';
    updateViewport();
  });
  new MutationObserver(updateViewport).observe(document.body, {
    attributes: true, attributeFilter: ['data-ks-mode']
  });
  document.addEventListener('ks-modeling-selection', resetSelection);
  operand.addEventListener('pointerdown', refreshObjects);
  refreshObjects();

  function rayAt(x, y) {
    const rect = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2((x - rect.left) / rect.width * 2 - 1,
      1 - (y - rect.top) / rect.height * 2), camera);
    return ray;
  }

  function chooseComponent(mesh, hit, additive) {
    const geometry = mesh.geometry;
    const faces = readMesh(geometry), adjacency = topology(faces);
    const first = hit.faceIndex;
    const pickBoundary = mode.value === 'edge' && !section.querySelector('#ksTriangleEdges').checked;
    const region = mode.value === 'polygon' || pickBoundary ?
      polygonRegion(faces, adjacency, first) : new Set([first]);
    const point = mesh.worldToLocal(hit.point.clone());
    let edges = boundaryEdges(adjacency, region);
    let corners = [...new Map(edges.map(edge => [edge.a.p.toArray().join(','), edge.a])).values()];
    if (mode.value === 'vertex') {
      corners = [faces[first].reduce((a, b) => a.p.distanceToSquared(point) <
        b.p.distanceToSquared(point) ? a : b)];
      if ((additive || section.querySelector('#ksComponentAccumulate').checked) && current()) {
        const previous = current().corners;
        const included = previous.some(v => v.p.distanceToSquared(corners[0].p) < 1e-12);
        corners = included ? previous.filter(v => v.p.distanceToSquared(corners[0].p) >= 1e-12) :
          [...previous, ...corners];
        if (!corners.length) { resetSelection(); return; }
      }
      edges = [];
    }
    if (mode.value === 'edge') {
      const distance = edge => new THREE.Line3(edge.a.p, edge.b.p)
        .closestPointToPoint(point, true, new THREE.Vector3()).distanceToSquared(point);
      edges = [edges.reduce((a, b) => distance(a) < distance(b) ? a : b)];
      corners = [edges[0].a, edges[0].b];
    }
    if (!corners.length) throw Error('The selected region has no editable boundary.');
    if (mode.value === 'polygon') {
      corners = [...new Map([...region].flatMap(f => faces[f]).map(v => [v.p.toArray().join(','), v])).values()];
    }
    const previous=additive && current();
    if (previous && mode.value==='edge') {
      const clicked=edges[0];
      edges=previous.edges.some(edge=>edge.key===clicked.key)?
        previous.edges.filter(edge=>edge.key!==clicked.key):[...previous.edges,clicked];
      corners=[...new Map(edges.flatMap(({a,b})=>[a,b]).map(v=>[v.p.toArray().join(','),v])).values()];
    }
    if (previous && ['face','polygon'].includes(mode.value)) {
      for (const index of previous.region) {
        if (region.has(index)) region.delete(index);
        else region.add(index);
      }
      edges=boundaryEdges(adjacency,region);
      corners=[...new Map([...region].flatMap(f=>faces[f]).map(v=>[v.p.toArray().join(','),v])).values()];
    }
    if (!corners.length) {
      resetSelection();
      report('Selection cleared.');
      return;
    }
    selection = {mesh, geometry, faces, adjacency, region, corners, edges};
    report(mode.selectedOptions[0].textContent + ' selected.');
    drawSelection();
    syncGizmo();
  }

  function replaceGeometry(mesh, geometry, remove) {
    if (mesh !== active() || !group.children.includes(mesh)) {
      geometry.dispose();
      throw Error('The selected mesh changed while the tool was running.');
    }
    saveHistory();
    mesh.geometry.dispose();
    mesh.geometry = geometry;
    if (remove) {
      group.remove(remove);
      remove.geometry.dispose();
      remove.material.dispose();
    }
    document.dispatchEvent(new Event('ks-modeling-geometry'));
    resetSelection();
  }

  function tap(x, y, additive) {
    if (mode.value === 'object') {
      const objects = group.children.filter(mesh => mesh.visible);
      const hit = rayAt(x, y).intersectObjects(objects, false)[0];
      if (!hit) return;
      const batch=new Set(additive?(selectedObjects.size?[...selectedObjects]:
        active()?[active()]:[]):[]);
      if (additive && batch.has(hit.object)) batch.delete(hit.object);
      else batch.add(hit.object);
      const next=batch.has(hit.object)?hit.object:[...batch].at(-1);
      const select = document.getElementById('refBlocks');
      select.value = next?String(group.children.indexOf(next)):'';
      select.dispatchEvent(new Event('change', {bubbles: true}));
      if (!next) bridge.select(-1);
      selectedObjects.clear();
      for (const mesh of batch) selectedObjects.add(mesh);
      drawSelection();
      report(batch.size>1?batch.size+' objects selected.':next?'Object selected.':'Selection cleared.');
      return;
    }
    const mesh = active();
    if (!mesh?.visible) throw Error('Select a visible mesh first.');
    const hit = rayAt(x, y).intersectObject(mesh, false)[0];
    if (!hit) throw Error('Tap the selected mesh.');
    if (mode.value === 'retopo') {
      if (retopoPoints.length === 4) throw Error('Create the face or clear its points.');
      let point = hit.point.clone();
      if (retopoMesh && group.children.includes(retopoMesh)) {
        const positions = retopoMesh.geometry.attributes.position;
        const rect = canvas.getBoundingClientRect();
        let best = 14;
        for (let i = 0; i < positions.count; i++) {
          const world = retopoMesh.localToWorld(new THREE.Vector3().fromBufferAttribute(positions, i));
          const projected = world.clone().project(camera);
          const distance = Math.hypot(x - (rect.left + (1 + projected.x) * rect.width / 2),
            y - (rect.top + (1 - projected.y) * rect.height / 2));
          if (distance >= best || world.distanceTo(hit.point) > .06) continue;
          best = distance;
          point = world;
        }
      }
      if (retopoPoints.some(v => v.distanceToSquared(point) < 1e-8)) throw Error('Pick a different point.');
      retopoPoints.push(point);
      drawSelection();
      report(retopoPoints.length + ' surface points. Create a face with 3 or 4 points.');
      return;
    }
    chooseComponent(mesh, hit, additive);
  }

  function projectToViewport(matrix, width, height, local) {
    const clip = new THREE.Vector4(local.x, local.y, local.z, 1).applyMatrix4(matrix);
    return {w:clip.w, point:new THREE.Vector2((clip.x/clip.w+1)*width/2,
      (1-clip.y/clip.w)*height/2)};
  }

  function projection(mesh, rect) {
    mesh.updateWorldMatrix(true, false);
    camera.updateMatrixWorld(true);
    const matrix = camera.projectionMatrix.clone().multiply(camera.matrixWorldInverse)
      .multiply(mesh.matrixWorld);
    return point => projectToViewport(matrix, rect.width, rect.height, point);
  }

  function knifePoint(x, y) {
    const rect = canvas.getBoundingClientRect();
    const point = new THREE.Vector2(x-rect.left,y-rect.top);
    if (!field('ksKnifeSnap').checked) return point;
    const mesh = active();
    let hit;
    for (const [dx,dy] of [[0,0],[-6,0],[6,0],[0,-6],[0,6]]) {
      hit = rayAt(x+dx,y+dy).intersectObject(mesh,false)[0];
      if (hit) break;
    }
    if (!hit) return point;
    const project = projection(mesh,rect);
    const attr = mesh.geometry.attributes.position;
    const corners = [hit.face.a,hit.face.b,hit.face.c].map(i=>
      project(new THREE.Vector3().fromBufferAttribute(attr,i)).point);
    const vertex = corners.reduce((a,b)=>a.distanceToSquared(point)<b.distanceToSquared(point)?a:b);
    if (vertex.distanceToSquared(point)<=81) return vertex;
    let distance = 49, result = point;
    for (let i=0;i<3;i++) {
      const from = corners[i], edge = corners[(i+1)%3].clone().sub(from);
      if (edge.lengthSq()<1e-8) continue;
      const t = THREE.MathUtils.clamp(point.clone().sub(from).dot(edge)/edge.lengthSq(),0,1);
      const nearest = from.clone().addScaledVector(edge,t);
      const score = nearest.distanceToSquared(point);
      if (score>=distance) continue;
      distance=score;
      result=nearest;
    }
    return result;
  }

  function drawKnife() {
    const rect = canvas.getBoundingClientRect();
    knifeOverlay.hidden = !knifePoints.length && !knifeHover;
    knifeOverlay.style.display = knifeOverlay.hidden ? 'none' : 'block';
    if (knifeOverlay.hidden) return;
    knifeOverlay.width = Math.round(rect.width*devicePixelRatio);
    knifeOverlay.height = Math.round(rect.height*devicePixelRatio);
    Object.assign(knifeOverlay.style,{left:canvas.offsetLeft+'px',top:canvas.offsetTop+'px',
      width:rect.width+'px',height:rect.height+'px'});
    const ctx = knifeOverlay.getContext('2d');
    ctx.scale(devicePixelRatio,devicePixelRatio);
    ctx.strokeStyle = '#ffcc59';
    ctx.fillStyle = '#ffcc59';
    ctx.lineWidth = 2;
    const points = knifeHover ? [...knifePoints,knifeHover] : knifePoints;
    ctx.beginPath();
    points.forEach((point,i)=>i ? ctx.lineTo(point.x,point.y) : ctx.moveTo(point.x,point.y));
    ctx.stroke();
    for (const point of knifePoints) {
      ctx.beginPath();
      ctx.arc(point.x,point.y,3,0,Math.PI*2);
      ctx.fill();
    }
  }

  function clearKnife() {
    knifePoints = [];
    knifeHover = undefined;
    knifeDrag = undefined;
    knifeOverlay.hidden = true;
    knifeOverlay.style.display = 'none';
  }

  function knifeInput(event, minDistance) {
    if (knifePoints.length>=64) {
      report('The stroke has 64 points. Confirm it or cancel.');
      return;
    }
    const point = knifePoint(event.clientX,event.clientY);
    if (knifePoints.at(-1)?.distanceToSquared(point)<minDistance**2) return;
    knifePoints.push(point);
    knifeHover = undefined;
    drawKnife();
  }

  canvas.addEventListener('pointerdown', event=>{
    if (!editing() || mode.value!=='knife' || !active()?.visible || busy || !event.isPrimary || event.button!==0) return;
    event.stopImmediatePropagation();
    canvas.setPointerCapture(event.pointerId);
    knifeDrag = {id:event.pointerId,start:knifePoints.length};
    knifeInput(event,2);
  },true);
  canvas.addEventListener('pointermove',event=>{
    if (!editing() || mode.value!=='knife' || !active()?.visible || busy || !event.isPrimary) return;
    if (knifeDrag?.id===event.pointerId) {
      event.stopImmediatePropagation();
      knifeInput(event,14);
    } else {
      knifeHover = knifePoint(event.clientX,event.clientY);
      drawKnife();
    }
  },true);
  canvas.addEventListener('pointerup',event=>{
    if (knifeDrag?.id!==event.pointerId) return;
    event.stopImmediatePropagation();
    knifeInput(event,4);
    knifeDrag = undefined;
    report(knifePoints.length+' knife points. Confirm the cut or cancel.');
  },true);
  canvas.addEventListener('pointercancel',event=>{
    if (knifeDrag?.id!==event.pointerId) return;
    knifePoints.length=knifeDrag.start;
    knifeDrag=undefined;
    knifeHover=undefined;
    drawKnife();
  },true);
  canvas.addEventListener('pointerleave',()=>{
    if (knifeDrag || !knifeHover) return;
    knifeHover=undefined;
    drawKnife();
  });
  window.addEventListener('resize',clearKnife);

  // A tap picks components. A drag on a gizmo is handled by TransformControls.
  canvas.addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch' && editing() && !busy && !['off','object'].includes(mode.value)) {
      componentTouches.add(event.pointerId);
      controls.enabled = false;
    }
    if (!event.isPrimary) {
      pendingTap = undefined;
      if (interaction || componentTouches.size) event.stopImmediatePropagation();
      return;
    }
    if (!editing() || busy || ['off','knife'].includes(mode.value) || event.button !== 0) return;
    const additive=event.ctrlKey||event.shiftKey||event.metaKey;
    if (gizmo.enabled && !additive) {
      const rect = canvas.getBoundingClientRect();
      gizmo.pointerHover({x: (event.clientX - rect.left) / rect.width * 2 - 1,
        y: 1 - (event.clientY - rect.top) / rect.height * 2, button: -1});
      if (gizmo.axis) {
        controls.enabled = false;
        return;
      }
    }
    if (mode.value !== 'object') controls.enabled = false;
    // TransformControls updates its axis for touch before firing mouseDown.
    pendingTap = {id: event.pointerId, x: event.clientX, y: event.clientY, additive};
    if (additive) event.stopImmediatePropagation();
  }, true);
  canvas.addEventListener('pointermove', event => {
    if ((interaction || componentTouches.size) && !event.isPrimary) event.stopImmediatePropagation();
  }, true);
  canvas.addEventListener('pointerup', event => {
    if (!event.isPrimary) {
      pendingTap = undefined;
      componentTouches.delete(event.pointerId);
      controls.enabled = componentTouches.size === 0 && !interaction;
      if (interaction || componentTouches.size) event.stopImmediatePropagation();
      return;
    }
    const start = pendingTap;
    pendingTap = undefined;
    if (event.pointerType === 'touch') componentTouches.delete(event.pointerId);
    if (componentTouches.size) {
      controls.enabled = false;
      event.stopImmediatePropagation();
      return;
    }
    if (interaction) return;
    controls.enabled = true;
    if (!start || start.id !== event.pointerId || !editing()) return;
    try {
      const dx = event.clientX - start.x, dy = event.clientY - start.y;
      if (Math.hypot(dx, dy) <= 8) tap(event.clientX, event.clientY,start.additive);
      else if (current() && section.querySelector('#ksComponentDrag').checked) {
        const selected = current();
        const world = selected.mesh.localToWorld(selected.corners[0].p.clone());
        const delta = bridge.edit.screenDeltaToLocal(dx, dy, world.toArray());
        nudge('translate', new THREE.Vector3(...delta));
        report('Component moved.');
      }
    } catch (error) { report(error.message); }
  }, true);

  function restorePositions(mesh, positions) {
    const geometry = mesh.geometry;
    const attr = geometry.attributes.position;
    attr.array.set(positions);
    attr.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  }

  gizmo.addEventListener('mouseDown', () => {
    pendingTap = undefined;
    const mesh = active();
    const selected = current();
    const attr = mesh.geometry.attributes.position;
    const positions = attr.array.slice();
    const keys = new Set(selected?.corners.map(v => v.p.toArray().join(',')));
    const indices = selected ? Array.from({length: attr.count}, (_, i) => i)
      .filter(i => keys.has(Array.from(positions.subarray(i * 3, i * 3 + 3)).join(','))) : [];
    const object = gizmo.object;
    object.updateMatrixWorld(true);
    interaction = {mesh, selected, positions, indices, object,
      startWorld: object.matrixWorld.clone(), position: object.position.clone(),
      quaternion: object.quaternion.clone(), scale: object.scale.clone()};
    controls.enabled = false;
  });

  gizmo.addEventListener('objectChange', () => {
    if (!interaction?.selected) return;
    const {mesh, positions, indices, startWorld} = interaction;
    anchor.updateMatrixWorld(true);
    const delta = mesh.matrixWorld.clone().invert().multiply(anchor.matrixWorld)
      .multiply(startWorld.clone().invert()).multiply(mesh.matrixWorld);
    const transformed = positions.slice();
    for (const i of indices) new THREE.Vector3().fromArray(positions, i * 3)
      .applyMatrix4(delta).toArray(transformed, i * 3);
    restorePositions(mesh, transformed);
  });

  function finishTransform(cancelled) {
    if (!interaction) return;
    const {mesh, selected, positions, object, position, quaternion, scale} = interaction;
    interaction = undefined;
    const next = mesh.geometry.attributes.position.array.slice();
    const end = [object.position.clone(), object.quaternion.clone(), object.scale.clone()];
    const changed = !end[0].equals(position) || !end[1].equals(quaternion) || !end[2].equals(scale);
    if (changed || cancelled) {
      object.position.copy(position);
      object.quaternion.copy(quaternion);
      object.scale.copy(scale);
      if (selected) restorePositions(mesh, positions);
      if (!cancelled) {
        saveHistory();
        if (selected) restorePositions(mesh, next);
        else {
          object.position.copy(end[0]);
          object.quaternion.copy(end[1]);
          object.scale.copy(end[2]);
        }
        document.dispatchEvent(new Event('ks-modeling-geometry'));
        report((selected ? 'Component' : 'Object') + ' transformed.');
      }
    }
    controls.enabled = true;
    if (selected) resetSelection();
  }
  gizmo.addEventListener('mouseUp', () => finishTransform(false));
  canvas.addEventListener('pointercancel', event => {
    if (event.pointerType === 'touch') componentTouches.delete(event.pointerId);
    controls.enabled = componentTouches.size === 0 && !interaction;
    if (!event.isPrimary) {
      pendingTap = undefined;
      if (interaction || componentTouches.size) event.stopImmediatePropagation();
      return;
    }
    pendingTap = undefined;
    if (!interaction) return;
    finishTransform(true);
    gizmo.domElement.removeEventListener('pointermove', gizmo._onPointerMove);
    gizmo.pointerUp({button: 0});
  });

  function selectedRegion() {
    const selected = current();
    if (!selected || !['face', 'polygon'].includes(mode.value)) throw Error('Select a triangle or polygon first.');
    return selected;
  }

  function selectedEdge() {
    const selected = current();
    if (!selected || mode.value !== 'edge' || selected.edges.length!==1) throw Error('Select a single edge first.');
    return selected;
  }

  function amount() {
    const value = Number(input.value);
    if (!Number.isFinite(value) || value <= 0) throw Error('Enter a positive tool amount.');
    return value;
  }

  function secondMesh() {
    const other = operand.value === '' ? null : group.children[Number(operand.value)];
    if (!other || other === active()) throw Error('Choose a second editable mesh.');
    return other;
  }

  async function solidAction(kind) {
    const mesh = active();
    const original = mesh.geometry;
    const faces = readMesh(original);
    const other = ['union', 'difference', 'intersection'].includes(kind) ? secondMesh() : null;
    const value = other ? 0 : amount();
    const kernel = await solidKernel();
    if (mesh !== active() || original !== mesh.geometry || (other && !group.children.includes(other))) {
      throw Error('The selected mesh changed.');
    }
    const handles = [];
    const keep = solid => { handles.push(solid); return solid; };
    try {
      const a = keep(toSolid(kernel, faces, !other || !!other.geometry.attributes.uv));
      let result;
      if (other) {
        mesh.updateWorldMatrix(true, false);
        other.updateWorldMatrix(true, false);
        const relative = mesh.matrixWorld.clone().invert().multiply(other.matrixWorld);
        const b = keep(toSolid(kernel, readMesh(other.geometry, relative), !!original.attributes.uv));
        result = keep(kernel.Manifold[kind](a, b));
      } else {
        const simplified = keep(a.simplify(value * .05));
        const bounds = original.boundingBox || new THREE.Box3().setFromBufferAttribute(original.attributes.position);
        if (bounds.getSize(new THREE.Vector3()).length() / value > 120) {
          throw Error('Increase the target edge length for this mesh.');
        }
        result = keep(simplified.refineToLength(value));
      }
      const resultFaces = fromSolid(result, !!other);
      if (resultFaces.length) {
        replaceGeometry(mesh, writeMesh(resultFaces, {smooth: kind === 'remesh'}), other);
      } else {
        // Empty intersection and complete subtraction are valid Boolean results.
        bridge.remove();
        group.remove(other);
        other.geometry.dispose();
        other.material.dispose();
        document.dispatchEvent(new Event('ks-modeling-geometry'));
        resetSelection();
        return 'Boolean ' + kind + ' produced an empty result.';
      }
    } finally {
      handles.reverse().forEach(solid => solid.delete());
    }
  }

  async function voxelRemesh() {
    const mesh = active(), original = mesh.geometry;
    const faces = readMesh(original);
    const edges = topology(faces).edges;
    if (!faces.length || [...edges.values()].some(edge => edge.length !== 2)) {
      throw Error('Voxel Remesh needs a closed, manifold mesh with every edge shared by two faces.');
    }
    const resolution = Number(field('ksVoxelResolution').value);
    const {MeshBVH} = await import('three-mesh-bvh');
    const tree = new MeshBVH(original,{indirect:true});
    if (mesh !== active() || original !== mesh.geometry) throw Error('The selected mesh changed.');
    const bounds = original.boundingBox?.clone() ||
      new THREE.Box3().setFromBufferAttribute(original.attributes.position);
    const size = bounds.getSize(new THREE.Vector3());
    const step = Math.max(size.x,size.y,size.z) / resolution;
    if (!Number.isFinite(step) || step <= 1e-8) throw Error('The mesh has no usable volume.');
    const origin = bounds.min.clone().addScalar(-2*step);
    const nx = Math.ceil(size.x/step)+4, ny = Math.ceil(size.y/step)+4, nz = Math.ceil(size.z/step)+4;
    const total = nx*ny*nz;
    if (total > 260000) throw Error('Reduce voxel resolution for this mesh size.');
    const fieldValues = new Float32Array(total);
    const index = (x,y,z) => (z*ny+y)*nx+x;
    const ray = new THREE.Ray(new THREE.Vector3(),new THREE.Vector3(1,0,0));
    const target = {};
    const hitXs = [];
    const distinctHits = [];
    const point = new THREE.Vector3();
    let completedRows = 0;
    for (let z=0;z<nz;z++) {
      const pz=origin.z+z*step;
      for (let y=0;y<ny;y++) {
        const py=origin.y+y*step;
        ray.origin.set(origin.x,py,pz);
        hitXs.length=0;
        for (const hit of tree.raycast(ray,THREE.DoubleSide,0,nx*step)) hitXs.push(hit.point.x);
        hitXs.sort((a,b)=>a-b);
        distinctHits.length=0;
        for (const x of hitXs) {
          if (!distinctHits.length || Math.abs(x-distinctHits[distinctHits.length-1])>step*1e-4) distinctHits.push(x);
        }
        let crossing=0;
        for (let x=0;x<nx;x++) {
          const px=origin.x+x*step;
          while (crossing<distinctHits.length && distinctHits[crossing] <= px+step*1e-5) crossing++;
          point.set(px,py,pz);
          const nearest=tree.closestPointToPoint(point,target);
          if (!nearest || !Number.isFinite(nearest.distance)) throw Error('Could not evaluate the mesh surface.');
          fieldValues[index(x,y,z)]=(crossing%2 ? -nearest.distance : nearest.distance);
        }
        completedRows++;
      }
      if ((z&3)===3) {
        report('Voxel Remesh sampling '+Math.round(completedRows/(ny*nz)*100)+'%…');
        await new Promise(resolve=>requestAnimationFrame(resolve));
        if (mesh !== active() || original !== mesh.geometry) throw Error('The selected mesh changed.');
      }
    }
    const tetrahedra=[[0,5,1,6],[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6]];
    const cubeOffsets=[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]];
    const result=[];
    const outward=new THREE.Vector3(), insideCenter=new THREE.Vector3(), outsideCenter=new THREE.Vector3();
    const addTriangle=(a,b,c,inside,outside)=>{
      const key=p=>p.toArray().map(value=>Math.round(value*1e6)).join(',');
      if (new Set([key(a),key(b),key(c)]).size!==3) return;
      const normal=b.clone().sub(a).cross(c.clone().sub(a));
      if (normal.lengthSq() < step*step*step*step*1e-12) return;
      if (normal.dot(outward.copy(outside).sub(inside))<0) [b,c]=[c,b];
      result.push([{p:a},{p:b},{p:c}]);
    };
    const interpolate=(a,b,va,vb)=>{
      const t=THREE.MathUtils.clamp(va/(va-vb),0,1);
      return a.clone().lerp(b,t);
    };
    const corners=Array.from({length:8},()=>new THREE.Vector3());
    const values=new Float32Array(8);
    for (let z=0;z<nz-1;z++) for (let y=0;y<ny-1;y++) for (let x=0;x<nx-1;x++) {
      for (let c=0;c<8;c++) {
        const [dx,dy,dz]=cubeOffsets[c];
        corners[c].set(origin.x+(x+dx)*step,origin.y+(y+dy)*step,origin.z+(z+dz)*step);
        values[c]=fieldValues[index(x+dx,y+dy,z+dz)]+step*1e-3;
      }
      for (const tetra of tetrahedra) {
        const ins=tetra.filter(i=>values[i]<0), outs=tetra.filter(i=>values[i]>=0);
        if (!ins.length || !outs.length) continue;
        insideCenter.set(0,0,0);outsideCenter.set(0,0,0);
        ins.forEach(i=>insideCenter.add(corners[i]));
        outs.forEach(i=>outsideCenter.add(corners[i]));
        insideCenter.multiplyScalar(1/ins.length);outsideCenter.multiplyScalar(1/outs.length);
        const cross=(i,j)=>interpolate(corners[i],corners[j],values[i],values[j]);
        if (ins.length===1) {
          addTriangle(cross(ins[0],outs[0]),cross(ins[0],outs[1]),cross(ins[0],outs[2]),insideCenter,outsideCenter);
        } else if (ins.length===3) {
          addTriangle(cross(ins[0],outs[0]),cross(ins[1],outs[0]),cross(ins[2],outs[0]),insideCenter,outsideCenter);
        } else {
          const a=cross(ins[0],outs[0]),b=cross(ins[0],outs[1]);
          const c=cross(ins[1],outs[0]),d=cross(ins[1],outs[1]);
          addTriangle(a,c,d,insideCenter,outsideCenter);
          addTriangle(a,d,b,insideCenter,outsideCenter);
        }
      }
    }
    if (!result.length) throw Error('Voxel Remesh found no enclosed surface.');
    if (mesh !== active() || original !== mesh.geometry) throw Error('The selected mesh changed.');
    const geometry=writeMesh(result,{smooth:true,uv:false});
    replaceGeometry(mesh,geometry);
    return 'Voxel Remesh created '+(geometry.index.count/3).toLocaleString()+' triangles at resolution '+resolution+'. UVs are not preserved.';
  }

  async function surfaceTree(mesh) {
    const source = mesh.geometry;
    const version = source.attributes.position.version;
    const {MeshBVH} = await import('three-mesh-bvh');
    let cached = surfaceTrees.get(source);
    if (cached?.version === version) return cached.tree;
    const tree = new MeshBVH(source,{indirect:true});
    surfaceTrees.set(source,{version,tree});
    return tree;
  }

  function bindRetopology(source, target) {
    source.userData.topologyReference ??= THREE.MathUtils.generateUUID();
    target.userData.retopologySource = source.userData.topologyReference;
  }

  async function automaticRetopology() {
    const source = active(), original = source.geometry;
    const snap = field('ksRetopoSnap').checked;
    const tree = snap ? await surfaceTree(source) : undefined;
    if (active()!==source || source.geometry!==original) throw Error('The source mesh changed.');
    const faces = quadRetopology(readMesh(original),Number(field('ksRetopoDensity').value),
      tree && (point=>{
        const nearest = tree.closestPointToPoint(point);
        if (nearest) point.copy(nearest.point);
      }));
    const geometry = writeMesh(faces,{smooth:true});
    const part = source.clone(false);
    part.geometry = geometry;
    part.material = new THREE.MeshStandardMaterial({color:0xe6ad65,side:THREE.DoubleSide,wireframe:true});
    part.userData = {};
    part.name = (source.name || 'Mesh')+' quad retopology';
    saveHistory();
    bindRetopology(source,part);
    group.add(part);
    bridge.select(group.children.indexOf(part));
    mode.value='polygon';
    updateViewport();
    document.dispatchEvent(new Event('ks-modeling-geometry'));
    return new Set(geometry.userData.polygons).size+' editable quads created.';
  }

  async function snapRetopology() {
    const mesh = active(), original = mesh.geometry;
    const source = group.children.find(item=>item!==mesh && item.userData.topologyReference &&
      item.userData.topologyReference===mesh.userData.retopologySource);
    if (!source) throw Error('Select retopology with its source mesh still in the scene.');
    const tree = await surfaceTree(source);
    if (active()!==mesh || mesh.geometry!==original) throw Error('The retopology mesh changed.');
    mesh.updateWorldMatrix(true,false);
    source.updateWorldMatrix(true,false);
    const intoSource = source.matrixWorld.clone().invert().multiply(mesh.matrixWorld);
    const intoMesh = intoSource.clone().invert();
    const next = original.clone(), positions = next.attributes.position;
    const selected = current();
    const keys = selected && new Set(selected.corners.map(v=>v.p.toArray().join(',')));
    const point = new THREE.Vector3();
    for (let i=0;i<positions.count;i++) {
      point.fromBufferAttribute(positions,i);
      if (keys && !keys.has(point.toArray().join(','))) continue;
      const nearest = tree.closestPointToPoint(point.applyMatrix4(intoSource));
      if (!nearest) continue;
      point.copy(nearest.point).applyMatrix4(intoMesh);
      positions.setXYZ(i,point.x,point.y,point.z);
    }
    next.computeVertexNormals();
    next.computeBoundingBox();
    next.computeBoundingSphere();
    replaceGeometry(mesh,next);
  }

  function addRetopoFace() {
    const mesh = active();
    if (mode.value !== 'retopo' || retopoPoints.length < 3) throw Error('Tap 3 or 4 source surface points first.');
    const existing = retopoMesh && group.children.includes(retopoMesh);
    const part = existing ? retopoMesh : new THREE.Mesh(undefined,
      new THREE.MeshStandardMaterial({color: 0xe6ad65, side: THREE.DoubleSide, wireframe: true}));
    const points = retopoPoints.map(p => ({p: group.worldToLocal(p.clone())}));
    const previous = existing ? readMesh(part.geometry) : [];
    const polygon = previous.reduce((max, face) => Math.max(max, face.polygon ?? 0), 0) + 1;
    const faces = [points.slice(0, 3)];
    if (points.length === 4) faces.push([points[0], points[2], points[3]]);
    if (faces.some(([a, b, c]) => b.p.clone().sub(a.p).cross(c.p.clone().sub(a.p)).lengthSq() < 1e-12)) {
      if (!existing) part.material.dispose();
      throw Error('Pick points that form a face with area.');
    }
    for (const face of faces) face.polygon = polygon;
    const geometry = writeMesh([...previous, ...faces], {smooth: true});
    saveHistory();
    part.geometry.dispose();
    part.geometry = geometry;
    if (!existing) {
      part.name = (mesh.name || 'Mesh') + ' retopology';
      bindRetopology(mesh,part);
      group.add(part);
    }
    retopoMesh = part;
    retopoPoints = [];
    drawSelection();
    document.dispatchEvent(new Event('ks-modeling-geometry'));
  }

  function makeButton(target, label, action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', async () => {
      if (busy || interaction) return;
      busy = true;
      try {
        if (!active() && !['Undo geometry','Redo geometry'].includes(label)) throw Error('Select an editable mesh.');
        const pending = action();
        if (pending?.then) report(label + ' running…');
        const message = await pending;
        report(typeof message === 'string' ? message : label + ' applied.');
      } catch (error) {
        report(error.message);
      } finally {
        busy = false;
        syncGizmo();
      }
    });
    target.append(button);
    return button;
  }

  function nudge(kind, delta, axis, value) {
    const selected = current();
    if (!selected) throw Error('Choose a component first.');
    const {mesh, faces, corners} = selected;
    const center = corners.reduce((sum, corner) => sum.add(corner.p), new THREE.Vector3())
      .divideScalar(corners.length);
    const keys = new Set(corners.map(v => v.p.toArray().join(',')));
    const direction = new THREE.Vector3();
    if (axis) direction[axis] = 1;
    const changed = faces.map(face => {
      const transformed = face.map(v => {
        if (!keys.has(v.p.toArray().join(','))) return v;
        const p = v.p.clone();
        if (kind === 'translate') p.add(delta);
        else {
          p.sub(center);
          if (kind === 'rotate') p.applyAxisAngle(direction, value);
          else p[axis] *= Math.exp(value);
          p.add(center);
        }
        return {...v, p};
      });
      transformed.polygon = face.polygon;
      return transformed;
    });
    replaceGeometry(mesh, writeMesh(changed));
  }

  for (const axis of 'xyz') {
    for (const sign of [-1, 1]) {
      makeButton(section.querySelector('#ksComponentMoves'), axis.toUpperCase() + (sign > 0 ? ' +' : ' −'), () => {
        const value = amount() * sign;
        const delta = new THREE.Vector3();
        delta[axis] = value;
        nudge(transformMode.value, delta, axis, value);
      });
    }
  }

  const componentActions = section.querySelector('[data-actions="components"]');
  const solidActions = section.querySelector('[data-actions="solids"]');
  for (const kind of ['extrude', 'inset']) {
    makeButton(componentActions, kind === 'extrude' ? 'Extrude region' : 'Inset region', () => {
      const {mesh, faces, adjacency, region} = selectedRegion();
      replaceGeometry(mesh, writeMesh(regionOperation(faces, adjacency, region, kind,
        kind === 'inset' ? Math.min(.95, amount()) : amount())));
    });
  }
  function loopOperation(previous) {
    const data = previous ? lastLoop : selectedEdge();
    if (!data || data.mesh!==active() || (previous &&
        (data.result!==data.mesh.geometry || data.version!==data.result.attributes.position.version))) {
      throw Error('The last loop is no longer on the active mesh.');
    }
    const {mesh,faces,adjacency,edges} = data;
    const result = writeMesh(loopCut(faces,adjacency,edges[0],Number(field('ksLoopCount').value),
      Number(field('ksLoopPlacement').value)/100));
    replaceGeometry(mesh,result);
    lastLoop = {mesh,faces,adjacency,edges,result,version:result.attributes.position.version};
  }
  let loopPreviewFrame;
  function previewLoop() {
    field('ksLoopPlacementValue').textContent = field('ksLoopPlacement').value+'%';
    cancelAnimationFrame(loopPreviewFrame);
    loopPreviewFrame=requestAnimationFrame(()=>{
      drawSelection();
      if (!editing()) return;
      const selected=current();
      const data=mode.value==='edge' && selected ? selected :
        lastLoop?.mesh===active() && lastLoop.result===active()?.geometry ? lastLoop : undefined;
      if (!data || !data.edges.length) return;
      const preview=[];
      try {
        loopCut(data.faces,data.adjacency,data.edges[0],Number(field('ksLoopCount').value),
          Number(field('ksLoopPlacement').value)/100,preview);
        const line=new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(
          preview.map(p=>data.mesh.localToWorld(p))),outlineMaterial);
        line.renderOrder=42;
        markers.add(line);
      } catch (error) { report(error.message); }
    });
  }
  field('ksLoopPlacement').addEventListener('input',previewLoop);
  field('ksLoopCount').addEventListener('input',previewLoop);
  makeButton(componentActions,'Loop Cut',()=>loopOperation(false));
  makeButton(section.querySelector('[data-actions="loops"]'),'Slide last loop',()=>loopOperation(true));

  const knifeActions = section.querySelector('[data-actions="knife"]');
  const confirmKnife = makeButton(knifeActions,'Confirm knife cut',()=>{
    const mesh = active();
    if (mode.value!=='knife' || knifePoints.length<2) throw Error('Draw or tap at least two knife points.');
    const result = knifeStroke(readMesh(mesh.geometry),knifePoints,projection(mesh,canvas.getBoundingClientRect()));
    replaceGeometry(mesh,writeMesh(result));
  });
  const cancelKnife = makeButton(knifeActions,'Cancel knife stroke',()=>{
    clearKnife();
    return 'Knife stroke cancelled.';
  });
  document.addEventListener('keydown',event=>{
    if (!editing() || mode.value!=='knife' || !knifePoints.length) return;
    if (event.key==='Escape') cancelKnife.click();
    else if (event.key==='Enter' &&
        !event.target.matches?.('input,select,button,textarea,[contenteditable]')) confirmKnife.click();
    else return;
    event.preventDefault();
  });
  makeButton(componentActions, 'Split edge at midpoint', () => {
    const {mesh, faces, adjacency, edges} = selectedEdge();
    replaceGeometry(mesh, writeMesh(splitEdge(faces, adjacency, edges[0])));
  });
  makeButton(componentActions,'Bevel edge',()=>{
    const {mesh,faces,adjacency,edges}=selectedEdge();
    const result=bevelEdge(faces,adjacency,edges[0],Number(field('ksBevelWidth').value),
      Number(field('ksBevelSegments').value));
    replaceGeometry(mesh,writeMesh(result));
  });
  makeButton(componentActions, 'Merge at center', () => {
    const selected = current();
    if (!selected) throw Error('Choose a component first.');
    const faces = mergeCorners(selected.faces, selected.corners);
    if (!faces.length) throw Error('Merging these vertices would remove the mesh.');
    replaceGeometry(selected.mesh, writeMesh(faces, {smooth: true}));
  });
  for (const separate of [false, true]) {
    makeButton(componentActions, separate ? 'Separate region' : 'Delete selection', () => {
      const selected = separate ? selectedRegion() : current();
      if (!selected) throw Error('Choose a component first.');
      const {mesh, faces, corners} = selected;
      const keys = new Set(corners.map(v => v.p.toArray().join(',')));
      const remaining = faces.filter((face, i) => {
        if (mode.value === 'vertex' || mode.value === 'edge') {
          const count = face.filter(v => keys.has(v.p.toArray().join(','))).length;
          return count < (mode.value === 'vertex' ? 1 : 2);
        }
        return !selected.region.has(i);
      });
      if (!remaining.length) throw Error('Leave at least one face on the original mesh.');
      const part = separate ? mesh.clone() : null;
      if (part) {
        part.geometry = writeMesh([...selected.region].map(i => faces[i]));
        part.material = mesh.material.clone();
        part.name = (mesh.name || 'Mesh') + ' region';
      }
      replaceGeometry(mesh, writeMesh(remaining));
      if (part) {
        group.add(part);
        document.dispatchEvent(new Event('ks-modeling-geometry'));
      }
    });
  }
  makeButton(componentActions, 'Subdivide triangles ×4', () => {
    if (!bridge.edit.subdivideTriangles()) throw Error('Choose a mesh under 25,000 triangles.');
    resetSelection();
  });
  const retopoActions = section.querySelector('[data-actions="retopo"]');
  makeButton(retopoActions,'Generate quad retopology',automaticRetopology);
  makeButton(retopoActions,'Snap retopology to source',snapRetopology);
  makeButton(retopoActions, 'Create retopology face', addRetopoFace);
  makeButton(retopoActions, 'Clear surface points', () => {
    retopoPoints = [];
    drawSelection();
  });
  makeButton(solidActions, 'Weld coincident vertices', () => {
    const mesh = active();
    replaceGeometry(mesh, writeMesh(readMesh(mesh.geometry), {smooth: true}));
  });
  makeButton(solidActions, 'Join meshes', () => {
    const mesh = active(), other = secondMesh();
    mesh.updateWorldMatrix(true, false);
    other.updateWorldMatrix(true, false);
    const relative = mesh.matrixWorld.clone().invert().multiply(other.matrixWorld);
    replaceGeometry(mesh, writeMesh([...readMesh(mesh.geometry), ...readMesh(other.geometry, relative)]), other);
  });
  for (const kind of ['union', 'difference', 'intersection']) {
    makeButton(solidActions, 'Boolean ' + kind, () => solidAction(kind));
  }
  makeButton(solidActions, 'Surface remesh', () => solidAction('remesh'));
  makeButton(solidActions, 'Voxel Remesh', voxelRemesh).id = 'ksVoxelRemesh';
  makeButton(solidActions, 'Duplicate mirrored mesh X', () => {
    const mesh = active();
    replaceGeometry(mesh, writeMesh(duplicateMirror(readMesh(mesh.geometry), 'x')));
  });
  makeButton(solidActions, 'Mirror and weld', () => {
    const [axis, side] = section.querySelector('#ksMirrorSide').value.split(':');
    const mesh = active();
    replaceGeometry(mesh, writeMesh(mirrorMesh(readMesh(mesh.geometry), axis, Number(side)), {smooth: true}));
  }).id = 'ksMirrorWeld';
  for (const kind of ['undo', 'redo']) {
    makeButton(componentActions, kind === 'undo' ? 'Undo geometry' : 'Redo geometry', () => {
      if (!bridge[kind]()) throw Error('No more geometry history.');
    });
  }

  return {startTransform(kind,axis){
    const mesh=active(), component=current(), originalMode=mode.value;
    if (!editing() || busy || interaction || !mesh?.visible ||
        (!component && originalMode!=='object')) {
      throw Error('Select an object or mesh component in Modeling first.');
    }
    if (component && kind!=='move' && component.corners.length<2) {
      throw Error('Rotation and scale need at least two vertices.');
    }
    const objects=!component && selectedObjects.has(mesh)?[...selectedObjects]:[mesh];
    const geometry=mesh.geometry, attr=geometry.attributes.position;
    const point=new THREE.Vector3(), vector=new THREE.Vector3();
    const center=new THREE.Vector3(), indices=[];
    if (component) {
      const keys=new Set(component.corners.map(v=>v.p.toArray().join(',')));
      for (const {p} of component.corners) center.add(p);
      center.divideScalar(component.corners.length);
      for(let i=0;i<attr.count;i++){
        point.fromBufferAttribute(attr,i);
        if(keys.has(point.toArray().join(','))) indices.push(i);
      }
    }
    const basis={
      x:new THREE.Vector3(1,0,0),y:new THREE.Vector3(0,1,0),z:new THREE.Vector3(0,0,1)
    };
    let changed=false, elapsed=0;
    return {
      apply(horizontal,vertical,dt){
        if (!editing() || busy || active()!==mesh || mesh.geometry!==geometry || mode.value!==originalMode ||
            objects.some(object=>!group.children.includes(object))) return false;
        const scalar=axis==='y'?-vertical:horizontal;
        if(axis==='free') vector.set(horizontal,-vertical,0);
        else vector.copy(basis[axis]).multiplyScalar(scalar);
        if (kind==='move' ? vector.lengthSq()<1e-10 : Math.abs(scalar)<1e-6) return true;
        if (!changed) {saveHistory();changed=true;}
        const amount=scalar*dt;
        const rotationAxis=basis[axis==='free'?'y':axis];
        if (!component) {
          for (const object of objects) {
            if(kind==='move')object.position.addScaledVector(vector,dt*.8);
            else if(kind==='rotate')object.rotateOnAxis(rotationAxis,amount*1.8);
            else if(axis==='free')object.scale.multiplyScalar(Math.exp(amount)).clampScalar(.01,100);
            else object.scale[axis]=THREE.MathUtils.clamp(object.scale[axis]*Math.exp(amount),.01,100);
          }
          return true;
        }
        for(const i of indices){
          point.fromBufferAttribute(attr,i);
          if(kind==='move')point.addScaledVector(vector,dt*.35);
          else {
            point.sub(center);
            if(kind==='rotate') point.applyAxisAngle(rotationAxis,amount*1.8);
            else if(axis==='free') point.multiplyScalar(Math.exp(amount));
            else point[axis]*=Math.exp(amount);
            point.add(center);
          }
          attr.setXYZ(i,point.x,point.y,point.z);
        }
        attr.needsUpdate=true;
        elapsed+=dt;
        if(elapsed>=.06){geometry.computeVertexNormals();elapsed=0;}
        return true;
      },
      end(){
        if (!changed || !group.children.includes(mesh) || mesh.geometry!==geometry) return;
        if(component){
          geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
          resetSelection();
        } else drawSelection();
        document.dispatchEvent(new Event('ks-modeling-geometry'));
        report('Joystick transform applied.');
      }
    };
  }};

}
