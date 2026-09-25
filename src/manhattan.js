import * as THREE from '../vendor/three.module.js';

// 실제 맨해튼의 석재·적벽돌 거리와 옥상 설비를 참고한 독자 제작 도시다.
// 지도 타일이나 스트리트뷰 이미지를 텍스처로 복사하지 않는다.
const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function random(seed = 41703) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

function canvasTexture(width, height, draw, repeat = false) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  if (repeat) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function facadeTexture(style, seed) {
  const rng = random(seed);
  const palettes = [
    ['#c9bca7', '#ac9c85', '#e5d8c1'], ['#985b45', '#744532', '#c89b7b'],
    ['#ad9f88', '#877967', '#e0d3bd'], ['#b39b86', '#796452', '#d9c7ae'],
    ['#657781', '#394c56', '#b0c2c4'], ['#424d59', '#233443', '#93b0c0'],
  ];
  const [stone, mortar, trim] = palettes[style];
  return canvasTexture(1024, 1024, (ctx, w, h) => {
    ctx.fillStyle = stone; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 8500; i++) {
      ctx.fillStyle = rng() > .45 ? '#ffffff09' : '#231a1810';
      ctx.fillRect(rng() * w, rng() * h, 2 + rng() * 4, 1 + rng() * 2);
    }
    if (style < 4) {
      const brick = style === 1 ? 17 : 32;
      ctx.strokeStyle = mortar; ctx.globalAlpha = .4; ctx.lineWidth = 1;
      for (let y = 0; y < h; y += brick) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        for (let x = (y / brick % 2) * 32; x < w; x += 64) {
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + brick); ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }
    for (let row = 0; row < 8; row++) {
      const y = row * 128;
      if (style < 4) {
        ctx.fillStyle = mortar; ctx.fillRect(0, y + 125, w, 3);
        ctx.fillStyle = trim; ctx.fillRect(0, y + 121, w, 3);
      }
      for (let col = 0; col < 4; col++) {
        const x = col * 256;
        const pad = style >= 4 ? 8 : 48;
        const top = style >= 4 ? 6 : 20;
        const ww = 256 - pad * 2; const wh = style >= 4 ? 116 : 84;
        ctx.fillStyle = '#1b2025'; ctx.fillRect(x + pad - 7, y + top - 5, ww + 14, wh + 13);
        ctx.fillStyle = trim; ctx.fillRect(x + pad - 5, y + top - 7, ww + 10, wh + 12);
        const glass = ctx.createLinearGradient(x + pad, y + top, x + pad + ww * .75, y + top + wh);
        const warm = rng() > .87;
        glass.addColorStop(0, warm ? '#b4a27e' : '#6b8792');
        glass.addColorStop(.5, warm ? '#655b45' : '#3e586a');
        glass.addColorStop(1, '#192c3b'); ctx.fillStyle = glass;
        ctx.fillRect(x + pad, y + top, ww, wh);
        ctx.fillStyle = '#dde4d729'; ctx.fillRect(x + pad + 3, y + top + 2, ww * .32, wh * .8);
        if (rng() > .58 && style < 4) {
          ctx.fillStyle = '#d2c7ad'; ctx.fillRect(x + pad + 2, y + top + 1, ww - 4, 13 + rng() * 21);
          ctx.fillStyle = '#655e52'; ctx.fillRect(x + pad + 2, y + top + 14, ww - 4, 2);
        }
        ctx.fillStyle = style === 1 ? '#352d27' : '#b9b7a7';
        ctx.fillRect(x + 125, y + top, 5, wh);
        ctx.fillRect(x + pad, y + top + wh * .5, ww, 4);
        ctx.fillStyle = '#111a2455'; ctx.fillRect(x + pad, y + top, ww, 7);
        ctx.fillStyle = trim; ctx.fillRect(x + pad - 13, y + top + wh + 5, ww + 26, 5);
        ctx.fillStyle = '#2c262644'; ctx.fillRect(x + pad - 10, y + top + wh + 10, ww + 20, 5);
      }
    }
  }, true);
}

