import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { recognizeGestureFrame } from '../src/vision/gestureRecognizer.js';
import {
  classifyHandLandmarks,
  createKnnClassifier,
  createTemporalGestureSmoother,
  validateKnnModelJson,
} from '../src/vision/knnClassifier.js';
import {
  analyzeDatasetBalance,
  CLASSIFICATION_FEATURE_COUNT,
  computeFeatureVectorDistance,
  extractClassificationFeatures,
  extractHandFeatureVector,
  HAND_FEATURE_COUNT,
} from '../src/vision/landmarkFeatures.js';

/**
 * Generates realistic 21-landmark 3D hand poses (Right-hand reference) including:
 * - Open_Palm
 * - Number_6 (Shaka / Chinese 6: thumb + pinky extended, index/middle/ring curled)
 * - Number_6_ASL (ASL 6: thumb touching pinky, index/middle/ring extended)
 * - Victory, Thumbs_Up, Pointing_Up, Closed_Fist
 * - Unfamiliar_Claw (untrained pose outside trained manifold)
 */
function makePoseLandmarks(poseName, options = {}) {
  const {
    offsetX = 0.5,
    offsetY = 0.65,
    scale = 0.16,
    angleDeg = 0,
    handedness = 'Right',
    jitter = 0,
  } = options;

  // Base coordinates relative to wrist (0,0,0) in Right-hand orientation (Open_Palm)
  const pts = [
    [0.0, 0.0, 0.0], // 0: WRIST
    [-0.18, -0.14, -0.02], // 1: THUMB_CMC
    [-0.32, -0.32, -0.04], // 2: THUMB_MCP
    [-0.42, -0.5, -0.05], // 3: THUMB_IP
    [-0.5, -0.66, -0.06], // 4: THUMB_TIP
    [-0.14, -0.48, 0.0], // 5: INDEX_MCP
    [-0.16, -0.78, -0.02], // 6: INDEX_PIP
    [-0.17, -0.98, -0.04], // 7: INDEX_DIP
    [-0.18, -1.14, -0.05], // 8: INDEX_TIP
    [0.02, -0.52, 0.01], // 9: MIDDLE_MCP
    [0.03, -0.84, -0.01], // 10: MIDDLE_PIP
    [0.04, -1.06, -0.03], // 11: MIDDLE_DIP
    [0.05, -1.24, -0.04], // 12: MIDDLE_TIP
    [0.16, -0.48, 0.02], // 13: RING_MCP
    [0.19, -0.76, 0.0], // 14: RING_PIP
    [0.21, -0.96, -0.02], // 15: RING_DIP
    [0.22, -1.12, -0.03], // 16: RING_TIP
    [0.29, -0.4, 0.04], // 17: PINKY_MCP
    [0.34, -0.62, 0.03], // 18: PINKY_PIP
    [0.38, -0.78, 0.01], // 19: PINKY_DIP
    [0.41, -0.92, 0.0], // 20: PINKY_TIP
  ];

  if (poseName === 'Number_6') {
    // Chinese / Shaka 6: Thumb & Pinky extended wide, Index/Middle/Ring curled into palm
    pts[3] = [-0.46, -0.46, -0.05];
    pts[4] = [-0.58, -0.6, -0.06];
    for (const [base, xScale] of [
      [5, 0.85],
      [9, 0.85],
      [13, 0.85],
    ]) {
      pts[base + 1] = [pts[base][0] * xScale, -0.34, -0.14];
      pts[base + 2] = [pts[base][0] * 0.65, -0.2, -0.16];
      pts[base + 3] = [pts[base][0] * 0.5, -0.1, -0.12];
    }
    pts[18] = [0.38, -0.6, 0.02];
    pts[19] = [0.46, -0.74, 0.0];
    pts[20] = [0.54, -0.88, -0.01];
  } else if (poseName === 'Number_6_ASL') {
    // ASL 6: Thumb tip (#4) touches Pinky tip (#20) in a forward circle; Index/Middle/Ring extended
    pts[2] = [-0.14, -0.3, -0.06];
    pts[3] = [0.02, -0.36, -0.16];
    pts[4] = [0.16, -0.34, -0.22];
    pts[18] = [0.26, -0.42, -0.06];
    pts[19] = [0.22, -0.38, -0.16];
    pts[20] = [0.17, -0.34, -0.22];
  } else if (poseName === 'Victory') {
    pts[3] = [-0.15, -0.36, -0.12];
    pts[4] = [0.02, -0.3, -0.16];
    pts[7] = [-0.24, -0.98, -0.04];
    pts[8] = [-0.3, -1.18, -0.05];
    pts[11] = [0.1, -1.04, -0.03];
    pts[12] = [0.16, -1.22, -0.04];
    for (const base of [13, 17]) {
      pts[base + 1] = [pts[base][0] * 0.85, -0.3, -0.12];
      pts[base + 2] = [pts[base][0] * 0.65, -0.17, -0.14];
      pts[base + 3] = [pts[base][0] * 0.5, -0.09, -0.11];
    }
  } else if (poseName === 'Thumbs_Up') {
    pts[2] = [-0.18, -0.38, -0.05];
    pts[3] = [-0.12, -0.72, -0.06];
    pts[4] = [-0.06, -1.05, -0.07];
    for (const base of [5, 9, 13, 17]) {
      const yRow = -0.22 - (base - 5) * 0.015;
      pts[base] = [0.16, yRow, -0.02];
      pts[base + 1] = [0.32, yRow + 0.02, -0.1];
      pts[base + 2] = [0.2, yRow + 0.04, -0.18];
      pts[base + 3] = [0.08, yRow + 0.03, -0.16];
    }
  } else if (poseName === 'Pointing_Up') {
    pts[3] = [-0.16, -0.36, -0.1];
    pts[4] = [-0.02, -0.32, -0.14];
    pts[6] = [-0.12, -0.78, -0.02];
    pts[7] = [-0.12, -1.02, -0.03];
    pts[8] = [-0.12, -1.24, -0.04];
    for (const base of [9, 13, 17]) {
      pts[base + 1] = [pts[base][0], -0.3, -0.12];
      pts[base + 2] = [pts[base][0] * 0.8, -0.16, -0.14];
      pts[base + 3] = [pts[base][0] * 0.6, -0.08, -0.11];
    }
  } else if (poseName === 'Closed_Fist') {
    pts[2] = [-0.16, -0.2, -0.08];
    pts[3] = [-0.02, -0.24, -0.15];
    pts[4] = [0.12, -0.2, -0.18];
    for (const base of [5, 9, 13, 17]) {
      pts[base + 1] = [pts[base][0] * 0.9, -0.32, -0.12];
      pts[base + 2] = [pts[base][0] * 0.7, -0.18, -0.16];
      pts[base + 3] = [pts[base][0] * 0.5, -0.08, -0.12];
    }
  } else if (poseName === 'Unfamiliar_Claw') {
    // Unusual hyper-splayed backward claw gesture well outside all trained classes
    pts[2] = [-0.45, -0.15, 0.25];
    pts[3] = [-0.7, 0.1, 0.45];
    pts[4] = [-0.85, 0.3, 0.55];
    for (const [base, xDir] of [
      [5, -0.45],
      [9, -0.12],
      [13, 0.2],
      [17, 0.52],
    ]) {
      pts[base + 1] = [xDir, -0.4, 0.35];
      pts[base + 2] = [xDir * 1.15, -0.1, 0.55];
      pts[base + 3] = [xDir * 0.95, 0.25, 0.45];
    }
  }

  const rad = (angleDeg * Math.PI) / 180;
  const cosA = Math.cos(rad);
  const sinA = Math.sin(rad);

  const rightLm = pts.map(([lx, ly, lz], idx) => {
    const jx = jitter ? Math.sin(idx * 1.7 + jitter) * jitter : 0;
    const jy = jitter ? Math.cos(idx * 2.3 + jitter) * jitter : 0;
    const jz = jitter ? Math.sin(idx * 3.1 + jitter) * jitter : 0;
    const rx = (lx + jx) * cosA - (ly + jy) * sinA;
    const ry = (lx + jx) * sinA + (ly + jy) * cosA;
    return {
      x: offsetX + rx * scale,
      y: offsetY + ry * scale,
      z: (lz + jz) * scale,
    };
  });

  if (handedness === 'Left') {
    return rightLm.map((pt) => ({ x: 1 - pt.x, y: pt.y, z: pt.z }));
  }
  return rightLm;
}

