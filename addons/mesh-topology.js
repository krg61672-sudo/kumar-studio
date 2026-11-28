import * as THREE from 'three';

const epsilon = 1e-6;
const spatialKey = v => v.toArray().map(x => Math.round(x / epsilon)).join(',');
const edgeKey = (a, b) => a < b ? a + ':' + b : b + ':' + a;

export function readMesh(geometry, matrix = new THREE.Matrix4()) {
  if (geometry.morphAttributes.position?.length ||
      Object.keys(geometry.attributes).some(name => !['position', 'normal', 'uv'].includes(name))) {
    throw Error('This tool needs an editable mesh with positions, normals and optional UVs.');
  }
  const { position, uv } = geometry.attributes;
  const index = geometry.index;
  const count = (index?.count ?? position.count) / 3;
  if (count > 100000) throw Error('This tool supports up to 100,000 input triangles.');
  const vertices = Array.from({length: position.count}, (_, i) => ({
    p: new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(matrix),
    uv: uv && new THREE.Vector2().fromBufferAttribute(uv, i),
    source: i
  }));
  const flipped = matrix.determinant() < 0;
  return Array.from({length: count}, (_, face) => {
    const corners = [0, 1, 2].map(i => vertices[index ? index.getX(face * 3 + i) : face * 3 + i]);
    corners.polygon = geometry.userData.polygons?.[face];
    return flipped ? corners.reverse() : corners;
  });
}

export function writeMesh(faces, { smooth = false, uv = true } = {}) {
  const positions = [], texcoords = [], indices = [], seen = new Map();
  const hasUV = uv && faces.every(face => face.every(v => v.uv));
  const geometry = new THREE.BufferGeometry();
  for (const [faceIndex, face] of faces.entries()) {
    for (const corner of face) {
      const key = [spatialKey(corner.p), hasUV ? corner.uv.toArray().join(',') : '',
        smooth ? '' : faceIndex].join('|');
      if (!seen.has(key)) {
        seen.set(key, positions.length / 3);
        positions.push(...corner.p.toArray());
        if (hasUV) texcoords.push(...corner.uv.toArray());
      }
      indices.push(seen.get(key));
    }
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (hasUV) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(texcoords, 2));
  geometry.setIndex(indices);
  if (faces.some(face => face.polygon != null)) {
    geometry.userData.polygons = faces.map(face => face.polygon ?? null);
  }
  if (indices.length) {
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  }
  return geometry;
}

export function faceNormal(face) {
  return face[1].p.clone().sub(face[0].p).cross(face[2].p.clone().sub(face[0].p)).normalize();
}

export function topology(faces) {
  const edges = new Map();
  const faceEdges = faces.map((face, f) => face.map((a, i) => {
    const b = face[(i + 1) % 3];
    const key = edgeKey(spatialKey(a.p), spatialKey(b.p));
    if (!edges.has(key)) edges.set(key, []);
    const edge = {a, b, f, key};
    edges.get(key).push(edge);
    return edge;
  }));
  return {edges, faceEdges};
}

export function polygonRegion(faces, adjacency, first) {
  const region = new Set([first]);
  const id = faces[first].polygon ?? null;
  const normal = faceNormal(faces[first]), origin = faces[first][0].p;
  const pending = [first];
  while (pending.length) {
    const face = pending.pop();
    for (const edge of adjacency.faceEdges[face]) {
      const neighbors = adjacency.edges.get(edge.key);
      if (neighbors.length !== 2) continue;
      const other = neighbors.find(item => item.f !== face);
      if (!other || region.has(other.f)) continue;
      const triangle = faces[other.f];
      if ((triangle.polygon ?? null) !== id) continue;
      if (id === null && (normal.dot(faceNormal(triangle)) < 1 - epsilon ||
          triangle.some(v => Math.abs(normal.dot(v.p.clone().sub(origin))) > epsilon))) continue;
      region.add(other.f);
      pending.push(other.f);
    }
  }
  return region;
}

export function boundaryEdges(adjacency, region) {
  return [...region].flatMap(face => adjacency.faceEdges[face].filter(edge =>
    adjacency.edges.get(edge.key).filter(other => region.has(other.f)).length === 1));
}

