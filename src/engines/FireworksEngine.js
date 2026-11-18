export const FIREWORK_PATTERNS = [
  { id: 'golden-peony', label: 'Golden Peony' },
  { id: 'crimson-chrysanthemum', label: 'Crimson Chrysanthemum' },
  { id: 'golden-willow', label: 'Golden Willow' },
  { id: 'red-gold-ring', label: 'Red & Gold Ring' },
  { id: 'celebration-burst', label: 'Celebration Burst' },
];

export const FIREWORK_PALETTES = [
  {
    id: 'imperial',
    label: 'Champagne Gold',
    colors: ['#fffbeb', '#fef08a', '#f8e3a3', '#f59e0b', '#fb7185'],
    accent: '#f43f5e',
    secondaryAccent: '#c084fc',
    ember: '#f59e0b',
    core: '#fffef9',
    flashRgb: '248, 227, 163',
    flash: 'rgba(248, 227, 163, 0.22)',
  },
  {
    id: 'crimson',
    label: 'Crimson & Rose',
    colors: ['#fff1f2', '#fda4af', '#fb7185', '#e11d48', '#fde68a'],
    accent: '#f8e3a3',
    secondaryAccent: '#e879f9',
    ember: '#e11d48',
    core: '#fff9f5',
    flashRgb: '244, 63, 94',
    flash: 'rgba(244, 63, 94, 0.22)',
  },
  {
    id: 'jade',
    label: 'Celadon & Pearl',
    colors: ['#ecfdf5', '#a7f3d0', '#fde68a', '#38bdf8', '#fda4af'],
    accent: '#6ee7b7',
    secondaryAccent: '#a78bfa',
    ember: '#38bdf8',
    core: '#ffffff',
    flashRgb: '110, 231, 183',
    flash: 'rgba(110, 231, 183, 0.2)',
  },
  {
    id: 'festival',
    label: 'Grand Gala',
    colors: ['#fef3c7', '#f8e3a3', '#fb7185', '#c084fc', '#38bdf8', '#f59e0b'],
    accent: '#e11d48',
    secondaryAccent: '#38bdf8',
    ember: '#a855f7',
    core: '#fffdf9',
    flashRgb: '251, 191, 36',
    flash: 'rgba(251, 191, 36, 0.22)',
  },
];

const MAX_PARTICLES = 3800;
const MAX_SUB_SHELLS = 48;

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * High-luminance radial halo sprite cached per color for zero-allocation bloom rendering.
 */
