import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  calculatePosePointsTier,
  calculatePoseSimilarity,
  createPoseChallengeState,
  evaluateHalfBodyCalibration,
  evaluatePoseChallenge,
  extractRelevantPoseLandmarks,
  getEffectivePoseScoring,
  getPerformanceTitle,
  normalizePoseCoordinates,
} from '../src/exercises/poseChallengeMapping.js';
import {
  POSE_LIBRARY,
  POSE_LEVELS,
  selectArcadeRoundPoses,
} from '../src/exercises/poseLibrary.js';

function buildHalfBodyRawLandmarks(mirroredNormPts, options = {}) {
  const {
    originX = 0.5,
    originY = 0.5,
    shoulderSpan = 0.22,
    hideKnees = true,
    liftedKneeIndices = [],
    visibleAnkleIndices = [],
    hideAnkles = true,
  } = options;

  const raw = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 1.25,
    z: 0,
    visibility: 0.05,
  }));

  for (const [idxStr, pt] of Object.entries(mirroredNormPts)) {
    const idx = Number(idxStr);
    const mirroredX = originX + pt.x * shoulderSpan;
    const rawX = 1 - mirroredX; // unmirrored camera space
    const rawY = originY + pt.y * shoulderSpan;

    let visibility = pt.visibility ?? 0.95;
    if (idx === 27 || idx === 28) {
      if (visibleAnkleIndices.includes(idx)) {
        visibility = pt.visibility ?? 0.95;
      } else if (hideAnkles) {
        visibility = 0.05;
      }
    } else if ((idx === 25 || idx === 26) && hideKnees && !liftedKneeIndices.includes(idx)) {
      visibility = 0.2;
    }

    raw[idx] = { x: rawX, y: rawY, z: 0, visibility };
  }

  return raw;
}

function mirrorPoints(landmarks) {
  const swap = {
    0: 0,
    11: 12,
    12: 11,
    13: 14,
    14: 13,
    15: 16,
    16: 15,
    23: 24,
    24: 23,
    25: 26,
    26: 25,
    27: 28,
    28: 27,
  };
  const out = {};
  for (const [k, pt] of Object.entries(landmarks)) {
    const idx = swap[Number(k)] ?? Number(k);
    out[idx] = { ...pt, x: -pt.x };
  }
  return out;
}

function createNeutralHalfBodyRaw(options = {}) {
  return buildHalfBodyRawLandmarks(
    {
      0: { x: 0, y: -1.06 },
      11: { x: -0.48, y: -0.66 },
      12: { x: 0.48, y: -0.66 },
      13: { x: -0.54, y: -0.05 },
      14: { x: 0.54, y: -0.05 },
      15: { x: -0.52, y: 0.56 },
      16: { x: 0.52, y: 0.56 },
      23: { x: -0.35, y: 0.46 },
      24: { x: 0.35, y: 0.46 },
      25: { x: -0.36, y: 1.06 },
      26: { x: 0.36, y: 1.06 },
      27: { x: -0.38, y: 1.72 },
      28: { x: 0.38, y: 1.72 },
    },
    options
  );
}

test('POSE_LIBRARY defines all 15 wacky poses across 3 levels with 10s/12s/15s timings', () => {
  assert.equal(POSE_LIBRARY.length, 15);
  assert.deepEqual(
    POSE_LEVELS.map((l) => [l.level, l.name, l.roundDurationMs]),
    [
      [1, 'Warming Up', 10000],
      [2, 'Getting Weird', 12000],
      [3, 'Absolute Chaos', 15000],
    ]
  );

  assert.deepEqual(
    POSE_LIBRARY.map((p) => p.name),
    [
      'The Dab',
      'Mind Blown',
      'Chicken Wings',
      'Wrong Number',
      'The Self Hug',
      'The Croissant',
      'The Flamingo',
      'Disco Alien',
      'Sideways Chicken',
      'The Archer',
      'The Karate Kick',
      'Flamingo Disco',
      'The Broken Windmill',
      'The Sideways Balance',
      'The Final Boss — Twisted Flamingo',
    ]
  );

  // Upper-body-only poses must NOT require knees or ankles
  const upperBodyIds = new Set([
    'the-dab',
    'mind-blown',
    'chicken-wings',
    'wrong-number',
    'the-self-hug',
    'the-croissant',
    'disco-alien',
    'the-archer',
    'the-broken-windmill',
  ]);
  for (const pose of POSE_LIBRARY) {
    if (upperBodyIds.has(pose.id)) {
      assert.ok(!pose.targetPose.requiredIndices.includes(25));
      assert.ok(!pose.targetPose.requiredIndices.includes(26));
      assert.ok(!pose.targetPose.requiredIndices.includes(27));
      assert.ok(!pose.targetPose.requiredIndices.includes(28));
    }
  }

  // Straight-leg Karate Kick strictly requires hip (24), knee (26), and ankle (28)
  const karateKick = POSE_LIBRARY.find((p) => p.id === 'the-karate-kick');
  assert.ok(karateKick.targetPose.requiredIndices.includes(24));
  assert.ok(karateKick.targetPose.requiredIndices.includes(26));
  assert.ok(karateKick.targetPose.requiredIndices.includes(28));

  assert.equal(selectArcadeRoundPoses('All').length, 15);
  assert.equal(selectArcadeRoundPoses('Warming Up').length, 5);
  assert.equal(selectArcadeRoundPoses('Getting Weird').length, 5);
  assert.equal(selectArcadeRoundPoses('Absolute Chaos').length, 5);
});