function interpolate(a, b, t) {
  return {p: a.p.clone().lerp(b.p, t), uv: a.uv?.clone().lerp(b.uv, t)};
}

function triangulateFan(polygon) {
  return polygon.slice(1, -1).map((v, i) => [polygon[0], v, polygon[i + 2]])
    .filter(face => faceNormal(face).lengthSq() > 0);
}

export function clipFace(face, distance) {
  const result = [];
  for (let i = 0; i < face.length; i++) {
    const a = face[i], b = face[(i + 1) % face.length];
    const da = distance(a.p), db = distance(b.p);
    if (da >= -epsilon) result.push(a);
    if ((da > epsilon && db < -epsilon) || (da < -epsilon && db > epsilon)) {
      result.push(interpolate(a, b, da / (da - db)));
    }
  }
  return result;
}

function markPolygon(faces, id) {
  for (const face of faces) face.polygon = id;
  return faces;
}

function polygonId(faces) {
  return faces.reduce((max, face) => Math.max(max, face.polygon ?? 0), 0) + 1;
}

export function cutMesh(faces, normal, point) {
  const distance = p => normal.dot(p) - normal.dot(point);
  const adjacency = topology(faces);
  const visited = new Set();
  const result = [];
  let next = polygonId(faces), cuts = 0;
  for (const i of faces.keys()) {
    if (visited.has(i)) continue;
    const region = polygonRegion(faces, adjacency, i);
    const patch = [...region].map(f => faces[f]);
    region.forEach(j => visited.add(j));
    const distances = patch.flatMap(face => face.map(v => distance(v.p)));
    if (!distances.some(d => d > epsilon) || !distances.some(d => d < -epsilon)) {
      result.push(...patch);
      continue;
    }
    cuts++;
    for (const side of [1, -1]) {
      const half = patch.flatMap(face => triangulateFan(clipFace(face, p => side * distance(p))));
      result.push(...markPolygon(half, next++));
    }
  }
  if (!cuts) throw Error('The cutting plane does not cross the mesh.');
  return result;
}

export function duplicateMirror(faces, axis) {
  const offset = polygonId(faces);
  const reflected = faces.map(face => {
    const result = [...face].reverse().map(v => {
      const p = v.p.clone();
      p[axis] *= -1;
      return {...v, p};
    });
    if (face.polygon != null) result.polygon = face.polygon + offset;
    return result;
  });
  return [...faces, ...reflected];
}

export function mirrorMesh(faces, axis, side) {
  const half = faces.flatMap(face => triangulateFan(clipFace(face, p => p[axis] * side)))
    .map(face => face.map(v => {
      if (Math.abs(v.p[axis]) > epsilon) return v;
      const p = v.p.clone();
      p[axis] = 0;
      return {...v, p};
    }))
    .filter(face => face.some(v => v.p[axis] !== 0));
  if (!half.length) throw Error('The chosen side has no mesh to mirror.');
  const reflected = half.map(face => [...face].reverse().map(v => {
    const p = v.p.clone();
    p[axis] *= -1;
    return {...v, p};
  }));
  // Share seam indices even where the source had a UV split on the mirror plane.
  const seamUV = new Map();
  for (const face of [...half, ...reflected]) {
    for (let i = 0; i < 3; i++) {
      const v = face[i];
      if (v.p[axis] || !v.uv) continue;
      const key = spatialKey(v.p);
      if (!seamUV.has(key)) seamUV.set(key, v.uv);
      face[i] = {...v, uv: seamUV.get(key)};
    }
  }
  return [...half, ...reflected];
}

