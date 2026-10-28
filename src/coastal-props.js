import * as THREE from '../vendor/three.module.js';
import {sydneyTerrainHeight} from './city-track.js';

const UP = new THREE.Vector3(0, 1, 0);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// 랜드마크 하나를 정점 색상 메시 하나로 합친다. 서로 먼 부두와 등대는
// 따로 컬링하고, 작은 볼트·케이블마다 드로콜이나 그림자 패스를 늘리지 않는다.
class CoastalBatch {
  constructor(shapes) {
    this.shapes = shapes;
    this.positions = [];
    this.normals = [];
    this.colors = [];
  }
  add(shape, color, position, scale = [1, 1, 1], quaternion = new THREE.Quaternion()) {
    const geometry = this.shapes[shape];
    const matrix = new THREE.Matrix4().compose(V(...position), quaternion, V(...scale));
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
    const p = V(0, 0, 0), n = V(0, 0, 0), tint = new THREE.Color(color);
    const vertices = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
    const count = geometry.index ? geometry.index.count : vertices.count;
    for (let i = 0; i < count; i++) {
      const index = geometry.index ? geometry.index.getX(i) : i;
      p.fromBufferAttribute(vertices, index).applyMatrix4(matrix);
      n.fromBufferAttribute(normals, index).applyNormalMatrix(normalMatrix);
      this.positions.push(p.x, p.y, p.z);
      this.normals.push(n.x, n.y, n.z);
      this.colors.push(tint.r, tint.g, tint.b);
    }
  }
  box(color, x, y, z, width, height, depth, yaw = 0) {
    this.add('box', color, [x, y, z], [width, height, depth], new THREE.Quaternion().setFromAxisAngle(UP, yaw));
  }
  beam(color, a, b, width = 1, depth = width) {
    const delta = b.clone().sub(a);
    this.add('box', color, a.clone().add(b).multiplyScalar(.5).toArray(), [width, delta.length(), depth], new THREE.Quaternion().setFromUnitVectors(UP, delta.normalize()));
  }
  geometry() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }
}

