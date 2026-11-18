import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  createMagicCanvasGestureState,
  mapGestureToFireworkAction,
} from '../src/exercises/magicCanvasMapping.js';
import {
  calculateParticleInteraction,
  createParticleUniverseState,
} from '../src/exercises/particleUniverseMapping.js';
import { recognizeGestureFrame } from '../src/vision/gestureRecognizer.js';
import {
  classifyHandLandmarks,
  createKnnClassifier,
  extractDatasetFromKnnModel,
  validateKnnModelJson,
} from '../src/vision/knnClassifier.js';
import {
  buildTrainingDatasetPayload,
  CANONICAL_HANDEDNESS,
  canonicalizeHandFeatureVector,
  canonicalizeHandLandmarks,
  CLASSIFICATION_FEATURE_COUNT,
  extractClassificationFeatures,
  extractHandFeatureVector,
  HAND_FEATURE_COUNT,
  HAND_FEATURE_SPEC,
  normalizeHandedness,
  parseTrainingDatasetJson,
} from '../src/vision/landmarkFeatures.js';

/**
 * Generates synthetic, anatomically distinct 21-landmark 3D hand poses in raw
 * camera space (Right-hand reference) so gestures are genuinely separable
 * and an untrained pose lies well outside calibrated open-set thresholds.
 */
function makeRightHandPose(poseName, options = {}) {
  const { offsetX = 0.5, offsetY = 0.65, scale = 0.16, jitter = 0 } = options;

  // Base coordinates relative to wrist (0, 0, 0) in Right-hand orientation
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

  if (poseName === 'Victory') {
    // Thumb, ring, pinky curled toward palm; index & middle extended in a V
    pts[3] = [-0.15, -0.36, -0.12];
    pts[4] = [0.02, -0.3, -0.16];
    pts[7] = [-0.24, -0.98, -0.04];
    pts[8] = [-0.3, -1.18, -0.05];
    pts[11] = [0.1, -1.04, -0.03];
    pts[12] = [0.16, -1.22, -0.04];
    pts[14] = [0.14, -0.32, -0.12];
    pts[15] = [0.1, -0.18, -0.14];
    pts[16] = [0.08, -0.1, -0.12];
    pts[18] = [0.25, -0.26, -0.1];
    pts[19] = [0.21, -0.14, -0.12];
    pts[20] = [0.18, -0.08, -0.1];
  } else if (poseName === 'Thumbs_Up') {
    // Thumb pointing strongly up & outward; all four fingers curled tight horizontally
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
    // Index extended straight up; middle, ring, pinky, thumb curled
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
    // All fingers & thumb tightly curled into palm (distinct compact cluster)
    pts[2] = [-0.16, -0.2, -0.08];
    pts[3] = [-0.02, -0.24, -0.15];
    pts[4] = [0.12, -0.2, -0.18];
    for (const base of [5, 9, 13, 17]) {
      pts[base + 1] = [pts[base][0] * 0.9, -0.32, -0.12];
      pts[base + 2] = [pts[base][0] * 0.7, -0.18, -0.16];
      pts[base + 3] = [pts[base][0] * 0.5, -0.08, -0.12];
    }
  }

  return pts.map(([lx, ly, lz], idx) => {
    const jx = jitter ? Math.sin(idx * 1.7 + jitter) * jitter : 0;
    const jy = jitter ? Math.cos(idx * 2.3 + jitter) * jitter : 0;
    const jz = jitter ? Math.sin(idx * 3.1 + jitter) * jitter : 0;
    return {
      x: offsetX + (lx + jx) * scale,
      y: offsetY + (ly + jy) * scale,
      z: (lz + jz) * scale,
    };
  });
}

function mirrorPoseToLeft(rightLandmarks, shiftX = 0) {
  return rightLandmarks.map((pt) => ({
    x: 1 - pt.x + shiftX,
    y: pt.y,
    z: pt.z ?? 0,
  }));
}