export function regionOperation(faces, adjacency, region, kind, amount) {
  const boundary = boundaryEdges(adjacency, region);
  if (!boundary.length) throw Error('Choose an open face region.');
  const normal = faceNormal(faces[region.values().next().value]);
  if (normal.lengthSq() === 0) throw Error('Choose a non-degenerate face.');
  const points = new Map();
  for (const {a} of boundary) points.set(spatialKey(a.p), a.p);
  const center = [...points.values()].reduce((sum, p) => sum.add(p), new THREE.Vector3())
    .divideScalar(points.size);
  if (kind === 'inset') {
    if (points.size !== boundary.length || boundary.some(({a, b}) =>
      b.p.clone().sub(a.p).cross(center.clone().sub(a.p)).dot(normal) <= epsilon)) {
      throw Error('Inset requires a convex planar polygon.');
    }
  }
  const top = v => ({...v, p: kind === 'inset' ? v.p.clone().lerp(center, amount) :
    v.p.clone().addScaledVector(normal, amount)});
  let next = polygonId(faces);
  const cap = next++;
  const result = faces.map((face, i) => region.has(i) ? markPolygon([face.map(top)], cap)[0] : face);
  for (const {a, b} of boundary) {
    result.push(...markPolygon([[a, b, top(b)], [a, top(b), top(a)]], next++));
  }
  return result;
}

export function mergeCorners(faces, corners) {
  const selected = new Map(corners.map(v => [spatialKey(v.p), v.p]));
  if (selected.size < 2) throw Error('Select an edge, face or polygon to merge its vertices.');
  const center = [...selected.values()].reduce((sum, p) => sum.add(p), new THREE.Vector3())
    .divideScalar(selected.size);
  return faces.map(face => markPolygon([
    face.map(v => selected.has(spatialKey(v.p)) ? {...v, p: center} : v)
  ], face.polygon)[0])
    .filter(face => faceNormal(face).lengthSq() > 0);
}

let kernelPromise;
export function solidKernel() {
  if (!kernelPromise) {
    kernelPromise = import('manifold-3d').then(({default: load}) => load()).then(module => {
      module.setup();
      return module;
    }).catch(error => {
      kernelPromise = undefined;
      throw error;
    });
  }
  return kernelPromise;
}

export function toSolid({Manifold, Mesh}, faces, useUV = true) {
  // Positional welding is separate from UV seams in the solid kernel.
  const geometry = writeMesh(faces, {smooth: true, uv: useUV});
  const positions = geometry.attributes.position.array;
  const uv = geometry.attributes.uv?.array;
  const properties = uv ? new Float32Array(5 * positions.length / 3) : positions;
  if (uv) {
    for (let i = 0; i < properties.length / 5; i++) {
      properties.set(positions.subarray(i * 3, i * 3 + 3), i * 5);
      properties.set(uv.subarray(i * 2, i * 2 + 2), i * 5 + 3);
    }
  }
  const mesh = new Mesh({numProp: uv ? 5 : 3, vertProperties: properties,
    triVerts: Uint32Array.from(geometry.index.array)});
  geometry.dispose();
  mesh.merge();
  const solid = new Manifold(mesh);
  const status = solid.status();
  if (status !== 'NoError' || solid.isEmpty()) {
    solid.delete();
    throw Error('A closed, consistently wound solid is required (' + status + ').');
  }
  return solid;
}

export function fromSolid(solid, allowEmpty = false) {
  if (solid.status() !== 'NoError') throw Error('The solid operation failed.');
  if (solid.isEmpty()) {
    if (allowEmpty) return [];
    throw Error('The solid operation would produce an empty mesh.');
  }
  if (solid.numTri() > 100000) throw Error('The result exceeds 100,000 triangles.');
  const {triVerts, vertProperties, numProp} = solid.getMesh();
  const faces = [];
  const corner = id => {
    const start = id * numProp;
    return {p: new THREE.Vector3().fromArray(vertProperties, start),
      uv: numProp === 5 ? new THREE.Vector2().fromArray(vertProperties, start + 3) : undefined};
  };
  for (let i = 0; i < triVerts.length; i += 3) faces.push([
    corner(triVerts[i]), corner(triVerts[i + 1]), corner(triVerts[i + 2])
  ]);
  return faces;
}

export function splitEdge(faces, adjacency, edge) {
  const sides = new Map(adjacency.edges.get(edge.key).map(side => [side.f, side]));
  return faces.flatMap((face, i) => {
    const side = sides.get(i);
    if (!side) return [face];
    const {a, b} = side;
    const c = face[(face.indexOf(a) + 2) % 3];
    const middle = interpolate(a, b, .5);
    return markPolygon([[a, middle, c], [middle, b, c]], face.polygon);
  });
}