test('evaluateHalfBodyCalibration supports head-to-mid-thigh framing internally', () => {
  const calibratedRaw = createNeutralHalfBodyRaw({
    shoulderSpan: 0.36,
    originY: 0.48,
    hideKnees: true,
    hideAnkles: true,
  });

  const res = evaluateHalfBodyCalibration(calibratedRaw);
  assert.equal(res.isCalibrated, true);
  assert.equal(res.checks.head, true);
  assert.equal(res.checks.shoulders, true);
  assert.equal(res.checks.hips, true);
  assert.equal(res.checks.centered, true);
});

test('Neutral resting posture fails all 15 wacky poses', () => {
  const neutralRaw = createNeutralHalfBodyRaw({
    shoulderSpan: 0.2,
    hideKnees: false,
    hideAnkles: false,
    visibleAnkleIndices: [27, 28],
  });
  const normalized = normalizePoseCoordinates(extractRelevantPoseLandmarks(neutralRaw));

  for (const challenge of POSE_LIBRARY) {
    const threshold = getEffectivePoseScoring(challenge, 'Standard').threshold;
    const sim = calculatePoseSimilarity(normalized, challenge.targetPose);
    assert.ok(
      sim.score < threshold,
      `Neutral posture must not pass ${challenge.name} (got ${sim.score}, threshold ${threshold})`
    );
  }
});

test('All 15 poses (canonical and mirrored variants) score high and complete hold window', () => {
  for (const challenge of POSE_LIBRARY) {
    const needsBentKnee = challenge.targetPose.poseRules?.some(
      (r) => r.type === 'horizontalThigh'
    );
    const needsStraightLeg = challenge.targetPose.poseRules?.some(
      (r) => r.type === 'straightHorizontalLeg'
    );

    const variants = [challenge.targetPose.landmarks];
    if (challenge.targetPose.allowMirror) {
      variants.push(mirrorPoints(challenge.targetPose.landmarks));
    }

    variants.forEach((landmarks, variantIdx) => {
      const liftedKneeIndices =
        needsBentKnee || needsStraightLeg ? (variantIdx === 0 ? [26] : [25]) : [];
      const visibleAnkleIndices = needsStraightLeg ? (variantIdx === 0 ? [28] : [27]) : [];

      const raw = buildHalfBodyRawLandmarks(landmarks, {
        shoulderSpan: needsStraightLeg ? 0.2 : 0.24,
        hideKnees: true,
        liftedKneeIndices,
        hideAnkles: !needsStraightLeg,
        visibleAnkleIndices,
      });

      const state = createPoseChallengeState();
      let latest;
      for (let t = 0; t <= 1600; t += 140) {
        latest = evaluatePoseChallenge(raw, challenge, state, t, 'Standard');
      }

      assert.ok(
        latest.rawScore >= 85,
        `Expected ${challenge.name} (variant ${variantIdx}) rawScore >= 85, got ${latest.rawScore} (${latest.feedback})`
      );
      assert.equal(
        latest.completed,
        true,
        `Expected ${challenge.name} (variant ${variantIdx}) to complete hold`
      );
    });
  }
});