function buildRightTrainedClassifier(options = {}) {
  const {
    k = 5,
    confidenceThreshold = 0.6,
    maxDistanceThreshold = 0.85,
    classDistanceThresholds = {
      Victory: 0.72,
      Thumbs_Up: 0.72,
    },
  } = options;

  const samples = [];
  for (let i = 0; i < 6; i += 1) {
    const lmV = makeRightHandPose('Victory', {
      offsetX: 0.35 + i * 0.04,
      offsetY: 0.68 - i * 0.01,
      scale: 0.14 + i * 0.01,
      jitter: i * 0.015,
    });
    samples.push({
      label: 'Victory',
      handedness: 'Right',
      handednessCanonicalized: true,
      features: extractHandFeatureVector(lmV, { handedness: 'Right' }),
    });

    const lmT = makeRightHandPose('Thumbs_Up', {
      offsetX: 0.4 + i * 0.03,
      offsetY: 0.62 + i * 0.01,
      scale: 0.15 + i * 0.008,
      jitter: i * 0.015,
    });
    samples.push({
      label: 'Thumbs_Up',
      handedness: 'Right',
      handednessCanonicalized: true,
      features: extractHandFeatureVector(lmT, { handedness: 'Right' }),
    });
  }

  const validated = validateKnnModelJson({
    schemaVersion: 3,
    featureSpec: { ...HAND_FEATURE_SPEC },
    hyperparams: {
      k,
      metric: 'euclidean',
      weighting: 'distance',
      confidenceThreshold,
      maxDistanceThreshold,
      classDistanceThresholds,
    },
    samples,
  });

  return createKnnClassifier(validated);
}

test('normalizeHandedness & canonicalizeHandLandmarks handle Left/Right/null without mutation', () => {
  assert.equal(normalizeHandedness('Left'), 'Left');
  assert.equal(normalizeHandedness('  left '), 'Left');
  assert.equal(normalizeHandedness('RIGHT'), 'Right');
  assert.equal(normalizeHandedness(null), null);
  assert.equal(normalizeHandedness('Unknown'), null);

  const rightPose = makeRightHandPose('Victory', { offsetX: 0.3, offsetY: 0.65, scale: 0.16 });
  const originalSnapshot = structuredClone(rightPose);
  const leftPose = mirrorPoseToLeft(rightPose, -0.15);

  const canonLeft = canonicalizeHandLandmarks(leftPose, 'Left');
  const canonRight = canonicalizeHandLandmarks(rightPose, 'Right');

  assert.deepEqual(rightPose, originalSnapshot, 'canonicalizeHandLandmarks must not mutate input');
  assert.equal(canonLeft.length, 21);
  for (let i = 0; i < 21; i += 1) {
    assert.ok(Math.abs(canonLeft[i].x - (1 - leftPose[i].x)) < 1e-12);
    assert.equal(canonLeft[i].y, leftPose[i].y);
    assert.equal(canonLeft[i].z, leftPose[i].z);
    assert.equal(canonRight[i].x, rightPose[i].x);
  }
});

test('Left and Right hands performing the same gesture produce identical 63D canonical features across position/scale', () => {
  for (const pose of ['Victory', 'Thumbs_Up', 'Pointing_Up', 'Closed_Fist']) {
    const rightLm = makeRightHandPose(pose, { offsetX: 0.32, offsetY: 0.72, scale: 0.14 });
    const leftLm = mirrorPoseToLeft(
      makeRightHandPose(pose, { offsetX: 0.66, offsetY: 0.58, scale: 0.21 })
    );

    const featRight = extractHandFeatureVector(rightLm, { handedness: 'Right' });
    const featLeft = extractHandFeatureVector(leftLm, { handedness: 'Left' });

    assert.equal(featRight.length, HAND_FEATURE_COUNT);
    assert.equal(featLeft.length, HAND_FEATURE_COUNT);

    let maxDiff = 0;
    for (let j = 0; j < HAND_FEATURE_COUNT; j += 1) {
      const diff = Math.abs(featRight[j] - featLeft[j]);
      if (diff > maxDiff) maxDiff = diff;
    }
    assert.ok(
      maxDiff < 1e-12,
      `${pose}: expected identical Left/Right canonical features, maxDiff=${maxDiff}`
    );
  }
});