function dock(batch) {
  const steel = '#668e92', dark = '#315159', deck = '#a8a598', orange = '#dfb458';
  // 수면 아래까지 이어지는 콘크리트 기단과 수직 파일이 떠 있는 부두를 막는다.
  batch.box('#706f64', 0, -8, 0, 204, 16, 132);
  batch.box(deck, 0, .6, 0, 205, 1.2, 133);
  batch.box('#d1c6a7', 0, 1.35, -66, 205, .3, 1.3);
  for (let x = -96; x <= 96; x += 16) {
    for (const z of [-67, 67]) {
      batch.add('cylinder', dark, [x, -5, z], [1.15, 12, 1.15]);
      batch.box('#344449', x, -.3, z * 1.01, 4, 4.5, 1.2);
      batch.add('cylinder', orange, [x, 1.8, z * .88], [.8, 1.3, .8]);
    }
  }
  // 40ft 컨테이너 비율과 반복 골을 낮은 면 수로 표현한다.
  const colors = ['#b65a46', '#487d87', '#d1b169', '#738270'];
  for (let row = 0; row < 3; row++) for (let column = 0; column < 7; column++) {
    const x = -82 + column * 25, z = -42 + row * 17, height = 6.5;
    const layers = (row + column) % 3 === 0 ? 3 : 2;
    for (let layer = 0; layer < layers; layer++) {
      const y = 1.2 + height * (layer + .5);
      batch.box(colors[(row + column + layer) % colors.length], x, y, z, 22.5, height - .3, 9);
      for (let rib = -9; rib <= 9; rib += 3) batch.box('#263c43', x + rib, y, z - 4.55, .17, height - .7, .1);
      batch.box('#b9bdac', x + 11.3, y, z, .12, height - .7, .22);
    }
  }
  function crane(cx, cz, height) {
    const p = (x, y, z = 0) => V(cx + x, y, cz + z);
    for (const side of [-1, 1]) {
      for (const z of [-15, 15]) {
        batch.box(dark, cx + side * 13, 2.2, cz + z, 10, 2.2, 5);
        batch.beam(steel, p(side * 13, 3, z), p(side * 7, height, z * .7), 2.6);
      }
      batch.beam(steel, p(-13, 5, side * 15), p(7, height - 5, side * 10.5), 1.1);
      batch.beam(steel, p(13, 5, side * 15), p(-7, height - 5, side * 10.5), 1.1);
      batch.beam(steel, p(-30, height, side * 5), p(73, height, side * 5), 2);
      batch.beam(steel, p(-30, height + 8, side * 5), p(73, height + 8, side * 5), 1.5);
      for (let x = -30; x < 70; x += 10) {
        batch.beam(steel, p(x, height, side * 5), p(x + 10, height + 8, side * 5), .72);
        batch.beam(steel, p(x, height + 8, side * 5), p(x + 10, height, side * 5), .72);
      }
    }
    batch.beam(steel, p(0, height), p(0, height + 27), 1.8);
    for (const x of [-28, 71]) batch.beam('#c4c6b7', p(0, height + 26), p(x, height + 8), .28);
    batch.box('#b8bcb1', cx - 21, height + 3, cz, 14, 6, 14);
    batch.box('#e6d5a6', cx + 18, height - 5, cz, 8, 6.5, 9);
    batch.box('#345c69', cx + 21, height - 4.5, cz - 4.6, 3, 3.5, .2);
    for (const z of [-2, 2]) batch.beam(dark, p(50, height, z), p(50, 25, z), .2);
    batch.box(orange, cx + 50, 24, cz, 11, 2.4, 7);
  }
  crane(-42, 37, 61);
  crane(39, 35, 48);
  // 부두 진입 차선은 레이스 노면과 구별되는 짧고 가는 작업장 표식이다.
  for (let x = -90; x <= 90; x += 14) batch.box('#e7d9ab', x, 1.24, 56, 7, .04, .35);
}

function lighthouse(batch, ground) {
  const white = '#f5eee0', dark = '#314a53', sandstone = '#b7a17b';
  // 두 번째 만의 작은 암초에서 등대까지 단단한 지반이 연결된다.
  batch.add('rock', sandstone, [0, (ground - 13) / 2, 0], [45, (ground + 13) / 2 + 2, 43]);
  batch.add('cylinder', '#c9b99a', [0, ground - 1, 0], [21, 5, 21]);
  batch.add('tower', white, [0, ground + 25, 0], [9, 50, 9]);
  for (const h of [2, 14, 32, 48]) batch.add('cylinder', h === 32 ? '#d3d0bd' : white, [0, ground + h, 0], [h > 32 ? 7.3 : 9, 1.1, h > 32 ? 7.3 : 9]);
  batch.box(dark, 0, ground + 5, -9, 3, 7, .25);
  for (const h of [17, 30, 41]) batch.box(dark, 0, ground + h, -8.2 + h * .033, 1.8, 3.3, .4);
  batch.add('cylinder', white, [0, ground + 51, 0], [10.5, 2, 10.5]);
  batch.add('cylinder', '#83acb4', [0, ground + 55, 0], [6.8, 6, 6.8]);
  batch.add('cylinder', '#f8d886', [0, ground + 55, 0], [2.8, 4, 2.8]);
  batch.add('roof', dark, [0, ground + 60, 0], [9, 5, 9]);
  batch.add('cylinder', dark, [0, ground + 64, 0], [.25, 4, .25]);
  for (let i = 0; i < 12; i++) {
    const angle = i / 12 * Math.PI * 2, next = (i + 1) / 12 * Math.PI * 2;
    const x = Math.cos(angle), z = Math.sin(angle);
    batch.beam(dark, V(x * 9.7, ground + 52, z * 9.7), V(x * 9.7, ground + 54.7, z * 9.7), .17);
    batch.beam(dark, V(x * 9.7, ground + 54.7, z * 9.7), V(Math.cos(next) * 9.7, ground + 54.7, Math.sin(next) * 9.7), .17);
    batch.beam(dark, V(x * 6.7, ground + 52, z * 6.7), V(x * 6.7, ground + 58, z * 6.7), .35);
  }
  // 낮은 관리동과 방파제, 발치 암석으로 흰 탑의 크기를 읽을 수 있게 한다.
  batch.box(white, 22, ground + 3, 3, 17, 6, 12);
  batch.add('roof', '#76645a', [22, ground + 7.5, 3], [13, 4, 10]);
  batch.box(dark, 22, ground + 3, -3.1, 3, 3.8, .2);
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4, r = 28 + (i % 3) * 4;
    batch.add('rock', i % 2 ? '#927f67' : '#cfba91', [Math.cos(a) * r, ground * .12 - 2, Math.sin(a) * r], [11 + i % 4, 7 + i % 3, 9 + i % 5]);
  }
}