function createHaloSprite(hexColor, size = 64) {
  const off = document.createElement('canvas');
  off.width = size;
  off.height = size;
  const ctx = off.getContext('2d');
  const half = size / 2;
  const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
  grad.addColorStop(0, 'rgba(255, 254, 248, 0.96)');
  grad.addColorStop(0.14, `${hexColor}e6`);
  grad.addColorStop(0.38, `${hexColor}66`);
  grad.addColorStop(0.7, `${hexColor}1a`);
  grad.addColorStop(1, `${hexColor}00`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return off;
}

/**
 * Crisp star-tip core sprite for bright sparkling firework heads.
 */
function createCoreSprite(hexColor, size = 24) {
  const off = document.createElement('canvas');
  off.width = size;
  off.height = size;
  const ctx = off.getContext('2d');
  const half = size / 2;
  const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
  grad.addColorStop(0, 'rgba(255, 255, 252, 1)');
  grad.addColorStop(0.28, `${hexColor}cc`);
  grad.addColorStop(0.65, `${hexColor}26`);
  grad.addColorStop(1, `${hexColor}00`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return off;
}

export class FireworksEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });

    // Dedicated persistence layer for luminous trails and cascading embers
    this.trailCanvas = document.createElement('canvas');
    this.trailCtx = this.trailCanvas.getContext('2d');

    this.width = 0;
    this.height = 0;
    this.dpr = 1;

    this.rockets = [];
    this.particles = [];
    this.subShells = [];
    this.skyFlashes = [];
    this.shockwaves = [];
    this.stars = [];
    this.lanterns = [];

    this.glowSprites = new Map();
    this.coreSprites = new Map();
    this.lastTrailPoint = null;
    this.trailCursor = null;

    this.options = {
      pattern: 'golden-peony',
      palette: 'imperial',
      explosionSize: 1.0,
      celebrationMode: false,
      celebrationFrequency: 1.2,
      paused: false,
    };

    this.rafId = 0;
    this.lastTime = 0;
    this.celebrationTimer = 0;

    this._initStarsAndLanterns();
    this.resize();
    this._loop = this._loop.bind(this);
  }

  _getSprite(hexColor) {
    if (!this.glowSprites.has(hexColor)) {
      this.glowSprites.set(hexColor, createHaloSprite(hexColor, 64));
    }
    return this.glowSprites.get(hexColor);
  }

  _getCoreSprite(hexColor) {
    if (!this.coreSprites.has(hexColor)) {
      this.coreSprites.set(hexColor, createCoreSprite(hexColor, 24));
    }
    return this.coreSprites.get(hexColor);
  }

  _getPalette(paletteId = this.options.palette) {
    return FIREWORK_PALETTES.find((p) => p.id === paletteId) || FIREWORK_PALETTES[0];
  }

  /**
   * Computes viewport-adaptive spatial scale so standard bursts span ~32–44%
   * of screen width and grand bursts reach ~48–55% across laptop/desktop aspect ratios.
   */
  _computeBurstScale(scale = 1.0) {
    const targetSpan = Math.min(
      this.width * 0.45,
      Math.max(this.width * 0.255, this.height * 0.44)
    );
    return (targetSpan / 172) * scale;
  }

  _initStarsAndLanterns() {
    this.stars = Array.from({ length: 120 }, () => ({
      nx: Math.random(),
      ny: Math.random() * 0.74,
      r: randomRange(0.55, 1.5),
      phase: Math.random() * Math.PI * 2,
      speed: randomRange(0.65, 2.1),
      warm: Math.random() < 0.3,
    }));

    this.lanterns = [
      { nx: 0.055, ny: 0.105, scale: 0.88, phase: 0.2 },
      { nx: 0.125, ny: 0.075, scale: 0.66, phase: 1.4 },
      { nx: 0.875, ny: 0.075, scale: 0.68, phase: 2.3 },
      { nx: 0.945, ny: 0.105, scale: 0.9, phase: 3.1 },
    ];
  }

  start() {
    if (this.rafId) return;
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this._loop);
  }

  stop() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  destroy() {
    this.stop();
    this.rockets = [];
    this.particles = [];
    this.subShells = [];
    this.skyFlashes = [];
    this.shockwaves = [];
    this.glowSprites.clear();
    this.coreSprites.clear();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const cssWidth = Math.max(1, Math.floor(rect.width || window.innerWidth));
    const cssHeight = Math.max(1, Math.floor(rect.height || window.innerHeight));
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.width = cssWidth;
    this.height = cssHeight;

    this.canvas.width = Math.floor(cssWidth * this.dpr);
    this.canvas.height = Math.floor(cssHeight * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    this.trailCanvas.width = Math.floor(cssWidth * this.dpr);
    this.trailCanvas.height = Math.floor(cssHeight * this.dpr);
    this.trailCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  setOptions(partial) {
    this.options = { ...this.options, ...partial };
  }

  clear() {
    this.rockets = [];
    this.particles = [];
    this.subShells = [];
    this.skyFlashes = [];
    this.shockwaves = [];
    this.lastTrailPoint = null;
    this.trailCursor = null;
    this.trailCtx.clearRect(0, 0, this.width, this.height);
  }

  togglePause() {
    this.options.paused = !this.options.paused;
    return this.options.paused;
  }

  setTrailCursor(point) {
    this.trailCursor = point;
  }

  endTrail() {
    this.lastTrailPoint = null;
  }

  /**
   * Draws a luminous champagne-gold light ribbon with fine falling ember dust
   * following fingertip movement.
   */
  drawTrailPoint(x, y) {
    if (this.options.paused) return;

    const palette = this._getPalette();
    const prev = this.lastTrailPoint;
    this.lastTrailPoint = { x, y };
    this.trailCursor = { x, y };

    const tCtx = this.trailCtx;
    tCtx.save();
    tCtx.globalCompositeOperation = 'lighter';

    if (prev) {
      const dist = Math.hypot(x - prev.x, y - prev.y);
      if (dist > 0 && dist < 240) {
        // Soft luminous outer aura
        tCtx.strokeStyle = `${palette.colors[1]}48`;
        tCtx.lineWidth = 4.6;
        tCtx.lineCap = 'round';
        tCtx.beginPath();
        tCtx.moveTo(prev.x, prev.y);
        tCtx.lineTo(x, y);
        tCtx.stroke();

        // Crisp incandescent core filament
        const grad = tCtx.createLinearGradient(prev.x, prev.y, x, y);
        grad.addColorStop(0, palette.colors[1]);
        grad.addColorStop(1, palette.core);
        tCtx.strokeStyle = grad;
        tCtx.lineWidth = 1.65;
        tCtx.beginPath();
        tCtx.moveTo(prev.x, prev.y);
        tCtx.lineTo(x, y);
        tCtx.stroke();

        const sparkCount = Math.min(4, Math.floor(dist / 13));
        for (let i = 0; i < sparkCount; i += 1) {
          const t = Math.random();
          this._spawnParticle({
            x: prev.x + (x - prev.x) * t + randomRange(-2, 2),
            y: prev.y + (y - prev.y) * t + randomRange(-2, 2),
            vx: randomRange(-24, 24),
            vy: randomRange(-18, 28),
            gravity: 52,
            drag: 0.966,
            life: randomRange(0.55, 1.05),
            lineWidth: 0.9,
            headRadius: 1.15,
            glowSize: i === 0 ? 10 : 0,
            color: pickRandom(palette.colors),
            emberColor: palette.ember,
            twinkle: true,
            priority: 0,
          });
        }
      }
    } else {
      const sprite = this._getSprite(palette.colors[1]);
      tCtx.globalAlpha = 0.72;
      tCtx.drawImage(sprite, x - 9, y - 9, 18, 18);
    }

    tCtx.restore();
  }

  /**
   * Launches an ascending shell from the lower skyline to (targetX, targetY).
   */
  launchFirework(targetX, targetY, overrides = {}) {
    if (this.options.paused) {
      this.options.paused = false;
    }

    const pattern = overrides.pattern ?? this.options.pattern;
    const paletteId = overrides.palette ?? this.options.palette;
    const sizeVariance = overrides.explosionSize !== undefined ? 1.0 : randomRange(0.86, 1.16);
    const size = (overrides.explosionSize ?? this.options.explosionSize) * sizeVariance;
    const delay = overrides.delay ?? 0;

    const tx = targetX ?? randomRange(this.width * 0.15, this.width * 0.85);
    const ty = targetY ?? randomRange(this.height * 0.16, this.height * 0.43);

    const startX = tx + randomRange(-44, 44);
    const startY = this.height + 10;
    const duration = overrides.duration ?? randomRange(0.34, 0.5);
    const palette = this._getPalette(paletteId);

    this.rockets.push({
      x: startX,
      y: startY,
      prevX: startX,
      prevY: startY,
      startX,
      startY,
      targetX: tx,
      targetY: ty,
      elapsed: -delay,
      duration,
      pattern,
      paletteId,
      size,
      color: palette.core,
      trailColor: palette.colors[1] || palette.core,
    });
  }

  /**
   * Two-hand / Side interaction: launches a single firework on the corresponding screen side.
   */
  launchSideFirework(side, targetX, targetY) {
    const x =
      targetX ??
      (side === 'left'
        ? randomRange(this.width * 0.16, this.width * 0.42)
        : randomRange(this.width * 0.58, this.width * 0.84));
    const y = targetY ?? randomRange(this.height * 0.17, this.height * 0.4);
    this.launchFirework(x, y);
  }

  /**
   * Two Open Palms: launches two large, synchronized panoramic fireworks simultaneously.
   */
  launchDualFireworks(leftPos, rightPos) {
    const lx = leftPos?.x ?? this.width * 0.27;
    const ly = leftPos?.y ?? this.height * 0.27;
    const rx = rightPos?.x ?? this.width * 0.73;
    const ry = rightPos?.y ?? this.height * 0.27;

    this.launchFirework(lx, ly, {
      explosionSize: this.options.explosionSize * 1.12,
      duration: 0.36,
    });
    this.launchFirework(rx, ry, {
      explosionSize: this.options.explosionSize * 1.12,
      duration: 0.38,
      delay: 0.04,
    });
  }

  /**
   * Two Open Palms Moving Apart: choreographs a multi-layered panoramic grand finale
   * spanning nearly the entire sky width with mixed luxury patterns & jewel palettes.
   */
  launchGrandFinaleSpread(spreadNorm = 0.78) {
    if (this.options.paused) {
      this.options.paused = false;
    }

    const halfSpan = Math.max(0.32, Math.min(0.43, spreadNorm * 0.56));
    const finaleSpecs = [
      {
        nx: 0.5 - halfSpan,
        ny: 0.34,
        pattern: 'golden-willow',
        palette: this.options.palette,
        scale: 1.12,
        delay: 0.0,
      },
      {
        nx: 0.5 - halfSpan * 0.68,
        ny: 0.21,
        pattern: 'crimson-chrysanthemum',
        palette: 'crimson',
        scale: 1.05,
        delay: 0.08,
      },
      {
        nx: 0.5 - halfSpan * 0.34,
        ny: 0.29,
        pattern: 'red-gold-ring',
        palette: 'festival',
        scale: 1.08,
        delay: 0.15,
      },
      {
        nx: 0.5,
        ny: 0.23,
        pattern: 'celebration-burst',
        palette: 'festival',
        scale: 1.36,
        delay: 0.18,
      },
      {
        nx: 0.5 + halfSpan * 0.34,
        ny: 0.29,
        pattern: 'red-gold-ring',
        palette: 'imperial',
        scale: 1.08,
        delay: 0.15,
      },
      {
        nx: 0.5 + halfSpan * 0.68,
        ny: 0.21,
        pattern: 'crimson-chrysanthemum',
        palette: 'festival',
        scale: 1.05,
        delay: 0.08,
      },
      {
        nx: 0.5 + halfSpan,
        ny: 0.34,
        pattern: 'golden-willow',
        palette: 'imperial',
        scale: 1.12,
        delay: 0.0,
      },
    ];

    finaleSpecs.forEach((spec) => {
      this.launchFirework(this.width * spec.nx, this.height * spec.ny, {
        pattern: spec.pattern,
        palette: spec.palette,
        explosionSize: this.options.explosionSize * spec.scale,
        delay: spec.delay,
        duration: 0.38,
      });
    });
  }

  /**
   * Two Hands Moving Closer Together: launches a monumental multi-layered focal burst.
   */
  launchConcentratedBurst(centerX, centerY) {
    if (this.options.paused) {
      this.options.paused = false;
    }
    const cx = centerX ?? this.width * 0.5;
    const cy = centerY ?? this.height * 0.28;

    this.launchFirework(cx, cy, {
      pattern: 'celebration-burst',
      explosionSize: this.options.explosionSize * 1.28,
      duration: 0.32,
    });
    this.launchFirework(cx, cy - 14, {
      pattern: 'red-gold-ring',
      palette: 'festival',
      explosionSize: this.options.explosionSize * 1.04,
      delay: 0.09,
      duration: 0.3,
    });
    this.launchFirework(cx + randomRange(-24, 24), cy + 12, {
      pattern: 'golden-willow',
      palette: 'imperial',
      explosionSize: this.options.explosionSize * 1.08,
      delay: 0.16,
      duration: 0.3,
    });
  }

  _spawnParticle(p) {
    const priority = p.priority ?? 1;
    if (this.particles.length >= MAX_PARTICLES) {
      if (priority === 0) return;
      // Replace a random older-half slot in O(1) without blocking array shifts
      const idx = Math.floor(Math.random() * (MAX_PARTICLES * 0.55));
      this.particles[idx] = this._createParticleRecord(p);
      return;
    }
    this.particles.push(this._createParticleRecord(p));
  }

  _createParticleRecord(p) {
    return {
      x: p.x,
      y: p.y,
      prevX: p.x,
      prevY: p.y,
      vx: p.vx,
      vy: p.vy,
      gravity: p.gravity ?? 86,
      drag: p.drag ?? 0.96,
      age: 0,
      life: p.life ?? 1.55,
      lineWidth: p.lineWidth ?? 1.35,
      headRadius: p.headRadius ?? 1.75,
      glowSize: p.glowSize ?? 0,
      color: p.color ?? '#f8e3a3',
      emberColor: p.emberColor ?? p.color ?? '#f59e0b',
      coreColor: p.coreColor ?? '#fffef8',
      depthAlpha: p.depthAlpha ?? 1.0,
      twinkle: p.twinkle ?? false,
      seed: Math.random() * 20,
      branchChance: p.branchChance ?? 0,
      branched: false,
      microBurst: p.microBurst ?? false,
      emberShed: p.emberShed ?? false,
      shedTimer: 0,
    };
  }

  _detonate(x, y, pattern, paletteId, scale = 1.0) {
    const palette = this._getPalette(paletteId);
    const s = this._computeBurstScale(scale);

    // Rich layered sky illumination flash
    const flashRadius = Math.max(260, Math.min(this.width, this.height) * 0.58) * scale;
    this.skyFlashes.push({
      x,
      y,
      radius: flashRadius,
      flashRgb: palette.flashRgb,
      age: 0,
      life: 0.48,
      strength: Math.min(1.35, 0.85 + scale * 0.25),
    });

    // Expanding luminous pressure wave ring
    this.shockwaves.push({
      x,
      y,
      maxRadius: Math.max(115, 165 * s),
      color: palette.core,
      tint: palette.colors[1] || palette.accent,
      age: 0,
      life: 0.36,
    });

    switch (pattern) {
      case 'crimson-chrysanthemum':
        this._burstChrysanthemum(x, y, palette, s);
        break;
      case 'golden-willow':
        this._burstWillow(x, y, palette, s);
        break;
      case 'red-gold-ring':
        this._burstRing(x, y, palette, s);
        break;
      case 'celebration-burst':
        this._burstCelebration(x, y, palette, s, scale);
        break;
      case 'golden-peony':
      default:
        this._burstPeony(x, y, palette, s);
        break;
    }
  }

  /**
   * Monumental 3D Spherical Peony: white-hot core pistil + jewel inner crown + lush outer canopy.
   */
  _burstPeony(x, y, palette, s) {
    // Incandescent white-gold core cluster
    const coreCount = 52;
    for (let i = 0; i < coreCount; i += 1) {
      const phi = Math.acos(1 - (2 * (i + 0.5)) / coreCount);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i + randomRange(-0.14, 0.14);
      const speed = randomRange(75, 165) * s;
      const vx = Math.sin(phi) * Math.cos(theta) * speed;
      const vy = Math.cos(phi) * speed;
      const depth = Math.sin(phi) * Math.sin(theta);

      this._spawnParticle({
        x,
        y,
        vx,
        vy,
        gravity: 62,
        drag: 0.946,
        life: randomRange(0.85, 1.35),
        lineWidth: 1.15,
        headRadius: 1.65,
        glowSize: i % 2 === 0 ? 15 : 0,
        color: palette.core,
        emberColor: palette.colors[1],
        depthAlpha: 0.72 + (depth + 1) * 0.14,
        twinkle: true,
      });
    }

    // Mid-radius jewel ring for dimensional depth
    const midCount = 72;
    for (let i = 0; i < midCount; i += 1) {
      const phi = Math.acos(1 - (2 * (i + 0.5)) / midCount);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i + randomRange(-0.1, 0.1);
      const speed = randomRange(175, 255) * s;
      const vx = Math.sin(phi) * Math.cos(theta) * speed;
      const vy = Math.cos(phi) * speed;
      const depth = Math.sin(phi) * Math.sin(theta);

      this._spawnParticle({
        x,
        y,
        vx,
        vy,
        gravity: 82,
        drag: 0.955,
        life: randomRange(1.25, 1.85),
        lineWidth: randomRange(1.15, 1.6),
        headRadius: randomRange(1.5, 2.1),
        glowSize: i % 4 === 0 ? 18 : 0,
        color: i % 3 === 0 ? palette.accent : pickRandom(palette.colors),
        emberColor: palette.ember,
        depthAlpha: 0.65 + (depth + 1) * 0.175,
        twinkle: true,
      });
    }

    // Grand spherical outer canopy
    const outerCount = 175;
    for (let i = 0; i < outerCount; i += 1) {
      const phi = Math.acos(1 - (2 * (i + 0.5)) / outerCount);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i + randomRange(-0.07, 0.07);
      const speed = randomRange(275, 395) * s;
      const vx = Math.sin(phi) * Math.cos(theta) * speed;
      const vy = Math.cos(phi) * speed;
      const depth = Math.sin(phi) * Math.sin(theta);
      const mainColor =
        i % 8 === 0
          ? palette.accent
          : i % 15 === 0
            ? palette.secondaryAccent
            : pickRandom(palette.colors);

      this._spawnParticle({
        x,
        y,
        vx,
        vy,
        gravity: 96,
        drag: 0.961,
        life: randomRange(1.45, 2.2),
        lineWidth: randomRange(1.25, 1.85),
        headRadius: randomRange(1.75, 2.55),
        glowSize: i % 3 === 0 ? randomRange(18, 28) : 0,
        color: mainColor,
        emberColor: palette.ember,
        depthAlpha: 0.64 + (depth + 1) * 0.18,
        twinkle: i % 2 === 0,
        microBurst: i % 14 === 0,
      });
    }
  }

  /**
   * 3D Multi-Tier Chrysanthemum: blazing radial starburst needles + branching forks + sparkling tips.
   */
  _burstChrysanthemum(x, y, palette, s) {
    // Hot inner sparkle flash
    for (let i = 0; i < 36; i += 1) {
      const phi = Math.acos(1 - (2 * (i + 0.5)) / 36);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      const speed = randomRange(65, 140) * s;
      this._spawnParticle({
        x,
        y,
        vx: Math.sin(phi) * Math.cos(theta) * speed,
        vy: Math.cos(phi) * speed,
        gravity: 58,
        drag: 0.945,
        life: randomRange(0.7, 1.15),
        lineWidth: 1.1,
        headRadius: 1.5,
        glowSize: i % 3 === 0 ? 14 : 0,
        color: palette.core,
        emberColor: palette.colors[1],
        twinkle: true,
      });
    }

    const count = 205;
    for (let i = 0; i < count; i += 1) {
      const phi = Math.acos(1 - (2 * (i + 0.5)) / count);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i + randomRange(-0.04, 0.04);
      const tier = i % 3 === 0 ? 1.18 : i % 3 === 1 ? 0.9 : 0.64;
      const speed = randomRange(300, 425) * s * tier;
      const vx = Math.sin(phi) * Math.cos(theta) * speed;
      const vy = Math.cos(phi) * speed;
      const depth = Math.sin(phi) * Math.sin(theta);

      const needleColor =
        i % 5 === 0
          ? palette.core
          : i % 4 === 0
            ? palette.accent
            : i % 13 === 0
              ? palette.secondaryAccent
              : pickRandom(palette.colors);

      this._spawnParticle({
        x,
        y,
        vx,
        vy,
        gravity: 78,
        drag: 0.964,
        life: randomRange(1.45, 2.25),
        lineWidth: tier > 1 ? 1.65 : 1.15,
        headRadius: tier > 1 ? 2.15 : 1.45,
        glowSize: i % 4 === 0 ? 22 : 0,
        color: needleColor,
        emberColor: palette.ember,
        depthAlpha: 0.66 + (depth + 1) * 0.17,
        branchChance: tier > 1 ? 0.48 : 0.22,
        twinkle: true,
      });
    }
  }

  /**
   * Cascading Golden Willow: sweeping, long-burning champagne-gold tendrils drifting like silk ribbons.
   */
  _burstWillow(x, y, palette, s) {
    const count = 190;
    const willowGold = ['#fffef4', '#fef08a', '#f8e3a3', '#fbbf24', '#f59e0b', '#fb923c'];

    // Soft bright golden crown core
    for (let i = 0; i < 30; i += 1) {
      const a = randomRange(0, Math.PI * 2);
      const sp = randomRange(45, 115) * s;
      this._spawnParticle({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        gravity: 65,
        drag: 0.945,
        life: randomRange(0.75, 1.15),
        lineWidth: 1.1,
        headRadius: 1.5,
        glowSize: i % 2 === 0 ? 15 : 0,
        color: '#fffef6',
        emberColor: '#fbbf24',
        twinkle: true,
      });
    }

    for (let i = 0; i < count; i += 1) {
      const phi = Math.acos(1 - (2 * (i + 0.5)) / count);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i + randomRange(-0.1, 0.1);
      const speed = randomRange(170, 340) * s;
      const vx = Math.sin(phi) * Math.cos(theta) * speed;
      const vy = Math.cos(phi) * speed - 56 * s;
      const depth = Math.sin(phi) * Math.sin(theta);

      this._spawnParticle({
        x,
        y,
        vx,
        vy,
        gravity: randomRange(118, 146),
        drag: 0.974,
        life: randomRange(2.4, 3.45),
        lineWidth: randomRange(1.05, 1.55),
        headRadius: randomRange(1.25, 1.85),
        glowSize: i % 5 === 0 ? 18 : 0,
        color: pickRandom(willowGold),
        emberColor: '#ea580c',
        depthAlpha: 0.62 + (depth + 1) * 0.19,
        twinkle: true,
        branchChance: 0.42,
        emberShed: i % 3 === 0,
      });
    }
  }

  /**
   * Tilted 3D Triple-Orbit Ring: rose-gold, champagne, and jewel orbital rings with radiant core.
   */
  _burstRing(x, y, palette, s) {
    const tilt = randomRange(-0.44, 0.44);
    const squash = randomRange(0.46, 0.76);
    const cosT = Math.cos(tilt);
    const sinT = Math.sin(tilt);

    const spawnRing = (count, speedBase, color, emberColor, lw, ringCos = cosT, ringSin = sinT, ringSquash = squash) => {
      for (let i = 0; i < count; i += 1) {
        const a = (i / count) * Math.PI * 2 + randomRange(-0.018, 0.018);
        const speed = speedBase * randomRange(0.96, 1.04);
        const lx = Math.cos(a) * speed;
        const ly = Math.sin(a) * speed * ringSquash;
        const vx = lx * ringCos - ly * ringSin;
        const vy = lx * ringSin + ly * ringCos;

        this._spawnParticle({
          x,
          y,
          vx,
          vy,
          gravity: 68,
          drag: 0.961,
          life: randomRange(1.45, 2.05),
          lineWidth: lw,
          headRadius: lw * 1.32,
          glowSize: i % 3 === 0 ? 20 : 0,
          color,
          emberColor,
          twinkle: true,
          microBurst: i % 18 === 0,
        });
      }
    };

    // Outer primary luminous crown ring
    spawnRing(104, 365 * s, palette.accent, palette.ember, 1.65);
    // Middle champagne orbital ring
    spawnRing(76, 245 * s, palette.colors[1] || palette.core, palette.accent, 1.35);
    // Cross-tilted jewel halo ring
    const crossTilt = tilt + (tilt > 0 ? -0.68 : 0.68);
    spawnRing(
      54,
      190 * s,
      palette.secondaryAccent || palette.colors[2],
      palette.ember,
      1.15,
      Math.cos(crossTilt),
      Math.sin(crossTilt),
      0.55
    );

    // Sparkling starburst core
    for (let i = 0; i < 40; i += 1) {
      const a = randomRange(0, Math.PI * 2);
      const sp = randomRange(40, 125) * s;
      this._spawnParticle({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        gravity: 62,
        drag: 0.948,
        life: randomRange(0.9, 1.25),
        lineWidth: 1.1,
        headRadius: 1.5,
        glowSize: i % 4 === 0 ? 14 : 0,
        color: palette.core,
        emberColor: palette.colors[1],
        twinkle: true,
      });
    }
  }

  /**
   * Multi-layer Celebration Burst: huge peony + staggered secondary chrysanthemums & jewel stars.
   */
  _burstCelebration(x, y, palette, s, rawScale) {
    this._burstPeony(x, y, palette, s * 1.04);

    const subCount = 7;
    const subPalettes = [this.options.palette, 'festival', 'imperial', 'crimson'];
    for (let i = 0; i < subCount; i += 1) {
      if (this.subShells.length >= MAX_SUB_SHELLS) break;
      const angle = (i / subCount) * Math.PI * 2 + randomRange(-0.18, 0.18);
      const dist = randomRange(95, 168) * s;
      this.subShells.push({
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        delay: 0.18 + i * 0.06,
        elapsed: 0,
        paletteId: i % 2 === 0 ? palette.id : subPalettes[i % subPalettes.length],
        pattern: i % 3 === 0 ? 'golden-peony' : 'crimson-chrysanthemum',
        scale: rawScale * randomRange(0.46, 0.62),
      });
    }
  }

  _update(dt) {
    if (this.options.paused) return;

    if (this.options.celebrationMode) {
      this.celebrationTimer += dt;
      const interval = 1 / Math.max(0.3, this.options.celebrationFrequency);
      if (this.celebrationTimer >= interval) {
        this.celebrationTimer = 0;
        const patterns = FIREWORK_PATTERNS.map((p) => p.id);
        this.launchFirework(
          randomRange(this.width * 0.14, this.width * 0.86),
          randomRange(this.height * 0.14, this.height * 0.42),
          { pattern: pickRandom(patterns) }
        );
      }
    }

    for (let i = this.skyFlashes.length - 1; i >= 0; i -= 1) {
      const f = this.skyFlashes[i];
      f.age += dt;
      if (f.age >= f.life) {
        this.skyFlashes.splice(i, 1);
      }
    }

    for (let i = this.shockwaves.length - 1; i >= 0; i -= 1) {
      const sw = this.shockwaves[i];
      sw.age += dt;
      if (sw.age >= sw.life) {
        this.shockwaves.splice(i, 1);
      }
    }

    for (let i = this.rockets.length - 1; i >= 0; i -= 1) {
      const r = this.rockets[i];
      r.elapsed += dt;
      if (r.elapsed < 0) continue;

      r.prevX = r.x;
      r.prevY = r.y;

      const t = Math.min(1, r.elapsed / r.duration);
      const easeOut = 1 - (1 - t) * (1 - t);
      r.x = r.startX + (r.targetX - r.startX) * easeOut;
      r.y = r.startY + (r.targetY - r.startY) * easeOut;

      // Shed warm trailing exhaust sparks along rocket ascent
      if (t < 0.94 && Math.random() < 0.72) {
        this._spawnParticle({
          x: r.x + randomRange(-1.5, 1.5),
          y: r.y + randomRange(0, 3),
          vx: randomRange(-24, 24),
          vy: randomRange(30, 85),
          gravity: 95,
          drag: 0.93,
          life: randomRange(0.22, 0.42),
          lineWidth: 0.95,
          headRadius: 1.0,
          glowSize: 0,
          color: r.trailColor,
          emberColor: '#f97316',
          twinkle: true,
          priority: 0,
        });
      }

      if (t >= 1) {
        this._detonate(r.targetX, r.targetY, r.pattern, r.paletteId, r.size);
        this.rockets.splice(i, 1);
      }
    }

    for (let i = this.subShells.length - 1; i >= 0; i -= 1) {
      const sub = this.subShells[i];
      sub.elapsed += dt;
      if (sub.elapsed >= sub.delay) {
        const palette = this._getPalette(sub.paletteId);
        const s = this._computeBurstScale(sub.scale);
        this.skyFlashes.push({
          x: sub.x,
          y: sub.y,
          radius: 170 * sub.scale,
          flashRgb: palette.flashRgb,
          age: 0,
          life: 0.34,
          strength: 0.65,
        });
        if (sub.pattern === 'golden-peony') {
          this._burstPeony(sub.x, sub.y, palette, s * 0.72);
        } else {
          this._burstChrysanthemum(sub.x, sub.y, palette, s * 0.85);
        }
        this.subShells.splice(i, 1);
      }
    }

    const frameDragFactor = dt * 60;
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const p = this.particles[i];
      p.age += dt;
      const progress = p.age / p.life;

      // Branching willow / chrysanthemum tendrils mid-flight
      if (
        !p.branched &&
        p.branchChance > 0 &&
        progress > 0.38 &&
        this.particles.length < MAX_PARTICLES - 24
      ) {
        p.branched = true;
        if (Math.random() < p.branchChance) {
          for (let b = 0; b < 2; b += 1) {
            const spreadAngle = (b === 0 ? -1 : 1) * randomRange(0.24, 0.52);
            const cosA = Math.cos(spreadAngle);
            const sinA = Math.sin(spreadAngle);
            const bvx = (p.vx * cosA - p.vy * sinA) * 0.78;
            const bvy = (p.vx * sinA + p.vy * cosA) * 0.78;
            this._spawnParticle({
              x: p.x,
              y: p.y,
              vx: bvx,
              vy: bvy,
              gravity: p.gravity * 1.04,
              drag: p.drag,
              life: (p.life - p.age) * randomRange(0.68, 0.96),
              lineWidth: Math.max(0.75, p.lineWidth * 0.72),
              headRadius: Math.max(0.9, p.headRadius * 0.7),
              glowSize: 0,
              color: p.color,
              emberColor: p.emberColor,
              depthAlpha: p.depthAlpha * 0.88,
              twinkle: true,
              priority: 0,
            });
          }
        }
      }

      // Delicate glittering ember sparks shed from cascading golden willow tendrils
      if (p.emberShed && progress > 0.25 && progress < 0.85) {
        p.shedTimer += dt;
        if (p.shedTimer > 0.14 && this.particles.length < MAX_PARTICLES - 180) {
          p.shedTimer = 0;
          if (Math.random() < 0.55) {
            this._spawnParticle({
              x: p.x,
              y: p.y,
              vx: p.vx * 0.18 + randomRange(-16, 16),
              vy: p.vy * 0.18 + randomRange(-10, 20),
              gravity: 90,
              drag: 0.955,
              life: randomRange(0.32, 0.6),
              lineWidth: 0.75,
              headRadius: 0.9,
              glowSize: 0,
              color: '#fef08a',
              emberColor: '#f59e0b',
              depthAlpha: 0.72,
              twinkle: true,
              priority: 0,
            });
          }
        }
      }

      if (p.age >= p.life) {
        // Secondary crackling micro-explosion along selected outer peony & ring stars
        if (p.microBurst && this.particles.length < MAX_PARTICLES - 40) {
          const microCount = 14;
          for (let c = 0; c < microCount; c += 1) {
            const a = (c / microCount) * Math.PI * 2 + randomRange(-0.14, 0.14);
            const sp = randomRange(58, 125);
            this._spawnParticle({
              x: p.x,
              y: p.y,
              vx: Math.cos(a) * sp,
              vy: Math.sin(a) * sp,
              gravity: 68,
              drag: 0.925,
              life: randomRange(0.32, 0.55),
              lineWidth: 0.95,
              headRadius: 1.15,
              glowSize: c % 4 === 0 ? 10 : 0,
              color: c % 2 === 0 ? '#fffdf5' : p.color,
              emberColor: p.emberColor,
              twinkle: true,
              priority: 0,
            });
          }
        }

        // O(1) swap-and-pop removal
        const last = this.particles[this.particles.length - 1];
        this.particles[i] = last;
        this.particles.pop();
        continue;
      }

      p.prevX = p.x;
      p.prevY = p.y;

      const drag = Math.pow(p.drag, frameDragFactor);
      p.vx *= drag;
      p.vy = p.vy * drag + p.gravity * dt;

      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  _drawBackground(nowSec) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
    skyGrad.addColorStop(0, '#020105');
    skyGrad.addColorStop(0.5, '#0c030b');
    skyGrad.addColorStop(0.84, '#1b0510');
    skyGrad.addColorStop(1, '#280713');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, h);

    // Subtle warm champagne-crimson horizon haze
    const horizonGlow = ctx.createRadialGradient(
      w * 0.5,
      h * 1.05,
      10,
      w * 0.5,
      h * 1.05,
      w * 0.68
    );
    horizonGlow.addColorStop(0, 'rgba(248, 227, 163, 0.095)');
    horizonGlow.addColorStop(0.42, 'rgba(190, 18, 60, 0.075)');
    horizonGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = horizonGlow;
    ctx.fillRect(0, 0, w, h);

    for (const star of this.stars) {
      const alpha = 0.2 + 0.36 * (0.5 + 0.5 * Math.sin(nowSec * star.speed + star.phase));
      ctx.fillStyle = star.warm
        ? `rgba(254, 243, 199, ${alpha.toFixed(2)})`
        : `rgba(235, 244, 255, ${alpha.toFixed(2)})`;
      ctx.fillRect(star.nx * w, star.ny * h, star.r, star.r);
    }

    // Bright multi-layer additive sky illumination flashes
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const flash of this.skyFlashes) {
      const progress = flash.age / flash.life;
      const alpha = Math.pow(Math.max(0, 1 - progress), 1.45) * flash.strength;
      const g = ctx.createRadialGradient(
        flash.x,
        flash.y,
        0,
        flash.x,
        flash.y,
        flash.radius
      );
      g.addColorStop(0, `rgba(255, 250, 235, ${(0.28 * alpha).toFixed(3)})`);
      g.addColorStop(0.28, `rgba(${flash.flashRgb}, ${(0.22 * alpha).toFixed(3)})`);
      g.addColorStop(0.65, `rgba(${flash.flashRgb}, ${(0.07 * alpha).toFixed(3)})`);
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(
        flash.x - flash.radius,
        flash.y - flash.radius,
        flash.radius * 2,
        flash.radius * 2
      );
    }

    // Subtle expanding detonation shockwave rings
    for (const sw of this.shockwaves) {
      const progress = sw.age / sw.life;
      const ease = 1 - Math.pow(1 - progress, 2.2);
      const radius = 12 + sw.maxRadius * ease;
      const alpha = (1 - progress) * 0.24;
      ctx.strokeStyle = sw.tint;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = Math.max(0.6, 2.6 * (1 - progress));
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    this._drawLanterns(nowSec);
  }

  _drawLanterns(nowSec) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    if (w < 540) return;

    const lanternHalo = this._getSprite('#f59e0b');

    for (const l of this.lanterns) {
      const anchorX = l.nx * w;
      const cordLen = l.ny * h;
      const sway = Math.sin(nowSec * 1.05 + l.phase) * 0.05;

      ctx.save();
      ctx.translate(anchorX, 0);
      ctx.rotate(sway);

      ctx.strokeStyle = 'rgba(248, 227, 163, 0.26)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, cordLen);
      ctx.stroke();

      const ly = cordLen + 17 * l.scale;
      const rw = 14 * l.scale;
      const rh = 18 * l.scale;

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.2;
      ctx.drawImage(lanternHalo, -46 * l.scale, ly - 46 * l.scale, 92 * l.scale, 92 * l.scale);
      ctx.restore();

      const bodyGrad = ctx.createRadialGradient(0, ly, 1, 0, ly, rh);
      bodyGrad.addColorStop(0, 'rgba(254, 215, 170, 0.88)');
      bodyGrad.addColorStop(0.45, 'rgba(190, 18, 60, 0.82)');
      bodyGrad.addColorStop(1, 'rgba(100, 18, 28, 0.88)');
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.ellipse(0, ly, rw, rh, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(248, 227, 163, 0.68)';
      ctx.fillRect(-rw * 0.42, ly - rh - 2, rw * 0.84, 3);
      ctx.fillRect(-rw * 0.4, ly + rh - 1, rw * 0.8, 3);

      ctx.restore();
    }
  }

  _drawEffects() {
    const tCtx = this.trailCtx;
    const ctx = this.ctx;

    // Silky trail persistence tuned for long cascading willow ribbons & crisp glowing arcs
    if (!this.options.paused) {
      tCtx.save();
      tCtx.globalCompositeOperation = 'destination-out';
      tCtx.fillStyle = 'rgba(0, 0, 0, 0.072)';
      tCtx.fillRect(0, 0, this.width, this.height);
      tCtx.restore();
    }

    tCtx.save();
    tCtx.globalCompositeOperation = 'lighter';
    tCtx.lineCap = 'round';

    // Luminous ascending rocket streaks with glowing comet tips
    for (const r of this.rockets) {
      if (r.elapsed < 0) continue;
      tCtx.globalAlpha = 0.9;
      tCtx.strokeStyle = r.trailColor;
      tCtx.lineWidth = 2.6;
      tCtx.beginPath();
      tCtx.moveTo(r.prevX, r.prevY);
      tCtx.lineTo(r.x, r.y);
      tCtx.stroke();

      tCtx.strokeStyle = '#fffef7';
      tCtx.lineWidth = 1.25;
      tCtx.beginPath();
      tCtx.moveTo(r.prevX, r.prevY);
      tCtx.lineTo(r.x, r.y);
      tCtx.stroke();

      const sprite = this._getSprite(r.trailColor);
      tCtx.globalAlpha = 0.85;
      tCtx.drawImage(sprite, r.x - 10, r.y - 10, 20, 20);
    }

    // Two-pass luminous filaments: colored bloom wake + cooling white-hot head
    for (const p of this.particles) {
      const progress = p.age / p.life;
      let alpha = Math.max(0, 1 - progress * progress * 0.92) * p.depthAlpha;
      if (p.twinkle && progress > 0.32) {
        alpha *= 0.35 + 0.65 * Math.sin(p.age * 42 + p.seed);
      }
      if (alpha < 0.02) continue;

      const trailColor = progress > 0.68 ? p.emberColor : p.color;
      const lw = Math.max(0.55, p.lineWidth * (1 - progress * 0.42));

      // Outer colored trail stroke
      tCtx.globalAlpha = alpha * 0.85;
      tCtx.strokeStyle = trailColor;
      tCtx.lineWidth = lw * 1.45;
      tCtx.beginPath();
      tCtx.moveTo(p.prevX, p.prevY);
      tCtx.lineTo(p.x, p.y);
      tCtx.stroke();

      // White-hot inner core streak on young & bright sparks
      if (progress < 0.48) {
        tCtx.globalAlpha = alpha * (1 - progress * 1.8) * 0.9;
        tCtx.strokeStyle = p.coreColor;
        tCtx.lineWidth = Math.max(0.5, lw * 0.65);
        tCtx.beginPath();
        tCtx.moveTo(p.prevX, p.prevY);
        tCtx.lineTo(p.x, p.y);
        tCtx.stroke();
      }

      // Crisp luminous star head
      if (progress < 0.8) {
        const coreSprite = this._getCoreSprite(trailColor);
        const coreScale = (p.headRadius * 3.1) * (1 - progress * 0.35);
        tCtx.globalAlpha = alpha * 0.92;
        tCtx.drawImage(
          coreSprite,
          p.x - coreScale * 0.5,
          p.y - coreScale * 0.5,
          coreScale,
          coreScale
        );
      }

      // Soft multi-layer bloom halo on hero stars
      if (p.glowSize > 0 && progress < 0.65) {
        const sprite = this._getSprite(trailColor);
        const gs = p.glowSize * (1 - progress * 0.28);
        tCtx.globalAlpha = alpha * 0.52;
        tCtx.drawImage(sprite, p.x - gs * 0.5, p.y - gs * 0.5, gs, gs);
      }
    }

    tCtx.restore();

    ctx.save();
    ctx.drawImage(this.trailCanvas, 0, 0, this.width, this.height);

    // Luminous fingertip cursor star
    if (this.trailCursor) {
      const sprite = this._getSprite('#f8e3a3');
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.82;
      ctx.drawImage(sprite, this.trailCursor.x - 12, this.trailCursor.y - 12, 24, 24);
    }
    ctx.restore();
  }

  _loop(now) {
    this.rafId = requestAnimationFrame(this._loop);
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastTime) / 1000));
    this.lastTime = now;

    this._update(dt);
    this._drawBackground(now / 1000);
    this._drawEffects();
  }
}
