import * as THREE from '../vendor/three.module.js';

const clamp = THREE.MathUtils.clamp;
const HISTORY = 32;
const PARTICLES = 96;
const TRAIL_SEGMENTS = 24;

const particleVertex = `
  attribute vec3 tint;
  attribute float alpha;
  attribute float radius;
  attribute float kind;
  uniform float pixelScale;
  varying vec3 vTint;
  varying float vAlpha;
  varying float vKind;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(radius * pixelScale / max(1., -mv.z), 1., 70.);
    vTint = tint;
    vAlpha = alpha;
    vKind = kind;
  }
`;
const particleFragment = `
  varying vec3 vTint;
  varying float vAlpha;
  varying float vKind;
  void main() {
    vec2 p = gl_PointCoord * 2. - 1.;
    float r = length(p);
    float cloud = pow(max(0., 1. - r * r), 2.5);
    float star = exp(-abs(p.x * p.y) * 46.) * pow(max(0., 1. - r), 1.8);
    float shape = mix(cloud, max(star, cloud * .32), vKind);
    float a = shape * vAlpha;
    if (a < .003) discard;
    gl_FragColor = vec4(vTint, a);
    #include <colorspace_fragment>
  }
`;

const ringFragment = `
  uniform float opacity;
  uniform float phase;
  varying vec2 vUv;
  void main() {
    vec2 p = (vUv - .5) * 2.;
    float r = length(p);
    float angle = atan(p.y, p.x);
    float core = 1. - smoothstep(.006, .02, abs(r - .78));
    float glow = exp(-abs(r - .78) * 48.) * .3;
    float broken = smoothstep(-.55, .15, sin(angle * 3. + phase));
    float fine = (1. - smoothstep(.004, .012, abs(r - .87))) * .26;
    float a = (core * broken + glow + fine * broken) * opacity;
    if (a < .003) discard;
    gl_FragColor = vec4(mix(vec3(.11,.66,1.), vec3(.88,1.,1.), core), a);
    #include <colorspace_fragment>
  }
`;