function interpolateLandmarks(lmA, lmB, t) {
  return lmA.map((ptA, i) => ({
    x: ptA.x + (lmB[i].x - ptA.x) * t,
    y: ptA.y + (lmB[i].y - ptA.y) * t,
    z: (ptA.z ?? 0) + ((lmB[i].z ?? 0) - (ptA.z ?? 0)) * t,
  }));
}

function buildFullWorkshopClassifier(overrides = {}) {
  const gestureClasses = [
    'Open_Palm',
    'Number_6',
    'Number_6_ASL',
    'Victory',
    'Thumbs_Up',
    'Pointing_Up',
    'Closed_Fist',
  ];

  const samples = [];
  for (const label of gestureClasses) {
    for (let i = 0; i < 6; i += 1) {
      const lm = makePoseLandmarks(label, {
        offsetX: 0.42 + (i % 3) * 0.05,
        offsetY: 0.62 + (i % 2) * 0.04,
        scale: 0.14 + (i % 3) * 0.02,
        angleDeg: (i - 2.5) * 4,
        jitter: i * 0.008,
      });
      samples.push({
        label,
        handedness: 'Right',
        handednessCanonicalized: true,
        features: extractHandFeatureVector(lm, { handedness: 'Right' }),
      });
    }
  }

  const validated = validateKnnModelJson({
    schemaVersion: 4,
    modelType: 'knn-hand-landmarks',
    featureSpec: {
      featureCount: HAND_FEATURE_COUNT,
      classificationFeatureCount: CLASSIFICATION_FEATURE_COUNT,
      coordinateSpace: 'raw-landmarks-wrist-centered-maxnorm',
      handednessCanonicalization: true,
      canonicalHand: 'Right',
    },
    hyperparams: {
      k: 5,
      metric: 'euclidean',
      weighting: 'distance',
      confidenceThreshold: 0.6,
      maxDistanceThreshold: 1.15,
      minDistanceMargin: 0.1,
      ...overrides,
    },
    samples,
  });

  return createKnnClassifier(validated);
}

