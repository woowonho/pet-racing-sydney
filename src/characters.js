import * as THREE from '../vendor/three.module.js';

const clamp = THREE.MathUtils.clamp;
const MAP_NAMES = ['portrait', 'idle', 'rear', 'boost'];

const frameCount = (pet, name) => name === 'portrait' ? 1 : name === 'rear' ? pet.rearFrames || 4 : pet.frames || 8;

/** 원본 아틀라스를 한 번씩 읽는다. 인스턴스별 재생 위치는 아래에서 복제한다. */
export async function loadCharacterTextures(pets, {loader = new THREE.TextureLoader(), anisotropy = 4} = {}) {
  const textures = new Map();
  await Promise.all(pets.map(async pet => {
    const maps = {};
    await Promise.all(MAP_NAMES.filter(name => pet[name]).map(async name => {
      const texture = await loader.loadAsync(pet[name]);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.generateMipmaps = false;
      texture.anisotropy = anisotropy;
      maps[name] = texture;
    }));
    textures.set(pet.id, maps);
  }));
  return textures;
}

/** 선택 화면은 원본, 경기에서는 디자인을 보존한 후면 달리기 프레임을 사용한다. */
export function createCharacter(pet, textures) {
  const source = textures?.get?.(pet.id) ?? textures?.[pet.id] ?? textures;
  if (!source?.rear || !source?.portrait) {
    throw new Error(`${pet.name}의 후면 달리기 텍스처가 준비되지 않았습니다.`);
  }

  const maps = {};
  for (const name of MAP_NAMES) {
    if (!source[name]) continue;
    maps[name] = source[name].clone();
    maps[name].needsUpdate = true;
    maps[name].repeat.set(1 / frameCount(pet, name), 1);
  }

  const group = new THREE.Group();
  group.name = pet.name;
  group.userData = {mode: 'rear-art', usesVehicle: false, petId: pet.id, originalName: pet.name};
  const material = new THREE.SpriteMaterial({
    map: maps.portrait,
    transparent: true,
    alphaTest: .16,
    depthTest: true,
    depthWrite: true,
    // 장면 노출에 따라 원본 색이 하얗게 날아가지 않도록 원본 sRGB를 유지한다.
    toneMapped: false,
    fog: true,
  });
  const sprite = new THREE.Sprite(material);
  sprite.name = `${pet.name} 후면 달리기`;
  sprite.center.set(.5, .025);
  sprite.position.y = .04;
  group.add(sprite);
  let phase = 0;
  let lastMap = 'portrait';
  let disposed = false;

  function update(racer = {}, time = 0, dt = 0, {menu = false, reducedMotion = false} = {}) {
    const speed = Math.max(0, Number(racer.speed) || 0);
    const steer = Number(racer.steer) || 0;
    const moving = !menu && speed > 3;
    const cloud = pet.locomotion === 'cloud';
    const spin = moving && pet.sonic && racer.boostTime > 0 && !!maps.boost;
    // 방향키로 옆모습/앞모습을 갈아끼우지 않는다. 정지·출발 대기 때도 앞을 본다.
    let mapName = menu ? (maps.idle ? 'idle' : 'portrait') : 'rear';
    if (spin) mapName = 'boost';
    const fps = spin ? 26 : moving ? cloud ? 5 : 7 + clamp(speed / 82, 0, 1.5) * 6 : menu ? 4 : 0;
    phase += Math.max(0, dt) * fps;
    const frames = frameCount(pet, mapName);
    const frame = (!menu && !moving) || (reducedMotion && menu) ? 0 : Math.floor(phase) % frames;
    const map = maps[mapName];
    if (lastMap !== mapName) {
      material.map = map;
      lastMap = mapName;
    }
    map.offset.x = frame / frames;
    const ratio = mapName === 'rear' ? (pet.rearWidth || 256) / (pet.rearHeight || 320) : (pet.width || 192) / (pet.height || 224);
    const height = spin ? 4.1 : mapName === 'rear' ? 4.2 : 3.9;
    sprite.scale.set(height * ratio, height, 1);
    // 용용이는 원래 구름 위에 앉아 낮게 부유한다. 발구름 동작을 쓰지 않는다.
    sprite.position.y = cloud && !menu ? .32 + (reducedMotion ? 0 : Math.sin(time * 3.2) * .07) : .04;
    // 발 구름은 그림의 네 프레임으로 표현하고, 상체만 조향 방향으로 살짝 기울인다.
    const lean = moving && !spin && !reducedMotion ? -steer * ((racer.drift || racer.drifting) ? .105 : .035) : 0;
    material.rotation = THREE.MathUtils.damp(material.rotation, lean, 14, Math.max(0, dt));
    group.userData.animation = spin ? 'spin-dash' : !menu && cloud ? 'cloud-ride' : moving ? 'running' : 'idle';
    group.userData.frame = frame;
    group.userData.facing = menu ? 'portrait' : 'forward';
    group.userData.texture = mapName;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    material.dispose();
    Object.values(maps).forEach(texture => texture.dispose());
    group.removeFromParent();
  }

  update({}, 0, 0, {menu: true});
  return {group, mode: 'rear-art', usesVehicle: false, update, dispose};
}
