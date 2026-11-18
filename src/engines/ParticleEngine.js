import * as THREE from 'three';

export const PARTICLE_PALETTES = [
  {
    id: 'celestial',
    label: 'Celestial Mist',
    colors: ['#fffdf7', '#f8e3a3', '#d8b4fe', '#38bdf8', '#6366f1'],
    coreTint: '#fff5d6',
    nebulaTint: '#7c3aed',
    nebulaAccent: '#0ea5e9',
  },
  {
    id: 'champagne',
    label: 'Champagne & Rose',
    colors: ['#fffdf8', '#fde68a', '#f8e3a3', '#fb7185', '#c084fc'],
    coreTint: '#fef3c7',
    nebulaTint: '#db2777',
    nebulaAccent: '#f59e0b',
  },
  {
    id: 'aurora',
    label: 'Cyan & Violet',
    colors: ['#f8fafc', '#a5f3fc', '#38bdf8', '#a855f7', '#ec4899'],
    coreTint: '#e0f2fe',
    nebulaTint: '#0284c7',
    nebulaAccent: '#9333ea',
  },
  {
    id: 'nebula',
    label: 'Solar Nebula',
    colors: ['#fffbeb', '#fbbf24', '#fb7185', '#c084fc', '#38bdf8'],
    coreTint: '#fef08a',
    nebulaTint: '#e11d48',
    nebulaAccent: '#6366f1',
  },
];

export const MAX_PARTICLES = 10000;
const STARFIELD_COUNT = 1100;
const NEBULA_CLOUD_COUNT = 140;

const GALAXY_TILT = 0.45;
const GALAXY_POLE = new THREE.Vector3(0, Math.cos(GALAXY_TILT), Math.sin(GALAXY_TILT)).normalize();

const SATURN_TILT_X = 0.44;
const SATURN_TILT_Z = -0.22;
const SATURN_POLE = new THREE.Vector3(0, 1, 0)
  .applyEuler(new THREE.Euler(SATURN_TILT_X, 0, SATURN_TILT_Z, 'XZY'))
  .normalize();

const UP_AXIS = new THREE.Vector3(0, 1, 0);

// Module-scope reusable helpers to keep render loop allocation-free
const _tempColor = new THREE.Color();
const _targetSwirlAxis = new THREE.Vector3();