test('Leg-lifting poses reject small knee raises and out-of-frame landmarks', () => {
  const byId = Object.fromEntries(POSE_LIBRARY.map((p) => [p.id, p]));
  const legPoseIds = [
    'the-flamingo',
    'sideways-chicken',
    'the-karate-kick',
    'flamingo-disco',
    'the-sideways-balance',
    'the-final-boss',
  ];

  // 1. Small knee raise (~40 degrees below horizontal) MUST fail all 6 leg poses
  for (const id of legPoseIds) {
    const challenge = byId[id];
    const lm = structuredClone(challenge.targetPose.landmarks);
    const hip = lm[24];
    lm[26] = { x: hip.x + 0.35, y: hip.y + 0.42 }; // small knee lift, far from horizontal
    if (lm[28]) {
      lm[28] = { x: hip.x + 0.55, y: hip.y + 0.92 };
    }

    const raw = buildHalfBodyRawLandmarks(lm, {
      shoulderSpan: 0.2,
      hideKnees: false,
      liftedKneeIndices: [26],
      hideAnkles: false,
      visibleAnkleIndices: [28],
    });
    const norm = normalizePoseCoordinates(extractRelevantPoseLandmarks(raw));
    const sim = calculatePoseSimilarity(norm, challenge.targetPose);
    const thresh = getEffectivePoseScoring(challenge, 'Standard').threshold;
    assert.ok(
      sim.score < thresh,
      `Small knee raise must fail ${challenge.name} (got ${sim.score}, threshold ${thresh})`
    );
  }

  // 2. Out-of-frame knee (y > 1.0, even with high visibility!) MUST fail bent-knee poses
  for (const id of [
    'the-flamingo',
    'sideways-chicken',
    'flamingo-disco',
    'the-sideways-balance',
    'the-final-boss',
  ]) {
    const challenge = byId[id];
    const lm = structuredClone(challenge.targetPose.landmarks);
    // 2a. If only lifted knee 26 clips outside viewport while standing knee 25 stays down, pose MUST still fail (< threshold)
    const clippedLifted = buildHalfBodyRawLandmarks(lm, {
      shoulderSpan: 0.22,
      originY: 0.48,
      hideKnees: false,
      liftedKneeIndices: [26],
      hideAnkles: true,
    });
    clippedLifted[26].x = 1.04;
    clippedLifted[26].visibility = 0.96;
    const clippedSim = calculatePoseSimilarity(
      normalizePoseCoordinates(extractRelevantPoseLandmarks(clippedLifted)),
      challenge.targetPose
    );
    const thresh = getEffectivePoseScoring(challenge, 'Standard').threshold;
    assert.ok(
      clippedSim.score < thresh,
      `Out-of-frame lifted knee must fail ${challenge.name} (got ${clippedSim.score})`
    );

    // 2b. When both knees are below bottom of viewport (even with high visibility), missingRequired must flag it
    clippedLifted[25].y = 1.04;
    clippedLifted[25].visibility = 0.96;
    clippedLifted[26].y = 1.04;
    const bothOutSim = calculatePoseSimilarity(
      normalizePoseCoordinates(extractRelevantPoseLandmarks(clippedLifted)),
      challenge.targetPose
    );
    assert.ok(bothOutSim.missingRequired.length > 0, `${challenge.name} must flag out-of-frame knees`);
    assert.ok(bothOutSim.score < 40, `Out-of-frame knees must fail ${challenge.name} (got ${bothOutSim.score})`);
  }

  // 3. The Karate Kick MUST fail when ankle is out of frame OR when knee is deeply bent
  const karate = byId['the-karate-kick'];
  const karateAnkleOut = buildHalfBodyRawLandmarks(karate.targetPose.landmarks, {
    shoulderSpan: 0.2,
    hideKnees: false,
    liftedKneeIndices: [26],
    hideAnkles: false,
    visibleAnkleIndices: [28],
  });
  karateAnkleOut[28].x = -0.03; // clipped outside frame edge even with high visibility
  karateAnkleOut[28].visibility = 0.95;
  const karateOutSim = calculatePoseSimilarity(
    normalizePoseCoordinates(extractRelevantPoseLandmarks(karateAnkleOut)),
    karate.targetPose
  );
  assert.ok(karateOutSim.missingRequired.includes(28));
  assert.ok(karateOutSim.score < 40);

  const karateBentLm = structuredClone(karate.targetPose.landmarks);
  karateBentLm[28] = { x: 0.72, y: 1.1 }; // flamingo-like bent knee instead of straight kick
  const karateBentRaw = buildHalfBodyRawLandmarks(karateBentLm, {
    shoulderSpan: 0.2,
    hideKnees: false,
    liftedKneeIndices: [26],
    hideAnkles: false,
    visibleAnkleIndices: [28],
  });
  const karateBentSim = calculatePoseSimilarity(
    normalizePoseCoordinates(extractRelevantPoseLandmarks(karateBentRaw)),
    karate.targetPose
  );
  assert.ok(
    karateBentSim.score < getEffectivePoseScoring(karate, 'Standard').threshold,
    `Bent knee must fail The Karate Kick (got ${karateBentSim.score})`
  );

  // 4. Sideways Chicken must fail if knee is lifted straight forward (no lateral reach)
  const sideChicken = byId['sideways-chicken'];
  const narrowKneeLm = structuredClone(sideChicken.targetPose.landmarks);
  narrowKneeLm[26] = { x: narrowKneeLm[24].x + 0.08, y: narrowKneeLm[24].y };
  const narrowRaw = buildHalfBodyRawLandmarks(narrowKneeLm, {
    shoulderSpan: 0.22,
    hideKnees: false,
    liftedKneeIndices: [26],
    hideAnkles: true,
  });
  const narrowSim = calculatePoseSimilarity(
    normalizePoseCoordinates(extractRelevantPoseLandmarks(narrowRaw)),
    sideChicken.targetPose
  );
  assert.ok(
    narrowSim.score < getEffectivePoseScoring(sideChicken, 'Standard').threshold,
    `Forward-only knee must fail Sideways Chicken (got ${narrowSim.score})`
  );
});