test('Train Right -> Test Left & Train Left -> Test Right both classify accurately while preserving open-set rejection', () => {
  const rightClassifier = buildRightTrainedClassifier();

  // Test Left hand on Victory & Thumbs_Up
  const leftVictory = mirrorPoseToLeft(
    makeRightHandPose('Victory', { offsetX: 0.38, offsetY: 0.66, scale: 0.18 })
  );
  const leftPred = classifyHandLandmarks(rightClassifier, leftVictory, {}, { handedness: 'Left' });
  assert.equal(leftPred.rejected, false);
  assert.equal(leftPred.label, 'Victory');
  assert.ok(leftPred.confidence >= 0.9);
  assert.ok(leftPred.nearestDistance < 0.2);
  assert.equal(leftPred.diagnostics.handedness, 'Left');
  assert.equal(leftPred.diagnostics.handednessCanonicalized, true);
  assert.equal(leftPred.diagnostics.canonicalHand, CANONICAL_HANDEDNESS);

  const leftThumbs = mirrorPoseToLeft(
    makeRightHandPose('Thumbs_Up', { offsetX: 0.45, offsetY: 0.61, scale: 0.15 })
  );
  const thumbsPred = classifyHandLandmarks(rightClassifier, leftThumbs, {}, { handedness: 'Left' });
  assert.equal(thumbsPred.rejected, false);
  assert.equal(thumbsPred.label, 'Thumbs_Up');
  assert.ok(thumbsPred.nearestDistance < 0.2);

  // Train strictly on Left hand, test with Right hand
  const leftSamples = [];
  for (let i = 0; i < 6; i += 1) {
    const lmV = mirrorPoseToLeft(
      makeRightHandPose('Victory', { offsetX: 0.35 + i * 0.03, scale: 0.15, jitter: i * 0.01 })
    );
    leftSamples.push({
      label: 'Victory',
      handedness: 'Left',
      handednessCanonicalized: true,
      features: extractHandFeatureVector(lmV, { handedness: 'Left' }),
    });
    const lmP = mirrorPoseToLeft(
      makeRightHandPose('Pointing_Up', { offsetX: 0.45 + i * 0.03, scale: 0.15, jitter: i * 0.01 })
    );
    leftSamples.push({
      label: 'Pointing_Up',
      handedness: 'Left',
      handednessCanonicalized: true,
      features: extractHandFeatureVector(lmP, { handedness: 'Left' }),
    });
  }
  const leftModel = validateKnnModelJson({
    schemaVersion: 3,
    featureSpec: { ...HAND_FEATURE_SPEC },
    hyperparams: {
      k: 5,
      confidenceThreshold: 0.6,
      maxDistanceThreshold: 0.85,
      classDistanceThresholds: { Victory: 0.72, Pointing_Up: 0.72 },
    },
    samples: leftSamples,
  });
  const leftClassifier = createKnnClassifier(leftModel);

  const rightPointing = makeRightHandPose('Pointing_Up', { offsetX: 0.62, scale: 0.19 });
  const rightPred = classifyHandLandmarks(leftClassifier, rightPointing, {}, { handedness: 'Right' });
  assert.equal(rightPred.rejected, false);
  assert.equal(rightPred.label, 'Pointing_Up');
  assert.ok(rightPred.nearestDistance < 0.2);

  // Open-set rejection MUST remain active for untrained gestures on BOTH hands
  const rightUnknownOpenPalm = makeRightHandPose('Open_Palm', { offsetX: 0.5, scale: 0.16 });
  const leftUnknownOpenPalm = mirrorPoseToLeft(rightUnknownOpenPalm);
  const rightUnknownFist = makeRightHandPose('Closed_Fist', { offsetX: 0.5, scale: 0.16 });

  for (const [lm, handLabel] of [
    [rightUnknownOpenPalm, 'Right'],
    [leftUnknownOpenPalm, 'Left'],
    [rightUnknownFist, 'Right'],
  ]) {
    const unkPred = classifyHandLandmarks(rightClassifier, lm, {}, { handedness: handLabel });
    assert.equal(unkPred.rejected, true, `Expected ${handLabel} untrained pose to be rejected`);
    assert.equal(unkPred.label, 'None');
    assert.ok(
      unkPred.reason === 'class-distance' || unkPred.reason === 'unknown-distance',
      `Expected distance-based rejection, got ${unkPred.reason}`
    );
  }
});