function detectSoftwareWebGL() {
  try {
    const testCanvas = document.createElement('canvas');
    const gl = testCanvas.getContext('webgl2') || testCanvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

function seededRandom(seed) {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Generates procedural soft cosmic mist texture for galactic dust & nebula clouds.
 */
function createNebulaCloudTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const half = size / 2;

  ctx.clearRect(0, 0, size, size);

  const puffs = [
    { x: half, y: half, r: half, a: 0.55 },
    { x: half * 0.82, y: half * 0.9, r: half * 0.65, a: 0.35 },
    { x: half * 1.18, y: half * 1.08, r: half * 0.6, a: 0.3 },
  ];

  for (const puff of puffs) {
    const grad = ctx.createRadialGradient(puff.x, puff.y, 0, puff.x, puff.y, puff.r);
    grad.addColorStop(0, `rgba(255, 255, 255, ${puff.a})`);
    grad.addColorStop(0.35, `rgba(255, 255, 255, ${puff.a * 0.45})`);
    grad.addColorStop(0.72, `rgba(255, 255, 255, ${puff.a * 0.1})`);
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Generates warm radial galactic core glow texture for the central luminous bulge.
 */
function createCoreHaloTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const half = size / 2;

  const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
  grad.addColorStop(0, 'rgba(255, 253, 245, 0.95)');
  grad.addColorStop(0.14, 'rgba(254, 240, 199, 0.55)');
  grad.addColorStop(0.36, 'rgba(216, 180, 254, 0.2)');
  grad.addColorStop(0.68, 'rgba(56, 189, 248, 0.06)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Generates target XYZ coordinates, structural color weights [0..1], and differential
 * orbital velocities for all six 3D formations across a consistent particle pool.
 */
function buildAllFormations(count) {
  const shapeIds = ['galaxy', 'heart', 'butterfly', 'star', 'saturn', 'flower'];
  const positions = {};
  const colorWeights = {};
  const orbitRates = {};

  for (const id of shapeIds) {
    positions[id] = new Float32Array(count * 3);
    colorWeights[id] = new Float32Array(count);
    orbitRates[id] = new Float32Array(count);
  }

  const kinds = new Float32Array(count);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);

  // Precompute 5-point astral star perimeter vertices (scaled up to match viewport)
  const starVerts = [];
  for (let k = 0; k < 10; k += 1) {
    const angle = (k * Math.PI) / 5 + Math.PI / 2;
    const radius = k % 2 === 0 ? 4.3 : 1.78;
    starVerts.push({
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    });
  }

  const cosGal = Math.cos(GALAXY_TILT);
  const sinGal = Math.sin(GALAXY_TILT);

  for (let i = 0; i < count; i += 1) {
    const i3 = i * 3;
    const r1 = seededRandom(i * 3.1 + 1);
    const r2 = seededRandom(i * 5.7 + 2);
    const r3 = seededRandom(i * 7.3 + 3);
    const r4 = seededRandom(i * 11.9 + 4);
    const r5 = seededRandom(i * 13.7 + 5);

    // Particle optical role: crisp stars (79%), hero diffraction beacons (9%), soft cosmic dust (12%)
    const roleRoll = seededRandom(i * 17.3 + 7);
    if (roleRoll > 0.88) {
      kinds[i] = 2.0; // soft cosmic dust puff
      sizes[i] = 44 + r4 * 46;
    } else if (roleRoll < 0.09) {
      kinds[i] = 1.0; // luminous beacon star
      sizes[i] = 28 + Math.pow(r5, 1.5) * 30;
    } else {
      kinds[i] = 0.0; // crisp starlight
      sizes[i] = 14 + Math.pow(r1, 2.1) * 26;
    }
    phases[i] = r2 * Math.PI * 2;

    // 1. MILKY-WAY INSPIRED GRAND SPIRAL GALAXY (~11+ world units wide -> 70-85% viewport width)
    {
      let gx = 0;
      let gy = 0;
      let gz = 0;
      let galRad = 0;

      if (i < count * 0.16) {
        // Dense elongated luminous white-gold galactic core & bar
        const theta = r1 * Math.PI * 2;
        const phi = Math.acos(2 * r2 - 1);
        const rad = Math.pow(r3, 2.0) * 1.48;
        const bx = rad * Math.sin(phi) * Math.cos(theta) * 1.32;
        const bz = rad * Math.sin(phi) * Math.sin(theta) * 0.92;
        const barRot = 0.42;
        gx = bx * Math.cos(barRot) - bz * Math.sin(barRot);
        gz = bx * Math.sin(barRot) + bz * Math.cos(barRot);
        gy = rad * Math.cos(phi) * 0.52;
        galRad = rad;
        colorWeights.galaxy[i] = Math.min(0.18, (rad / 1.48) * 0.16);
      } else if (i < count * 0.88) {
        // Sweeping logarithmic spiral arms: 2 grand primary arms + 2 softer secondary spurs
        const isPrimary = i % 2 === 0;
        const arm = isPrimary ? (i % 4 === 0 ? 0 : 2) : i % 4 === 1 ? 1 : 3;
        const rad = 0.65 + Math.pow(r1, 0.74) * 4.95; // spans 0.65 .. 5.60
        const spin = rad * 1.02;
        const armBaseAngle = arm * (Math.PI / 2) + (isPrimary ? 0 : 0.22);

        // Organic cluster spread (gaussian-like via r2+r4-1), tighter on primary arms
        const spreadWidth = (isPrimary ? 0.38 : 0.64) + rad * 0.085;
        const scatter = (r2 + r4 - 1.0) * spreadWidth;
        const knotJitter = Math.sin(rad * 2.1 + arm * 1.7) * 0.11;
        const angle = armBaseAngle + spin + scatter + knotJitter;

        const diskThickness = (r3 - 0.5) * 0.48 * Math.exp(-rad * 0.22);
        gx = Math.cos(angle) * rad;
        gz = Math.sin(angle) * rad;
        gy = diskThickness;
        galRad = rad;

        const radNorm = Math.min(1, (rad - 0.5) / 5.1);
        colorWeights.galaxy[i] = Math.max(
          0.14,
          Math.min(0.98, 0.18 + radNorm * 0.76 + (r5 - 0.5) * 0.1)
        );
      } else {
        // Outer galactic halo & trailing peripheral stars
        const theta = r1 * Math.PI * 2;
        const phi = Math.acos(2 * r2 - 1);
        const rad = 2.1 + Math.pow(r3, 0.85) * 3.8;
        gx = rad * Math.sin(phi) * Math.cos(theta);
        gy = rad * Math.cos(phi) * 0.36;
        gz = rad * Math.sin(phi) * Math.sin(theta);
        galRad = rad;
        colorWeights.galaxy[i] = 0.68 + r4 * 0.32;
      }

      // Tilt galactic plane toward viewer so spiral arms read dramatically
      positions.galaxy[i3] = gx;
      positions.galaxy[i3 + 1] = gy * cosGal - gz * sinGal;
      positions.galaxy[i3 + 2] = gy * sinGal + gz * cosGal;

      // Differential Keplerian orbital velocity (inner core orbits faster than outer spiral tips)
      orbitRates.galaxy[i] = 0.36 / (0.68 + galRad * 0.42);
    }

    // 2. 3D SCULPTED HEART
    {
      const t = r1 * Math.PI * 2;
      const hx = 16 * Math.pow(Math.sin(t), 3);
      const hy =
        13 * Math.cos(t) -
        5 * Math.cos(2 * t) -
        2 * Math.cos(3 * t) -
        Math.cos(4 * t);

      const shellBias = r2 < 0.48 ? 0.92 + r3 * 0.08 : 0.32 + Math.pow(r3, 0.54) * 0.68;
      const scale = 0.215 * shellBias;
      const xNorm = Math.min(1, Math.abs(hx) / 16);
      const depthSpan = Math.sqrt(Math.max(0.05, 1 - xNorm * xNorm)) * 1.58 * shellBias;

      positions.heart[i3] = hx * scale;
      positions.heart[i3 + 1] = (hy + 1.8) * scale;
      positions.heart[i3 + 2] = (r4 - 0.5) * 2 * depthSpan;
      colorWeights.heart[i] = Math.min(0.98, 0.1 + shellBias * 0.82);
      orbitRates.heart[i] = 0.0;
    }

    // 3. IRIDESCENT SYMMETRICAL BUTTERFLY
    {
      if (i < count * 0.06) {
        if (r1 < 0.72) {
          positions.butterfly[i3] = (r2 - 0.5) * 0.2;
          positions.butterfly[i3 + 1] = (r3 - 0.5) * 2.55;
          positions.butterfly[i3 + 2] = (r4 - 0.5) * 0.22;
        } else {
          const side = i % 2 === 0 ? 1 : -1;
          const u = r2;
          positions.butterfly[i3] = side * (0.07 + u * 0.62);
          positions.butterfly[i3 + 1] = 1.15 + Math.pow(u, 0.8) * 0.95;
          positions.butterfly[i3 + 2] = u * 0.22;
        }
        colorWeights.butterfly[i] = 0.08 + r4 * 0.12;
      } else {
        const t = r1 * Math.PI * 2;
        const wingR =
          Math.exp(Math.cos(t)) - 2 * Math.cos(4 * t) + Math.pow(Math.sin(t / 12), 5);
        const fill = r2 < 0.34 ? 0.95 + r3 * 0.05 : 0.24 + Math.pow(r3, 0.48) * 0.76;
        const bx = Math.sin(t) * wingR * 1.16 * fill;
        const by = Math.cos(t) * wingR * 1.16 * fill;
        const dihedralZ = Math.abs(bx) * 0.27 + (r4 - 0.5) * 0.18;

        positions.butterfly[i3] = bx;
        positions.butterfly[i3 + 1] = by - 0.18;
        positions.butterfly[i3 + 2] = dihedralZ;
        colorWeights.butterfly[i] = Math.min(0.98, 0.22 + fill * 0.74);
      }
      orbitRates.butterfly[i] = 0.0;
    }

    // 4. FIVE-POINTED FACETED 3D STAR
    {
      const edgeIdx = i % 10;
      const vA = starVerts[edgeIdx];
      const vB = starVerts[(edgeIdx + 1) % 10];
      const apexZ = i % 2 === 0 ? 1.05 : -1.05;

      let u = r1;
      let v = r2;
      if (u + v > 1) {
        u = 1 - u;
        v = 1 - v;
      }
      const w = 1 - u - v;
      const edgeSnap = r3 < 0.25 ? 0.04 : 1;
      const sx = vA.x * u + vB.x * v;
      const sy = vA.y * u + vB.y * v;
      const sz = apexZ * w * edgeSnap + (r4 - 0.5) * 0.09;

      positions.star[i3] = sx;
      positions.star[i3 + 1] = sy - 0.12;
      positions.star[i3 + 2] = sz;
      // Luminous white-gold center ridge/apex transitioning to sapphire/violet points
      colorWeights.star[i] = Math.min(0.98, 0.08 + (1.0 - w) * 0.85);
      orbitRates.star[i] = 0.0;
    }

    // 5. SATURN WITH BANDED ATMOSPHERE & CASSINI RINGS
    {
      let px = 0;
      let py = 0;
      let pz = 0;
      let satRad = 1.0;

      if (i < count * 0.36) {
        const theta = r1 * Math.PI * 2;
        const phi = Math.acos(2 * r2 - 1);
        const rad = 1.66 * (r3 < 0.68 ? 0.96 + r4 * 0.04 : Math.pow(r4, 0.33));
        px = rad * Math.sin(phi) * Math.cos(theta);
        py = rad * Math.cos(phi) * 0.89;
        pz = rad * Math.sin(phi) * Math.sin(theta);
        satRad = rad;
        // Latitudinal atmospheric bands on Saturn sphere
        const band = 0.5 + 0.5 * Math.sin(Math.cos(phi) * 14.0);
        colorWeights.saturn[i] = 0.06 + band * 0.24;
      } else {
        const angle = r1 * Math.PI * 2;
        // Inner C/B ring vs outer A ring separated by crisp dark Cassini division
        const isOuterRing = r2 > 0.56;
        const rad = isOuterRing ? 3.92 + r3 * 1.18 : 2.34 + r3 * 1.18;
        px = Math.cos(angle) * rad;
        py = (r4 - 0.5) * 0.085;
        pz = Math.sin(angle) * rad;
        satRad = rad;
        colorWeights.saturn[i] = isOuterRing ? 0.72 + r3 * 0.25 : 0.42 + r3 * 0.22;
      }

      const y1 = py * Math.cos(SATURN_TILT_X) - pz * Math.sin(SATURN_TILT_X);
      const z1 = py * Math.sin(SATURN_TILT_X) + pz * Math.cos(SATURN_TILT_X);
      positions.saturn[i3] = px * Math.cos(SATURN_TILT_Z) - y1 * Math.sin(SATURN_TILT_Z);
      positions.saturn[i3 + 1] = px * Math.sin(SATURN_TILT_Z) + y1 * Math.cos(SATURN_TILT_Z);
      positions.saturn[i3 + 2] = z1;
      orbitRates.saturn[i] = 0.28 / (0.65 + satRad * 0.34);
    }

    // 6. BLOOMING 3D COSMIC LOTUS FLOWER
    {
      if (i < count * 0.14) {
        const a = r1 * Math.PI * 2;
        const rad = Math.sqrt(r2) * 0.92;
        positions.flower[i3] = Math.cos(a) * rad;
        positions.flower[i3 + 1] = Math.sin(a) * rad;
        positions.flower[i3 + 2] = 0.42 + (1 - rad / 0.92) * 0.42 + (r3 - 0.5) * 0.12;
        colorWeights.flower[i] = 0.04 + (rad / 0.92) * 0.14;
      } else {
        const petalCount = 8;
        const petalIdx = i % petalCount;
        const isInnerTier = petalIdx % 2 === 1;
        const baseAngle = (petalIdx / petalCount) * Math.PI * 2;
        const u = Math.pow(r1, 0.7);
        const petalWidth = Math.sin(u * Math.PI) * 0.44;
        const localAngle = baseAngle + (r2 - 0.5) * petalWidth;
        const maxLen = isInnerTier ? 3.35 : 4.35;
        const rad = 0.6 + u * maxLen;

        const cupLift = Math.pow(u, 1.55) * (isInnerTier ? 1.55 : 0.92);
        positions.flower[i3] = Math.cos(localAngle) * rad;
        positions.flower[i3 + 1] = Math.sin(localAngle) * rad;
        positions.flower[i3 + 2] = cupLift + (r3 - 0.5) * 0.16 - 0.42;
        colorWeights.flower[i] = isInnerTier ? 0.28 + u * 0.36 : 0.58 + u * 0.4;
      }
      orbitRates.flower[i] = 0.0;
    }
  }

  return { positions, colorWeights, orbitRates, kinds, sizes, phases };
}

const VERTEX_SHADER = `
  attribute float aSize;
  attribute float aPhase;
  attribute float aOrbitRate;
  attribute float aKind;

  varying vec3 vColor;
  varying float vAlpha;
  varying float vKind;

  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uPointScale;
  uniform float uTwinkle;
  uniform float uExpansion;
  uniform vec3 uSwirlAxis;
  uniform float uSwirlMix;
  uniform vec3 uAttractPos;
  uniform float uAttractStrength;

  void main() {
    vColor = color;
    vKind = aKind;

    // Differential Keplerian orbital motion on GPU around formation pole axis
    float theta = uTime * aOrbitRate * uSwirlMix;
    float c = cos(theta);
    float s = sin(theta);
    vec3 p = position;
    vec3 swirled = p * c + cross(uSwirlAxis, p) * s + uSwirlAxis * dot(uSwirlAxis, p) * (1.0 - c);

    // Subtle harmonic cosmic breathing & floating dust drift
    float breath = sin(uTime * 1.15 + aPhase) * 0.032;
    vec3 dir = normalize(swirled + vec3(0.0001));
    vec3 worldPos = swirled * uExpansion + dir * breath;

    // Open-Palm local 3D attraction vortex on GPU
    if (uAttractStrength > 0.005) {
      vec3 diff = uAttractPos - worldPos;
      float distSq = dot(diff, diff) + 0.65;
      float pull = min(0.72, (uAttractStrength * 1.45) / distSq);
      worldPos += diff * pull;
    }

    vec4 mvPosition = modelViewMatrix * vec4(worldPos, 1.0);
    float twinkleWave = 0.68 + 0.32 * sin(uTime * 2.5 + aPhase);
    vAlpha = mix(1.0, twinkleWave, uTwinkle);

    float kindSizeMult = aKind > 1.5 ? 2.55 : (aKind > 0.5 ? 1.42 : 1.0);
    float maxPtSize = aKind > 1.5 ? 92.0 : 54.0;
    gl_PointSize = clamp(
      (aSize * kindSizeMult * uPointScale * uPixelRatio) / max(1.0, -mvPosition.z),
      1.4,
      maxPtSize
    );
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const FRAGMENT_SHADER = `
  varying vec3 vColor;
  varying float vAlpha;
  varying float vKind;

  uniform float uGlowIntensity;

  void main() {
    vec2 uv = gl_PointCoord - vec2(0.5);
    float dist = length(uv);
    if (dist > 0.5) discard;

    // Soft cosmic dust clouds vs crisp astronomical stars
    if (vKind > 1.5) {
      float mist = exp(-dist * dist * 16.0);
      float alpha = mist * 0.145 * uGlowIntensity * vAlpha;
      gl_FragColor = vec4(vColor, clamp(alpha, 0.0, 0.5));
      return;
    }

    float core = smoothstep(0.22, 0.0, dist);
    float halo = pow(max(0.0, 1.0 - dist * 2.0), 2.25);
    float flare = 0.0;
    if (vKind > 0.5) {
      // Subtle four-ray astronomical diffraction glint on brightest hero stars
      float rayX = exp(-abs(uv.x) * 26.0) * exp(-abs(uv.y) * 6.5);
      float rayY = exp(-abs(uv.y) * 26.0) * exp(-abs(uv.x) * 6.5);
      flare = (rayX + rayY) * 0.42;
    }

    float intensity = (halo * 0.68 * uGlowIntensity) + core * 0.85 + flare * uGlowIntensity;
    vec3 finalColor = mix(vColor, vec3(1.0, 0.99, 0.96), clamp(core * 0.58 + flare * 0.35, 0.0, 1.0));
    gl_FragColor = vec4(finalColor, clamp(intensity * vAlpha, 0.0, 1.0));
  }
`;

const NEBULA_VERTEX_SHADER = `
  attribute float aSize;
  attribute float aPhase;

  varying vec3 vColor;
  varying float vAlpha;

  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uExpansion;
  uniform float uNebulaVisibility;
  uniform vec3 uSwirlAxis;

  void main() {
    vColor = color;
    float theta = uTime * 0.032 + aPhase * 0.08;
    float c = cos(theta);
    float s = sin(theta);
    vec3 p = position;
    vec3 swirled = p * c + cross(uSwirlAxis, p) * s + uSwirlAxis * dot(uSwirlAxis, p) * (1.0 - c);
    vec3 worldPos = swirled * uExpansion;

    vec4 mvPosition = modelViewMatrix * vec4(worldPos, 1.0);
    vAlpha = uNebulaVisibility * (0.82 + 0.18 * sin(uTime * 0.7 + aPhase));
    gl_PointSize = clamp((aSize * uPixelRatio) / max(1.0, -mvPosition.z), 12.0, 260.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const NEBULA_FRAGMENT_SHADER = `
  varying vec3 vColor;
  varying float vAlpha;

  uniform sampler2D uMap;
  uniform float uGlowIntensity;

  void main() {
    vec4 tex = texture2D(uMap, gl_PointCoord);
    float alpha = tex.a * 0.135 * uGlowIntensity * vAlpha;
    if (alpha < 0.002) discard;
    gl_FragColor = vec4(vColor * tex.rgb, clamp(alpha, 0.0, 0.45));
  }
`;

const BG_VERTEX_SHADER = `
  attribute float aSize;
  attribute float aPhase;

  varying vec3 vColor;
  varying float vAlpha;

  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uTwinkle;

  void main() {
    vColor = color;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float twinkleWave = 0.65 + 0.35 * sin(uTime * 1.9 + aPhase);
    vAlpha = mix(1.0, twinkleWave, uTwinkle);
    gl_PointSize = clamp((aSize * uPixelRatio) / max(1.0, -mvPosition.z), 1.2, 24.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const BG_FRAGMENT_SHADER = `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec2 uv = gl_PointCoord - vec2(0.5);
    float dist = length(uv);
    if (dist > 0.5) discard;
    float core = smoothstep(0.28, 0.0, dist);
    float halo = pow(max(0.0, 1.0 - dist * 2.0), 2.4);
    float alpha = (halo * 0.55 + core * 0.8) * vAlpha;
    gl_FragColor = vec4(mix(vColor, vec3(1.0), core * 0.4), clamp(alpha, 0.0, 1.0));
  }
`;

export class ParticleEngine {
  constructor(mountElement) {
    this.mount = mountElement;
    this.isSoftwareGl = detectSoftwareWebGL();

    const width = Math.max(1, mountElement.clientWidth || window.innerWidth);
    const height = Math.max(1, mountElement.clientHeight || window.innerHeight);
    this.pixelRatio = this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x02040a);

    this.camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 150);
    this._updateCameraFraming(width, height);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(width, height);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';

    mountElement.appendChild(this.renderer.domElement);

    const built = buildAllFormations(MAX_PARTICLES);
    this.formations = built.positions;
    this.shapeColorWeights = built.colorWeights;
    this.shapeOrbitRates = built.orbitRates;
    this.particleKinds = built.kinds;
    this.particleSizes = built.sizes;
    this.particlePhases = built.phases;

    this.currentShape = 'galaxy';
    this.paletteId = 'celestial';
    this.activeCount = MAX_PARTICLES;
    this.morphActive = false;
    this.colorMorphActive = false;

    this.options = {
      glowIntensity: 1.6,
      twinkle: 0.75,
      autoOrbit: true,
      pointScale: 1.6,
    };

    // Live interaction targets updated by VisionContext / pointer controls
    this.interaction = {
      targetRotX: 0.14,
      targetRotY: 0,
      targetOffsetX: 0,
      targetOffsetY: 0,
      targetExpansion: 1.0,
      attractionStrength: 0,
      attractionX: 0,
      attractionY: 0,
      attractionZ: 0.6,
      manualControlActive: false,
    };

    this.smoothed = {
      rotX: 0.14,
      rotY: 0,
      offsetX: 0,
      offsetY: 0,
      expansion: 1.0,
      attractionStrength: 0,
      attractionX: 0,
      attractionY: 0,
      swirlMix: 1.0,
      nebulaVisibility: 1.0,
      swirlAxis: GALAXY_POLE.clone(),
    };

    this.nebulaTexture = createNebulaCloudTexture();
    this.coreHaloTexture = createCoreHaloTexture();

    this._initUniverseGroup();
    this._initParticles();
    this._initNebulaAndCore();
    this._initStarfield();
    this.setPalette(this.paletteId, true);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this._onContextLost = (e) => {
      e.preventDefault();
      this.stop();
    };
    this._onContextRestored = () => {
      this.start();
    };
    this.renderer.domElement.addEventListener('webglcontextlost', this._onContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this._onContextRestored);

    this.rafId = 0;
    this.lastTime = 0;
    this.elapsed = 0;
    this._loop = this._loop.bind(this);
  }

  _updateCameraFraming(width, height) {
    const aspect = width / Math.max(1, height);
    this.camera.aspect = aspect;
    // Frame default Galaxy across ~72–84% of viewport width without cropping on narrower displays
    const targetZ = aspect >= 1.5 ? 9.1 : Math.min(15.2, 9.1 * (1.5 / Math.max(0.62, aspect)));
    this.camera.position.set(0, 0.16, targetZ);
    this.camera.updateProjectionMatrix();
  }

  _initUniverseGroup() {
    // Group holds main stars, cosmic nebula clouds, and core glow halo under unified hand/pointer transforms
    this.universeGroup = new THREE.Group();
    this.universeGroup.rotation.x = this.smoothed.rotX;
    this.universeGroup.rotation.y = this.smoothed.rotY;
    this.scene.add(this.universeGroup);
  }

  _initParticles() {
    this.positions = new Float32Array(this.formations.galaxy);
    this.colors = new Float32Array(MAX_PARTICLES * 3);
    this.targetColors = new Float32Array(MAX_PARTICLES * 3);
    this.orbitRates = new Float32Array(this.shapeOrbitRates.galaxy);

    this.geometry = new THREE.BufferGeometry();
    this.positionAttr = new THREE.BufferAttribute(this.positions, 3);
    this.positionAttr.setUsage(THREE.DynamicDrawUsage);
    this.colorAttr = new THREE.BufferAttribute(this.colors, 3);
    this.colorAttr.setUsage(THREE.DynamicDrawUsage);
    this.orbitRateAttr = new THREE.BufferAttribute(this.orbitRates, 1);
    this.orbitRateAttr.setUsage(THREE.DynamicDrawUsage);

    this.geometry.setAttribute('position', this.positionAttr);
    this.geometry.setAttribute('color', this.colorAttr);
    this.geometry.setAttribute('aOrbitRate', this.orbitRateAttr);
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(this.particleSizes, 1));
    this.geometry.setAttribute('aPhase', new THREE.BufferAttribute(this.particlePhases, 1));
    this.geometry.setAttribute('aKind', new THREE.BufferAttribute(this.particleKinds, 1));
    this.geometry.setDrawRange(0, this.activeCount);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: this.pixelRatio },
        uPointScale: { value: 1.6 },
        uGlowIntensity: { value: 1.6 },
        uTwinkle: { value: 0.75 },
        uExpansion: { value: 1.0 },
        uSwirlAxis: { value: this.smoothed.swirlAxis },
        uSwirlMix: { value: 1.0 },
        uAttractPos: { value: new THREE.Vector3(0, 0, 0.6) },
        uAttractStrength: { value: 0 },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.universeGroup.add(this.points);
  }

  _initNebulaAndCore() {
    const nebPos = new Float32Array(NEBULA_CLOUD_COUNT * 3);
    this.nebulaColors = new Float32Array(NEBULA_CLOUD_COUNT * 3);
    this.nebulaTargetColors = new Float32Array(NEBULA_CLOUD_COUNT * 3);
    const nebSize = new Float32Array(NEBULA_CLOUD_COUNT);
    const nebPhase = new Float32Array(NEBULA_CLOUD_COUNT);
    this.nebulaWeights = new Float32Array(NEBULA_CLOUD_COUNT);

    const cosGal = Math.cos(GALAXY_TILT);
    const sinGal = Math.sin(GALAXY_TILT);

    for (let i = 0; i < NEBULA_CLOUD_COUNT; i += 1) {
      const i3 = i * 3;
      const r1 = seededRandom(i * 4.1 + 19);
      const r2 = seededRandom(i * 6.7 + 31);
      const r3 = seededRandom(i * 9.3 + 47);

      const isCoreCloud = i < NEBULA_CLOUD_COUNT * 0.25;
      let gx = 0;
      let gy = 0;
      let gz = 0;
      if (isCoreCloud) {
        const theta = r1 * Math.PI * 2;
        const rad = r2 * 1.45;
        gx = Math.cos(theta) * rad;
        gz = Math.sin(theta) * rad;
        gy = (r3 - 0.5) * 0.35;
        this.nebulaWeights[i] = 0.08 + (rad / 1.45) * 0.16;
        nebSize[i] = 420 + r3 * 340;
      } else {
        const arm = i % 4;
        const rad = 1.1 + Math.pow(r1, 0.8) * 4.15;
        const angle = arm * (Math.PI / 2) + rad * 1.02 + (r2 - 0.5) * 0.5;
        gx = Math.cos(angle) * rad;
        gz = Math.sin(angle) * rad;
        gy = (r3 - 0.5) * 0.32;
        this.nebulaWeights[i] = 0.28 + ((rad - 1.1) / 4.15) * 0.68;
        nebSize[i] = 520 + r2 * 440;
      }

      nebPos[i3] = gx;
      nebPos[i3 + 1] = gy * cosGal - gz * sinGal;
      nebPos[i3 + 2] = gy * sinGal + gz * cosGal;
      nebPhase[i] = r1 * Math.PI * 2;
    }

    this.nebulaGeometry = new THREE.BufferGeometry();
    this.nebulaGeometry.setAttribute('position', new THREE.BufferAttribute(nebPos, 3));
    this.nebulaColorAttr = new THREE.BufferAttribute(this.nebulaColors, 3);
    this.nebulaColorAttr.setUsage(THREE.DynamicDrawUsage);
    this.nebulaGeometry.setAttribute('color', this.nebulaColorAttr);
    this.nebulaGeometry.setAttribute('aSize', new THREE.BufferAttribute(nebSize, 1));
    this.nebulaGeometry.setAttribute('aPhase', new THREE.BufferAttribute(nebPhase, 1));

    this.nebulaMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: this.pixelRatio },
        uExpansion: { value: 1.0 },
        uGlowIntensity: { value: 1.6 },
        uNebulaVisibility: { value: 1.0 },
        uSwirlAxis: { value: GALAXY_POLE },
        uMap: { value: this.nebulaTexture },
      },
      vertexShader: NEBULA_VERTEX_SHADER,
      fragmentShader: NEBULA_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
    });

    this.nebulaPoints = new THREE.Points(this.nebulaGeometry, this.nebulaMaterial);
    this.nebulaPoints.frustumCulled = false;
    this.universeGroup.add(this.nebulaPoints);

    // Central luminous galactic core aura sprite
    this.coreHaloMaterial = new THREE.SpriteMaterial({
      map: this.coreHaloTexture,
      color: 0xfff5d6,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.coreHaloSprite = new THREE.Sprite(this.coreHaloMaterial);
    this.coreHaloSprite.scale.set(5.4, 4.2, 1.0);
    this.universeGroup.add(this.coreHaloSprite);
  }

  _initStarfield() {
    const bgPos = new Float32Array(STARFIELD_COUNT * 3);
    const bgCol = new Float32Array(STARFIELD_COUNT * 3);
    const bgSize = new Float32Array(STARFIELD_COUNT);
    const bgPhase = new Float32Array(STARFIELD_COUNT);

    for (let i = 0; i < STARFIELD_COUNT; i += 1) {
      const i3 = i * 3;
      const r1 = seededRandom(i * 2.3 + 17);
      const r2 = seededRandom(i * 6.1 + 29);
      const r3 = seededRandom(i * 8.9 + 41);
      const r4 = seededRandom(i * 15.1 + 53);

      const theta = r1 * Math.PI * 2;
      const phi = Math.acos(2 * r2 - 1);
      // Two depth tiers: mid-depth stars & distant deep-space field
      const radius = i % 3 === 0 ? 15 + r3 * 12 : 26 + r3 * 22;

      bgPos[i3] = radius * Math.sin(phi) * Math.cos(theta);
      bgPos[i3 + 1] = radius * Math.cos(phi);
      bgPos[i3 + 2] = radius * Math.sin(phi) * Math.sin(theta) - 8;

      const brightness = 0.48 + r4 * 0.52;
      if (r1 < 0.32) {
        // Cool blue-white stellar tint
        bgCol[i3] = brightness * 0.78;
        bgCol[i3 + 1] = brightness * 0.9;
        bgCol[i3 + 2] = brightness * 1.05;
      } else if (r1 < 0.58) {
        // Warm champagne star tint
        bgCol[i3] = brightness * 1.02;
        bgCol[i3 + 1] = brightness * 0.94;
        bgCol[i3 + 2] = brightness * 0.78;
      } else {
        // Crisp silver-violet tint
        bgCol[i3] = brightness * 0.92;
        bgCol[i3 + 1] = brightness * 0.92;
        bgCol[i3 + 2] = brightness;
      }

      bgSize[i] = 10 + Math.pow(r2, 1.8) * 20;
      bgPhase[i] = r3 * Math.PI * 2;
    }

    this.bgGeometry = new THREE.BufferGeometry();
    this.bgGeometry.setAttribute('position', new THREE.BufferAttribute(bgPos, 3));
    this.bgGeometry.setAttribute('color', new THREE.BufferAttribute(bgCol, 3));
    this.bgGeometry.setAttribute('aSize', new THREE.BufferAttribute(bgSize, 1));
    this.bgGeometry.setAttribute('aPhase', new THREE.BufferAttribute(bgPhase, 1));

    this.bgMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: this.pixelRatio },
        uTwinkle: { value: 0.9 },
      },
      vertexShader: BG_VERTEX_SHADER,
      fragmentShader: BG_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
    });

    this.bgPoints = new THREE.Points(this.bgGeometry, this.bgMaterial);
    this.scene.add(this.bgPoints);
  }

  _recomputeTargetColors(immediate = false) {
    const palette = PARTICLE_PALETTES.find((p) => p.id === this.paletteId) || PARTICLE_PALETTES[0];
    const paletteColors = palette.colors.map((hex) => new THREE.Color(hex));
    const len = paletteColors.length;
    const weights = this.shapeColorWeights[this.currentShape] || this.shapeColorWeights.galaxy;

    for (let i = 0; i < MAX_PARTICLES; i += 1) {
      const i3 = i * 3;
      const ratio = weights[i];
      const scaled = Math.max(0, Math.min(1, ratio)) * (len - 1);
      const idxA = Math.floor(scaled);
      const idxB = Math.min(len - 1, idxA + 1);
      const blend = scaled - idxA;

      _tempColor.copy(paletteColors[idxA]).lerp(paletteColors[idxB], blend);
      this.targetColors[i3] = _tempColor.r;
      this.targetColors[i3 + 1] = _tempColor.g;
      this.targetColors[i3 + 2] = _tempColor.b;

      if (immediate) {
        this.colors[i3] = _tempColor.r;
        this.colors[i3 + 1] = _tempColor.g;
        this.colors[i3 + 2] = _tempColor.b;
      }
    }

    for (let i = 0; i < NEBULA_CLOUD_COUNT; i += 1) {
      const i3 = i * 3;
      const ratio = this.nebulaWeights[i];
      const scaled = ratio * (len - 1);
      const idxA = Math.floor(scaled);
      const idxB = Math.min(len - 1, idxA + 1);
      _tempColor.copy(paletteColors[idxA]).lerp(paletteColors[idxB], scaled - idxA);
      this.nebulaTargetColors[i3] = _tempColor.r;
      this.nebulaTargetColors[i3 + 1] = _tempColor.g;
      this.nebulaTargetColors[i3 + 2] = _tempColor.b;
      if (immediate) {
        this.nebulaColors[i3] = _tempColor.r;
        this.nebulaColors[i3 + 1] = _tempColor.g;
        this.nebulaColors[i3 + 2] = _tempColor.b;
      }
    }

    this.coreHaloMaterial.color.set(palette.coreTint);

    if (immediate) {
      this.colorAttr.needsUpdate = true;
      this.nebulaColorAttr.needsUpdate = true;
      this.colorMorphActive = false;
    } else {
      this.colorMorphActive = true;
    }
  }

  setShape(shapeId) {
    if (this.formations[shapeId] && this.currentShape !== shapeId) {
      this.currentShape = shapeId;
      this.morphActive = true;
      this._recomputeTargetColors(false);
    }
  }

  setPalette(paletteId, immediate = false) {
    const palette = PARTICLE_PALETTES.find((p) => p.id === paletteId) || PARTICLE_PALETTES[0];
    this.paletteId = palette.id;
    this._recomputeTargetColors(immediate);
  }

  setDensity(count) {
    const clamped = Math.max(1500, Math.min(MAX_PARTICLES, Math.floor(count)));
    this.activeCount = clamped;
    this.geometry.setDrawRange(0, clamped);
  }

  setEffects(partial) {
    this.options = { ...this.options, ...partial };
    if (partial.glowIntensity !== undefined) {
      this.material.uniforms.uGlowIntensity.value = partial.glowIntensity;
      this.nebulaMaterial.uniforms.uGlowIntensity.value = partial.glowIntensity;
    }
    if (partial.twinkle !== undefined) {
      this.material.uniforms.uTwinkle.value = partial.twinkle;
      this.bgMaterial.uniforms.uTwinkle.value = Math.min(1.0, partial.twinkle * 1.05);
    }
    if (partial.pointScale !== undefined) {
      this.material.uniforms.uPointScale.value = partial.pointScale;
    }
  }

  setInteraction(partial) {
    Object.assign(this.interaction, partial);
  }

  resize() {
    if (!this.mount) return;
    const width = Math.max(1, this.mount.clientWidth || window.innerWidth);
    const height = Math.max(1, this.mount.clientHeight || window.innerHeight);

    this.pixelRatio = this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    this._updateCameraFraming(width, height);

    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(width, height);
    this.material.uniforms.uPixelRatio.value = this.pixelRatio;
    this.nebulaMaterial.uniforms.uPixelRatio.value = this.pixelRatio;
    this.bgMaterial.uniforms.uPixelRatio.value = this.pixelRatio;
  }

  start() {
    if (this.rafId) return;
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this._loop);
  }

  stop() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      clearTimeout(this.rafId);
      this.rafId = 0;
    }
  }

  destroy() {
    this.stop();
    this.renderer.domElement.removeEventListener('webglcontextlost', this._onContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this._onContextRestored);

    this.geometry.dispose();
    this.material.dispose();
    this.nebulaGeometry.dispose();
    this.nebulaMaterial.dispose();
    this.coreHaloMaterial.dispose();
    this.nebulaTexture.dispose();
    this.coreHaloTexture.dispose();
    this.bgGeometry.dispose();
    this.bgMaterial.dispose();

    this.universeGroup.remove(this.points, this.nebulaPoints, this.coreHaloSprite);
    this.scene.remove(this.universeGroup, this.bgPoints);
    this.renderer.dispose();

    if (this.renderer.domElement.parentNode === this.mount) {
      this.mount.removeChild(this.renderer.domElement);
    }
  }

  _updateParticles(dt) {
    // Smooth global transforms cleanly so missing hands never snap
    this.smoothed.rotX = THREE.MathUtils.damp(
      this.smoothed.rotX,
      this.interaction.targetRotX,
      5.2,
      dt
    );
    if (this.interaction.manualControlActive) {
      this.smoothed.rotY = THREE.MathUtils.damp(
        this.smoothed.rotY,
        this.interaction.targetRotY,
        5.2,
        dt
      );
    } else if (this.options.autoOrbit) {
      this.smoothed.rotY += dt * 0.19;
      this.interaction.targetRotY = this.smoothed.rotY;
    }

    this.smoothed.offsetX = THREE.MathUtils.damp(
      this.smoothed.offsetX,
      this.interaction.targetOffsetX,
      5.0,
      dt
    );
    this.smoothed.offsetY = THREE.MathUtils.damp(
      this.smoothed.offsetY,
      this.interaction.targetOffsetY,
      5.0,
      dt
    );
    this.smoothed.expansion = THREE.MathUtils.damp(
      this.smoothed.expansion,
      this.interaction.targetExpansion,
      5.5,
      dt
    );
    this.smoothed.attractionStrength = THREE.MathUtils.damp(
      this.smoothed.attractionStrength,
      this.interaction.attractionStrength,
      6.0,
      dt
    );
    this.smoothed.attractionX = THREE.MathUtils.damp(
      this.smoothed.attractionX,
      this.interaction.attractionX,
      6.5,
      dt
    );
    this.smoothed.attractionY = THREE.MathUtils.damp(
      this.smoothed.attractionY,
      this.interaction.attractionY,
      6.5,
      dt
    );

    const isSwirlingShape = this.currentShape === 'galaxy' || this.currentShape === 'saturn';
    this.smoothed.swirlMix = THREE.MathUtils.damp(
      this.smoothed.swirlMix,
      isSwirlingShape ? 1.0 : 0.0,
      3.5,
      dt
    );
    const targetNebulaVis = this.currentShape === 'galaxy' ? 1.0 : 0.24;
    this.smoothed.nebulaVisibility = THREE.MathUtils.damp(
      this.smoothed.nebulaVisibility,
      targetNebulaVis,
      3.5,
      dt
    );

    _targetSwirlAxis.copy(
      this.currentShape === 'saturn'
        ? SATURN_POLE
        : this.currentShape === 'galaxy'
          ? GALAXY_POLE
          : UP_AXIS
    );
    this.smoothed.swirlAxis.lerp(_targetSwirlAxis, 1 - Math.exp(-4.5 * dt)).normalize();

    this.universeGroup.rotation.x = this.smoothed.rotX;
    this.universeGroup.rotation.y = this.smoothed.rotY;
    this.universeGroup.position.x = this.smoothed.offsetX;
    this.universeGroup.position.y = this.smoothed.offsetY;

    // Gentle parallax drift for deep-space starfield
    this.bgPoints.rotation.y = this.smoothed.rotY * 0.14;
    this.bgPoints.rotation.x = this.smoothed.rotX * 0.14;

    // Push continuous animation uniforms to GPU shaders
    const matU = this.material.uniforms;
    matU.uExpansion.value = this.smoothed.expansion;
    matU.uSwirlMix.value = this.smoothed.swirlMix;
    matU.uAttractStrength.value = this.smoothed.attractionStrength;
    matU.uAttractPos.value.set(
      this.smoothed.attractionX,
      this.smoothed.attractionY,
      this.interaction.attractionZ
    );

    this.nebulaMaterial.uniforms.uExpansion.value = this.smoothed.expansion;
    this.nebulaMaterial.uniforms.uNebulaVisibility.value = this.smoothed.nebulaVisibility;

    // Pulse galactic core halo sprite softly with expansion and glow settings
    const corePulse = 1.0 + 0.05 * Math.sin(this.elapsed * 1.45);
    const coreScale = this.smoothed.expansion * corePulse;
    this.coreHaloSprite.scale.set(5.4 * coreScale, 4.2 * coreScale, 1.0);
    const baseHaloAlpha = this.currentShape === 'galaxy' ? 0.44 : 0.16;
    this.coreHaloMaterial.opacity = Math.min(
      0.72,
      baseHaloAlpha * this.options.glowIntensity * corePulse
    );

    // Run CPU buffer morphing ONLY while transitioning between shapes or palettes
    if (this.morphActive) {
      const targetArr = this.formations[this.currentShape] || this.formations.galaxy;
      const targetOrbitArr = this.shapeOrbitRates[this.currentShape] || this.shapeOrbitRates.galaxy;
      const posArr = this.positions;
      const orbitArr = this.orbitRates;
      const morphLerp = 1 - Math.exp(-4.2 * dt);

      let maxDelta = 0;
      for (let i = 0; i < MAX_PARTICLES; i += 1) {
        const i3 = i * 3;
        const dx = targetArr[i3] - posArr[i3];
        const dy = targetArr[i3 + 1] - posArr[i3 + 1];
        const dz = targetArr[i3 + 2] - posArr[i3 + 2];

        posArr[i3] += dx * morphLerp;
        posArr[i3 + 1] += dy * morphLerp;
        posArr[i3 + 2] += dz * morphLerp;
        orbitArr[i] += (targetOrbitArr[i] - orbitArr[i]) * morphLerp;

        const absMax = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
        if (absMax > maxDelta) maxDelta = absMax;
      }

      if (maxDelta < 0.002) {
        posArr.set(targetArr);
        orbitArr.set(targetOrbitArr);
        this.morphActive = false;
      }
      this.positionAttr.needsUpdate = true;
      this.orbitRateAttr.needsUpdate = true;
    }

    if (this.colorMorphActive) {
      const colArr = this.colors;
      const targetColArr = this.targetColors;
      const colorLerp = 1 - Math.exp(-3.8 * dt);

      let maxColorDelta = 0;
      for (let i = 0; i < MAX_PARTICLES * 3; i += 1) {
        const dc = targetColArr[i] - colArr[i];
        colArr[i] += dc * colorLerp;
        const absDc = Math.abs(dc);
        if (absDc > maxColorDelta) maxColorDelta = absDc;
      }

      for (let i = 0; i < NEBULA_CLOUD_COUNT * 3; i += 1) {
        this.nebulaColors[i] += (this.nebulaTargetColors[i] - this.nebulaColors[i]) * colorLerp;
      }

      if (maxColorDelta < 0.002) {
        colArr.set(targetColArr);
        this.nebulaColors.set(this.nebulaTargetColors);
        this.colorMorphActive = false;
      }
      this.colorAttr.needsUpdate = true;
      this.nebulaColorAttr.needsUpdate = true;
    }
  }

  _afterSoftwareDraw(cb) {
    const gl = this.renderer.getContext();
    if (!gl || typeof gl.fenceSync !== 'function') {
      this.rafId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      const status = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (status === gl.UNSIGNALED) {
        this.rafId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.rafId = window.setTimeout(cb, 80);
      }
    };
    this.rafId = window.setTimeout(poll, 5);
  }

  _loop(now) {
    const nowMs = typeof now === 'number' ? now : performance.now();
    const dt = Math.min(0.05, Math.max(0.001, (nowMs - this.lastTime) / 1000));
    this.lastTime = nowMs;
    this.elapsed += dt;

    this.material.uniforms.uTime.value = this.elapsed;
    this.nebulaMaterial.uniforms.uTime.value = this.elapsed;
    this.bgMaterial.uniforms.uTime.value = this.elapsed;

    this._updateParticles(dt);
    this.renderer.render(this.scene, this.camera);

    if (this.isSoftwareGl) {
      this._afterSoftwareDraw(this._loop);
    } else {
      this.rafId = requestAnimationFrame(this._loop);
    }
  }
}