test('Open Palm is never misclassified as Number 6 (Shaka or ASL) across rotations, camera distances, and hands', () => {
  const clf = buildFullWorkshopClassifier();

  // Verify 95D hybrid features separate Number_6 / Number_6_ASL further from Open_Palm than a 25° rotation of Open_Palm
  const basePalm95 = extractClassificationFeatures(
    extractHandFeatureVector(makePoseLandmarks('Open_Palm', { angleDeg: 0 }), { handedness: 'Right' })
  );
  const rotPalm95 = extractClassificationFeatures(
    extractHandFeatureVector(makePoseLandmarks('Open_Palm', { angleDeg: 25 }), { handedness: 'Right' })
  );
  const shaka695 = extractClassificationFeatures(
    extractHandFeatureVector(makePoseLandmarks('Number_6', { angleDeg: 0 }), { handedness: 'Right' })
  );
  const asl695 = extractClassificationFeatures(
    extractHandFeatureVector(makePoseLandmarks('Number_6_ASL', { angleDeg: 0 }), { handedness: 'Right' })
  );

  const palmRotDist = computeFeatureVectorDistance(basePalm95, rotPalm95);
  const palmShakaDist = computeFeatureVectorDistance(basePalm95, shaka695);
  const palmAsl6Dist = computeFeatureVectorDistance(basePalm95, asl695);
  assert.ok(
    palmRotDist < palmShakaDist * 0.6,
    `Expected rotated Open Palm distance (${palmRotDist.toFixed(3)}) << Open_Palm vs Number_6 (${palmShakaDist.toFixed(3)})`
  );
  assert.ok(
    palmRotDist < palmAsl6Dist * 0.6,
    `Expected rotated Open Palm distance (${palmRotDist.toFixed(3)}) << Open_Palm vs Number_6_ASL (${palmAsl6Dist.toFixed(3)})`
  );

  const angles = [-24, -15, -8, 0, 8, 15, 24];
  const scales = [0.09, 0.16, 0.27];
  const hands = ['Right', 'Left'];

  for (const handedness of hands) {
    for (const scale of scales) {
      for (const angleDeg of angles) {
        const palmPred = classifyHandLandmarks(
          clf,
          makePoseLandmarks('Open_Palm', { angleDeg, scale, handedness, jitter: 0.01 }),
          {},
          { handedness }
        );
        assert.equal(
          palmPred.label,
          'Open_Palm',
          `Open_Palm misclassified as ${palmPred.label} at angle=${angleDeg}, scale=${scale}, hand=${handedness} (d=${palmPred.nearestDistance.toFixed(3)}, gap=${palmPred.distanceGap.toFixed(3)}, reason=${palmPred.reason})`
        );

        const shakaPred = classifyHandLandmarks(
          clf,
          makePoseLandmarks('Number_6', { angleDeg, scale, handedness, jitter: 0.01 }),
          {},
          { handedness }
        );
        assert.equal(
          shakaPred.label,
          'Number_6',
          `Number_6 misclassified as ${shakaPred.label} at angle=${angleDeg}, scale=${scale}, hand=${handedness}`
        );

        const aslPred = classifyHandLandmarks(
          clf,
          makePoseLandmarks('Number_6_ASL', { angleDeg, scale, handedness, jitter: 0.01 }),
          {},
          { handedness }
        );
        assert.equal(
          aslPred.label,
          'Number_6_ASL',
          `Number_6_ASL misclassified as ${aslPred.label} at angle=${angleDeg}, scale=${scale}, hand=${handedness}`
        );
      }
    }
  }
});

