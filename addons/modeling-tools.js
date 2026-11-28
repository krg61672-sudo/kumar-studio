import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import {
  readMesh, writeMesh, topology, polygonRegion, boundaryEdges, cutMesh, mirrorMesh,
  regionOperation, mergeCorners, solidKernel, toSolid, fromSolid, bevelPlane, loopCut, splitEdge, duplicateMirror
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
      <option value="knife">Knife · two taps</option><option value="retopo">Retopology · surface points</option>
    </select></label>
    <label>Gizmo <select id="ksGizmoMode">
      <option value="translate">Move</option><option value="rotate">Rotate</option><option value="scale">Scale</option>
    </select></label>
    <label>Tool amount <input id="ksComponentStep" type="number" value="0.02" min="0.001" step="0.01"></label>
    <label><input id="ksTriangleEdges" type="checkbox"> Include triangle edges when picking</label>
    <label><input id="ksComponentAccumulate" type="checkbox"> Add vertices to selection</label>
    <label><input id="ksComponentDrag" type="checkbox"> Drag component in camera plane</label>
    <div id="ksComponentMoves"></div>
    <details open><summary>Components and topology</summary><div data-actions="components"></div></details>
    <details><summary>Objects and solids</summary>
      <label>Second mesh <select id="ksMeshOperand"></select></label>
      <label>Mirror side <select id="ksMirrorSide">
        <option value="x:1">+X to −X</option><option value="x:-1">−X to +X</option>
        <option value="y:1">+Y to −Y</option><option value="y:-1">−Y to +Y</option>
        <option value="z:1">+Z to −Z</option><option value="z:-1">−Z to +Z</option>
      </select></label>
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

  let selection, interaction, pendingTap, knifeStart, retopoMesh;
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
    knifeStart = undefined;
    retopoPoints = [];
    retopoMesh = undefined;
    drawSelection();
    syncGizmo();
    refreshObjects();
  }

  function updateViewport() {
    controls.enabled = true;
    if (editing() && mode.value === 'retopo') report('Tap 3 or 4 points on the source mesh, then create a face.');
    if (editing() && mode.value === 'knife') report('Tap two points to define a cut through the selected mesh.');
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

  function chooseComponent(mesh, hit) {
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
      if (section.querySelector('#ksComponentAccumulate').checked && current()) {
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

  function tap(x, y) {
    if (mode.value === 'object') {
      const objects = group.children.filter(mesh => mesh.visible);
      const hit = rayAt(x, y).intersectObjects(objects, false)[0];
      if (!hit) return;
      const select = document.getElementById('refBlocks');
      select.value = String(group.children.indexOf(hit.object));
      select.dispatchEvent(new Event('change', {bubbles: true}));
      report('Object selected.');
      return;
    }
    const mesh = active();
    if (!mesh?.visible) throw Error('Select a visible mesh first.');
    if (mode.value === 'knife') {
      if (!knifeStart) {
        knifeStart = [x, y];
        report('Tap the second point of the knife line.');
        return;
      }
      const a = rayAt(...knifeStart).ray.direction.clone();
      const b = rayAt(x, y).ray.direction.clone();
      knifeStart = undefined;
      const normal = a.cross(b).normalize();
      if (!normal.lengthSq()) throw Error('Pick two different points.');
      const inverse = mesh.matrixWorld.clone().invert();
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, camera.position).applyMatrix4(inverse);
      replaceGeometry(mesh, writeMesh(cutMesh(readMesh(mesh.geometry), plane.normal,
        plane.coplanarPoint(new THREE.Vector3()))));
      report('Knife cut applied.');
      return;
    }
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
    chooseComponent(mesh, hit);
  }

  // A tap picks components. A drag on a gizmo is handled by TransformControls.
  canvas.addEventListener('pointerdown', event => {
    if (!event.isPrimary) {
      pendingTap = undefined;
      if (interaction) event.stopImmediatePropagation();
      return;
    }
    if (!editing() || busy || mode.value === 'off' || event.button !== 0) return;
    if (gizmo.enabled) {
      const rect = canvas.getBoundingClientRect();
      gizmo.pointerHover({x: (event.clientX - rect.left) / rect.width * 2 - 1,
        y: 1 - (event.clientY - rect.top) / rect.height * 2, button: -1});
      if (gizmo.axis) {
        controls.enabled = false;
        return;
      }
    }
    if (mode.value !== 'object' &&
        (event.pointerType !== 'touch' || section.querySelector('#ksComponentDrag').checked)) {
      controls.enabled = false;
    }
    // TransformControls updates its axis for touch before firing mouseDown.
    pendingTap = {id: event.pointerId, x: event.clientX, y: event.clientY};
  }, true);
  canvas.addEventListener('pointermove', event => {
    if (interaction && !event.isPrimary) event.stopImmediatePropagation();
  }, true);
  canvas.addEventListener('pointerup', event => {
    if (interaction && !event.isPrimary) {
      event.stopImmediatePropagation();
      return;
    }
    const start = pendingTap;
    pendingTap = undefined;
    if (interaction) return;
    controls.enabled = true;
    if (!start || start.id !== event.pointerId || !editing()) return;
    try {
      const dx = event.clientX - start.x, dy = event.clientY - start.y;
      if (Math.hypot(dx, dy) <= 8) tap(event.clientX, event.clientY);
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
    if (!event.isPrimary) return;
    pendingTap = undefined;
    controls.enabled = true;
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
    if (!selected || mode.value !== 'edge') throw Error('Select an edge first.');
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
    const edge = kind === 'bevel' ? selectedEdge() : null;
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
      } else if (edge) {
        const plane = bevelPlane(faces, edge.adjacency, edge.edges[0], value);
        result = keep(a.trimByPlane(plane.normal, plane.offset));
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
  makeButton(componentActions, 'Loop Cut', () => {
    const {mesh, faces, adjacency, edges} = selectedEdge();
    replaceGeometry(mesh, writeMesh(loopCut(faces, adjacency, edges[0])));
  });
  makeButton(componentActions, 'Split edge at midpoint', () => {
    const {mesh, faces, adjacency, edges} = selectedEdge();
    replaceGeometry(mesh, writeMesh(splitEdge(faces, adjacency, edges[0])));
  });
  makeButton(componentActions, 'Bevel edge', () => solidAction('bevel'));
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
  makeButton(componentActions, 'Create retopology face', addRetopoFace);
  makeButton(componentActions, 'Clear surface points', () => {
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
}