test('Legacy samples.json migration recomputes from rawLandmarks, converts feature-only Left once, preserves missing handedness, and never double-flips', () => {
  const rightVictory = makeRightHandPose('Victory', { offsetX: 0.35, scale: 0.16 });
  const leftVictory = mirrorPoseToLeft(rightVictory);

  // Legacy un-canonicalized features (computed with canonicalize: false)
  const legacyLeftRawFeatures = extractHandFeatureVector(leftVictory, { canonicalize: false });
  const legacyRightFeatures = extractHandFeatureVector(rightVictory, { canonicalize: false });
  const canonicalExpected = extractHandFeatureVector(rightVictory, { handedness: 'Right' });

  const legacyDataset = {
    schemaVersion: 1,
    featureSpec: {
      featureCount: 63,
      landmarkCount: 21,
      dimensions: ['x', 'y', 'z'],
      coordinateSource: 'hand.landmarks',
      coordinateSpace: 'raw-landmarks-wrist-centered-maxnorm',
      handednessCanonicalization: false,
    },
    classes: ['Victory'],
    samples: [
      {
        id: 'legacy_left_with_raw',
        label: 'Victory',
        handedness: 'Left',
        rawLandmarks: leftVictory,
        features: legacyLeftRawFeatures,
      },
      {
        id: 'legacy_left_features_only',
        label: 'Victory',
        handedness: 'Left',
        features: legacyLeftRawFeatures,
      },
      {
        id: 'legacy_right_features_only',
        label: 'Victory',
        handedness: 'Right',
        features: legacyRightFeatures,
      },
      {
        id: 'legacy_missing_handedness',
        label: 'Victory',
        handedness: null,
        features: legacyLeftRawFeatures,
      },
    ],
  };

  const legacySnapshot = structuredClone(legacyDataset);
  const parsed = parseTrainingDatasetJson(legacyDataset);

  // Must never silently mutate caller's legacy payload
  assert.deepEqual(legacyDataset, legacySnapshot);

  assert.equal(parsed.migrationReport.sourceCanonicalized, false);
  assert.equal(parsed.migrationReport.recomputedFromRawCount, 1);
  assert.equal(parsed.migrationReport.convertedLeftFeaturesCount, 1);
  assert.equal(parsed.migrationReport.unconvertibleMissingHandednessCount, 1);
  assert.equal(parsed.migrationReport.warnings.length, 1);
  assert.match(parsed.migrationReport.warnings[0], /lacked handedness metadata/i);

  const byId = new Map(parsed.samples.map((s) => [s.id, s]));

  // Left with rawLandmarks -> canonicalized, original handedness & unmirrored rawLandmarks preserved
  const s1 = byId.get('legacy_left_with_raw');
  assert.equal(s1.handedness, 'Left');
  assert.equal(s1.handednessCanonicalized, true);
  assert.deepEqual(s1.rawLandmarks, leftVictory);
  for (let j = 0; j < HAND_FEATURE_COUNT; j += 1) {
    assert.ok(Math.abs(s1.features[j] - canonicalExpected[j]) < 1e-12);
  }

  // Feature-only Left -> converted once to canonical Right-hand space
  const s2 = byId.get('legacy_left_features_only');
  assert.equal(s2.handedness, 'Left');
  assert.equal(s2.handednessCanonicalized, true);
  for (let j = 0; j < HAND_FEATURE_COUNT; j += 1) {
    assert.ok(Math.abs(s2.features[j] - canonicalExpected[j]) < 1e-12);
  }

  // Missing handedness -> left UNCHANGED and flagged handednessCanonicalized: false
  const s4 = byId.get('legacy_missing_handedness');
  assert.equal(s4.handedness, null);
  assert.equal(s4.handednessCanonicalized, false);
  assert.deepEqual(s4.features, legacyLeftRawFeatures);

  // Export -> Re-import round-trip MUST NEVER double-flip!
  const exported = buildTrainingDatasetPayload(parsed.samples, parsed.classes);
  assert.equal(exported.schemaVersion, 2);
  assert.equal(exported.featureSpec.handednessCanonicalization, true);
  assert.equal(exported.featureSpec.canonicalHand, 'Right');

  const reimported = parseTrainingDatasetJson(exported);
  assert.equal(reimported.migrationReport.recomputedFromRawCount, 0);
  assert.equal(reimported.migrationReport.convertedLeftFeaturesCount, 0);
  const reById = new Map(reimported.samples.map((s) => [s.id, s]));
  assert.deepEqual(reById.get('legacy_left_features_only').features, s2.features);
  assert.deepEqual(reById.get('legacy_left_with_raw').features, s1.features);
  assert.deepEqual(reById.get('legacy_missing_handedness').features, legacyLeftRawFeatures);
  assert.equal(reById.get('legacy_missing_handedness').handednessCanonicalized, false);

  // Even if top-level featureSpec says false, per-sample handednessCanonicalized: true prevents double-flipping
  const mixedPayload = {
    schemaVersion: 1,
    featureSpec: {
      coordinateSpace: 'raw-landmarks-wrist-centered-maxnorm',
      handednessCanonicalization: false,
    },
    samples: [
      {
        id: 'already_canon_left',
        label: 'Victory',
        handedness: 'Left',
        handednessCanonicalized: true,
        features: canonicalExpected,
      },
    ],
  };
  const mixedParsed = parseTrainingDatasetJson(mixedPayload);
  assert.equal(mixedParsed.migrationReport.convertedLeftFeaturesCount, 0);
  assert.deepEqual(mixedParsed.samples[0].features, canonicalExpected);
});