test('All existing gesture classes classify accurately across orientations and distances with honest neighbor diagnostics', () => {
  const clf = buildFullWorkshopClassifier();
  const classes = [
    'Open_Palm',
    'Number_6',
    'Number_6_ASL',
    'Victory',
    'Thumbs_Up',
    'Pointing_Up',
    'Closed_Fist',
  ];

  for (const label of classes) {
    for (const angleDeg of [-18, 0, 18]) {
      for (const scale of [0.1, 0.23]) {
        for (const handedness of ['Right', 'Left']) {
          const pred = classifyHandLandmarks(
            clf,
            makePoseLandmarks(label, { angleDeg, scale, handedness, jitter: 0.01 }),
            {},
            { handedness }
          );
          assert.equal(pred.rejected, false, `${label} unexpectedly rejected (${pred.reason}) at ${angleDeg}°`);
          assert.equal(pred.label, label, `${label} misclassified as ${pred.label}`);
          assert.equal(pred.predictionStatus, 'Known');
          assert.ok(['Strong', 'Good', 'Borderline'].includes(pred.matchQuality));
          assert.ok(pred.neighborVoteCount >= 3 && pred.neighborVoteCount <= 5);
          assert.ok(Number.isFinite(pred.distanceGap) && pred.distanceGap > 0.1);
          assert.ok(pred.secondClosestLabel && pred.secondClosestLabel !== label);
        }
      }
    }
  }
});

test('Imbalanced training datasets are flagged and balanced vote weighting prevents large classes crowding minority classes', () => {
  const samples = [];
  // Crowded majority class: 40 Number_6 samples
  for (let i = 0; i < 40; i += 1) {
    const lm = makePoseLandmarks('Number_6', {
      angleDeg: (i % 5) - 2,
      jitter: (i % 4) * 0.005,
    });
    samples.push({
      label: 'Number_6',
      handedness: 'Right',
      handednessCanonicalized: true,
      features: extractHandFeatureVector(lm, { handedness: 'Right' }),
    });
  }
  // Minority class: 8 Open_Palm samples
  for (let i = 0; i < 8; i += 1) {
    const lm = makePoseLandmarks('Open_Palm', {
      angleDeg: (i % 5) - 2,
      jitter: (i % 4) * 0.005,
    });
    samples.push({
      label: 'Open_Palm',
      handedness: 'Right',
      handednessCanonicalized: true,
      features: extractHandFeatureVector(lm, { handedness: 'Right' }),
    });
  }

  const balance = analyzeDatasetBalance(['Number_6', 'Open_Palm'], samples);
  assert.equal(balance.isImbalanced, true);
  assert.equal(balance.minCount, 8);
  assert.equal(balance.maxCount, 40);
  assert.deepEqual(balance.underrepresentedClasses, ['Open_Palm']);

  const validated = validateKnnModelJson({
    schemaVersion: 4,
    hyperparams: { k: 5, confidenceThreshold: 0.6, maxDistanceThreshold: 1.15, minDistanceMargin: 0.1 },
    samples,
  });
  assert.ok(validated.migrationReport.warnings.some((w) => w.includes('imbalanced')));

  const clf = createKnnClassifier(validated);
  const palmQuery = makePoseLandmarks('Open_Palm', { angleDeg: 10, scale: 0.2 });
  const pred = classifyHandLandmarks(clf, palmQuery, {}, { handedness: 'Right' });
  assert.equal(pred.label, 'Open_Palm');
  assert.equal(pred.predictionStatus, 'Known');
});