function pavementTexture() {
  const rng = random(1960);
  return canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#a5a39c'; ctx.fillRect(0, 0, w, h);
    for (let n = 0; n < 17000; n++) {
      ctx.fillStyle = rng() > .5 ? '#dedac224' : '#46474426';
      ctx.fillRect(rng() * w, rng() * h, 2, 2);
    }
    ctx.strokeStyle = '#656b68'; ctx.lineWidth = 2;
    for (let x = 0; x < w; x += 128) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y < h; y += 128) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  }, true);
}

// 같은 재질의 정적 건물을 한 버퍼로 합쳐 수백 개의 점포도 적은 드로콜로 그린다.
class CityBatch {
  constructor(scene) { this.scene = scene; this.buckets = new Map(); this.matrix = new THREE.Matrix4(); }
  get(material) {
    let b = this.buckets.get(material);
    if (!b) { b = { positions: [], normals: [], uvs: [] }; this.buckets.set(material, b); }
    return b;
  }
  geometry(geometry, material, position, scale = [1, 1, 1], rotation = 0) {
    const b = this.get(material);
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    const pos = g.getAttribute('position'), norm = g.getAttribute('normal'), uv = g.getAttribute('uv');
    this.matrix.compose(V(...position), new THREE.Quaternion().setFromAxisAngle(UP, rotation), V(...scale));
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(this.matrix);
    const p = new THREE.Vector3(), n = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i).applyMatrix4(this.matrix); b.positions.push(p.x, p.y, p.z);
      n.fromBufferAttribute(norm, i).applyMatrix3(normalMatrix).normalize(); b.normals.push(n.x, n.y, n.z);
      b.uvs.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
    }
    if (g !== geometry) g.dispose();
  }
  quad(material, a, b, c, d, uv = [0, 0, 1, 1]) {
    const bucket = this.get(material);
    const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    const [u0, v0, u1, v1] = uv;
    const points = [a, b, c, a, c, d];
    const coords = [[u0, v0], [u1, v0], [u1, v1], [u0, v0], [u1, v1], [u0, v1]];
    points.forEach((p, i) => { bucket.positions.push(p.x, p.y, p.z); bucket.normals.push(normal.x, normal.y, normal.z); bucket.uvs.push(...coords[i]); });
  }
  finish() {
    let vertices = 0;
    for (const [material, b] of this.buckets) {
      if (!b.positions.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.positions, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(b.normals, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uvs, 2));
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, material);
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.name = '맨해튼 정적 거리'; this.scene.add(mesh);
      vertices += b.positions.length / 3;
    }
    return { batches: this.buckets.size, vertices };
  }
}