test('Legacy knn-gesture-model.json loads safely, converts single-hand Left models for both hands, and prevents double-flipping', () => {
  // Build a legacy model trained purely on Left hand with handednessCanonicalization: false
  const legacySamples = [];
  for (let i = 0; i < 6; i += 1) {
    const leftV = mirrorPoseToLeft(
      makeRightHandPose('Victory', { offsetX: 0.36 + i * 0.02, scale: 0.15, jitter: i * 0.01 })
    );
    legacySamples.push({
      label: 'Victory',
      handedness: 'Left',
      features: extractHandFeatureVector(leftV, { canonicalize: false }),
    });
    const leftT = mirrorPoseToLeft(
      makeRightHandPose('Thumbs_Up', { offsetX: 0.42 + i * 0.02, scale: 0.15, jitter: i * 0.01 })
    );
    legacySamples.push({
      label: 'Thumbs_Up',
      handedness: 'Left',
      features: extractHandFeatureVector(leftT, { canonicalize: false }),
    });
  }

  const legacyModelJson = {
    schemaVersion: 2,
    modelType: 'knn-hand-landmarks',
    featureSpec: {
      featureCount: 63,
      landmarkCount: 21,
      dimensions: ['x', 'y', 'z'],
      coordinateSource: 'hand.landmarks',
      coordinateSpace: 'raw-landmarks-wrist-centered-maxnorm',
      handednessCanonicalization: false,
    },
    hyperparams: {
      k: 5,
      metric: 'euclidean',
      weighting: 'distance',
      confidenceThreshold: 0.6,
      maxDistanceThreshold: 0.85,
      classDistanceThresholds: { Victory: 0.72, Thumbs_Up: 0.72 },
    },
    samples: legacySamples,
  };

  const legacySnapshot = structuredClone(legacyModelJson);
  const validated = validateKnnModelJson(legacyModelJson);
  assert.deepEqual(legacyModelJson, legacySnapshot, 'Must not mutate original model object');
  assert.equal(validated.featureSpec.handednessCanonicalization, true);
  assert.equal(validated.featureSpec.sourceHandednessCanonicalization, false);
  assert.equal(validated.migrationReport.convertedLeftCount, 12);

  // Re-validating or recovering dataset from validated model must NOT double-flip
  const validatedTwice = validateKnnModelJson(validated);
  assert.equal(validatedTwice.migrationReport.convertedLeftCount, 0);
  assert.deepEqual(validatedTwice.samples[0].features, validated.samples[0].features);

  const recovered = extractDatasetFromKnnModel(validated);
  assert.equal(recovered.samples.length, 12);
  assert.equal(recovered.samples[0].handedness, 'Left');
  assert.equal(recovered.samples[0].handednessCanonicalized, true);
  assert.deepEqual(recovered.samples[0].features, validated.samples[0].features);

  // Inference with converted legacy model must accept BOTH Right and Left hands and reject Unknown
  const classifier = createKnnClassifier(validated);
  const rightV = makeRightHandPose('Victory', { offsetX: 0.55, scale: 0.17 });
  const leftV = mirrorPoseToLeft(rightV);
  const rightOpen = makeRightHandPose('Open_Palm', { offsetX: 0.5, scale: 0.16 });

  const predRight = classifyHandLandmarks(classifier, rightV, {}, { handedness: 'Right' });
  const predLeft = classifyHandLandmarks(classifier, leftV, {}, { handedness: 'Left' });
  const predUnknown = classifyHandLandmarks(classifier, rightOpen, {}, { handedness: 'Right' });

  assert.equal(predRight.rejected, false);
  assert.equal(predRight.label, 'Victory');
  assert.equal(predLeft.rejected, false);
  assert.equal(predLeft.label, 'Victory');
  assert.equal(predUnknown.rejected, true);
  assert.equal(predUnknown.label, 'None');
});