function sandstoneOutcrop(batch, ground) {
  const palette = ['#b09571', '#d3bc93', '#9f896e', '#c7ad83'];
  for (let i = 0; i < 15; i++) {
    const a = i * 2.399, r = i < 3 ? i * 11 : 22 + i % 4 * 6;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const height = i < 3 ? 17 - i * 3 : 4 + i % 5;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(.08 * (i % 3), a, -.09 * (i % 2)));
    batch.add('rock', palette[i % palette.length], [x, ground + height * .2 - 2, z], [11 + i % 5, height, 9 + i % 6], q);
  }
}

export function addCoastalLandmarks(world) {
  if (world.coastalLandmarks) return world.coastalLandmarks;
  const shapes = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cylinder: new THREE.CylinderGeometry(1, 1, 1, 12),
    tower: new THREE.CylinderGeometry(.72, 1, 1, 20),
    roof: new THREE.ConeGeometry(1, 1, 12),
    rock: new THREE.IcosahedronGeometry(1, 1),
  };
  const material = new THREE.MeshStandardMaterial({vertexColors: true, roughness: .83, metalness: .08});
  const step = 6, road = [];
  for (let d = 0; d < world.length; d += step) road.push(world.frameAt(d).p);
  road.push(world.frameAt(world.length).p);
  const landmarks = [];
  const add = (id, x, z, base, build) => {
    const batch = new CoastalBatch(shapes);
    build(batch);
    const geometry = batch.geometry(), vertices = geometry.getAttribute('position');
    let radius = 0;
    for (let i = 0; i < vertices.count; i++) radius = Math.max(radius, Math.hypot(vertices.getX(i), vertices.getZ(i)));
    const centerGap = Math.min(...road.map(p => Math.hypot(p.x - x, p.z - z)));
    // 전체 장식의 외곽 반경과 표본 사이 3m 오차까지 뺀 보수적 간격이다.
    // 나중에 코스가 바뀌어도 크레인의 팔이 도로 위에 걸리지 않는다.
    const minimumRoadGap = centerGap - radius - step / 2;
    if (minimumRoadGap < 60) { geometry.dispose(); return; }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = id;
    mesh.position.set(x, base, z);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.userData = {coastalLandmark: true, minimumRoadGap, horizontalRadius: radius};
    world.scene.add(mesh);
    landmarks.push({id, x, z, minimumRoadGap, radius, mesh});
  };
  add('서안 컨테이너 부두', -1760, -1090, 3.4, dock);
  add('하버 곶 흰 등대', -2740, 60, 0, batch => lighthouse(batch, sydneyTerrainHeight(-2740, 60) + 1));
  add('발메인 사암 노두', -2035, -535, 0, batch => sandstoneOutcrop(batch, sydneyTerrainHeight(-2035, -535) - 1.2));
  for (const geometry of Object.values(shapes)) geometry.dispose();
  if (!landmarks.length) material.dispose();
  world.coastalLandmarks = landmarks;
  return landmarks;
}
