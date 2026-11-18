import { mirrorNormalizedX } from '../vision/landmarkMath.js';
import { RELEVANT_POSE_INDICES } from '../vision/poseLandmarker.js';

/**
 * NOTE ON AI/ML ARCHITECTURE FOR WORKSHOP PARTICIPANTS:
 * MediaPipe Pose Landmarker (a pretrained ML model) predicts 33 body landmark positions
 * and visibility confidence scores from each webcam video frame.
 *
 * All functions in this file are CUSTOM GEOMETRIC LOGIC written in JavaScript—not an ML model.
 * They calibrate half-body / dynamic framing, normalize body scale/position, evaluate
 * joint angles, horizontal thigh & straight-leg kick geometry, and manage scoring/progression.
 */

export const HOLD_DURATION_MS = 1150;
export const DEFAULT_ROUND_DURATION_MS = 10000;

export const DIFFICULTY_PRESETS = {
  Relaxed: { thresholdOffset: -5, holdDurationMs: 1000, roundDurationMs: 12000 },
  Standard: { thresholdOffset: 0, holdDurationMs: HOLD_DURATION_MS, roundDurationMs: 10000 },
  Strict: { thresholdOffset: 6, holdDurationMs: 1300, roundDurationMs: 10000 },
};

const LANDMARK_NAMES = {
  0: 'head',
  11: 'left shoulder',
  12: 'right shoulder',
  13: 'left elbow',
  14: 'right elbow',
  15: 'left wrist',
  16: 'right wrist',
  23: 'left hip',
  24: 'right hip',
  25: 'left knee',
  26: 'right knee',
  27: 'left ankle',
  28: 'right ankle',
};