function signAtlas() {
  const labels = [
    ['#205943', 'FIFTH AV'], ['#205943', 'BROADWAY'], ['#205943', 'W 23 ST'], ['#205943', 'W 24 ST'],
    ['#205943', 'W 25 ST'], ['#205943', 'W 26 ST'], ['#205943', 'MADISON AV'], ['#205943', 'PARK AV S'],
    ['#203031', 'COFFEE & BAGELS'], ['#bd9661', 'FIFTH AVENUE BAKERY'], ['#712e2c', 'DELI & MARKET'], ['#e8ded0', 'BOOKS ON BROADWAY'],
    ['#133a38', '23rd STREET FLORIST'], ['#233a53', 'NEW YORK RUN CLUB'], ['#35342f', 'NOMAD ESPRESSO'], ['#ad6842', 'PIZZA • NEW YORK'],
    ['#f1e9db', 'ONE WAY  →'], ['#f1e9db', '←  ONE WAY'], ['#233a30', '23 Street Station'], ['#f4d133', '코너 감속'],
    ['#183944', '맨해튼 스피드 페스티벌'], ['#d87435', '끝까지 달려!'], ['#233337', 'FLATIRON DISTRICT'], ['#1b3835', 'MADISON SQUARE'],
  ];
  const texture = canvasTexture(2048, 1536, (ctx) => {
    labels.forEach(([bg, title], i) => {
      const x = (i % 4) * 512, y = Math.floor(i / 4) * 256;
      ctx.fillStyle = bg; ctx.fillRect(x, y, 512, 256);
      ctx.strokeStyle = bg === '#f1e9db' || bg === '#e8ded0' ? '#303c36' : '#e9e8d6';
      ctx.lineWidth = 5; ctx.strokeRect(x + 9, y + 9, 494, 238);
      ctx.fillStyle = bg === '#f1e9db' || bg === '#e8ded0' || bg === '#f4d133' ? '#233530' : '#f8f3e2';
      ctx.font = `700 ${title.length > 17 ? 33 : title.length > 12 ? 40 : 54}px Arial, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(title, x + 256, y + 128, 476);
    });
  });
  return { material: new THREE.MeshStandardMaterial({ map: texture, roughness: .72, side: THREE.DoubleSide }),
    uv: index => [(index % 4) / 4 + .004, 1 - (Math.floor(index / 4) + 1) / 6 + .004, ((index % 4) + 1) / 4 - .004, 1 - Math.floor(index / 4) / 6 - .004] };
}

export function buildManhattanScenery(world) {
  const batch = new CityBatch(world.scene), rng = random(9526);
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const cylinderGeo = new THREE.CylinderGeometry(1, 1, 1, 10);
  const coneGeo = new THREE.ConeGeometry(1, 1, 12);
  const sphereGeo = new THREE.SphereGeometry(1, 10, 7);
  const stone = world.material('#bcb5a7', .02, .92);
  const darkStone = world.material('#686762', .08, .94);
  const iron = world.material('#27383b', .38, .53);
  const timber = world.material('#72604b', .02, .94);
  const yellow = world.material('#e2aa29', .12, .56);
  const white = world.material('#e8e1cc', .02, .82);
  const red = world.material('#b84b36', .12, .62);
  const glass = world.material('#243b44', .45, .28);
  const foliage = world.material('#47624b', .02, .96);
  const leafLight = world.material('#71815a', .02, .96);
  const atlas = signAtlas();
  const facadeMats = Array.from({ length: 6 }, (_, i) => new THREE.MeshStandardMaterial({ map: facadeTexture(i, 519 + i * 233), roughness: i >= 4 ? .48 : .94, metalness: i >= 4 ? .2 : .02 }));
  const slab = new THREE.MeshStandardMaterial({ map: pavementTexture(), roughness: .94 });
  const ground = world.mesh(new THREE.PlaneGeometry(7000, 7000), world.material('#666a69'), [320, -.12, 350]);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  // 가로수와 가로등 사이로 실제 보도 블록이 이어진다.
  if (world.ribbon) {
    world.ribbon(-19, -11.8, .22, slab); world.ribbon(11.8, 19, .22, slab);
    world.ribbon(-12.05, -11.75, .28, stone); world.ribbon(11.75, 12.05, .28, stone);
  }
  const box = (mat, pos, size, rotation = 0) => batch.geometry(boxGeo, mat, pos, size, rotation);
  const cylinder = (mat, pos, radius, height) => batch.geometry(cylinderGeo, mat, pos, [radius, height, radius]);
  const samples = Array.from({ length: Math.ceil(world.length / 4) }, (_, i) => world.frameAt(i * 4).p);
  const nearestRoad = (x, z) => {
    let min = Infinity;
    for (const p of samples) min = Math.min(min, (p.x - x) ** 2 + (p.z - z) ** 2);
    return Math.sqrt(min);
  };
  const transform = (x, y, z, ox, oz, angle) => V(ox + Math.cos(angle) * x + Math.sin(angle) * z, y, oz - Math.sin(angle) * x + Math.cos(angle) * z);
  const localBox = (mat, x, y, z, size, ox, oz, angle) => box(mat, transform(x, y, z, ox, oz, angle).toArray(), size, angle);
  const sign = (id, x, y, z, width, height, angle = 0) => {
    const p = (dx, dy) => transform(dx, y + dy, 0, x, z, angle);
    batch.quad(atlas.material, p(-width / 2, -height / 2), p(width / 2, -height / 2), p(width / 2, height / 2), p(-width / 2, height / 2), atlas.uv(id));
  };
  const buildings = [];
  const parkCenter = world.frameAt(250, 37).p;
  const landmarkReserved = { x: 100, z: -75, radius: 43 };
  const canBuild = (x, z, w, d, angle, clearance = 22.6) => {
    if (Math.hypot(x - landmarkReserved.x, z - landmarkReserved.z) < landmarkReserved.radius + Math.hypot(w, d) / 2) return false;
    if (Math.abs(x - parkCenter.x) < 27 + w / 2 && Math.abs(z - parkCenter.z) < 56 + d / 2) return false;
    const c = Math.cos(angle), s = Math.sin(angle);
    // 사각형 외곽까지 검사해 헤어핀 안쪽으로 건물이 튀어나오지 않게 한다.
    for (const p of samples) {
      const dx = p.x - x, dz = p.z - z;
      const lx = c * dx - s * dz, lz = s * dx + c * dz;
      const qx = Math.max(0, Math.abs(lx) - w / 2), qz = Math.max(0, Math.abs(lz) - d / 2);
      if (qx * qx + qz * qz < clearance ** 2) return false;
    }
    const radius = Math.min(w, d) * .43;
    return !buildings.some(b => Math.hypot(x - b.x, z - b.z) < radius + b.radius + 2.5);
  };
  function building(x, z, width, depth, height, style, angle = 0, detailed = true) {
    buildings.push({ x, z, radius: Math.min(width, depth) * .43 });
    const corners = [[-width / 2, -depth / 2], [-width / 2, depth / 2], [width / 2, depth / 2], [width / 2, -depth / 2]];
    for (let side = 0; side < 4; side++) {
      const [ax, az] = corners[side], [bx, bz] = corners[(side + 1) % 4];
      const faceWidth = Math.hypot(bx - ax, bz - az);
      batch.quad(facadeMats[style], transform(ax, 4.2, az, x, z, angle), transform(bx, 4.2, bz, x, z, angle), transform(bx, height, bz, x, z, angle), transform(ax, height, az, x, z, angle), [0, 0, faceWidth / 16, (height - 4.2) / 32]);
    }
    box(darkStone, [x, .28, z], [width + 1.7, .55, depth + 1.7], angle);
    box(stone, [x, 4.12, z], [width + .6, .42, depth + .6], angle);
    box(darkStone, [x, height + .16, z], [width + .7, .35, depth + .7], angle);
    box(style === 1 ? timber : stone, [x, height - .65, z], [width + 1, .4, depth + 1], angle);
    box(style === 1 ? timber : stone, [x, height - .13, z], [width + .45, .42, depth + .45], angle);
    box(glass, [x, 2.25, z], [width - .22, 3.85, depth - .22], angle);
    const columnStep = 4.1;
    for (let dx = -width / 2; dx <= width / 2 + .1; dx += columnStep) {
      for (const dz of [-depth / 2, depth / 2]) localBox(stone, dx, 2.15, dz, [.42, 4.1, .55], x, z, angle);
    }
    for (let dz = -depth / 2; dz <= depth / 2; dz += columnStep) {
      for (const dx of [-width / 2, width / 2]) localBox(stone, dx, 2.15, dz, [.55, 4.1, .42], x, z, angle);
    }
    if (!detailed) return;
    // 실제 돌출 창턱은 사선으로 지나갈 때 평면 텍스처와 다른 입체감을 만든다.
    for (let y = 7.7; y < height - 2; y += 4) {
      for (let dx = -width / 2 + 2; dx < width / 2 - .5; dx += 4) {
        for (const dz of [-depth / 2 - .14, depth / 2 + .14]) localBox(style === 1 ? timber : stone, dx, y, dz, [2.7, .18, .42], x, z, angle);
      }
    }
    for (let y = 7.7; y < height - 2; y += 4) {
      for (let dz = -depth / 2 + 2; dz < depth / 2 - .5; dz += 4) {
        for (const dx of [-width / 2 - .14, width / 2 + .14]) localBox(style === 1 ? timber : stone, dx, y, dz, [.42, .18, 2.7], x, z, angle);
      }
    }
    const awningColor = [world.material('#315550'), world.material('#7d3834'), world.material('#bdac84')][Math.floor(rng() * 3)];
    for (const side of [-1, 1]) {
      const front = transform(0, 3.5, side * (depth / 2 + .08), x, z, angle);
      sign(8 + Math.floor(rng() * 8), front.x, 3.55, front.z, Math.min(width - 1.4, 16), 1.15, angle + (side === -1 ? Math.PI : 0));
      localBox(awningColor, 0, 2.95, side * (depth / 2 + 1.05), [width - 1.6, .18, 1.9], x, z, angle);
      localBox(awningColor, 0, 2.78, side * (depth / 2 + 1.88), [width - 1.6, .42, .15], x, z, angle);
    }
    for (const side of [-1, 1]) {
      const front = transform(side * (width / 2 + .12), 3.5, 0, x, z, angle);
      sign(8 + Math.floor(rng() * 8), front.x, 3.55, front.z, Math.min(depth - 1.4, 16), 1.15, angle + side * Math.PI / 2);
      localBox(awningColor, side * (width / 2 + 1.05), 2.95, 0, [1.9, .18, depth - 1.6], x, z, angle);
      localBox(awningColor, side * (width / 2 + 1.88), 2.78, 0, [.15, .42, depth - 1.6], x, z, angle);
    }
    if (style < 4 && height > 22 && rng() > .42) {
      // 외부 철제 비상계단과 사다리도 정적 버퍼에 합친다.
      const ex = width * .18, ez = -depth / 2 - .65;
      for (let y = 9; y < height - 3; y += 8) {
        localBox(iron, ex, y, ez, [3.6, .16, 1.5], x, z, angle);
        localBox(iron, ex, y + 1.08, ez - .72, [3.6, .08, .08], x, z, angle);
        for (let dx = -1.7; dx < 1.8; dx += .5) localBox(iron, ex + dx, y + .57, ez - .72, [.07, 1.12, .07], x, z, angle);
        for (const dx of [ex - 1.2, ex - .4]) localBox(iron, dx, y + 3.3, ez, [.08, 6.6, .08], x, z, angle);
        for (let dy = 0; dy < 6.6; dy += .45) localBox(iron, ex - .8, y + dy, ez, [.9, .07, .08], x, z, angle);
      }
    }
    if (rng() > .38 && height < 85) {
      const wx = x + Math.cos(angle) * width * .2, wz = z - Math.sin(angle) * width * .2;
      for (const dx of [-1.35, 1.35]) for (const dz of [-1.35, 1.35]) box(iron, [wx + dx, height + 1.4, wz + dz], [.16, 2.8, .16]);
      cylinder(timber, [wx, height + 4.15, wz], 2.55, 4.8);
      for (const y of [height + 2.25, height + 4.2, height + 6.2]) cylinder(iron, [wx, y, wz], 2.59, .11);
      batch.geometry(coneGeo, darkStone, [wx, height + 7.4, wz], [2.8, 2, 2.8]);
    }
    box(darkStone, [x - width * .22, height + .9, z], [3.8, 1.5, 4.4], angle);
    for (let i = 0; i < 4; i++) localBox(iron, -width * .22, height + 1.7, -1.7 + i * 1.1, [3.4, .1, .18], x, z, angle);
  }

  // 경기 도로를 따라 상점가를 배치하고, 그 뒤에 맨해튼 특유의 밀집한 고층 스카이라인을 쌓는다.
  for (let d = 16; d < world.length; d += 29) {
    const f = world.frameAt(d), angle = Math.atan2(f.tangent.x, f.tangent.z);
    for (const side of [-1, 1]) {
      const width = 20 + rng() * 7, depth = 18 + rng() * 12;
      const p = f.p.clone().addScaledVector(f.right, side * (24 + width / 2));
      if (!canBuild(p.x, p.z, width, depth, angle, 22.6)) continue;
      const style = rng() < .64 ? Math.floor(rng() * 4) : 4 + Math.floor(rng() * 2);
      const height = style >= 4 ? 52 + Math.floor(rng() * 14) * 4 : 20 + Math.floor(rng() * 9) * 4;
      building(p.x, p.z, width, depth, height, style, angle, true);
    }
  }
  const minX = Math.min(...samples.map(p => p.x)), maxX = Math.max(...samples.map(p => p.x));
  const minZ = Math.min(...samples.map(p => p.z)), maxZ = Math.max(...samples.map(p => p.z));
  for (let x = minX - 300; x <= maxX + 300; x += 58) {
    for (let z = minZ - 280; z <= maxZ + 320; z += 65) {
      const px = x + (rng() - .5) * 10, pz = z + (rng() - .5) * 10;
      if (nearestRoad(px, pz) < 65 || rng() < .22) continue;
      const width = 25 + rng() * 15, depth = 28 + rng() * 17;
      if (!canBuild(px, pz, width, depth, 0)) continue;
      const style = rng() < .45 ? Math.floor(rng() * 4) : 4 + Math.floor(rng() * 2);
      const h = (style < 4 ? 35 : 62) + Math.floor(rng() * 19) * 4;
      building(px, pz, width, depth, h, style, 0, false);
      if (h > 105) box(stone, [px, h + 7, pz], [width * .62, 14, depth * .62]);
    }
  }

  function tree(x, z, scale = 1) {
    cylinder(timber, [x, 2.8 * scale, z], .24 * scale, 5.6 * scale);
    for (const [dx, dy, dz, r] of [[0, 6.3, 0, 2.4], [-1.2, 5.5, .4, 1.9], [1.2, 5.7, -.6, 1.9], [.1, 7.5, .2, 1.7]]) {
      batch.geometry(sphereGeo, dy > 7 ? leafLight : foliage, [x + dx * scale, dy * scale, z + dz * scale], [r * scale, r * scale, r * scale]);
    }
    box(iron, [x, .3, z], [2.7, .1, 2.7]);
    box(world.material('#786a50'), [x, .36, z], [2.3, .08, 2.3]);
  }
  // 매디슨 스퀘어 파크를 참고한 작은 공원. 출발 직선 우측에 열린 시야를 만든다.
  box(world.material('#647754'), [parkCenter.x, .15, parkCenter.z], [50, .25, 109]);
  for (let dz = -52; dz <= 52; dz += 14) {
    for (const dx of [-17, 3, 18]) tree(parkCenter.x + dx, parkCenter.z + dz, 1.15 + rng() * .6);
    box(timber, [parkCenter.x + 19, .92, parkCenter.z + dz], [1.1, .2, 3.5]);
    box(iron, [parkCenter.x + 19.5, 1.36, parkCenter.z + dz], [.12, .85, 3.5]);
  }
  for (let dz = -54; dz <= 54; dz += 1.6) {
    for (const dx of [-25, 25]) box(iron, [parkCenter.x + dx, 1.13, parkCenter.z + dz], [.095, 1.75, .095]);
  }
  for (const dx of [-25, 25]) box(iron, [parkCenter.x + dx, 1.62, parkCenter.z], [.12, .1, 109]);
  function lamp(x, z, angle) {
    cylinder(iron, [x, 4.4, z], .115, 8.6);
    cylinder(iron, [x, .55, z], .31, .8);
    localBox(iron, 0, 8.55, -1.2, [.12, .15, 2.55], x, z, angle);
    localBox(iron, 0, 8.48, -2.2, [.8, .3, 1.35], x, z, angle);
    localBox(white, 0, 8.28, -2.2, [.64, .04, 1.1], x, z, angle);
  }
  const signalGreen = world.material('#7cbc83', .05, .4);
  const signalRed = world.material('#8a3a30', .05, .5);
  for (let d = 24, n = 0; d < world.length; d += 37, n++) {
    const f = world.frameAt(d), angle = Math.atan2(f.tangent.x, f.tangent.z);
    for (const side of [-1, 1]) {
      const p = world.frameAt(d, side * 13.4).p;
      lamp(p.x, p.z, angle + (side === -1 ? Math.PI : 0));
      if (n % 3 === 1) {
        const t = world.frameAt(d + 9, side * 15.2).p;
        tree(t.x, t.z, .85 + rng() * .3);
      }
      if (n % 4 === 0) {
        const h = world.frameAt(d + 8, side * 12.2).p;
        cylinder(red, [h.x, .75, h.z], .28, 1.2);
        batch.geometry(sphereGeo, red, [h.x, 1.39, h.z], [.34, .25, .34]);
        box(red, [h.x, 1, h.z], [.9, .18, .22], angle);
      }
      if (n % 4 === 2) {
        const b = world.frameAt(d + 5, side * 16.2).p;
        box(iron, [b.x, .85, b.z], [1, 1.6, 1], angle);
        box(darkStone, [b.x, 1.67, b.z], [1.06, .1, 1.06], angle);
      }
    }
    if (n % 4 === 0) {
      const p = world.frameAt(d, -12.7).p;
      const cross = angle + Math.PI;
      cylinder(iron, [p.x, 4.2, p.z], .14, 8.2);
      localBox(iron, 4.8, 7.7, 0, [9.6, .17, .18], p.x, p.z, angle);
      for (const x of [3, 7]) {
        localBox(yellow, x, 6.65, -.08, [.76, 1.9, .57], p.x, p.z, angle);
        for (let i = 0; i < 3; i++) {
          const lp = transform(x, 7.25 - i * .6, -.4, p.x, p.z, angle);
          batch.geometry(sphereGeo, i === 2 ? signalGreen : signalRed, lp.toArray(), [.23, .23, .065], angle);
        }
      }
      sign(n % 8 === 0 ? 0 : 1, p.x, 5.5, p.z, 3.8, .73, cross);
      sign(2 + Math.floor(n / 4) % 6, p.x, 4.65, p.z, 3.8, .73, cross + Math.PI / 2);
      const signP = world.frameAt(d + 2, 12.7).p;
      cylinder(iron, [signP.x, 1.7, signP.z], .07, 3.3);
      sign(n % 8 === 0 ? 16 : 17, signP.x, 3.18, signP.z, 2.4, .66, angle + Math.PI);
      // 횡단보도는 방향 안내와 함께 도심 교차로의 리듬을 만든다.
      for (let off = -9; off < 10; off += 2.3) {
        const p = world.frameAt(d + 8, off).p;
        box(white, [p.x, .205, p.z], [1.4, .012, 4.4], angle);
      }
    }
    if (n % 6 === 3) {
      const p = world.frameAt(d, 3.8).p;
      cylinder(darkStone, [p.x, .205, p.z], .67, .018);
      for (let i = -2; i <= 2; i++) box(iron, [p.x + i * .19, .218, p.z], [.06, .01, 1.1]);
    }
  }

  // 도로 가까이에서 알아볼 수 있는 뉴욕 지하철 입구와 공원 벤치.
  for (const t of [.065, .38, .77]) {
    const f = world.frameAt(t * world.length, 16.8), angle = Math.atan2(f.tangent.x, f.tangent.z);
    box(glass, [f.p.x, .225, f.p.z], [3.8, .08, 7], angle);
    for (const side of [-1, 1]) {
      for (let z = -3.6; z <= 3.6; z += .6) localBox(iron, side * 2, .9, z, [.09, 1.4, .09], f.p.x, f.p.z, angle);
      localBox(iron, side * 2, 1.65, 0, [.11, .12, 7.3], f.p.x, f.p.z, angle);
      const post = transform(side * 2, 2.4, 3.5, f.p.x, f.p.z, angle);
      cylinder(iron, post.toArray(), .14, 1.7);
      batch.geometry(sphereGeo, signalGreen, [post.x, 3.45, post.z], [.35, .35, .35]);
    }
    const label = transform(0, 1.9, -3.5, f.p.x, f.p.z, angle);
    sign(18, label.x, label.y, label.z, 3.9, .8, angle + Math.PI);
  }

  // 플랫아이언의 긴 삼각형과 엠파이어 스테이트의 계단형 지붕을 독자 모델로 재해석한다.
  const lx = landmarkReserved.x, lz = landmarkReserved.z;
  const landmarkAngle = -.38;
  const triangle = [[-14, -24], [-1.9, 37], [1.9, 37], [14, -24]];
  for (let i = 0; i < triangle.length; i++) {
    const a = triangle[i], b = triangle[(i + 1) % triangle.length], width = Math.hypot(a[0] - b[0], a[1] - b[1]);
    batch.quad(facadeMats[0], transform(...[a[0], .5, a[1]], lx, lz, landmarkAngle), transform(...[b[0], .5, b[1]], lx, lz, landmarkAngle), transform(...[b[0], 88, b[1]], lx, lz, landmarkAngle), transform(...[a[0], 88, a[1]], lx, lz, landmarkAngle), [0, 0, width / 16, 2.75]);
    const midX = (a[0] + b[0]) / 2, midZ = (a[1] + b[1]) / 2;
    const along = Math.atan2(b[0] - a[0], b[1] - a[1]);
    for (const h of [4.6, 13, 77, 85.5, 88.3]) {
      const p = transform(midX, h, midZ, lx, lz, landmarkAngle);
      box(stone, p.toArray(), [.85, h === 88.3 ? .8 : .38, width + .7], landmarkAngle + along);
    }
  }
  const flatShape = new THREE.Shape(triangle.map(([x, z]) => new THREE.Vector2(x, -z)));
  const roof = new THREE.ShapeGeometry(flatShape); roof.rotateX(-Math.PI / 2);
  batch.geometry(roof, darkStone, [lx, 88.05, lz], [1, 1, 1], landmarkAngle); roof.dispose();
  const banner = transform(0, 4.1, 37.15, lx, lz, landmarkAngle);
  sign(22, banner.x, banner.y, banner.z, 4.8, 1.2, landmarkAngle);
  const ex = (minX + maxX) / 2 - 110, ez = maxZ + 420;
  building(ex, ez, 78, 63, 112, 2, 0, false);
  building(ex, ez, 49, 44, 202, 2, 0, false);
  building(ex, ez, 30, 27, 255, 2, 0, false);
  box(stone, [ex, 272, ez], [17, 34, 17]);
  cylinder(iron, [ex, 316, ez], 2.1, 58);
  cylinder(white, [ex, 352, ez], .42, 42);

  const stats = batch.finish();
  world.manhattanStats = { ...stats, buildings: buildings.length, landmarks: 2 };
  // 기존 세계 갱신 루프와도 호환되며, 바다는 생성하지 않는다.
  world.windmills = [];
  boxGeo.dispose(); cylinderGeo.dispose(); coneGeo.dispose(); sphereGeo.dispose();
}
