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

export function bevelPlane(faces, adjacency, edge, width) {
  const pair = adjacency.edges.get(edge.key);
  if (pair?.length !== 2) throw Error('Bevel needs an edge shared by two faces.');
  const [a, b] = pair.map(item => faceNormal(faces[item.f]));
  const outward = a.clone().add(b).normalize();
  if (a.dot(b) > .999 || outward.lengthSq() < epsilon) throw Error('Choose a corner edge.');
  const origin = edge.a.p;
  const support = outward.dot(origin);
  if (faces.some(face => face.some(v => outward.dot(v.p) > support + epsilon))) {
    throw Error('Bevel supports exposed convex edges.');
  }
  const halfAngle = Math.sqrt((1 - a.dot(b)) / 2);
  const offset = support - width * halfAngle;
  return { normal: outward.negate().toArray(), offset: -offset };
}

export function loopCut(faces, adjacency, start) {
  const replacements = new Map(), visited = new Set();
  const pending = [start.key];
  let nextId = polygonId(faces);
  while (pending.length) {
    const key = pending.pop();
    if (visited.has(key)) continue;
    visited.add(key);
    for (const side of adjacency.edges.get(key)) {
      if (replacements.has(side.f)) continue;
      const region = polygonRegion(faces, adjacency, side.f);
      const boundary = boundaryEdges(adjacency, region);
      if (boundary.length !== 4) throw Error('Loop Cut follows connected four-sided polygons.');
      const loop = [boundary.find(edge => edge.key === key)];
      if (!loop[0]) throw Error('Choose a polygon boundary edge.');
      while (loop.length < 4) {
        const next = boundary.find(edge => spatialKey(edge.a.p) === spatialKey(loop.at(-1).b.p));
        if (!next || loop.includes(next)) throw Error('Loop Cut needs an ordered quad boundary.');
        loop.push(next);
      }
      if (region.size !== 2) throw Error('Loop Cut needs quads built from two triangles.');
      const [a, b, c, d] = loop.map(edge => edge.a);
      const first = interpolate(a, b, .5), last = interpolate(c, d, .5);
      for (const f of region) replacements.set(f, []);
      replacements.set(side.f, [
        ...markPolygon(triangulateFan([a, first, last, d]), nextId++),
        ...markPolygon(triangulateFan([first, b, c, last]), nextId++)
      ]);
      pending.push(loop[2].key);
    }
  }
  return faces.flatMap((face, i) => replacements.get(i) ?? [face]);
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