test('recognizeGestureFrame handles two-hand custom KNN independently and preserves pretrained + activity pipelines', () => {
  const classifier = buildRightTrainedClassifier();

  const rightThumbs = makeRightHandPose('Thumbs_Up', { offsetX: 0.25, offsetY: 0.65, scale: 0.16 });
  const leftVictory = mirrorPoseToLeft(
    makeRightHandPose('Victory', { offsetX: 0.25, offsetY: 0.65, scale: 0.16 })
  );

  // Mock MediaPipe GestureRecognizer returning 2 hands in unmirrored camera space
  const mockVideo = { readyState: 4, videoWidth: 640, videoHeight: 360 };
  const mockRecognizer = {
    recognizeForVideo() {
      return {
        landmarks: [leftVictory, rightThumbs],
        handedness: [[{ categoryName: 'Left' }], [{ categoryName: 'Right' }]],
        gestures: [
          [{ categoryName: 'Victory', score: 0.94 }],
          [{ categoryName: 'Thumb_Up', score: 0.92 }],
        ],
      };
    },
  };

  // Custom KNN two-hand frame: each hand canonicalised & classified independently
  const customFrame = recognizeGestureFrame(mockRecognizer, mockVideo, 1000, 0.55, {
    classifierSource: 'custom-knn',
    customClassifier: classifier,
  });

  assert.equal(customFrame.handDetected, true);
  assert.equal(customFrame.handCount, 2);
  const labels = customFrame.hands.map((h) => h.rawGestureName).sort();
  assert.deepEqual(labels, ['Thumbs_Up', 'Victory']);
  for (const h of customFrame.hands) {
    assert.equal(h.rejected, false);
    assert.equal(h.knnDiagnostics.handednessCanonicalized, true);
    assert.equal(h.mirroredLandmarks.length, 21);
    assert.ok(Math.abs(h.mirroredLandmarks[0].x - (1 - h.landmarks[0].x)) < 1e-12);
  }

  // Pretrained mode continues to work unchanged
  const pretrainedFrame = recognizeGestureFrame(mockRecognizer, mockVideo, 1020, 0.55, {
    classifierSource: 'pretrained',
  });
  assert.equal(pretrainedFrame.handCount, 2);
  assert.deepEqual(
    pretrainedFrame.hands.map((h) => h.rawGestureName).sort(),
    ['Thumb_Up', 'Victory']
  );

  // Magic Canvas & Particle Universe mappings remain functional
  const mcState = createMagicCanvasGestureState();
  const mcAction = mapGestureToFireworkAction(
    pretrainedFrame,
    mcState,
    { width: 1280, height: 720 },
    'golden-peony',
    1020
  );
  assert.ok(mcAction && typeof mcAction.type === 'string');

  const puState = createParticleUniverseState();
  const puRes = calculateParticleInteraction(
    customFrame,
    puState,
    'galaxy',
    1000,
    {
      classifierSource: 'custom-knn',
      actionBindings: {
        particleUniverse: {
          Victory: 'NEXT_SHAPE',
          Thumbs_Up: 'ATTRACT',
        },
      },
    }
  );
  assert.equal(puRes.handCount, 2);
  assert.equal(puRes.engineInteraction.manualControlActive, true);
});