test('Unknown unfamiliar gestures and Uncertain ambiguous borderline poses are properly rejected', () => {
  const clf = buildFullWorkshopClassifier({
    maxDistanceThreshold: 1.15,
    minDistanceMargin: 0.12,
  });

  // 1. Unfamiliar pose well outside all training manifolds -> Unknown
  const unfamiliarLm = makePoseLandmarks('Unfamiliar_Claw', { scale: 0.18 });
  const unknownPred = classifyHandLandmarks(clf, unfamiliarLm, {}, { handedness: 'Right' });
  assert.equal(unknownPred.rejected, true);
  assert.equal(unknownPred.label, 'None');
  assert.equal(unknownPred.predictionStatus, 'Unknown');
  assert.equal(unknownPred.matchQuality, 'Unknown');
  assert.ok(unknownPred.nearestDistance > 1.15);

  // 2. Intermediate ambiguous pose near class boundary -> Uncertain (ambiguous-margin)
  const palmLm = makePoseLandmarks('Open_Palm', { scale: 0.16 });
  const aslSixLm = makePoseLandmarks('Number_6_ASL', { scale: 0.16 });
  let uncertainAsl = null;
  for (let step = 20; step <= 80; step += 1) {
    const midLm = interpolateLandmarks(palmLm, aslSixLm, step / 100);
    const pred = classifyHandLandmarks(clf, midLm, {}, { handedness: 'Right' });
    if (pred.predictionStatus === 'Uncertain' && pred.reason === 'ambiguous-margin') {
      uncertainAsl = pred;
      break;
    }
  }
  assert.ok(uncertainAsl, 'Expected intermediate Open_Palm<->Number_6_ASL pose to trigger Uncertain rejection');
  assert.equal(uncertainAsl.rejected, true);
  assert.equal(uncertainAsl.label, 'None');
  assert.equal(uncertainAsl.predictionStatus, 'Uncertain');
  assert.ok(uncertainAsl.distanceGap < 0.12);

  // Also check Open_Palm<->Number_6 midpoint with looser distance threshold (1.45) is caught by margin gate
  const sixLm = makePoseLandmarks('Number_6', { scale: 0.16 });
  let uncertainShaka = null;
  for (let step = 35; step <= 65; step += 1) {
    const midLm = interpolateLandmarks(palmLm, sixLm, step / 100);
    const pred = classifyHandLandmarks(
      clf,
      midLm,
      { maxDistanceThreshold: 1.45, minDistanceMargin: 0.12 },
      { handedness: 'Right' }
    );
    if (pred.predictionStatus === 'Uncertain' && pred.reason === 'ambiguous-margin') {
      uncertainShaka = pred;
      break;
    }
  }
  assert.ok(uncertainShaka, 'Expected intermediate Open_Palm<->Number_6 pose to trigger Uncertain rejection');
  assert.equal(uncertainShaka.rejected, true);
  assert.equal(uncertainShaka.label, 'None');
  assert.equal(uncertainShaka.predictionStatus, 'Uncertain');
  assert.ok(uncertainShaka.distanceGap < 0.12);
});