test('Lookalike postures fail mismatched pose-specific rules', () => {
  const byId = Object.fromEntries(POSE_LIBRARY.map((p) => [p.id, p]));

  // T-pose arms out should fail upper-body folded/asymmetric poses
  const tPoseRaw = buildHalfBodyRawLandmarks(
    {
      0: { x: 0, y: -1.06 },
      11: { x: -0.48, y: -0.66 },
      12: { x: 0.48, y: -0.66 },
      13: { x: -1.08, y: -0.66 },
      14: { x: 1.08, y: -0.66 },
      15: { x: -1.66, y: -0.66 },
      16: { x: 1.66, y: -0.66 },
      23: { x: -0.35, y: 0.46 },
      24: { x: 0.35, y: 0.46 },
      25: { x: -0.36, y: 1.04 },
      26: { x: 0.36, y: 1.04 },
    },
    { hideKnees: true, hideAnkles: true }
  );
  const tNorm = normalizePoseCoordinates(extractRelevantPoseLandmarks(tPoseRaw));
  for (const id of [
    'the-dab',
    'mind-blown',
    'chicken-wings',
    'wrong-number',
    'the-self-hug',
    'the-croissant',
    'the-flamingo',
    'the-archer',
    'the-broken-windmill',
    'the-final-boss',
  ]) {
    const sim = calculatePoseSimilarity(tNorm, byId[id].targetPose);
    const thresh = getEffectivePoseScoring(byId[id], 'Standard').threshold;
    assert.ok(sim.score < thresh, `T-pose must fail ${id} (got ${sim.score})`);
  }

  // Chicken Wings without lifted sideways knee must fail Sideways Chicken
  const chickenWingsRaw = buildHalfBodyRawLandmarks(byId['chicken-wings'].targetPose.landmarks, {
    hideKnees: true,
    hideAnkles: true,
  });
  const chickenOnSideways = calculatePoseSimilarity(
    normalizePoseCoordinates(extractRelevantPoseLandmarks(chickenWingsRaw)),
    byId['sideways-chicken'].targetPose
  );
  assert.ok(
    chickenOnSideways.score < getEffectivePoseScoring(byId['sideways-chicken'], 'Standard').threshold,
    `Chicken Wings without sideways knee must fail Sideways Chicken (got ${chickenOnSideways.score})`
  );

  // Twisted Flamingo must require ALL 4 components simultaneously (horizontal bent knee, lean, cross-body arm, overhead arm)
  const boss = byId['the-final-boss'];
  const bossThresh = getEffectivePoseScoring(boss, 'Standard').threshold;
  assert.ok(boss.scoring.holdDurationMs >= 950 && boss.scoring.holdDurationMs <= 1150);

  // Missing sideways torso lean (upright torso, even with arms + horizontal bent knee) -> must fail
  const bossNoLeanLm = structuredClone(boss.targetPose.landmarks);
  bossNoLeanLm[0] = { x: 0, y: -1.06 };
  bossNoLeanLm[11] = { x: -0.48, y: -0.66 };
  bossNoLeanLm[12] = { x: 0.48, y: -0.66 };
  bossNoLeanLm[13] = { x: 0.08, y: -0.48 };
  bossNoLeanLm[15] = { x: 0.64, y: -0.36 };
  const bossNoLeanRaw = buildHalfBodyRawLandmarks(bossNoLeanLm, {
    hideKnees: false,
    liftedKneeIndices: [26],
    hideAnkles: false,
    visibleAnkleIndices: [28],
  });
  const bossNoLeanSim = calculatePoseSimilarity(
    normalizePoseCoordinates(extractRelevantPoseLandmarks(bossNoLeanRaw)),
    boss.targetPose
  );
  assert.ok(
    bossNoLeanSim.score < bossThresh,
    `Twisted Flamingo without sideways torso lean must fail (got ${bossNoLeanSim.score})`
  );

  // Missing cross-body arm (extending lower arm outward instead of across chest) -> must fail
  const bossNoCrossLm = structuredClone(boss.targetPose.landmarks);
  bossNoCrossLm[13] = { x: -1.26, y: -0.34 };
  bossNoCrossLm[15] = { x: -1.74, y: -0.22 };
  const bossNoCrossRaw = buildHalfBodyRawLandmarks(bossNoCrossLm, {
    hideKnees: false,
    liftedKneeIndices: [26],
    hideAnkles: false,
    visibleAnkleIndices: [28],
  });
  const bossNoCrossSim = calculatePoseSimilarity(
    normalizePoseCoordinates(extractRelevantPoseLandmarks(bossNoCrossRaw)),
    boss.targetPose
  );
  assert.ok(
    bossNoCrossSim.score < bossThresh,
    `Twisted Flamingo without cross-body arm must fail (got ${bossNoCrossSim.score})`
  );

  // Must not complete before ~1 second hold window
  const bossValidRaw = buildHalfBodyRawLandmarks(boss.targetPose.landmarks, {
    hideKnees: false,
    liftedKneeIndices: [26],
    hideAnkles: false,
    visibleAnkleIndices: [28],
  });
  const bossHoldState = createPoseChallengeState();
  let earlyCheck;
  for (let t = 0; t <= 700; t += 140) {
    earlyCheck = evaluatePoseChallenge(bossValidRaw, boss, bossHoldState, t, 'Standard');
  }
  assert.equal(earlyCheck.completed, false, 'Twisted Flamingo must require ~1s stability hold');
  let finalCheck;
  for (let t = 840; t <= 1680; t += 140) {
    finalCheck = evaluatePoseChallenge(bossValidRaw, boss, bossHoldState, t, 'Standard');
  }
  assert.equal(finalCheck.completed, true, 'Twisted Flamingo must award after ~1s hold');
});