function orderedBoundary(edges) {
  const next = new Map(edges.map(edge => [spatialKey(edge.a.p), edge]));
  const loop = [], seen = new Set();
  let edge = edges[0];
  while (edge && !seen.has(edge)) {
    seen.add(edge);
    loop.push(edge);
    edge = next.get(spatialKey(edge.b.p));
  }
  return edge === loop[0] && loop.length === edges.length ? loop : [];
}

function quadRegions(faces, adjacency) {
  const patches = new Map();
  for (const index of faces.keys()) {
    if (patches.has(index)) continue;
    const region = polygonRegion(faces, adjacency, index);
    const boundary = orderedBoundary(boundaryEdges(adjacency, region));
    const quad = region.size === 2 && boundary.length === 4 ? {region, boundary} : null;
    for (const face of region) patches.set(face, quad);
  }

  // A UV diagonal identifies the two halves of a curved grid quad even when
  // the source import has no polygon IDs.
  const candidates = new Map();
  for (const pair of adjacency.edges.values()) {
    if (pair.length !== 2) continue;
    const [a, b] = pair;
    if (patches.get(a.f) || patches.get(b.f) ||
        faces[a.f].polygon != null || faces[b.f].polygon != null) continue;
    const region = new Set([a.f, b.f]);
    const boundary = orderedBoundary(boundaryEdges(adjacency, region));
    if (boundary.length !== 4 || !boundary.every(({a,b}) => a.uv && b.uv)) continue;
    if (Math.abs(a.a.uv.x - a.b.uv.x) < epsilon || Math.abs(a.a.uv.y - a.b.uv.y) < epsilon) continue;
    if (!boundary.every(({a,b}) => Math.abs(a.uv.x-b.uv.x) < epsilon ||
        Math.abs(a.uv.y-b.uv.y) < epsilon)) continue;
    for (const side of pair) {
      if (!candidates.has(side.f)) candidates.set(side.f, []);
      candidates.get(side.f).push({region, boundary});
    }
  }
  for (const [face, [quad, ...other]] of candidates) {
    if (!other.length && [...quad.region].every(i => candidates.get(i)?.length === 1)) {
      for (const i of quad.region) patches.set(i, quad);
    }
  }
  // For untagged, untextured grids choose a diagonal only when both
  // triangles independently prefer the same well-shaped quad.
  const best = new Map();
  for (const sides of adjacency.edges.values()) {
    if (sides.length!==2) continue;
    const [first,second] = sides;
    if (sides.some(side=>patches.get(side.f) || faces[side.f].polygon!=null)) continue;
    if (faceNormal(faces[first.f]).dot(faceNormal(faces[second.f]))<.5) continue;
    const region=new Set(sides.map(side=>side.f));
    const boundary=orderedBoundary(boundaryEdges(adjacency,region));
    if (boundary.length!==4) continue;
    const vectors=boundary.map(({a,b})=>b.p.clone().sub(a.p));
    const lengths=vectors.map(v=>v.length());
    const diagonal=first.a.p.distanceTo(first.b.p);
    if (diagonal<Math.max(...lengths)*1.035) continue;
    const axes=vectors.map(v=>v.normalize());
    const score=-axes[0].dot(axes[2])-axes[1].dot(axes[3])-
      .25*Math.abs(Math.log(lengths[0]/lengths[2]))-.25*Math.abs(Math.log(lengths[1]/lengths[3]));
    if (score<1.3) continue;
    const quad={region,boundary};
    for (const {f} of sides) {
      const old=best.get(f);
      if (!old || score>old.score+1e-4) best.set(f,{score,quad});
      else if (Math.abs(score-old.score)<=1e-4) best.set(f,{score,quad:null});
    }
  }
  for (const {quad} of best.values()) {
    if (quad && [...quad.region].every(f=>best.get(f)?.quad===quad)) {
      for (const f of quad.region) patches.set(f,quad);
    }
  }
  return patches;
}

function parameterOnEdge(reference, edge, t) {
  return spatialKey(reference.a.p) === spatialKey(edge.a.p) ? t : 1 - t;
}

function polygonTriangles(corners, id) {
  return markPolygon(triangulateFan(corners), id);
}