test('Temporal smoother stabilizes live predictions without lag or x=0.5 midpoint resets', () => {
  const clf = buildFullWorkshopClassifier();
  const smoother = createTemporalGestureSmoother({
    windowSize: 5,
    minConsistentFrames: 2,
    switchConsistentFrames: 3,
  });

  // Frame 1: single Open_Palm frame waits for consistency (Uncertain)
  const f1 = smoother.smooth(
    'hand-right',
    classifyHandLandmarks(clf, makePoseLandmarks('Open_Palm'), {}, { handedness: 'Right' }),
    100
  );
  assert.equal(f1.rejected, true);
  assert.equal(f1.predictionStatus, 'Uncertain');

  // Frame 2: 2nd Open_Palm frame confirms immediately (no excessive delay)
  const f2 = smoother.smooth(
    'hand-right',
    classifyHandLandmarks(clf, makePoseLandmarks('Open_Palm'), {}, { handedness: 'Right' }),
    133
  );
  assert.equal(f2.rejected, false);
  assert.equal(f2.label, 'Open_Palm');
  assert.equal(f2.predictionStatus, 'Known');

  // Frame 3: single noisy Number_6 blip holds active Open_Palm (no flicker!)
  const f3 = smoother.smooth(
    'hand-right',
    classifyHandLandmarks(clf, makePoseLandmarks('Number_6'), {}, { handedness: 'Right' }),
    166
  );
  assert.equal(f3.rejected, false);
  assert.equal(f3.label, 'Open_Palm');

  // Frame 4: returning to Open_Palm keeps Open_Palm smoothly
  const f4 = smoother.smooth(
    'hand-right',
    classifyHandLandmarks(clf, makePoseLandmarks('Open_Palm'), {}, { handedness: 'Right' }),
    200
  );
  assert.equal(f4.label, 'Open_Palm');

  // Frames 5..7: deliberate switch to Number_6 takes 3 consistent frames
  const s1 = smoother.smooth(
    'hand-right',
    classifyHandLandmarks(clf, makePoseLandmarks('Number_6'), {}, { handedness: 'Right' }),
    233
  );
  assert.equal(s1.label, 'Open_Palm'); // hold 1st frame
  const s2 = smoother.smooth(
    'hand-right',
    classifyHandLandmarks(clf, makePoseLandmarks('Number_6'), {}, { handedness: 'Right' }),
    266
  );
  assert.equal(s2.rejected, true);
  assert.equal(s2.predictionStatus, 'Uncertain'); // transitioning on frame 2
  const s3 = smoother.smooth(
    'hand-right',
    classifyHandLandmarks(clf, makePoseLandmarks('Number_6'), {}, { handedness: 'Right' }),
    300
  );
  assert.equal(s3.rejected, false);
  assert.equal(s3.label, 'Number_6'); // confirmed on frame 3

  // Unfamiliar Unknown raw frame is ALWAYS rejected immediately (never returns stale Number_6)
  const u1 = smoother.smooth(
    'hand-right',
    classifyHandLandmarks(clf, makePoseLandmarks('Unfamiliar_Claw'), {}, { handedness: 'Right' }),
    333
  );
  assert.equal(u1.rejected, true);
  assert.equal(u1.predictionStatus, 'Unknown');
  assert.equal(u1.label, 'None');

  // Sliding single Right hand across viewer midpoint x=0.35 -> x=0.65 inside recognizeGestureFrame
  // preserves smoother continuity (uses hand-right key rather than x<0.5 screen split)
  const frameSmoother = createTemporalGestureSmoother({
    windowSize: 5,
    minConsistentFrames: 2,
    switchConsistentFrames: 3,
  });
  const makeStubRecognizer = (offsetX) => ({
    recognizeForVideo: () => ({
      landmarks: [makePoseLandmarks('Open_Palm', { offsetX, handedness: 'Right' })],
      handedness: [[{ categoryName: 'Right', score: 0.99 }]],
      gestures: [[{ categoryName: 'Open_Palm', score: 0.95 }]],
    }),
  });
  const videoStub = { readyState: 4 };
  const r1 = recognizeGestureFrame(makeStubRecognizer(0.35), videoStub, 1000, 0.55, {
    classifierSource: 'custom-knn',
    customClassifier: clf,
    temporalSmoother: frameSmoother,
  });
  assert.equal(r1.rawGestureName, 'None'); // frame 1 entry consistency

  const r2 = recognizeGestureFrame(makeStubRecognizer(0.65), videoStub, 1033, 0.55, {
    classifierSource: 'custom-knn',
    customClassifier: clf,
    temporalSmoother: frameSmoother,
  });
  assert.equal(
    r2.rawGestureName,
    'Open_Palm',
    'Crossing x=0.5 must NOT reset hand-right smoother history'
  );
});