test('JS and Colab notebook Python preprocessing match identically for Left, Right, null, and legacy conversion', () => {
  const nbPath = path.resolve(process.cwd(), 'notebooks/Custom_Gesture_KNN_Training.ipynb');
  const nbJson = JSON.parse(fs.readFileSync(nbPath, 'utf8'));
  assert.equal(nbJson.nbformat, 4);

  const prepareCell = nbJson.cells.find((c) => c.metadata?.id === 'prepare_features');
  assert.ok(prepareCell, 'prepare_features cell must exist in notebook');
  const fullSource = prepareCell.source.join('');

  // Extract pure-Python function definitions from the prepare_features cell
  const cutMarker = 'dataset_canonicalized =';
  const markerIdx = fullSource.indexOf(cutMarker);
  assert.ok(markerIdx > 0, 'Expected dataset_canonicalized marker in prepare_features');
  const funcDefsOnly = fullSource
    .slice(0, markerIdx)
    .replace('import numpy as np\n', '');

  const rightV = makeRightHandPose('Victory', { offsetX: 0.34, offsetY: 0.67, scale: 0.17 });
  const leftV = mirrorPoseToLeft(rightV, 0.12);
  const legacyLeftVec = extractHandFeatureVector(leftV, { canonicalize: false });
  const legacyRightVec = extractHandFeatureVector(rightV, { canonicalize: false });

  const pyTestPayload = {
    rightLm: rightV,
    leftLm: leftV,
    legacyLeftVec,
    legacyRightVec,
  };

  const pyScript = `
import json, sys
${funcDefsOnly}
payload = json.loads(sys.stdin.read())
out = {
  "normLeft": normalize_handedness("  left "),
  "normRight": normalize_handedness("RIGHT"),
  "normNull": normalize_handedness(None),
  "rightCanon": extract_hand_feature_vector(payload["rightLm"], handedness="Right"),
  "leftCanon": extract_hand_feature_vector(payload["leftLm"], handedness="Left"),
  "nullCanon": extract_hand_feature_vector(payload["leftLm"], handedness=None),
  "legacyLeftConverted": canonicalize_hand_feature_vector(payload["legacyLeftVec"], handedness="Left"),
  "legacyRightUnchanged": canonicalize_hand_feature_vector(payload["legacyRightVec"], handedness="Right"),
}
out["rightClf95"] = extract_classification_features(out["rightCanon"])
out["leftClf95"] = extract_classification_features(out["leftCanon"])
print(json.dumps(out))
`;

  const stdout = execFileSync('python3', ['-c', pyScript], {
    input: JSON.stringify(pyTestPayload),
    encoding: 'utf8',
  });
  const pyOut = JSON.parse(stdout);

  assert.equal(pyOut.normLeft, 'Left');
  assert.equal(pyOut.normRight, 'Right');
  assert.equal(pyOut.normNull, null);

  const jsRight = extractHandFeatureVector(rightV, { handedness: 'Right' });
  const jsLeft = extractHandFeatureVector(leftV, { handedness: 'Left' });
  const jsNull = extractHandFeatureVector(leftV, { handedness: null });
  const jsLegacyLeftConverted = canonicalizeHandFeatureVector(legacyLeftVec, 'Left');
  const jsLegacyRightUnchanged = canonicalizeHandFeatureVector(legacyRightVec, 'Right');
  const jsRightClf95 = extractClassificationFeatures(jsRight);
  const jsLeftClf95 = extractClassificationFeatures(jsLeft);

  const assertClose = (a, b, label) => {
    assert.equal(a.length, HAND_FEATURE_COUNT);
    assert.equal(b.length, HAND_FEATURE_COUNT);
    for (let j = 0; j < HAND_FEATURE_COUNT; j += 1) {
      assert.ok(
        Math.abs(a[j] - b[j]) < 1e-12,
        `${label} mismatch at index ${j}: js=${a[j]}, py=${b[j]}`
      );
    }
  };

  assertClose(jsRight, pyOut.rightCanon, 'Right hand JS vs Python');
  assertClose(jsLeft, pyOut.leftCanon, 'Left hand JS vs Python');
  assertClose(jsLeft, jsRight, 'Left vs Right JS');
  assertClose(pyOut.leftCanon, pyOut.rightCanon, 'Left vs Right Python');
  assertClose(jsNull, pyOut.nullCanon, 'Null handedness JS vs Python');
  assertClose(jsLegacyLeftConverted, pyOut.legacyLeftConverted, 'Legacy Left conversion JS vs Python');
  assertClose(jsLegacyRightUnchanged, pyOut.legacyRightUnchanged, 'Legacy Right JS vs Python');
  assertClose(jsLegacyLeftConverted, jsRight, 'Legacy Left conversion matches canonical Right');

  assert.equal(jsRightClf95.length, CLASSIFICATION_FEATURE_COUNT);
  assert.equal(pyOut.rightClf95.length, CLASSIFICATION_FEATURE_COUNT);
  for (let j = 0; j < CLASSIFICATION_FEATURE_COUNT; j += 1) {
    assert.ok(
      Math.abs(jsRightClf95[j] - pyOut.rightClf95[j]) < 1e-12,
      `95D rightClf mismatch at ${j}: js=${jsRightClf95[j]}, py=${pyOut.rightClf95[j]}`
    );
    assert.ok(
      Math.abs(jsLeftClf95[j] - pyOut.leftClf95[j]) < 1e-12,
      `95D leftClf mismatch at ${j}: js=${jsLeftClf95[j]}, py=${pyOut.leftClf95[j]}`
    );
  }

  // Execute the full prepare_features cell loop in Python (with lightweight numpy stub)
  // to verify legacy dataset migration, double-flip prevention, and missing-handedness reporting.
  const mixedDataset = {
    schemaVersion: 1,
    featureSpec: {
      coordinateSpace: 'raw-landmarks-wrist-centered-maxnorm',
      handednessCanonicalization: false,
    },
    samples: [
      { id: 'r1', label: 'Victory', handedness: 'Left', rawLandmarks: leftV, features: legacyLeftVec },
      { id: 'r2', label: 'Victory', handedness: 'Left', features: legacyLeftVec },
      { id: 'r3', label: 'Victory', handedness: 'Left', handednessCanonicalized: true, features: jsRight },
      { id: 'r4', label: 'Victory', handedness: null, features: legacyLeftVec },
    ],
  };

  const jsParsed = parseTrainingDatasetJson(mixedDataset);
  const fullLoopScript = `
import json, sys, types
fake_np = types.SimpleNamespace(float32=float, asarray=lambda arr, dtype=None: arr)
sys.modules["numpy"] = fake_np
dataset = json.loads(sys.stdin.read())
raw_samples = dataset.get("samples", [])
${fullSource.replace('assert X.ndim == 2 and X.shape[1] == HAND_FEATURE_COUNT, f"Expected (*, 63), got {X.shape}"\n', '').replace('print(f"Prepared canonical feature matrix X={X.shape}, {len(CLASSES)} classes={CLASSES}")', '')}
print(json.dumps({
  "recomputed_from_raw": recomputed_from_raw,
  "converted_left_features": converted_left_features,
  "already_canonical": already_canonical,
  "missing_handedness": unconvertible_missing_handedness,
  "meta_list": meta_list,
}))
`;

  const loopStdout = execFileSync('python3', ['-c', fullLoopScript], {
    input: JSON.stringify(mixedDataset),
    encoding: 'utf8',
  });
  const jsonLine = loopStdout.trim().split('\n').pop();
  const pyLoopOut = JSON.parse(jsonLine);

  assert.equal(pyLoopOut.recomputed_from_raw, jsParsed.migrationReport.recomputedFromRawCount);
  assert.equal(pyLoopOut.converted_left_features, jsParsed.migrationReport.convertedLeftFeaturesCount);
  assert.equal(pyLoopOut.already_canonical, jsParsed.migrationReport.alreadyCanonicalCount);
  assert.equal(pyLoopOut.missing_handedness, jsParsed.migrationReport.unconvertibleMissingHandednessCount);
  assert.equal(pyLoopOut.meta_list.length, jsParsed.samples.length);
  for (let i = 0; i < jsParsed.samples.length; i += 1) {
    assert.equal(pyLoopOut.meta_list[i].handedness, jsParsed.samples[i].handedness);
    assert.equal(
      pyLoopOut.meta_list[i].handednessCanonicalized,
      jsParsed.samples[i].handednessCanonicalized
    );
    assertClose(jsParsed.samples[i].features, pyLoopOut.meta_list[i].features, `Row ${i}`);
  }
});