export function loopCut(faces, adjacency, start, count = 1, placement = .5, preview) {
  if (!Number.isInteger(count) || count < 1 || count > 12 || !(placement > 0 && placement < 1)) {
    throw Error('Choose 1–12 cuts and a placement between the edge endpoints.');
  }
  const quads = quadRegions(faces, adjacency);
  const edgeCuts = new Map(), strips = new Map();
  const pending = [{edge: start, fractions: Array.from({length: count}, (_, i) => {
    const span = 2 * Math.min(placement, 1 - placement);
    return placement + span * ((i + 1) / (count + 1) - .5);
  })}];
  while (pending.length) {
    const cut = pending.pop(), {edge, fractions} = cut;
    const existing = edgeCuts.get(edge.key);
    if (existing) {
      const expected = existing.fractions.map(t => parameterOnEdge(existing.edge, edge, t)).sort((a,b)=>a-b);
      if (expected.some((t, i) => Math.abs(t - fractions[i]) > epsilon)) {
        throw Error('This loop returns with reversed placement. Center the cut and try again.');
      }
      continue;
    }
    const sides = adjacency.edges.get(edge.key);
    if (sides.length > 2) throw Error('Loop Cut reached a non-manifold edge.');
    edgeCuts.set(edge.key, cut);
    for (const side of sides) {
      const quad = quads.get(side.f);
      if (!quad) continue;
      const index = quad.boundary.findIndex(item => item.key === edge.key);
      if (index < 0) continue;
      const loop = quad.boundary.slice(index).concat(quad.boundary.slice(0, index));
      const values = fractions.map(t => parameterOnEdge(edge, loop[0], t)).sort((a,b)=>a-b);
      const previous = strips.get(quad);
      if (previous) {
        if (previous.loop[0].key !== edge.key && previous.loop[2].key !== edge.key) {
          throw Error('This loop crosses itself inside a quad.');
        }
        continue;
      }
      strips.set(quad, {loop, values});
      pending.push({edge: loop[2], fractions: values.map(t=>1-t).reverse()});
    }
  }
  if (!strips.size) throw Error('Choose an edge on a quad boundary.');

  const replacements = new Map();
  let id = polygonId(faces);
  for (const [quad, {loop, values}] of strips) {
    const [a,b,c,d] = loop.map(edge=>edge.a);
    if (preview) for (const t of values) preview.push(interpolate(a,b,t).p,interpolate(d,c,t).p);
    const segments = [0,...values,1], next = [];
    for (let i=0; i<segments.length-1; i++) {
      const from = segments[i], to = segments[i+1];
      next.push(...polygonTriangles([
        interpolate(a,b,from), interpolate(a,b,to), interpolate(d,c,to), interpolate(d,c,from)
      ], id++));
    }
    for (const f of quad.region) replacements.set(f, []);
    replacements.set(quad.region.values().next().value,next);
  }
  // At a triangle pole or n-gon, terminate the loop while splitting the same
  // shared edge on both sides so there are no T-junctions.
  const result = faces.flatMap((face,i)=>{
    if (replacements.has(i)) return replacements.get(i);
    const sides = adjacency.faceEdges[i];
    if (!sides.some(edge=>edgeCuts.has(edge.key))) return [face];
    const rim = sides.flatMap(edge=>{
      const cut = edgeCuts.get(edge.key);
      if (!cut) return [edge.a];
      const values = cut.fractions.map(t=>parameterOnEdge(cut.edge,edge,t)).sort((a,b)=>a-b);
      return [edge.a,...values.map(t=>interpolate(edge.a,edge.b,t))];
    });
    const center = averageCorners(face);
    return rim.flatMap((corner,j)=>polygonTriangles([corner,rim[(j+1)%rim.length],center],id++));
  });
  if (result.length > 100000) throw Error('The cut would exceed 100,000 triangles.');
  return result;
}

function averageCorners(corners) {
  const p = new THREE.Vector3();
  const uv = corners.every(v=>v.uv) ? new THREE.Vector2() : undefined;
  for (const corner of corners) {
    p.add(corner.p);
    uv?.add(corner.uv);
  }
  return {p:p.divideScalar(corners.length),uv:uv?.divideScalar(corners.length)};
}