const MIRROR_LANDMARK_SWAP = {
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

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function isInFrame(pt, minVis = 0.45, marginX = 0.02, marginY = 0.02) {
  if (!pt) return false;
  const vis = pt.visibility ?? 1;
  return (
    vis >= minVis &&
    pt.x >= marginX &&
    pt.x <= 1 - marginX &&
    pt.y >= marginY &&
    pt.y <= 1 - marginY
  );
}

function isLandmarkReady(lm, requireBounds = false) {
  if (!lm?.visible) return false;
  if (requireBounds && lm.inFrame === false) return false;
  return true;
}

/**
 * Internal camera calibration supporting normal half-body (head to mid-thigh)
 * without forcing full-body distance upfront.
 */
export function evaluateHalfBodyCalibration(rawLandmarks, minVisibility = 0.45) {
  if (!rawLandmarks || rawLandmarks.length < 25) {
    return {
      isCalibrated: false,
      checks: {
        head: false,
        shoulders: false,
        hips: false,
        knees: false,
        centered: false,
      },
      readyCount: 0,
      message: 'Step into the camera view',
      subMessage: 'Frame your upper body and thighs, then start.',
    };
  }

  const head = isInFrame(rawLandmarks[0], minVisibility, 0.04, 0.03);
  const shoulders =
    isInFrame(rawLandmarks[11], minVisibility, 0.03, 0.02) &&
    isInFrame(rawLandmarks[12], minVisibility, 0.03, 0.02);
  const hips =
    isInFrame(rawLandmarks[23], minVisibility, 0.025, 0.012) &&
    isInFrame(rawLandmarks[24], minVisibility, 0.025, 0.012);
  const knees =
    isInFrame(rawLandmarks[25], minVisibility, 0.02, 0.01) ||
    isInFrame(rawLandmarks[26], minVisibility, 0.02, 0.01);

  let centered = false;
  let mirroredCenterX = 0.5;
  if (shoulders || hips) {
    const refA = shoulders ? rawLandmarks[11] : rawLandmarks[23];
    const refB = shoulders ? rawLandmarks[12] : rawLandmarks[24];
    mirroredCenterX = mirrorNormalizedX((refA.x + refB.x) * 0.5);
    centered = mirroredCenterX >= 0.24 && mirroredCenterX <= 0.76;
  }

  const readyCount = [head, shoulders, hips, centered].filter(Boolean).length;
  const requiredZonesVisible = head && shoulders && hips;

  const shoulderSpan = shoulders
    ? Math.hypot(
        rawLandmarks[12].x - rawLandmarks[11].x,
        rawLandmarks[12].y - rawLandmarks[11].y
      )
    : 0;
  const tooClose = shoulderSpan > 0.62 || (head && rawLandmarks[0].y < 0.03);

  return {
    isCalibrated: requiredZonesVisible && centered && !tooClose,
    checks: {
      head,
      shoulders,
      hips,
      knees,
      centered,
    },
    readyCount,
    message: requiredZonesVisible && centered && !tooClose ? 'Ready to play!' : 'Frame your upper body',
    subMessage: 'Step back slightly if prompted for leg poses.',
  };
}

export const evaluateFullBodyCalibration = evaluateHalfBodyCalibration;

/**
 * Computes points earned and tier label from match accuracy (0..100),
 * faster completion time, streak, and level bonus.
 */
export function calculatePosePointsTier(accuracyScore, currentStreak = 0, options = {}) {
  const { remainingMs = 0, roundDurationMs = 10000, level = 1 } = options;
  const score = Math.max(0, Math.min(100, Math.round(accuracyScore)));

  let tier = 'Miss';
  let basePoints = 0;
  let perfectBonus = 0;

  if (score >= 95) {
    tier = 'Perfect';
    basePoints = 120;
    perfectBonus = 30;
  } else if (score >= 85) {
    tier = 'Great';
    basePoints = 95;
  } else if (score >= 75) {
    tier = 'Good';
    basePoints = 75;
  } else if (score >= 60) {
    tier = 'Cleared';
    basePoints = 60;
  }

  const speedRatio = roundDurationMs > 0 ? clamp01(remainingMs / roundDurationMs) : 0;
  const speedBonus = basePoints > 0 ? Math.round(speedRatio * 50) : 0;
  const levelBonus = basePoints > 0 && level > 1 ? (level - 1) * 15 : 0;
  const streakBonus = basePoints > 0 && currentStreak > 0 ? Math.min(60, currentStreak * 10) : 0;
  const totalPoints = basePoints + perfectBonus + speedBonus + levelBonus + streakBonus;

  return {
    tier,
    basePoints,
    perfectBonus,
    speedBonus,
    levelBonus,
    streakBonus,
    totalPoints,
  };
}

/**
 * Computes the final fun performance title from completed count and accuracy.
 */
export function getPerformanceTitle(clearedCount, totalCount = 15, avgAccuracy = 0) {
  const ratio = totalCount > 0 ? clearedCount / totalCount : 0;
  if (ratio >= 0.8 || (ratio >= 0.72 && avgAccuracy >= 82)) {
    return 'Absolute Chaos Legend';
  }
  if (ratio >= 0.46 || avgAccuracy >= 68) {
    return 'Motion Master';
  }
  return 'Pose Beginner';
}

export function createPoseChallengeState() {
  return {
    smoothedScore: 0,
    bestAccuracy: 0,
    holdElapsedMs: 0,
    lastEvalMs: null,
    completed: false,
    roundAwarded: false,
  };
}

export function resetPoseChallengeState(state) {
  state.smoothedScore = 0;
  state.bestAccuracy = 0;
  state.holdElapsedMs = 0;
  state.lastEvalMs = null;
  state.completed = false;
  state.roundAwarded = false;
}

/**
 * Extracts MediaPipe Pose Landmarker keypoints, mirrors X for selfie comparison,
 * and records visibility + whether each point actually sits inside the camera viewport [0..1].
 */
export function extractRelevantPoseLandmarks(
  landmarks,
  minVisibility = 0.45,
  options = {}
) {
  const { alreadyMirrored = false } = options;
  const allLandmarks = [];
  const keypoints = {};
  const visibleIndices = [];
  let visibilitySum = 0;

  if (!landmarks || landmarks.length === 0) {
    return { allLandmarks, keypoints, visibleIndices, averageVisibility: 0 };
  }

  for (let i = 0; i < landmarks.length; i += 1) {
    const pt = landmarks[i];
    if (!pt) continue;
    const visibility = pt.visibility ?? 1;
    const inFrame = pt.x >= 0.01 && pt.x <= 0.99 && pt.y >= 0.01 && pt.y <= 0.99;
    const visible = visibility >= minVisibility;
    const mirroredPt = {
      x: alreadyMirrored ? pt.x : mirrorNormalizedX(pt.x),
      y: pt.y,
      z: pt.z ?? 0,
      visibility,
      visible,
      inFrame,
    };
    allLandmarks[i] = mirroredPt;
    keypoints[i] = mirroredPt;
  }

  for (const idx of RELEVANT_POSE_INDICES) {
    const pt = keypoints[idx];
    if (!pt) continue;
    visibilitySum += pt.visibility;
    if (pt.visible) {
      visibleIndices.push(idx);
    }
  }

  return {
    allLandmarks,
    keypoints,
    visibleIndices,
    averageVisibility: visibilitySum / RELEVANT_POSE_INDICES.length,
  };
}

/**
 * Translates and scales extracted keypoints relative to the participant's torso center
 * and shoulder width so matching works at varying distances from the webcam.
 */
export function normalizePoseCoordinates(extractedPose) {
  const kp = extractedPose?.keypoints ?? {};
  const leftShoulder = kp[11];
  const rightShoulder = kp[12];

  if (!leftShoulder?.visible || !rightShoulder?.visible) {
    return {
      valid: false,
      shoulderWidth: 0,
      origin: { x: 0.5, y: 0.5 },
      averageVisibility: extractedPose?.averageVisibility ?? 0,
      landmarks: {},
    };
  }

  const shoulderWidth = Math.max(
    0.06,
    Math.hypot(rightShoulder.x - leftShoulder.x, rightShoulder.y - leftShoulder.y)
  );

  const shoulderMid = {
    x: (leftShoulder.x + rightShoulder.x) * 0.5,
    y: (leftShoulder.y + rightShoulder.y) * 0.5,
  };

  const leftHip = kp[23];
  const rightHip = kp[24];
  const hipsVisible = leftHip?.visible && rightHip?.visible;
  const singleHip = leftHip?.visible ? leftHip : rightHip?.visible ? rightHip : null;

  const origin = hipsVisible
    ? {
        x: (shoulderMid.x + (leftHip.x + rightHip.x) * 0.5) * 0.5,
        y: (shoulderMid.y + (leftHip.y + rightHip.y) * 0.5) * 0.5,
      }
    : singleHip
      ? {
          x: shoulderMid.x,
          y: (shoulderMid.y + singleHip.y) * 0.5,
        }
      : {
          x: shoulderMid.x,
          y: shoulderMid.y + shoulderWidth * 0.58,
        };

  const normalized = {};
  const indicesToNormalize = new Set([0, ...RELEVANT_POSE_INDICES]);
  for (const idx of indicesToNormalize) {
    const pt = kp[idx];
    if (!pt) continue;
    normalized[idx] = {
      x: (pt.x - origin.x) / shoulderWidth,
      y: (pt.y - origin.y) / shoulderWidth,
      visibility: pt.visibility ?? 1,
      visible: pt.visible,
      inFrame: pt.inFrame !== false,
    };
  }

  return {
    valid: true,
    shoulderWidth,
    origin,
    averageVisibility: extractedPose?.averageVisibility ?? 1,
    landmarks: normalized,
  };
}

function calculateJointAngleDeg(a, b, c) {
  const bax = a.x - b.x;
  const bay = a.y - b.y;
  const bcx = c.x - b.x;
  const bcy = c.y - b.y;
  const lenBA = Math.hypot(bax, bay);
  const lenBC = Math.hypot(bcx, bcy);
  if (lenBA < 0.04 || lenBC < 0.04) return null;
  const cosTheta = Math.max(-1, Math.min(1, (bax * bcx + bay * bcy) / (lenBA * lenBC)));
  return (Math.acos(cosTheta) * 180) / Math.PI;
}

function swapIdx(idx) {
  return MIRROR_LANDMARK_SWAP[idx] ?? idx;
}

function mirrorTargetPose(targetPose) {
  const mirroredLandmarks = {};
  for (const [key, pt] of Object.entries(targetPose.landmarks ?? {})) {
    const idx = Number(key);
    mirroredLandmarks[swapIdx(idx)] = { ...pt, x: -pt.x };
  }

  return {
    ...targetPose,
    requiredIndices: (targetPose.requiredIndices ?? []).map(swapIdx),
    optionalIndices: (targetPose.optionalIndices ?? []).map(swapIdx),
    landmarks: mirroredLandmarks,
    segments: (targetPose.segments ?? []).map((seg) => ({
      ...seg,
      from: swapIdx(seg.from),
      to: swapIdx(seg.to),
    })),
    jointTriplets: (targetPose.jointTriplets ?? []).map((t) => ({
      ...t,
      a: swapIdx(t.a),
      b: swapIdx(t.b),
      c: swapIdx(t.c),
    })),
    poseRules: (targetPose.poseRules ?? []).map((rule) => {
      switch (rule.type) {
        case 'dabPose':
          return {
            ...rule,
            tuckWristIdx: swapIdx(rule.tuckWristIdx),
            tuckElbowIdx: swapIdx(rule.tuckElbowIdx),
            tuckShoulderIdx: swapIdx(rule.tuckShoulderIdx),
            skyWristIdx: swapIdx(rule.skyWristIdx),
            skyElbowIdx: swapIdx(rule.skyElbowIdx),
            skyShoulderIdx: swapIdx(rule.skyShoulderIdx),
          };
        case 'wrongNumber':
          return {
            ...rule,
            earWristIdx: swapIdx(rule.earWristIdx),
            hipWristIdx: swapIdx(rule.hipWristIdx),
            hipIdx: swapIdx(rule.hipIdx),
            earSideSign: -(rule.earSideSign ?? -1),
          };
        case 'torsoLean':
          return { ...rule, dirX: -(rule.dirX ?? -1) };
        case 'croissantArc':
          return { ...rule, dirX: -(rule.dirX ?? -1) };
        case 'foldedBowArm':
          return {
            ...rule,
            wristIdx: swapIdx(rule.wristIdx ?? 16),
            elbowIdx: swapIdx(rule.elbowIdx ?? 14),
            sideSign: -(rule.sideSign ?? 1),
          };
        case 'twistedFlamingoArms':
          return {
            ...rule,
            skyShoulderIdx: swapIdx(rule.skyShoulderIdx ?? 12),
            skyElbowIdx: swapIdx(rule.skyElbowIdx ?? 14),
            skyWristIdx: swapIdx(rule.skyWristIdx ?? 16),
            crossShoulderIdx: swapIdx(rule.crossShoulderIdx ?? 11),
            crossElbowIdx: swapIdx(rule.crossElbowIdx ?? 13),
            crossWristIdx: swapIdx(rule.crossWristIdx ?? 15),
            crossDirX: -(rule.crossDirX ?? 1),
          };
        case 'horizontalThigh':
        case 'straightHorizontalLeg':
          return {
            ...rule,
            hipIdx: swapIdx(rule.hipIdx ?? 24),
            kneeIdx: swapIdx(rule.kneeIdx ?? 26),
            standingKneeIdx: swapIdx(rule.standingKneeIdx ?? 25),
            ankleIdx: rule.ankleIdx ? swapIdx(rule.ankleIdx) : undefined,
          };
        default:
          return rule;
      }
    }),
  };
}

function getHeadAnchor(userLm) {
  const u0 = userLm[0];
  if (u0?.visible) return { x: u0.x, y: u0.y };
  const u11 = userLm[11];
  const u12 = userLm[12];
  return {
    x: (u11.x + u12.x) * 0.5,
    y: (u11.y + u12.y) * 0.5 - 0.38,
  };
}

function evaluatePoseRule(rule, userLm) {
  if (rule.type === 'dabPose') {
    const uTuckW = userLm[rule.tuckWristIdx];
    const uTuckE = userLm[rule.tuckElbowIdx];
    const uTuckS = userLm[rule.tuckShoulderIdx];
    const uSkyW = userLm[rule.skyWristIdx];
    const uSkyE = userLm[rule.skyElbowIdx];
    const uSkyS = userLm[rule.skyShoulderIdx];
    if (
      !uTuckW?.visible ||
      !uTuckE?.visible ||
      !uTuckS?.visible ||
      !uSkyW?.visible ||
      !uSkyE?.visible ||
      !uSkyS?.visible
    ) {
      return 0;
    }

    const head = getHeadAnchor(userLm);
    const faceDist = Math.hypot(uTuckW.x - head.x, uTuckW.y - head.y);
    const tuckScore = clamp01((0.95 - faceDist) / (0.95 - 0.45));

    const tuckAngle = calculateJointAngleDeg(uTuckS, uTuckE, uTuckW) ?? 180;
    const tuckBendScore = clamp01((140 - tuckAngle) / (140 - 85));

    const shoulderY = (uTuckS.y + uSkyS.y) * 0.5;
    const skyLift = shoulderY - uSkyW.y;
    const skyReachScore = clamp01((skyLift - 0.1) / 0.5);
    const skyAngle = calculateJointAngleDeg(uSkyS, uSkyE, uSkyW) ?? 90;
    const skyStraightScore = clamp01((skyAngle - 115) / (160 - 115));

    return Math.round(
      Math.min(tuckScore, tuckBendScore, skyReachScore, skyStraightScore) * 100
    );
  }

  if (rule.type === 'mindBlown') {
    const u11 = userLm[11];
    const u12 = userLm[12];
    const u13 = userLm[13];
    const u14 = userLm[14];
    const u15 = userLm[15];
    const u16 = userLm[16];
    if (
      !u11?.visible ||
      !u12?.visible ||
      !u13?.visible ||
      !u14?.visible ||
      !u15?.visible ||
      !u16?.visible
    ) {
      return 0;
    }

    const head = getHeadAnchor(userLm);
    const dL = Math.hypot(u15.x - (head.x - 0.3), u15.y - head.y);
    const dR = Math.hypot(u16.x - (head.x + 0.3), u16.y - head.y);
    const nearHeadScore = clamp01((0.9 - Math.max(dL, dR)) / (0.9 - 0.46));
    const flareL = clamp01((u15.x - u13.x - 0.15) / 0.35);
    const flareR = clamp01((u14.x - u16.x - 0.15) / 0.35);

    return Math.round(Math.min(nearHeadScore, flareL, flareR) * 100);
  }

  if (rule.type === 'chickenWings') {
    const u11 = userLm[11];
    const u12 = userLm[12];
    const u13 = userLm[13];
    const u14 = userLm[14];
    const u15 = userLm[15];
    const u16 = userLm[16];
    if (
      !u11?.visible ||
      !u12?.visible ||
      !u13?.visible ||
      !u14?.visible ||
      !u15?.visible ||
      !u16?.visible
    ) {
      return 0;
    }

    const dL = Math.hypot(u15.x - u11.x, u15.y - (u11.y + 0.16));
    const dR = Math.hypot(u16.x - u12.x, u16.y - (u12.y + 0.16));
    const tuckScore = clamp01((0.86 - Math.max(dL, dR)) / (0.86 - 0.44));

    const flareL = clamp01((u11.x - u13.x - 0.18) / 0.28);
    const flareR = clamp01((u14.x - u12.x - 0.18) / 0.28);

    return Math.round(Math.min(tuckScore, flareL, flareR) * 100);
  }

  if (rule.type === 'wrongNumber') {
    const uEarW = userLm[rule.earWristIdx];
    const uHipW = userLm[rule.hipWristIdx];
    const uHip = userLm[rule.hipIdx];
    if (!uEarW?.visible || !uHipW?.visible || !uHip?.visible || !userLm[11]?.visible || !userLm[12]?.visible) {
      return 0;
    }

    const head = getHeadAnchor(userLm);
    const earTarget = { x: head.x + (rule.earSideSign ?? -1) * 0.28, y: head.y };
    const earDist = Math.hypot(uEarW.x - earTarget.x, uEarW.y - earTarget.y);
    const earScore = clamp01((0.88 - earDist) / (0.88 - 0.46));

    const hipDist = Math.hypot(uHipW.x - uHip.x, uHipW.y - uHip.y);
    const hipScore = clamp01((0.92 - hipDist) / (0.92 - 0.52));

    return Math.round(Math.min(earScore, hipScore) * 100);
  }

  if (rule.type === 'selfHug') {
    const u11 = userLm[11];
    const u12 = userLm[12];
    const u15 = userLm[15];
    const u16 = userLm[16];
    if (!u11?.visible || !u12?.visible || !u15?.visible || !u16?.visible) return 0;

    const dLeftToRightShoulder = Math.hypot(u15.x - u12.x, u15.y - u12.y);
    const dRightToLeftShoulder = Math.hypot(u16.x - u11.x, u16.y - u11.y);
    const wrapScore = clamp01((0.98 - Math.max(dLeftToRightShoulder, dRightToLeftShoulder)) / (0.98 - 0.52));
    const crossScore = clamp01((u15.x - u16.x + 0.1) / 0.5);

    return Math.round(Math.min(wrapScore, crossScore) * 100);
  }

  if (rule.type === 'croissantArc') {
    const u11 = userLm[11];
    const u12 = userLm[12];
    const u15 = userLm[15];
    const u16 = userLm[16];
    if (!u11?.visible || !u12?.visible || !u15?.visible || !u16?.visible) return 0;

    const shoulderMidX = (u11.x + u12.x) * 0.5;
    const shoulderMidY = (u11.y + u12.y) * 0.5;
    const minLift = Math.min(shoulderMidY - u15.y, shoulderMidY - u16.y);
    const heightScore = clamp01((minLift - 0.05) / 0.45);

    const avgWristX = (u15.x + u16.x) * 0.5;
    const curveShift = (avgWristX - shoulderMidX) * (rule.dirX ?? -1);
    const arcScore = clamp01((curveShift + 0.05) / 0.35);

    return Math.round(Math.min(heightScore, arcScore) * 100);
  }

  if (rule.type === 'foldedBowArm') {
    const u11 = userLm[11];
    const u12 = userLm[12];
    const uWrist = userLm[rule.wristIdx ?? 16];
    const uElbow = userLm[rule.elbowIdx ?? 14];
    if (!u11?.visible || !u12?.visible || !uWrist?.visible || !uElbow?.visible) return 0;

    const chestTarget = {
      x: (u11.x + u12.x) * 0.5 + (rule.sideSign ?? 1) * 0.22,
      y: (u11.y + u12.y) * 0.5,
    };
    const dist = Math.hypot(uWrist.x - chestTarget.x, uWrist.y - chestTarget.y);
    const foldScore = clamp01((0.88 - dist) / (0.88 - 0.42)) * 100;
    const elbowOutSpan = Math.abs(uElbow.x - uWrist.x);
    if (elbowOutSpan < 0.25) {
      return Math.round(foldScore * clamp01(elbowOutSpan / 0.25));
    }
    return Math.round(foldScore);
  }

  if (rule.type === 'torsoLean') {
    const u11 = userLm[11];
    const u12 = userLm[12];
    const u23 = userLm[23];
    const u24 = userLm[24];
    if (!u11?.visible || !u12?.visible || !u23?.visible || !u24?.visible) return 0;

    const shoulderMidX = (u11.x + u12.x) * 0.5;
    const shoulderMidY = (u11.y + u12.y) * 0.5;
    const hipMidX = (u23.x + u24.x) * 0.5;
    const hipMidY = (u23.y + u24.y) * 0.5;

    const sx = shoulderMidX - hipMidX;
    const sy = Math.max(0.15, hipMidY - shoulderMidY);
    const signedLeanDeg = (Math.atan2(sx, sy) * 180) / Math.PI;
    const directionalLeanDeg = signedLeanDeg * (rule.dirX ?? -1);

    const minLean = rule.minLeanDeg ?? 10;
    return Math.round(clamp01((directionalLeanDeg - 3) / Math.max(6, minLean + 4)) * 100);
  }

  if (rule.type === 'twistedFlamingoArms') {
    const skyS = userLm[rule.skyShoulderIdx ?? 12];
    const skyE = userLm[rule.skyElbowIdx ?? 14];
    const skyW = userLm[rule.skyWristIdx ?? 16];
    const crossS = userLm[rule.crossShoulderIdx ?? 11];
    const crossE = userLm[rule.crossElbowIdx ?? 13];
    const crossW = userLm[rule.crossWristIdx ?? 15];
    if (
      !skyS?.visible ||
      !skyE?.visible ||
      !skyW?.visible ||
      !crossS?.visible ||
      !crossE?.visible ||
      !crossW?.visible
    ) {
      return 0;
    }

    const shoulderMidX = (skyS.x + crossS.x) * 0.5;
    const shoulderMidY = (skyS.y + crossS.y) * 0.5;

    // 1. Diagonal overhead arm
    const skyLift = shoulderMidY - skyW.y;
    const skyLiftScore = clamp01((skyLift - 0.18) / 0.55);
    const skyAngle = calculateJointAngleDeg(skyS, skyE, skyW) ?? 90;
    const skyExtScore = clamp01((skyAngle - 105) / 40);

    // 2. Cross-body extended arm reaching past torso midline toward opposite side
    const dir = rule.crossDirX ?? 1;
    const crossReachFromShoulder = (crossW.x - crossS.x) * dir;
    const crossMidlineReach = (crossW.x - shoulderMidX) * dir;
    const crossSpanScore = Math.min(
      clamp01((crossReachFromShoulder - 0.35) / 0.55),
      clamp01((crossMidlineReach + 0.05) / 0.35)
    );
    const crossArmAngle = calculateJointAngleDeg(crossS, crossE, crossW) ?? 90;
    const crossExtScore = clamp01((crossArmAngle - 100) / 42);

    // 3. Asymmetric vertical separation between overhead wrist and cross-body wrist
    const asymSepScore = clamp01((crossW.y - skyW.y - 0.25) / 0.5);

    return Math.round(
      Math.min(skyLiftScore, skyExtScore, crossSpanScore, crossExtScore, asymSepScore) * 100
    );
  }

  if (rule.type === 'horizontalThigh') {
    const uHip = userLm[rule.hipIdx ?? 24];
    const uKnee = userLm[rule.kneeIdx ?? 26];
    const uStandingKnee = userLm[rule.standingKneeIdx ?? 25];
    const uAnkle = rule.ankleIdx ? userLm[rule.ankleIdx] : null;

    // Must never pass if hip or knee is invisible or outside the camera viewport
    if (!isLandmarkReady(uHip, true) || !isLandmarkReady(uKnee, true)) {
      return 0;
    }

    const dx = uKnee.x - uHip.x;
    const dy = uKnee.y - uHip.y;

    // When lifting sideways, demand real lateral extension and compute exact 2D segment angle
    let angleDeg;
    if (rule.requireOutwardSide) {
      const sideReach = Math.abs(dx);
      if (sideReach < (rule.minSideReach ?? 0.36)) {
        return Math.round(clamp01(sideReach / (rule.minSideReach ?? 0.36)) * 25);
      }
      angleDeg = (Math.atan2(Math.abs(dy), sideReach) * 180) / Math.PI;
    } else {
      // Uses effective femur projection >= 0.56 so forward-toward-camera horizontal lifts work
      // accurately while small vertical knee raises (high dy) fail cleanly
      const effHoriz = Math.max(Math.abs(dx), 0.56);
      angleDeg = (Math.atan2(Math.abs(dy), effHoriz) * 180) / Math.PI;
    }

    const maxTol = rule.maxAngleDeg ?? 26;
    let score = clamp01((maxTol + 14 - angleDeg) / 22) * 100;

    // Penalize double-knee squatting when standing knee is also visible
    if (isLandmarkReady(uStandingKnee, true)) {
      const kneeSepY = uStandingKnee.y - uKnee.y;
      if (kneeSepY < 0.2) {
        score = Math.min(score, clamp01(kneeSepY / 0.2) * 35);
      }
    }

    // If bent knee is required and ankle happens to be visible in frame, verify knee bend (< 142 deg)
    if (rule.requireBentKnee && isLandmarkReady(uAnkle, true)) {
      const kneeAngle = calculateJointAngleDeg(uHip, uKnee, uAnkle);
      if (kneeAngle !== null && kneeAngle > 142) {
        score = Math.min(score, clamp01((175 - kneeAngle) / 33) * 40);
      }
    }

    return Math.round(score);
  }

  if (rule.type === 'straightHorizontalLeg') {
    const uHip = userLm[rule.hipIdx ?? 24];
    const uKnee = userLm[rule.kneeIdx ?? 26];
    const uAnkle = userLm[rule.ankleIdx ?? 28];
    const uStandingKnee = userLm[rule.standingKneeIdx ?? 25];

    // Straight-leg Karate Kick strictly requires hip, knee, AND ankle visible and inside viewport
    if (!isLandmarkReady(uHip, true) || !isLandmarkReady(uKnee, true) || !isLandmarkReady(uAnkle, true)) {
      return 0;
    }

    const thighAngleDeg =
      (Math.atan2(Math.abs(uKnee.y - uHip.y), Math.max(Math.abs(uKnee.x - uHip.x), 0.56)) * 180) /
      Math.PI;
    const legAngleDeg =
      (Math.atan2(Math.abs(uAnkle.y - uHip.y), Math.max(Math.abs(uAnkle.x - uHip.x), 1.05)) * 180) /
      Math.PI;

    const maxTol = rule.maxAngleDeg ?? 26;
    const horizScore =
      Math.min(
        clamp01((maxTol + 14 - thighAngleDeg) / 22),
        clamp01((maxTol + 12 - legAngleDeg) / 22)
      ) * 100;

    // Knee extension check using hip, knee, ankle geometry
    const legSpan2D = Math.hypot(uAnkle.x - uHip.x, uAnkle.y - uHip.y);
    let extensionScore = 100;
    if (legSpan2D >= 0.45) {
      const kneeAngle = calculateJointAngleDeg(uHip, uKnee, uAnkle) ?? 0;
      const minExt = rule.minKneeAngleDeg ?? 142;
      extensionScore = clamp01((kneeAngle - (minExt - 22)) / 24) * 100;
    } else {
      // Forward kick directly into the camera foreshortens 2D span; ankle must stay near knee/hip height
      const shinDrop = Math.max(0, uAnkle.y - uKnee.y);
      extensionScore = clamp01((0.3 - shinDrop) / 0.22) * 100;
    }

    let score = Math.min(horizScore, extensionScore);

    if (isLandmarkReady(uStandingKnee, true)) {
      const kneeSepY = uStandingKnee.y - uKnee.y;
      if (kneeSepY < 0.2) {
        score = Math.min(score, clamp01(kneeSepY / 0.2) * 35);
      }
    }

    return Math.round(score);
  }

  return 100;
}

function scorePoseOrientation(normalizedUserPose, targetPose) {
  const userLm = normalizedUserPose.landmarks;
  const required = targetPose.requiredIndices ?? [];

  // For lower-body joints (23..28), enforce both confidence and viewport bounds so out-of-frame legs never pass
  const missingRequired = required.filter((idx) => !isLandmarkReady(userLm[idx], idx >= 23));

  if (missingRequired.length > 0) {
    const firstMissing = LANDMARK_NAMES[missingRequired[0]] ?? 'body landmarks';
    const visibleRatio = Math.max(0, 1 - missingRequired.length / Math.max(1, required.length));
    const needsFullLeg = missingRequired.some((idx) => idx === 27 || idx === 28);
    const needsKnee = missingRequired.some((idx) => idx === 25 || idx === 26);

    let hint = `Adjust framing so your ${firstMissing} is visible.`;
    if (needsFullLeg) {
      hint = 'Step slightly further back so your hip, knee, and ankle fit in view.';
    } else if (needsKnee) {
      hint = 'Make sure your hip and lifted knee stay clearly inside the camera view.';
    }

    return {
      score: Math.round(visibleRatio * 28),
      missingRequired,
      weakestHint: hint,
      segmentScores: [],
      angleScores: [],
    };
  }

  let weightedScoreSum = 0;
  let totalWeight = 0;
  let weakestHint = null;
  let weakestScore = 101;
  const segmentScores = [];
  const angleScores = [];

  for (const seg of targetPose.segments ?? []) {
    const uA = userLm[seg.from];
    const uB = userLm[seg.to];
    const tA = targetPose.landmarks[seg.from];
    const tB = targetPose.landmarks[seg.to];

    const readyA = isLandmarkReady(uA, seg.from >= 23);
    const readyB = isLandmarkReady(uB, seg.to >= 23);
    if (!readyA || !readyB || !tA || !tB) {
      if (seg.optional) continue;
      totalWeight += seg.weight;
      continue;
    }

    const ux = uB.x - uA.x;
    const uy = uB.y - uA.y;
    const uLen = Math.hypot(ux, uy);

    const tx = tB.x - tA.x;
    const ty = tB.y - tA.y;
    const tLen = Math.hypot(tx, ty);

    if (uLen < 0.05 || tLen < 0.05) {
      totalWeight += seg.weight;
      continue;
    }

    const dot = Math.max(-1, Math.min(1, (ux * tx + uy * ty) / (uLen * tLen)));
    const angleDeg = (Math.acos(dot) * 180) / Math.PI;

    const rawSegScore = Math.max(0, Math.min(100, 100 - Math.max(0, angleDeg - 12) * (100 / 64)));
    const confidenceFactor = Math.min(
      1,
      0.8 + 0.2 * Math.min(uA.visibility ?? 1, uB.visibility ?? 1)
    );
    const segScore = rawSegScore * confidenceFactor;

    weightedScoreSum += segScore * seg.weight;
    totalWeight += seg.weight;
    segmentScores.push({
      from: seg.from,
      to: seg.to,
      score: Math.round(segScore),
      part: seg.part,
      hint: seg.hint,
    });

    if (segScore < weakestScore) {
      weakestScore = segScore;
      weakestHint = seg.hint ?? weakestHint;
    }
  }

  for (const triplet of targetPose.jointTriplets ?? []) {
    const uA = userLm[triplet.a];
    const uB = userLm[triplet.b];
    const uC = userLm[triplet.c];
    const tA = targetPose.landmarks[triplet.a];
    const tB = targetPose.landmarks[triplet.b];
    const tC = targetPose.landmarks[triplet.c];

    if (
      !isLandmarkReady(uA, triplet.a >= 23) ||
      !isLandmarkReady(uB, triplet.b >= 23) ||
      !isLandmarkReady(uC, triplet.c >= 23) ||
      !tA ||
      !tB ||
      !tC
    ) {
      if (triplet.optional) continue;
      totalWeight += triplet.weight;
      continue;
    }

    const userAngle = calculateJointAngleDeg(uA, uB, uC);
    const targetAngle = calculateJointAngleDeg(tA, tB, tC);
    if (userAngle === null || targetAngle === null) continue;

    const diffDeg = Math.abs(userAngle - targetAngle);
    const jointScore = Math.max(0, Math.min(100, 100 - Math.max(0, diffDeg - 12) * (100 / 65)));

    weightedScoreSum += jointScore * triplet.weight;
    totalWeight += triplet.weight;
    angleScores.push({
      a: triplet.a,
      b: triplet.b,
      c: triplet.c,
      score: Math.round(jointScore),
      diffDeg: Math.round(diffDeg),
    });

    if (jointScore < weakestScore) {
      weakestScore = jointScore;
      weakestHint = triplet.hint ?? weakestHint;
    }
  }

  let ruleCap = 100;
  for (const rule of targetPose.poseRules ?? []) {
    const ruleScore = evaluatePoseRule(rule, userLm);
    const w = rule.weight ?? 1;
    weightedScoreSum += ruleScore * w;
    totalWeight += w;

    // Hard signature rules cannot be bypassed by high scores on unrelated limbs
    if (
      (rule.type === 'horizontalThigh' || rule.type === 'straightHorizontalLeg') &&
      ruleScore < 45
    ) {
      ruleCap = Math.min(ruleCap, 56);
    } else if (rule.type === 'twistedFlamingoArms' && ruleScore < 40) {
      ruleCap = Math.min(ruleCap, 58);
    } else if (ruleScore < 30) {
      ruleCap = Math.min(ruleCap, 60);
    }

    if (ruleScore < weakestScore) {
      weakestScore = ruleScore;
      weakestHint = rule.hint ?? weakestHint;
    }
  }

  const rawFinal = totalWeight > 0 ? Math.round(weightedScoreSum / totalWeight) : 0;
  const finalScore = Math.min(ruleCap, rawFinal);

  return {
    score: finalScore,
    missingRequired: [],
    weakestHint,
    segmentScores,
    angleScores,
  };
}

/**
 * Computes a 0..100 geometric match score across upper body and (when needed) leg segments.
 */
export function calculatePoseSimilarity(normalizedUserPose, targetPose) {
  if (!normalizedUserPose?.valid || !targetPose) {
    return {
      score: 0,
      missingRequired: targetPose?.requiredIndices ?? [],
      weakestHint: 'Center yourself inside the camera view.',
      segmentScores: [],
      angleScores: [],
    };
  }

  const primaryResult = scorePoseOrientation(normalizedUserPose, targetPose);

  if (targetPose.allowMirror) {
    const mirroredTarget = mirrorTargetPose(targetPose);
    const mirroredResult = scorePoseOrientation(normalizedUserPose, mirroredTarget);
    if (
      mirroredResult.missingRequired.length === 0 &&
      (primaryResult.missingRequired.length > 0 || mirroredResult.score > primaryResult.score)
    ) {
      return mirroredResult;
    }
  }

  return primaryResult;
}

/**
 * Translates similarity results and hold progress into friendly real-time cues.
 */
export function generatePoseFeedback(
  similarityResult,
  holdProgress = 0,
  completed = false,
  smoothedScore = 0
) {
  if (completed) {
    return 'Pose locked in — awesome work!';
  }

  if (similarityResult?.missingRequired?.length > 0) {
    return similarityResult.weakestHint || 'Adjust framing so the required limbs stay in view.';
  }

  if (holdProgress > 0.05) {
    if (smoothedScore >= 95) return 'Perfect form — hold steady!';
    return 'Great match — keep holding!';
  }

  if (smoothedScore >= 85) {
    return 'Almost locked — hold steady!';
  }

  if (similarityResult?.weakestHint && smoothedScore < 85) {
    return similarityResult.weakestHint;
  }

  if (smoothedScore >= 70) {
    return 'Good shape — hold steady!';
  }

  if (smoothedScore >= 50) {
    return 'Getting closer — match the gold figure.';
  }

  return similarityResult?.weakestHint || 'Copy the gold figure.';
}

/**
 * Resolves the effective accuracy threshold & hold duration for a challenge + difficulty mode.
 */
export function getEffectivePoseScoring(challenge, difficulty = 'Standard') {
  const poseScoring = challenge?.scoring ?? {};
  const preset = DIFFICULTY_PRESETS[difficulty] ?? DIFFICULTY_PRESETS.Standard;
  const baseThreshold = poseScoring.threshold ?? 72;
  const threshold = Math.max(58, Math.min(92, baseThreshold + (preset.thresholdOffset ?? 0)));
  const holdDurationMs = poseScoring.holdDurationMs ?? preset.holdDurationMs ?? HOLD_DURATION_MS;
  const roundDurationMs =
    poseScoring.roundDurationMs ?? preset.roundDurationMs ?? DEFAULT_ROUND_DURATION_MS;

  return {
    threshold,
    holdDurationMs,
    roundDurationMs,
  };
}

/**
 * Applies temporal smoothing, tracks the round's best accuracy, checks whether the
 * smoothed similarity score meets threshold, and accumulates the hold duration before awarding points once.
 */
export function evaluatePoseChallenge(
  rawLandmarks,
  challenge,
  state,
  nowMs = performance.now(),
  difficulty = 'Standard'
) {
  const settings = getEffectivePoseScoring(challenge, difficulty);
  const dtMs = state.lastEvalMs !== null ? Math.max(0, Math.min(200, nowMs - state.lastEvalMs)) : 0;
  state.lastEvalMs = nowMs;

  const extracted = extractRelevantPoseLandmarks(rawLandmarks, 0.45);
  const normalizedUserPose = normalizePoseCoordinates(extracted);
  const similarity = calculatePoseSimilarity(normalizedUserPose, challenge?.targetPose);

  state.smoothedScore =
    state.smoothedScore + (similarity.score - state.smoothedScore) * 0.34;
  const smoothedRounded = Math.round(state.smoothedScore);

  if (similarity.missingRequired.length === 0) {
    state.bestAccuracy = Math.max(state.bestAccuracy, smoothedRounded, similarity.score);
  }

  if (state.completed) {
    return {
      score: smoothedRounded,
      rawScore: similarity.score,
      bestAccuracy: state.bestAccuracy,
      holdProgress: 1,
      completed: true,
      newlyCompleted: false,
      feedback: generatePoseFeedback(similarity, 1, true, smoothedRounded),
      missingRequired: similarity.missingRequired,
      segmentScores: similarity.segmentScores,
      normalizedUserPose,
    };
  }

  let newlyCompleted = false;
  if (similarity.missingRequired.length === 0 && state.smoothedScore >= settings.threshold) {
    state.holdElapsedMs = Math.min(settings.holdDurationMs, state.holdElapsedMs + dtMs);
    if (state.holdElapsedMs >= settings.holdDurationMs && !state.roundAwarded) {
      state.completed = true;
      state.roundAwarded = true;
      newlyCompleted = true;
    }
  } else {
    state.holdElapsedMs = Math.max(0, state.holdElapsedMs - dtMs * 0.4);
  }

  const holdProgress = Math.max(0, Math.min(1, state.holdElapsedMs / settings.holdDurationMs));
  const feedback = generatePoseFeedback(similarity, holdProgress, state.completed, smoothedRounded);

  return {
    score: smoothedRounded,
    rawScore: similarity.score,
    bestAccuracy: state.bestAccuracy,
    holdProgress,
    completed: state.completed,
    newlyCompleted,
    feedback,
    missingRequired: similarity.missingRequired,
    segmentScores: similarity.segmentScores,
    normalizedUserPose,
  };
}