/** 원본 잔상·빛의 궤적·발밑 입자를 작은 풀에서 재사용한다. */
export class SpeedFX {
  constructor(world) {
    this.world = world;
    this.group = new THREE.Group();
    this.group.name = '질주 잔상과 드리프트 효과';
    world.scene.add(this.group);
    this.group.visible = false;
    this.elapsed = 0;
    this.wasBoosting = false;
    this.wasAirborne = false;
    this.boostFade = 0;
    this.emission = 0;
    this.history = [];
    this.particleCursor = 0;
    this.textureKey = null;
    this.disposed = false;
    this.scratchPosition = new THREE.Vector3();
    this.scratchScale = new THREE.Vector3();
    this.scratchQuaternion = new THREE.Quaternion();
    this.screenSize = new THREE.Vector2();

    this.echoes = Array.from({length: 3}, () => {
      const material = new THREE.SpriteMaterial({transparent: true, opacity: 0, depthWrite: false, depthTest: true, toneMapped: false, blending: THREE.AdditiveBlending, color: '#b2efff'});
      const sprite = new THREE.Sprite(material);
      sprite.center.set(.5, .025);
      sprite.visible = false;
      this.group.add(sprite);
      return sprite;
    });

    const ringGeometry = new THREE.PlaneGeometry(1, 1);
    this.rings = Array.from({length: 3}, (_, index) => {
      const material = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, depthTest: true, toneMapped: false,
        blending: THREE.AdditiveBlending,
        uniforms: {opacity: {value: 0}, phase: {value: index * 2.1}},
        vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader: ringFragment,
      });
      const mesh = new THREE.Mesh(ringGeometry, material);
      mesh.visible = false;
      this.group.add(mesh);
      return {mesh, age: 1, delay: index * .045};
    });

    const geometry = new THREE.BufferGeometry();
    const vertices = (TRAIL_SEGMENTS - 1) * 6 * 2;
    this.trailPositions = new Float32Array(vertices * 3);
    this.trailFades = new Float32Array(vertices);
    this.trailEdges = new Float32Array(vertices);
    geometry.setAttribute('position', new THREE.BufferAttribute(this.trailPositions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('fade', new THREE.BufferAttribute(this.trailFades, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('edge', new THREE.BufferAttribute(this.trailEdges, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setDrawRange(0, 0);
    this.trail = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, toneMapped: false,
      vertexShader: 'attribute float fade; attribute float edge; varying float vFade; varying float vEdge; void main(){vFade=fade;vEdge=edge;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: 'varying float vFade; varying float vEdge; void main(){float core=pow(max(0.,1.-abs(vEdge)),1.6);float a=core*vFade*.56;if(a<.004)discard;gl_FragColor=vec4(mix(vec3(.035,.5,1.),vec3(.78,.98,1.),core*core),a);\n#include <colorspace_fragment>\n}',
    }));
    this.trail.frustumCulled = false;
    this.group.add(this.trail);

    this.pool = Array.from({length: PARTICLES}, () => ({p: new THREE.Vector3(), v: new THREE.Vector3(), tint: new THREE.Color(), age: 1, life: 0, size: 0, kind: 0}));
    this.particlePositions = new Float32Array(PARTICLES * 3);
    this.particleTints = new Float32Array(PARTICLES * 3);
    this.particleAlphas = new Float32Array(PARTICLES);
    this.particleRadii = new Float32Array(PARTICLES);
    this.particleKinds = new Float32Array(PARTICLES);
    const particleGeometry = new THREE.BufferGeometry();
    for (const [name, array, size] of [
      ['position', this.particlePositions, 3], ['tint', this.particleTints, 3],
      ['alpha', this.particleAlphas, 1], ['radius', this.particleRadii, 1], ['kind', this.particleKinds, 1],
    ]) particleGeometry.setAttribute(name, new THREE.BufferAttribute(array, size).setUsage(THREE.DynamicDrawUsage));
    particleGeometry.setDrawRange(0, 0);
    this.particles = new THREE.Points(particleGeometry, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: true, toneMapped: false,
      uniforms: {pixelScale: {value: 720}},
      vertexShader: particleVertex, fragmentShader: particleFragment,
    }));
    this.particles.frustumCulled = false;
    this.group.add(this.particles);
  }

  bindTexture(source) {
    const map = source.material.map;
    if (this.textureKey === map?.uuid) return;
    this.textureKey = map?.uuid;
    for (const echo of this.echoes) {
      echo.material.map?.dispose();
      echo.material.map = map?.clone() ?? null;
      if (echo.material.map) echo.material.map.needsUpdate = true;
      echo.material.needsUpdate = true;
    }
    this.history.length = 0;
  }

  capture(source, frame) {
    source.getWorldPosition(this.scratchPosition);
    source.getWorldScale(this.scratchScale);
    const sample = this.history.length >= HISTORY ? this.history.pop() : {
      p: new THREE.Vector3(), center: new THREE.Vector3(), right: new THREE.Vector3(), tangent: new THREE.Vector3(), scale: new THREE.Vector3(), offset: new THREE.Vector2(), repeat: new THREE.Vector2(), rotation: 0, age: 0,
    };
    sample.p.copy(this.scratchPosition);
    sample.center.copy(frame.p);
    sample.center.y += 1.35;
    sample.right.copy(frame.right);
    sample.tangent.copy(frame.tangent);
    sample.scale.copy(this.scratchScale);
    sample.offset.copy(source.material.map.offset);
    sample.repeat.copy(source.material.map.repeat);
    sample.rotation = source.material.rotation;
    sample.age = 0;
    this.history.unshift(sample);
  }

  burst(frame) {
    for (const ring of this.rings) {
      ring.age = -ring.delay;
      ring.mesh.position.copy(frame.p).addScaledVector(frame.tangent, -.55);
      ring.mesh.position.y += 1.45;
    }
    for (let i = 0; i < 16; i++) this.emitParticle(frame, true, true);
  }

  emitParticle(frame, charged, burst = false) {
    const particle = this.pool[this.particleCursor++ % PARTICLES];
    const seed = Math.sin(this.particleCursor * 127.1 + this.elapsed * 3.7) * 43758.5453;
    const random = seed - Math.floor(seed);
    const angle = this.particleCursor * 2.39996;
    const spark = burst || (!this.cloud && this.particleCursor % 3 !== 0);
    particle.p.copy(frame.p).addScaledVector(frame.right, Math.sin(angle) * .75);
    particle.p.y += burst ? 1.3 + Math.cos(angle) * .8 : this.cloud ? .6 : .08;
    particle.v.copy(frame.tangent).multiplyScalar(burst ? -9 - random * 5 : -3 - random * 2);
    particle.v.addScaledVector(frame.right, Math.cos(angle) * (burst ? 7 : 2.4));
    particle.v.y = burst ? Math.sin(angle) * 6 : spark ? 1.7 + random * 2.7 : .5;
    particle.age = 0;
    particle.life = spark ? .24 + random * .18 : .42 + random * .24;
    particle.kind = spark ? 1 : 0;
    particle.size = spark ? .09 + random * .09 : .42 + random * .18;
    particle.tint.set(this.cloud ? '#edfbff' : spark ? (charged ? '#d9fcff' : '#ffd3a1') : '#c4b4a0');
    return particle;
  }

  landingBurst(frame, impact) {
    const strength = clamp((impact || 8) / 15, .4, 1);
    for (let i = 0; i < 18; i++) {
      const particle = this.emitParticle(frame, false);
      const angle = i * Math.PI * 2 / 18;
      particle.kind = i % 4 ? 0 : 1;
      particle.p.copy(frame.p).addScaledVector(frame.right, Math.sin(angle) * .65);
      particle.p.y += .12;
      particle.v.copy(frame.right).multiplyScalar(Math.sin(angle) * 7 * strength).addScaledVector(frame.tangent, Math.cos(angle) * 5 * strength);
      particle.v.y = particle.kind ? 2.4 * strength : .6;
      particle.size = particle.kind ? .09 : .45;
      particle.life = .28 + strength * .18;
      particle.tint.set(particle.kind ? '#ffe6b4' : '#d4e9e9');
    }
  }

  updateTrails() {
    const count = Math.min(TRAIL_SEGMENTS, this.history.length);
    let vertex = 0;
    const addVertex = (sample, side, edge, fraction) => {
      const wave = Math.sin(sample.age * 11 + this.elapsed * 7 + side * .8);
      const width = .13 * (1 - fraction * .6);
      const lateral = side * (.62 + fraction * .6 + wave * .12) + edge * width;
      const p = sample.center;
      const i = vertex * 3;
      this.trailPositions[i] = p.x + sample.right.x * lateral;
      this.trailPositions[i + 1] = p.y + Math.sin(fraction * Math.PI * 1.5 + side) * .35 + fraction * .3;
      this.trailPositions[i + 2] = p.z + sample.right.z * lateral;
      this.trailFades[vertex] = Math.pow(1 - fraction, 1.2) * this.boostFade;
      this.trailEdges[vertex++] = edge;
    };
    for (const side of [-1, 1]) for (let i = 0; i < count - 1; i++) {
      const a = this.history[i], b = this.history[i + 1];
      if (a.age > .18 || b.age > .18 || a.center.distanceTo(b.center) > 20) break;
      const fa = clamp(a.age / .18, 0, 1), fb = clamp(b.age / .18, 0, 1);
      addVertex(a, side, -1, fa); addVertex(b, side, -1, fb); addVertex(a, side, 1, fa);
      addVertex(a, side, 1, fa); addVertex(b, side, -1, fb); addVertex(b, side, 1, fb);
    }
    this.trail.geometry.setDrawRange(0, vertex);
    for (const attribute of Object.values(this.trail.geometry.attributes)) attribute.needsUpdate = true;
    this.trail.visible = vertex > 0 && this.boostFade > .01;
  }

  update(dt, race, {menu = false, reducedMotion = false} = {}) {
    if (this.disposed) return;
    if (menu || reducedMotion || !race?.player || !this.world.racerMeshes[0] || (race.state !== 'racing' && race.state !== 'paused')) {
      this.reset();
      return;
    }
    if (race.state === 'paused') return;
    dt = clamp(Number(dt) || 0, 0, .06);
    this.elapsed += dt;
    const player = race.player;
    this.cloud = player.petId === 'yongyong';
    const boosting = (player.boostTime > 0 || player.speed > 145) && player.speed > 12;
    const drifting = (player.drift || player.drifting) && player.speed > 16 && !player.airborne;
    const frame = this.world.frameAtRacer(player);
    if (this.wasAirborne && !player.airborne) this.landingBurst(frame, player.landingImpact);
    this.wasAirborne = Boolean(player.airborne);
    frame.p.y += player.jumpHeight || 0;
    const root = this.world.racerMeshes[0].model.group;
    const source = root.children.find(child => child.isSprite && child.material.map);
    if (!source) {this.reset(); return;}
    this.group.visible = true;
    this.boostFade = boosting ? 1 : Math.max(0, this.boostFade - dt * 7);
    for (const sample of this.history) sample.age += dt;
    if (boosting) {
      this.bindTexture(source);
      this.capture(source, frame);
      if (!this.wasBoosting) this.burst(frame);
    }
    this.wasBoosting = boosting;

    for (let i = 0; i < this.echoes.length; i++) {
      const echo = this.echoes[i];
      const targetAge = .016 + i * .013;
      const sample = this.history.find(item => item.age >= targetAge);
      echo.visible = !!sample && this.boostFade > .01;
      if (!echo.visible) continue;
      echo.position.copy(sample.p);
      // 뒤따라오는 카메라에 잔상이 가까워져 화면 전체를 가리는 현상을 막는다.
      const perspective = clamp(sample.p.distanceTo(this.world.camera.position) / Math.max(1, this.scratchPosition.distanceTo(this.world.camera.position)), .15, 1);
      echo.scale.copy(sample.scale).multiplyScalar(perspective * (1 - i * .11));
      echo.material.rotation = sample.rotation;
      echo.material.map.offset.copy(sample.offset);
      echo.material.map.repeat.copy(sample.repeat);
      echo.material.opacity = [.12, .06, .028][i] * this.boostFade;
    }
    this.updateTrails();

    this.world.camera.getWorldQuaternion(this.scratchQuaternion);
    for (const ring of this.rings) {
      ring.age += dt;
      const t = clamp(ring.age / .28, 0, 1);
      ring.mesh.visible = ring.age >= 0 && ring.age < .28;
      ring.mesh.quaternion.copy(this.scratchQuaternion);
      ring.mesh.scale.setScalar(2.8 + t * 7.5);
      ring.mesh.material.uniforms.opacity.value = (1 - t) ** 2 * .34;
    }

    const slip = clamp(Math.abs(player.slipAngle || 0) / .38, .2, 1);
    this.emission += drifting ? dt * (25 + slip * 55) : this.cloud && player.speed > 8 ? dt * 14 : 0;
    while (this.emission >= 1) {
      this.emitParticle(frame, (player.driftQuality || 0) >= .7 || (player.driftCharge || 0) >= 60);
      this.emission--;
    }
    if (!drifting && !this.cloud) this.emission = 0;
    let active = 0;
    for (const particle of this.pool) {
      if (particle.age >= particle.life) continue;
      particle.age += dt;
      if (particle.age >= particle.life) continue;
      particle.p.addScaledVector(particle.v, dt);
      particle.v.y -= dt * (particle.kind ? 8 : -.18);
      const fade = 1 - particle.age / particle.life;
      particle.p.toArray(this.particlePositions, active * 3);
      particle.tint.toArray(this.particleTints, active * 3);
      this.particleAlphas[active] = fade * (particle.kind ? .8 : .14);
      this.particleRadii[active] = particle.size * (particle.kind ? 1 : 1 + particle.age * 1.4);
      this.particleKinds[active] = particle.kind;
      active++;
    }
    this.particles.geometry.setDrawRange(0, active);
    for (const attribute of Object.values(this.particles.geometry.attributes)) attribute.needsUpdate = true;
    this.particles.visible = active > 0;
    this.world.renderer?.getDrawingBufferSize?.(this.screenSize);
    this.particles.material.uniforms.pixelScale.value = Math.max(500, this.screenSize.y) * .75;
    this.group.userData.activeDrawCalls = this.echoes.filter(e => e.visible).length + this.rings.filter(r => r.mesh.visible).length + Number(this.trail.visible) + Number(this.particles.visible);
  }

  reset() {
    this.group.visible = false;
    this.history.length = 0;
    this.wasBoosting = false;
    this.wasAirborne = false;
    this.boostFade = 0;
    this.emission = 0;
    for (const echo of this.echoes) echo.visible = false;
    for (const ring of this.rings) {ring.age = 1; ring.mesh.visible = false;}
    for (const particle of this.pool) particle.age = particle.life;
    this.trail.geometry.setDrawRange(0, 0);
    this.particles.geometry.setDrawRange(0, 0);
    this.group.userData.activeDrawCalls = 0;
  }

  dispose() {
    if (this.disposed) return;
    this.reset();
    this.disposed = true;
    this.group.removeFromParent();
    for (const echo of this.echoes) {echo.material.map?.dispose(); echo.material.dispose();}
    this.rings[0].mesh.geometry.dispose();
    for (const ring of this.rings) ring.mesh.material.dispose();
    this.trail.geometry.dispose(); this.trail.material.dispose();
    this.particles.geometry.dispose(); this.particles.material.dispose();
  }
}