export function bevelEdge(faces, adjacency, edge, width, segments) {
  const sides = adjacency.edges.get(edge.key);
  if (sides.length !== 2) throw Error('Choose an edge shared by two faces.');
  if (!(width > epsilon) || !Number.isInteger(segments) || segments < 1 || segments > 16) {
    throw Error('Choose a positive bevel width and 1–16 segments.');
  }
  const [first, second] = sides;
  if (spatialKey(first.a.p) !== spatialKey(second.b.p)) throw Error('The two faces must have consistent winding.');
  const normals = sides.map(side=>faceNormal(faces[side.f]));
  if (Math.abs(normals[0].dot(normals[1])) > .99999) throw Error('Choose an edge with a corner angle.');

  const length = first.a.p.distanceTo(first.b.p);
  const third = sides.map(({a,b,f})=>faces[f].find(v=>v!==a&&v!==b));
  const edgeLine = new THREE.Line3(first.a.p,first.b.p);
  const heights = third.map(v=>edgeLine.closestPointToPoint(v.p,false,new THREE.Vector3()).distanceTo(v.p));
  if (width >= Math.min(...heights)*.9 || width >= length*.45) {
    throw Error('Reduce the bevel width for this edge and its incident faces.');
  }
  const inset = sides.map(({a,b},i)=>{
    const t = width / heights[i];
    const end = Math.min(.24, width / length);
    return [
      interpolate(interpolate(a,b,end),third[i],t),
      interpolate(interpolate(b,a,end),third[i],t)
    ];
  });

  let id = polygonId(faces);
  const rebuilt = sides.map(({a,b},i)=>{
    const [p,q] = inset[i], c = third[i];
    return markPolygon([[a,p,c],[p,q,c],[q,b,c]],id++);
  });
  const [a,b] = [first.a,first.b];
  let [p,q] = inset[0];
  const [rightQ,rightP] = inset[1];
  const round = (u,v,t)=>{
    const control = averageCorners([u,v]);
    edgeLine.closestPointToPoint(control.p,false,control.p);
    return interpolate(interpolate(u,control,t),interpolate(control,v,t),t);
  };
  const band = [];
  for (let i=1;i<=segments;i++) {
    const np = round(inset[0][0],rightP,i/segments);
    const nq = round(inset[0][1],rightQ,i/segments);
    band.push(...polygonTriangles([q,p,np,nq],id++),
      ...polygonTriangles([a,np,p],id++),...polygonTriangles([b,q,nq],id++));
    p=np;
    q=nq;
  }
  return faces.flatMap((face,i)=>i===first.f ? [...rebuilt[0],...band] :
    i===second.f ? rebuilt[1] : [face]);
}

function barycentric2(point,[a,b,c]) {
  const u = b.clone().sub(a), v = c.clone().sub(a), p = point.clone().sub(a);
  const det = u.cross(v);
  if (Math.abs(det)<1e-8) return null;
  const y = p.cross(v)/det, z = u.cross(p)/det;
  return [1-y-z,y,z];
}

function embedPoint(triangle, weights) {
  const p = new THREE.Vector3();
  const uv = triangle.every(v=>v.uv) ? new THREE.Vector2() : undefined;
  triangle.forEach((v,i)=>{
    p.addScaledVector(v.p,weights[i]);
    uv?.addScaledVector(v.uv,weights[i]);
  });
  return {p,uv};
}

function splitAtPoint(faces, corner) {
  return faces.flatMap(face=>{
    const [a,b,c] = face.map(v=>v.p);
    const bary = THREE.Triangle.getBarycoord(corner.p,a,b,c,new THREE.Vector3());
    if (!bary || Math.min(...bary.toArray()) < -epsilon ||
        face.some(v=>v.p.distanceToSquared(corner.p)<epsilon**2)) return [face];
    const zero = bary.toArray().findIndex(value=>value<epsilon);
    if (zero>=0) {
      const next = (zero+1)%3, last = (zero+2)%3;
      return [[face[zero],face[next],corner],[face[zero],corner,face[last]]];
    }
    return [[face[0],face[1],corner],[face[1],face[2],corner],[face[2],face[0],corner]];
  });
}

