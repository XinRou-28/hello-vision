import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  computeContainedVideoRect,
  drawHandLandmarksOverlay,
  HAND_FINGERTIP_INDICES,
  HAND_LANDMARK_COLORS,
  syncHandOverlayCanvasSize,
} from '../src/vision/handOverlayRenderer.js';
import { HAND_CONNECTIONS } from '../src/vision/landmarkMath.js';

function createMock2DContext() {
  const strokes = [];
  const arcs = [];
  const stateStack = [];
  const state = {
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    strokeStyle: '#000',
    fillStyle: '#000',
    shadowColor: 'transparent',
    shadowBlur: 0,
  };

  let currentPathMoves = 0;

  return {
    strokes,
    arcs,
    get lineWidth() { return state.lineWidth; },
    set lineWidth(v) { state.lineWidth = v; },
    get lineCap() { return state.lineCap; },
    set lineCap(v) { state.lineCap = v; },
    get lineJoin() { return state.lineJoin; },
    set lineJoin(v) { state.lineJoin = v; },
    get strokeStyle() { return state.strokeStyle; },
    set strokeStyle(v) { state.strokeStyle = v; },
    get fillStyle() { return state.fillStyle; },
    set fillStyle(v) { state.fillStyle = v; },
    get shadowColor() { return state.shadowColor; },
    set shadowColor(v) { state.shadowColor = v; },
    get shadowBlur() { return state.shadowBlur; },
    set shadowBlur(v) { state.shadowBlur = v; },
    save() {
      stateStack.push({ ...state });
    },
    restore() {
      Object.assign(state, stateStack.pop() || {});
    },
    beginPath() {
      currentPathMoves = 0;
    },
    moveTo() {
      currentPathMoves += 1;
    },
    lineTo() {},
    arc(x, y, radius) {
      arcs.push({ x, y, radius, fillStyle: state.fillStyle, strokeStyle: state.strokeStyle });
    },
    stroke() {
      if (currentPathMoves > 0) {
        strokes.push({
          lineWidth: state.lineWidth,
          lineCap: state.lineCap,
          lineJoin: state.lineJoin,
          strokeStyle: state.strokeStyle,
          shadowBlur: state.shadowBlur,
          segmentCount: currentPathMoves,
        });
      }
      if (arcs.length > 0 && currentPathMoves === 0) {
        arcs[arcs.length - 1].strokeStyle = state.strokeStyle;
        arcs[arcs.length - 1].borderWidth = state.lineWidth;
      }
    },
    fill() {
      if (arcs.length > 0) {
        arcs[arcs.length - 1].fillStyle = state.fillStyle;
      }
    },
  };
}

function makeFakeHand(side = 'right') {
  const landmarks = Array.from({ length: 21 }, (_, idx) => ({
    x: 0.25 + (idx % 5) * 0.1,
    y: 0.8 - Math.floor(idx / 5) * 0.14,
    z: 0,
  }));
  return { landmarks, side };
}

test('drawHandLandmarksOverlay renders original thin amber connections and small white/amber/emerald landmarks', () => {
  const ctx = createMock2DContext();
  const hand = makeFakeHand('right');

  drawHandLandmarksOverlay(ctx, [hand], 640, 360, {
    displayWidth: 224,
    videoWidth: 640,
    videoHeight: 360,
  });

  // 1 skeleton path with all HAND_CONNECTIONS in thin warm amber
  assert.equal(ctx.strokes.length, 1);
  assert.equal(ctx.strokes[0].segmentCount, HAND_CONNECTIONS.length);
  assert.equal(ctx.strokes[0].strokeStyle, HAND_LANDMARK_COLORS.connection);
  assert.equal(ctx.strokes[0].lineCap, 'round');
  assert.equal(ctx.strokes[0].lineJoin, 'round');
  assert.ok(ctx.strokes[0].lineWidth < 3.0, 'Thin skeleton lines should remain sleek without bulky strokes');
  assert.equal(ctx.strokes[0].shadowBlur, 0, 'Original minimalist overlay does not add heavy shadow blur');

  // All 21 landmarks drawn cleanly without bulky borders
  assert.equal(ctx.arcs.length, 21);

  // Wrist anchor (#0) is emerald (#34d399) and drawn last on top
  const wristArc = ctx.arcs[ctx.arcs.length - 1];
  assert.equal(wristArc.fillStyle, HAND_LANDMARK_COLORS.wrist);

  // 15 finger/palm joints are crisp white (#ffffff) and 5 fingertips are amber (#fbbf24)
  const jointArcs = ctx.arcs.slice(0, 15);
  const tipArcs = ctx.arcs.slice(15, 20);
  assert.ok(jointArcs.every((a) => a.fillStyle === HAND_LANDMARK_COLORS.joint));
  assert.ok(tipArcs.every((a) => a.fillStyle === HAND_LANDMARK_COLORS.tip));
  assert.deepEqual([...HAND_FINGERTIP_INDICES], [4, 8, 12, 16, 20]);
  assert.ok(tipArcs[0].radius > jointArcs[0].radius, 'Fingertips should be slightly larger than other joints');
});

test('computeContainedVideoRect and syncHandOverlayCanvasSize preserve alignment across aspect ratios', () => {
  const matched = computeContainedVideoRect(640, 360, 640, 360);
  assert.deepEqual(matched, { offsetX: 0, offsetY: 0, drawWidth: 640, drawHeight: 360 });

  // 4:3 webcam inside 16:9 container should letterbox horizontally
  const letterboxed = computeContainedVideoRect(640, 360, 640, 480);
  assert.equal(letterboxed.drawHeight, 360);
  assert.equal(letterboxed.drawWidth, 480);
  assert.equal(letterboxed.offsetX, 80);
  assert.equal(letterboxed.offsetY, 0);

  const mockCanvas = { width: 0, height: 0, clientWidth: 460, clientHeight: 259 };
  const mockVideo = { videoWidth: 640, videoHeight: 360 };
  const synced = syncHandOverlayCanvasSize(mockCanvas, mockVideo);
  assert.equal(synced.width, 640);
  assert.equal(synced.height, 360);
  assert.equal(synced.displayWidth, 460);
});

test('WebcamPip and CustomGestureModal both use shared drawHandLandmarksOverlay renderer', () => {
  const pipSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/WebcamPip.jsx'),
    'utf-8'
  );
  const modalSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/CustomGestureModal.jsx'),
    'utf-8'
  );
  assert.equal(pipSource.includes('drawHandLandmarksOverlay'), true);
  assert.equal(modalSource.includes('drawHandLandmarksOverlay'), true);
});

test('Particle Universe defaults to max density/glow/scale and Settings/Guide drawers are scrollable above WebcamPip', () => {
  const particleSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/activities/ParticleUniverseActivity.jsx'),
    'utf-8'
  );
  const engineSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/engines/ParticleEngine.js'),
    'utf-8'
  );
  const shellSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/ActivityShell.jsx'),
    'utf-8'
  );
  const magicSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/activities/MagicCanvasActivity.jsx'),
    'utf-8'
  );

  assert.equal(particleSource.includes('useState(10000)'), true);
  assert.equal(particleSource.includes('useState(1.6)'), true);
  assert.equal(engineSource.includes('this.activeCount = MAX_PARTICLES;'), true);
  assert.equal(engineSource.includes('glowIntensity: 1.6'), true);
  assert.equal(engineSource.includes('pointScale: 1.6'), true);

  for (const src of [shellSource, particleSource, magicSource]) {
    assert.equal(src.includes('overflow-y-auto'), true);
    assert.equal(src.includes('max-h-[calc(100dvh-17.5rem)]'), true);
  }
});