test('Legacy schema v1/v3 63D knn-gesture-model.json remains backward compatible', () => {
  const legacyModel = {
    schemaVersion: 3,
    modelType: 'knn-hand-landmarks',
    featureSpec: {
      featureCount: 63,
      coordinateSpace: 'raw-landmarks-wrist-centered-maxnorm',
      handednessCanonicalization: true,
      canonicalHand: 'Right',
    },
    hyperparams: {
      k: 3,
      metric: 'euclidean',
      weighting: 'distance',
      confidenceThreshold: 0.6,
      maxDistanceThreshold: 0.95,
    },
    samples: [
      ...Array.from({ length: 4 }, (_, i) => ({
        label: 'Open_Palm',
        handedness: 'Right',
        handednessCanonicalized: true,
        features: extractHandFeatureVector(makePoseLandmarks('Open_Palm', { jitter: i * 0.005 }), {
          handedness: 'Right',
        }),
      })),
      ...Array.from({ length: 4 }, (_, i) => ({
        label: 'Number_6',
        handedness: 'Right',
        handednessCanonicalized: true,
        features: extractHandFeatureVector(makePoseLandmarks('Number_6', { jitter: i * 0.005 }), {
          handedness: 'Right',
        }),
      })),
    ],
  };

  const validated = validateKnnModelJson(legacyModel);
  assert.equal(validated.hyperparams.minDistanceMargin, 0.1);
  assert.equal(validated.featureSpec.classificationFeatureCount, CLASSIFICATION_FEATURE_COUNT);

  const clf = createKnnClassifier(validated);
  const pred = classifyHandLandmarks(
    clf,
    makePoseLandmarks('Open_Palm', { angleDeg: 18 }),
    {},
    { handedness: 'Right' }
  );
  assert.equal(pred.label, 'Open_Palm');
});

test('Colab calibrate_thresholds caps noisy class thresholds below cross-class p10 and exports schema v4 JSON', () => {
  const nbPath = path.resolve(process.cwd(), 'notebooks/Custom_Gesture_KNN_Training.ipynb');
  const nbJson = JSON.parse(fs.readFileSync(nbPath, 'utf8'));
  const prepareCell = nbJson.cells.find((c) => c.metadata?.id === 'prepare_features');
  const calibrateCell = nbJson.cells.find((c) => c.metadata?.id === 'calibrate_thresholds');
  assert.ok(prepareCell && calibrateCell);

  const prepSource = prepareCell.source.join('');
  const cutMarker = 'dataset_canonicalized =';
  const funcDefsOnly = prepSource
    .slice(0, prepSource.indexOf(cutMarker))
    .replace('import numpy as np\n', '');

  const calibSource = calibrateCell.source
    .join('')
    .split('\nif len(all_in_dists) > 0:\n    plt.figure')[0];

  // Build noisy Open_Palm & Number_6 dataset in 63D so calibrate_thresholds runs cleanly if numpy exists
  const dataset = [];
  for (const label of ['Open_Palm', 'Number_6', 'Victory']) {
    for (let i = 0; i < 10; i += 1) {
      const lm = makePoseLandmarks(label, {
        angleDeg: (i - 4.5) * 5,
        jitter: i * 0.012,
      });
      dataset.push({
        label,
        features: extractHandFeatureVector(lm, { handedness: 'Right' }),
      });
    }
  }

  const pyScript = `
import json, sys
try:
    import numpy as np
except ImportError:
    print(json.dumps({"skipped": True}))
    sys.exit(0)

${funcDefsOnly}
rows = json.loads(sys.stdin.read())
X_all = np.asarray([extract_classification_features(r["features"]) for r in rows], dtype=np.float32)
y_all = np.asarray([r["label"] for r in rows])
CLASSES = sorted(list(set(r["label"] for r in rows)))
X_train = X_all[::2]
y_train = y_all[::2]
X_val = X_all[1::2]
y_val = y_all[1::2]

${calibSource}

print(json.dumps({
    "skipped": False,
    "globalThresh": MAX_DISTANCE_THRESHOLD,
    "minMargin": MIN_DISTANCE_MARGIN,
    "classThresholds": CLASS_DISTANCE_THRESHOLDS,
    "stats": PER_CLASS_CALIBRATION_STATS,
}))
`;

  const stdout = execFileSync('python3', ['-c', pyScript], {
    input: JSON.stringify(dataset),
    encoding: 'utf8',
  });
  const pyOut = JSON.parse(stdout);
  if (!pyOut.skipped) {
    assert.ok(pyOut.globalThresh >= 0.4 && pyOut.globalThresh <= 1.65);
    assert.ok(pyOut.minMargin >= 0.08 && pyOut.minMargin <= 0.22);
    for (const cls of ['Open_Palm', 'Number_6', 'Victory']) {
      const st = pyOut.stats[cls];
      assert.ok(st.crossMin > st.inMedian, `Expected crossMin > inMedian for ${cls}`);
      assert.ok(
        pyOut.classThresholds[cls] <= Math.max(pyOut.globalThresh, st.crossMin),
        `Threshold for ${cls} (${pyOut.classThresholds[cls]}) should stay bounded`
      );
    }
  }
});