export function knifeStroke(source, points, project) {
  let faces = source;
  let id = polygonId(source), changed = false;
  const cache = new Map();
  const projected = corner => {
    if (!cache.has(corner)) cache.set(corner,project(corner.p));
    return cache.get(corner);
  };
  for (let i=1;i<points.length;i++) {
    const start = points[i-1], end = points[i];
    if (start.distanceToSquared(end)<1) continue;
    const adjacency=topology(faces), shared=new Map();
    const cuts=faces.map((face,f)=>{
      const screen = face.map(projected);
      if (screen.some(v=>v.w<=epsilon)) return null;
      const xy = screen.map(v=>v.point);
      const a = barycentric2(start,xy), b = barycentric2(end,xy);
      if (!a || !b) return null;
      let min = 0, max = 1;
      for (let j=0;j<3;j++) {
        const slope = b[j]-a[j];
        if (Math.abs(slope)<1e-12) {
          if (a[j]<-epsilon) return null;
        } else if (slope>0) min = Math.max(min,-a[j]/slope);
        else max = Math.min(max,-a[j]/slope);
      }
      if (max-min<1e-7) return null;
      return [min,max].map(t=>{
        const weights = a.map((v,j)=>Math.max(0,v+(b[j]-v)*t)/screen[j].w);
        const sum = weights.reduce((x,y)=>x+y);
        const normalized=weights.map(value=>value/sum);
        const zero=normalized.findIndex(value=>value<epsilon);
        if (zero<0) return embedPoint(face,normalized);
        const j=(zero+1)%3,k=(zero+2)%3;
        const amount=normalized[k]/(normalized[j]+normalized[k]);
        const border=adjacency.faceEdges[f][j];
        if (!shared.has(border.key)) shared.set(border.key,[]);
        shared.get(border.key).push({border,amount});
        return interpolate(border.a,border.b,amount);
      });
    });
    faces=faces.flatMap((face,f)=>{
      const borderPoints=adjacency.faceEdges[f].flatMap(edge=>(shared.get(edge.key)??[]).map(({border,amount})=>
        interpolate(edge.a,edge.b,parameterOnEdge(border,edge,amount))));
      let result=[face];
      // Insert the stroke endpoints first, so the chord between them becomes
      // an edge. Then stitch any other new points on the original boundary.
      for (const point of [...(cuts[f]??[]),...borderPoints]) result=splitAtPoint(result,point);
      if (result.length===1) return result;
      changed=true;
      return result.flatMap(triangle=>polygonTriangles(triangle,id++));
    });
    if (faces.length>100000) throw Error('The knife result exceeds 100,000 triangles.');
  }
  if (!changed) throw Error('Draw a knife stroke across the selected mesh.');
  return faces;
}

export function quadRetopology(source, passes, snap) {
  if (!Number.isInteger(passes) || passes<1 || passes>3) throw Error('Choose density level 1–3.');
  let faces = source;
  for (let pass=0;pass<passes;pass++) {
    const adjacency = topology(faces), quads = quadRegions(faces,adjacency);
    const visited = new Set(), edgePoints = new Map(), result = [];
    let id = 1;
    for (const f of faces.keys()) {
      if (visited.has(f)) continue;
      const quad = quads.get(f);
      const rim = quad?.boundary ?? adjacency.faceEdges[f];
      for (const i of quad?.region ?? [f]) visited.add(i);
      const center = averageCorners(rim.map(edge=>edge.a));
      snap?.(center.p);
      const midpoint = rim.map(({key,a,b})=>{
        const corner = interpolate(a,b,.5);
        if (!edgePoints.has(key)) {
          snap?.(corner.p);
          edgePoints.set(key,corner.p);
        }
        return {...corner,p:edgePoints.get(key)};
      });
      for (const [i,{a}] of rim.entries()) {
        result.push(...polygonTriangles([a,midpoint[i],center,midpoint[(i+rim.length-1)%rim.length]],id++));
      }
      if (result.length>100000) throw Error('Reduce retopology density for this mesh.');
    }
    faces = result;
  }
  return faces;
}