test('Hand detection remains functional when MediaPipe handedness is missing, null, empty, or z is null', () => {
  const classifier = buildRightTrainedClassifier();
  const rightVictory = makeRightHandPose('Victory', { offsetX: 0.4, offsetY: 0.6, scale: 0.16 });
  const landmarksNullZ = rightVictory.map((pt) => ({ x: pt.x, y: pt.y, z: null }));
  const mockVideo = { readyState: 4, videoWidth: 640, videoHeight: 360 };

  for (const handednessPayload of [undefined, null, [], [[]], [[{}]], [[{ categoryName: '' }]]]) {
    const mockRecognizer = {
      recognizeForVideo() {
        return {
          landmarks: [landmarksNullZ],
          handedness: handednessPayload,
          gestures: [[{ categoryName: 'Victory', score: 0.91 }]],
        };
      },
    };

    const pretrained = recognizeGestureFrame(mockRecognizer, mockVideo, 1000, 0.55, {
      classifierSource: 'pretrained',
    });
    assert.equal(pretrained.handDetected, true);
    assert.equal(pretrained.handCount, 1);
    assert.equal(pretrained.landmarks.length, 21);
    assert.equal(pretrained.mirroredLandmarks.length, 21);
    assert.equal(pretrained.rawGestureName, 'Victory');
    assert.equal(pretrained.hands[0].handedness, null);

    const custom = recognizeGestureFrame(mockRecognizer, mockVideo, 1050, 0.55, {
      classifierSource: 'custom-knn',
      customClassifier: classifier,
      customOverrides: null,
    });
    assert.equal(custom.handDetected, true);
    assert.equal(custom.handCount, 1);
    assert.equal(custom.landmarks.length, 21);
    assert.equal(custom.mirroredLandmarks.length, 21);
    assert.equal(custom.hands[0].rejected, false);
    assert.equal(custom.hands[0].rawGestureName, 'Victory');
    assert.equal(custom.hands[0].knnDiagnostics.handedness, null);
    assert.equal(custom.hands[0].knnDiagnostics.handednessCanonicalized, false);
  }
});

test('Custom KNN runtime errors do not interrupt MediaPipe hand detection or landmark output', () => {
  const rightVictory = makeRightHandPose('Victory', { offsetX: 0.4, offsetY: 0.6, scale: 0.16 });
  const mockVideo = { readyState: 4, videoWidth: 640, videoHeight: 360 };
  const mockRecognizer = {
    recognizeForVideo() {
      return {
        landmarks: [rightVictory],
        handedness: [[{ categoryName: 'Right' }]],
        gestures: [[{ categoryName: 'Victory', score: 0.9 }]],
      };
    },
  };

  // Pass a malformed classifier/smoother that throws during KNN inference
  const brokenSmoother = {
    smooth() {
      throw new Error('simulated smoother crash');
    },
    pruneExcept() {},
    reset() {},
  };

  const frame = recognizeGestureFrame(mockRecognizer, mockVideo, 1100, 0.55, {
    classifierSource: 'custom-knn',
    customClassifier: buildRightTrainedClassifier(),
    temporalSmoother: brokenSmoother,
  });

  assert.equal(frame.handDetected, true);
  assert.equal(frame.handCount, 1);
  assert.equal(frame.landmarks.length, 21);
  assert.equal(frame.mirroredLandmarks.length, 21);
  assert.equal(frame.hands[0].handedness, 'Right');
  assert.equal(frame.hands[0].rejected, true);
  assert.equal(frame.hands[0].rejectionReason, 'knn-error');
});
