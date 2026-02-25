import React, {
  useState, useEffect, useRef, useCallback,
} from 'react';
import * as THREE from 'three';

/**
 * IRON REVENANT: APEX ARCHITECT (V4.0 - STYLIZED PASS)
 * Stronger comic-book readability, richer environment depth, cleaner gameplay signal.
 */

const GRID_SIZE = 24;
const INITIAL_SEGMENTS = 6;

const METAL_VERTEX = `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(cameraPosition - worldPos.xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const METAL_FRAGMENT = `
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uIntegrity;

  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec2 vUv;

  void main() {
    vec3 n = normalize(vNormal);
    vec3 l1 = normalize(vec3(0.65, 0.72, 0.2));
    vec3 l2 = normalize(vec3(-0.45, 0.55, -0.7));

    float ndlA = max(dot(n, l1), 0.0);
    float ndlB = max(dot(n, l2), 0.0) * 0.4;
    float ndl = clamp(ndlA + ndlB, 0.0, 1.0);

    // Cel ramp (4 bands)
    float ramp = floor(ndl * 4.0) / 4.0;

    float nv = clamp(dot(n, normalize(vViewDir)), 0.0, 1.0);
    float rim = pow(1.0 - nv, 2.0);

    // Mechanical hatch accents
    float hatchA = step(0.94, fract(vUv.y * 14.0 + uTime * 0.2));
    float hatchB = step(0.94, fract(vUv.x * 12.0 - uTime * 0.16));
    float hatch = max(hatchA, hatchB) * 0.14;

    // Panel seam detail
    float seam = step(0.97, fract(vUv.y * 6.0));

    vec3 dark = uColor * 0.24;
    vec3 mid = uColor * 0.65;
    vec3 lit = uColor * 1.22;

    vec3 base = mix(dark, mid, step(0.25, ramp));
    base = mix(base, lit, step(0.75, ramp));

    float edgeInk = smoothstep(0.24, 0.05, nv);
    vec3 ink = vec3(0.015, 0.015, 0.02) * edgeInk;

    float damagePulse = step(0.25, sin(uTime * 15.0));
    vec3 damage = vec3(1.0, 0.15, 0.06) * (1.0 - uIntegrity) * damagePulse;

    vec3 finalColor = base + rim * 0.35 + hatch + seam * 0.08 - ink + damage;
    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

const GROUND_VERTEX = `
  varying vec2 vUv;
  varying vec3 vPos;

  void main() {
    vUv = uv;
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const GROUND_FRAGMENT = `
  varying vec2 vUv;
  varying vec3 vPos;

  void main() {
    float radial = distance(vPos.xz, vec2(0.0));
    float rings = step(0.86, fract(radial * 0.45));
    float plate = step(0.92, fract(vUv.x * 16.0)) + step(0.92, fract(vUv.y * 16.0));
    vec3 sand = vec3(0.34, 0.25, 0.18);
    vec3 shadow = vec3(0.12, 0.08, 0.06);

    vec3 col = mix(sand, shadow, smoothstep(0.0, 34.0, radial));
    col += rings * 0.05;
    col -= min(plate, 1.0) * 0.05;

    gl_FragColor = vec4(col, 1.0);
  }
`;

const createSeededRandom = (seed = 1337) => {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
};

const App = () => {
  const [gameState, setGameState] = useState('TITLE');
  const [integrity, setIntegrity] = useState(100);
  const [torsion, setTorsion] = useState(0);
  const [turnCount, setTurnCount] = useState(0);
  const [flash, setFlash] = useState(0);

  const containerRef = useRef(null);

  const sceneRef = useRef({
    scene: null,
    camera: null,
    renderer: null,
    segments: [],
    food: null,
    clock: new THREE.Clock(),
    targetPath: Array.from({ length: INITIAL_SEGMENTS }, (_, i) => ({ x: 0, z: i })),
    lerpPath: Array.from({ length: INITIAL_SEGMENTS }, (_, i) => ({ x: 0, z: i })),
  });

  const logicRef = useRef({
    dir: { x: 0, z: -1 },
  });

  const createArticulatedSegment = (isHead = false) => {
    const group = new THREE.Group();

    const chassisGeom = isHead
      ? new THREE.BoxGeometry(0.95, 0.75, 1.3)
      : new THREE.CylinderGeometry(0.5, 0.5, 0.92, 12);

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: isHead ? new THREE.Color(0x69e4ff) : new THREE.Color(0xa6b7c8) },
        uIntegrity: { value: 1.0 },
      },
      vertexShader: METAL_VERTEX,
      fragmentShader: METAL_FRAGMENT,
    });

    const chassis = new THREE.Mesh(chassisGeom, material);
    if (!isHead) chassis.rotation.x = Math.PI / 2;
    chassis.castShadow = true;
    chassis.receiveShadow = true;
    group.add(chassis);

    if (isHead) {
      const eyeMat = new THREE.MeshStandardMaterial({
        color: 0xfff7df,
        emissive: 0xff9f2b,
        emissiveIntensity: 1.9,
      });
      const eyeGeom = new THREE.BoxGeometry(0.24, 0.12, 0.08);
      const eyeL = new THREE.Mesh(eyeGeom, eyeMat);
      eyeL.position.set(0.2, 0.2, -0.66);
      const eyeR = eyeL.clone();
      eyeR.position.x = -0.2;
      group.add(eyeL, eyeR);
    } else {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.56, 0.05, 12, 48),
        new THREE.MeshStandardMaterial({
          color: 0x28333d,
          metalness: 0.75,
          roughness: 0.38,
        }),
      );
      ring.rotation.x = Math.PI / 2;
      group.add(ring);
    }

    const outline = new THREE.Mesh(
      chassisGeom,
      new THREE.MeshBasicMaterial({ color: 0x030303, side: THREE.BackSide }),
    );
    outline.scale.setScalar(1.11);
    group.add(outline);

    return group;
  };

  const spawnSiphon = () => {
    const { scene } = sceneRef.current;
    if (!scene) return;

    if (sceneRef.current.food) {
      scene.remove(sceneRef.current.food);
    }

    const group = new THREE.Group();

    const shell = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.46, 1),
      new THREE.MeshStandardMaterial({
        color: 0xffe8bc,
        emissive: 0xff8f2e,
        emissiveIntensity: 2.2,
        metalness: 0.8,
        roughness: 0.15,
      }),
    );
    group.add(shell);

    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.7, 0.03, 12, 64),
      new THREE.MeshBasicMaterial({ color: 0xff8b2f }),
    );
    halo.rotation.x = Math.PI / 2;
    group.add(halo);

    const light = new THREE.PointLight(0xff9a40, 3.5, 11);
    group.add(light);

    group.position.set(
      Math.floor(Math.random() * (GRID_SIZE - 2) - (GRID_SIZE - 2) / 2),
      1.15,
      Math.floor(Math.random() * (GRID_SIZE - 2) - (GRID_SIZE - 2) / 2),
    );

    scene.add(group);
    sceneRef.current.food = group;
  };

  useEffect(() => {
    if (!containerRef.current) return undefined;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a100b);
    scene.fog = new THREE.FogExp2(0x1a100b, 0.021);

    const camera = new THREE.PerspectiveCamera(47, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(17, 15, 17);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.38;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    containerRef.current.appendChild(renderer.domElement);

    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(150, 32, 24),
      new THREE.MeshBasicMaterial({ color: 0x3f2413, side: THREE.BackSide }),
    );
    scene.add(sky);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(130, 130),
      new THREE.ShaderMaterial({
        vertexShader: GROUND_VERTEX,
        fragmentShader: GROUND_FRAGMENT,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.02;
    floor.receiveShadow = true;
    scene.add(floor);

    const grid = new THREE.GridHelper(GRID_SIZE, GRID_SIZE, 0xffc14f, 0x4a3527);
    grid.position.y = 0.02;
    grid.material.transparent = true;
    grid.material.opacity = 0.55;
    scene.add(grid);

    scene.add(new THREE.AmbientLight(0xf5bd82, 0.45));

    const keyLight = new THREE.DirectionalLight(0xfff1c9, 1.6);
    keyLight.position.set(11, 20, 8);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 80;
    keyLight.shadow.camera.left = -18;
    keyLight.shadow.camera.right = 18;
    keyLight.shadow.camera.top = 18;
    keyLight.shadow.camera.bottom = -18;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xffa859, 0.95);
    fillLight.position.set(-12, 10, -14);
    scene.add(fillLight);

    const backGlow = new THREE.PointLight(0xff7a29, 2.25, 45);
    backGlow.position.set(0, 8, -16);
    scene.add(backGlow);

    const random = createSeededRandom(2402);
    const skyline = new THREE.Group();
    for (let i = 0; i < 34; i += 1) {
      const w = 1 + random() * 2.1;
      const h = 1 + random() * 9;
      const d = 1 + random() * 2.1;
      const rock = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshStandardMaterial({
          color: random() > 0.5 ? 0x301f14 : 0x26170f,
          roughness: 0.92,
          metalness: 0.02,
        }),
      );
      const angle = (i / 34) * Math.PI * 2;
      const radius = 16 + random() * 8;
      rock.position.set(Math.cos(angle) * radius, 0.5, Math.sin(angle) * radius);
      rock.rotation.y = random() * Math.PI;
      rock.castShadow = true;
      rock.receiveShadow = true;

      const inkOutline = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshBasicMaterial({ color: 0x050505, side: THREE.BackSide }),
      );
      inkOutline.scale.setScalar(1.06);
      rock.add(inkOutline);

      skyline.add(rock);
    }
    scene.add(skyline);

    sceneRef.current = {
      ...sceneRef.current,
      scene,
      camera,
      renderer,
    };

    const segs = [];
    for (let i = 0; i < INITIAL_SEGMENTS; i += 1) {
      const segment = createArticulatedSegment(i === 0);
      scene.add(segment);
      segs.push(segment);
    }
    sceneRef.current.segments = segs;

    spawnSiphon();

    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);

      const time = sceneRef.current.clock.getElapsedTime();
      const {
        segments, targetPath, lerpPath, food,
      } = sceneRef.current;

      sky.rotation.y = time * 0.01;
      skyline.rotation.y = -time * 0.015;

      segments.forEach((segment, i) => {
        lerpPath[i].x = THREE.MathUtils.lerp(lerpPath[i].x, targetPath[i].x, 0.2);
        lerpPath[i].z = THREE.MathUtils.lerp(lerpPath[i].z, targetPath[i].z, 0.2);

        segment.position.set(
          lerpPath[i].x,
          0.68 + Math.sin(time * 2.6 + i * 0.4) * 0.07,
          lerpPath[i].z,
        );

        if (i < segments.length - 1) {
          const dx = lerpPath[i].x - lerpPath[i + 1].x;
          const dz = lerpPath[i].z - lerpPath[i + 1].z;
          if (Math.abs(dx) > 0.01 || Math.abs(dz) > 0.01) {
            segment.rotation.y = Math.atan2(dx, dz);
          }
        }

        const mesh = segment.children[0];
        if (mesh?.material?.uniforms) {
          mesh.material.uniforms.uTime.value = time;
          mesh.material.uniforms.uIntegrity.value = integrity / 100;
        }
      });

      if (food) {
        food.rotation.y += 0.032;
        food.rotation.z += 0.014;
        food.position.y = 1.15 + Math.sin(time * 4.0) * 0.2;
      }

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
    };
  }, []);

  const resolveTurn = useCallback(() => {
    const {
      targetPath, food, segments, scene,
    } = sceneRef.current;

    const { dir } = logicRef.current;

    const newHead = { x: targetPath[0].x + dir.x, z: targetPath[0].z + dir.z };

    if (
      Math.abs(newHead.x) > GRID_SIZE / 2
      || Math.abs(newHead.z) > GRID_SIZE / 2
      || targetPath.some((p) => p.x === newHead.x && p.z === newHead.z)
    ) {
      setIntegrity((prev) => Math.max(0, prev - 20));
      setFlash(0.95);
      setTimeout(() => setFlash(0), 95);
      return;
    }

    const newPath = [newHead, ...targetPath];
    const dist = Math.hypot(newHead.x - food.position.x, newHead.z - food.position.z);

    if (dist < 1.0) {
      spawnSiphon();
      setFlash(0.28);
      setTimeout(() => setFlash(0), 80);

      const segment = createArticulatedSegment(false);
      scene.add(segment);
      segments.push(segment);
      sceneRef.current.lerpPath.push({ ...newPath[newPath.length - 1] });

      setTorsion((t) => Math.min(100, t + 15));
    } else {
      newPath.pop();
    }

    sceneRef.current.targetPath = newPath;
    setTurnCount((t) => t + 1);
  }, []);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (gameState !== 'PLAYING' || integrity <= 0) return;

      const d = logicRef.current.dir;
      let valid = false;

      if (e.key === 'ArrowUp' && d.z !== 1) {
        logicRef.current.dir = { x: 0, z: -1 };
        valid = true;
      }
      if (e.key === 'ArrowDown' && d.z !== -1) {
        logicRef.current.dir = { x: 0, z: 1 };
        valid = true;
      }
      if (e.key === 'ArrowLeft' && d.x !== 1) {
        logicRef.current.dir = { x: -1, z: 0 };
        valid = true;
      }
      if (e.key === 'ArrowRight' && d.x !== -1) {
        logicRef.current.dir = { x: 1, z: 0 };
        valid = true;
      }

      if (valid) {
        e.preventDefault();
        resolveTurn();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [gameState, integrity, resolveTurn]);

  return (
    <div className="w-full h-screen bg-black text-white font-mono overflow-hidden select-none">
      <div ref={containerRef} className="absolute inset-0" />

      <div
        className="absolute inset-0 pointer-events-none transition-all duration-75"
        style={{
          background: flash > 0 ? 'rgba(255,188,82,0.95)' : 'transparent',
          mixBlendMode: 'screen',
          opacity: flash,
        }}
      />

      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_50%,rgba(255,185,96,0.08),rgba(0,0,0,0.7)_65%)]" />

      <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-6 md:p-8">
        <div className="flex justify-between items-start gap-4">
          <div className="bg-amber-300 text-black px-5 py-3 md:px-7 md:py-4 border-4 border-black shadow-[8px_8px_0px_#2a1a10]">
            <h1 className="text-3xl md:text-5xl font-black leading-none">IRON REVENANT</h1>
            <div className="text-[10px] md:text-xs font-bold tracking-[0.35em] mt-1 opacity-80">APEX ARCHITECT // V4.0</div>
          </div>

          <div className="bg-black/72 border-2 border-amber-300/80 px-4 py-3 md:px-5 md:py-4 backdrop-blur-sm shadow-[4px_4px_0px_#1b1b1b]">
            <div className="text-[10px] text-amber-200 font-bold mb-1">UNIT STATUS</div>
            <div className="text-xl md:text-3xl font-black">{integrity > 40 ? 'ACTIVE' : 'CRITICAL'}</div>
          </div>
        </div>

        {gameState === 'TITLE' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm pointer-events-auto z-50">
            <div className="text-center px-8">
              <button
                onClick={() => setGameState('PLAYING')}
                className="px-10 py-5 md:px-16 md:py-6 bg-amber-300 border-4 border-black text-black text-2xl md:text-3xl font-black hover:bg-yellow-200 transition-all shadow-[10px_10px_0px_#2d1d13]"
              >
                ENGAGE SYSTEM
              </button>
              <p className="mt-5 text-amber-300 font-bold tracking-[0.18em]">Use Arrow Keys</p>
            </div>
          </div>
        )}

        {integrity <= 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-900/95 pointer-events-auto z-50">
            <h2 className="text-6xl md:text-8xl font-black leading-none mb-8">CORE VOID</h2>
            <button
              onClick={() => window.location.reload()}
              className="px-10 py-4 bg-black text-white text-xl font-black hover:bg-white hover:text-black transition-all"
            >
              RECONSTRUCT
            </button>
          </div>
        )}

        <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-5 md:gap-8">
          <div className="flex-1 bg-black/65 p-4 border-2 border-amber-300/60 backdrop-blur-sm">
            <div className="flex justify-between text-xs md:text-sm font-bold mb-2 tracking-widest">
              <span>HULL INTEGRITY</span>
              <span className={integrity < 30 ? 'text-red-400' : 'text-amber-200'}>{integrity}%</span>
            </div>
            <div className="h-4 w-full bg-slate-950 border border-white/20">
              <div
                className={`h-full transition-all duration-200 ${integrity < 30 ? 'bg-red-500' : 'bg-amber-300'}`}
                style={{ width: `${integrity}%` }}
              />
            </div>
          </div>

          <div className="flex gap-4">
            <div className="bg-black/70 border-2 border-amber-300/50 px-4 py-3 min-w-[120px] text-right">
              <div className="text-[10px] font-bold text-amber-200 tracking-wider">TORSION</div>
              <div className="text-3xl font-black">{torsion}%</div>
            </div>
            <div className="bg-black/70 border-2 border-white/40 px-4 py-3 min-w-[120px] text-right">
              <div className="text-[10px] font-bold opacity-70 uppercase">Cycles</div>
              <div className="text-3xl font-black">{turnCount}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute inset-0 pointer-events-none opacity-20 [background-image:radial-gradient(rgba(255,255,255,0.06)_0.6px,transparent_0.6px)] [background-size:2px_2px]" />
      <div className="absolute inset-0 pointer-events-none opacity-16 bg-[linear-gradient(rgba(0,0,0,0.42)_50%,rgba(0,0,0,0.08)_50%)] bg-[length:100%_4px]" />
    </div>
  );
};

export default App;