test('Scoring rewards higher accuracy & faster completion and maps 15-pose performance titles', () => {
  const fastPerfect = calculatePosePointsTier(96, 2, {
    remainingMs: 8000,
    roundDurationMs: 10000,
    level: 2,
  });
  const slowGood = calculatePosePointsTier(76, 0, {
    remainingMs: 1000,
    roundDurationMs: 10000,
    level: 1,
  });
  const miss = calculatePosePointsTier(42, 0, {
    remainingMs: 0,
    roundDurationMs: 10000,
    level: 3,
  });

  assert.ok(fastPerfect.totalPoints > slowGood.totalPoints);
  assert.equal(miss.totalPoints, 0);
  assert.equal(miss.tier, 'Miss');

  assert.equal(getPerformanceTitle(13, 15, 88), 'Absolute Chaos Legend');
  assert.equal(getPerformanceTitle(8, 15, 72), 'Motion Master');
  assert.equal(getPerformanceTitle(3, 15, 48), 'Pose Beginner');
});

test('PoseChallengeActivity removes Half-Body View diagnostic panel and displays 3 wacky levels', () => {
  const src = fs.readFileSync(
    path.resolve(process.cwd(), 'src/activities/PoseChallengeActivity.jsx'),
    'utf8'
  );
  assert.doesNotMatch(src, /Half-Body View/);
  assert.doesNotMatch(src, /aria-label="Camera framing"/);
  assert.match(src, /POSE_LEVELS/);
  assert.match(src, /POSE_LIBRARY\.length/);
  assert.deepEqual(
    POSE_LEVELS.map((l) => l.name),
    ['Warming Up', 'Getting Weird', 'Absolute Chaos']
  );
});
