import { PARTICLE_SHAPES } from '../data/activities.js';
import { getDistance2D, HAND_LANDMARK_INDEX } from '../vision/landmarkMath.js';
import { resolveParticleSemanticAction } from './customGestureBindings.js';
import {
  canTriggerGesture,
  detectHandCountAndGestures,
  smoothHandPosition,
} from './magicCanvasMapping.js';

const SHAPE_SWITCH_COOLDOWN_MS = 950;

/**
 * Creates mutable state for particle interaction smoothing and shape-switch cooldowns.
 */
export function createParticleUniverseState() {
  return {
    lastTriggerKey: null,
    lastTriggerTimes: {},
    smoothedPalm: null,
    smoothedMidpoint: null,
    smoothedExpansion: 1.0,
    smoothedPalmSize: null,
  };
}

/**
 * Computes apparent palm span from wrist (#0) to middle-finger knuckle (#9).
 *
 * NOTE ON DEPTH LIMITATION:
 * MediaPipe Hand Landmarker does not output direct physical metric depth from the webcam.
 * Its `z` coordinate is relative to the wrist plane rather than camera distance.
 * Therefore, we approximate hand proximity using apparent 2D palm size in the frame:
 * moving your hand closer makes the palm appear larger; moving further makes it smaller.
 */
export function estimateApparentPalmSize(landmarks) {
  if (!landmarks || landmarks.length <= HAND_LANDMARK_INDEX.MIDDLE_MCP) {
    return null;
  }
  const wrist = landmarks[HAND_LANDMARK_INDEX.WRIST];
  const middleMcp = landmarks[HAND_LANDMARK_INDEX.MIDDLE_MCP];
  return getDistance2D(wrist, middleMcp);
}

/**
 * @workshop-exercise Exercise 1 (Particle Universe): Hand Position to 3D Control
 *
 * Converts mirrored normalized hand coordinates ({ x, y } in [0..1]) into smooth
 * 3D rotation angles, spatial offsets, and 3D attraction coordinates for Three.js.
 *
 * Expected inputs:
 * - hand: normalized hand object containing `palmCenter: { x, y }`
 * - state: mutable smoothing state from createParticleUniverseState()
 *
 * Expected output:
 * - {
 *     targetRotY: number,   // Horizontal hand motion -> Y-axis spin (radians)
 *     targetRotX: number,   // Vertical hand motion -> X-axis tilt (radians)
 *     targetOffsetX: number,
 *     targetOffsetY: number,
 *     attractionX: number,  // Local 3D attraction target X
 *     attractionY: number,  // Local 3D attraction target Y
 *   }
 *
 * Hint:
 * - Smooth `hand.palmCenter` with `smoothHandPosition(state.smoothedPalm, hand.palmCenter, 0.35)`.
 * - Map `x` centered around `0.5` (`x - 0.5`) to rotation radians and world X offset.
 */
export function mapHandPositionToParticleControl(hand, state) {
  if (!hand?.palmCenter) {
    return {
      targetRotY: 0,
      targetRotX: 0.14,
      targetOffsetX: 0,
      targetOffsetY: 0,
      attractionX: 0,
      attractionY: 0,
    };
  }

  const smoothed = smoothHandPosition(state.smoothedPalm, hand.palmCenter, 0.35);
  state.smoothedPalm = smoothed;

  const dx = smoothed.x - 0.5;
  const dy = smoothed.y - 0.5;

  return {
    targetRotY: dx * 3.2,
    targetRotX: 0.14 + dy * 1.9,
    targetOffsetX: dx * 2.1,
    targetOffsetY: -dy * 1.6,
    attractionX: dx * 5.2,
    attractionY: -dy * 4.0,
  };
}

/**
 * @workshop-exercise Exercise 2 (Particle Universe): Particle Expansion & Compression
 *
 * Computes particle universe expansion factor:
 * - Two hands: distance between left & right palms expands (> 1.0) or compresses (< 1.0).
 * - One hand: Closed_Fist compresses tightly; otherwise apparent palm size (depth proxy)
 *   gently scales the formation larger as the hand moves closer to the camera.
 *
 * Expected inputs:
 * - leftHand: normalized hand object | null
 * - rightHand: normalized hand object | null
 * - singleHand: normalized hand object | null
 * - state: mutable state from createParticleUniverseState()
 *
 * Expected output:
 * - number (clamped expansion multiplier in [0.48 .. 2.0])
 *
 * Hint:
 * - For two hands, compute `getDistance2D(leftHand.palmCenter, rightHand.palmCenter)`.
 * - Smooth `targetExpansion` with `state.smoothedExpansion` to prevent sudden jumps.
 */
export function calculateParticleExpansion(
  leftHand,
  rightHand,
  singleHand,
  state,
  options = {}
) {
  let rawTarget = 1.0;

  if (leftHand?.palmCenter && rightHand?.palmCenter) {
    const twoHandDistance = getDistance2D(leftHand.palmCenter, rightHand.palmCenter);
    // Typical comfortable span ~0.12 (close) to ~0.72 (wide apart)
    const normalizedSpread = Math.max(0, Math.min(1, (twoHandDistance - 0.12) / 0.58));
    rawTarget = 0.52 + normalizedSpread * 1.43;
  } else if (singleHand) {
    const semanticAction = resolveParticleSemanticAction(singleHand.rawGestureName, options);
    if (semanticAction === 'COMPRESS') {
      rawTarget = 0.55;
    } else if (semanticAction === 'EXPAND') {
      rawTarget = 1.55;
    } else {
      const rawPalmSize = estimateApparentPalmSize(singleHand.landmarks);
      if (rawPalmSize !== null) {
        const smoothedSize =
          state.smoothedPalmSize === null
            ? rawPalmSize
            : state.smoothedPalmSize + (rawPalmSize - state.smoothedPalmSize) * 0.28;
        state.smoothedPalmSize = smoothedSize;

        // Typical apparent palm span ~0.07 (far) to ~0.24 (close)
        const depthNorm = Math.max(0, Math.min(1, (smoothedSize - 0.07) / 0.17));
        rawTarget = 0.78 + depthNorm * 0.68;
      }
    }
  }

  state.smoothedExpansion =
    state.smoothedExpansion + (rawTarget - state.smoothedExpansion) * 0.28;
  return Math.max(0.48, Math.min(2.0, state.smoothedExpansion));
}

/**
 * @workshop-exercise Exercise 3 (Particle Universe): Gesture-Driven Shape Switching
 *
 * Triggers a smooth morph to the next 3D formation when the shape-switch gesture is detected,
 * using rising-edge + cooldown protection so holding the gesture does not cycle rapidly.
 */
export function mapGestureToParticleShape(
  gestureName,
  currentShapeId,
  state,
  nowMs = performance.now(),
  shapes = PARTICLE_SHAPES,
  options = {}
) {
  const semanticAction = resolveParticleSemanticAction(gestureName, options);
  const isSwitchGesture = semanticAction === 'NEXT_SHAPE';
  const triggerKey = isSwitchGesture
    ? `particle:NEXT_SHAPE:${gestureName}`
    : gestureName
      ? `particle:${gestureName}`
      : null;

  const shouldTrigger =
    isSwitchGesture && canTriggerGesture(triggerKey, state, nowMs, SHAPE_SWITCH_COOLDOWN_MS);

  state.lastTriggerKey = triggerKey;

  if (!shouldTrigger || !shapes || shapes.length === 0) {
    return null;
  }

  state.lastTriggerTimes[triggerKey] = nowMs;
  const currentIdx = shapes.findIndex((s) => s.id === currentShapeId);
  const nextIdx = currentIdx === -1 ? 0 : (currentIdx + 1) % shapes.length;
  return shapes[nextIdx];
}

/**
 * @workshop-exercise Exercise 4 (Particle Universe): Complete Hand-to-Particle Resolver
 *
 * Combines 1-hand and 2-hand detections into a unified ParticleEngine interaction payload,
 * handling missing hands gracefully without snapping or jumping.
 *
 * Expected inputs:
 * - gestureResult: live frame object from VisionContext
 * - state: mutable state from createParticleUniverseState()
 * - currentShapeId: string
 * - nowMs?: number
 *
 * Expected output:
 * - {
 *     handCount: number,
 *     nextShape: { id: string, label: string } | null,
 *     engineInteraction: {
 *       manualControlActive: boolean,
 *       targetRotX: number,
 *       targetRotY: number,
 *       targetOffsetX: number,
 *       targetOffsetY: number,
 *       targetExpansion: number,
 *       attractionStrength: number,
 *       attractionX: number,
 *       attractionY: number,
 *     },
 *     statusLabel: string,
 *   }
 */
export function calculateParticleInteraction(
  gestureResult,
  state,
  currentShapeId,
  nowMs = performance.now(),
  options = {}
) {
  const resolveOpts = {
    classifierSource: options.classifierSource ?? gestureResult?.classifierSource ?? 'pretrained',
    actionBindings: options.actionBindings ?? null,
  };
  const { handCount, leftHand, rightHand, hands } = detectHandCountAndGestures(gestureResult);

  // Missing hands: smoothly return to resting orbit & neutral scale without resetting smoothed state abruptly
  if (handCount === 0) {
    state.lastTriggerKey = null;
    state.smoothedExpansion = state.smoothedExpansion + (1.0 - state.smoothedExpansion) * 0.15;
    return {
      handCount: 0,
      nextShape: null,
      engineInteraction: {
        manualControlActive: false,
        targetRotX: 0.14,
        targetOffsetX: 0,
        targetOffsetY: 0,
        targetExpansion: 1.0,
        attractionStrength: 0,
        attractionX: 0,
        attractionY: 0,
      },
      statusLabel: 'Show a hand to sculpt particles',
    };
  }

  const isCustomKnn = resolveOpts.classifierSource === 'custom-knn';
  const activeHands = isCustomKnn
    ? hands.filter(
        (h) =>
          !h.rejected &&
          h.rawGestureName &&
          h.rawGestureName !== 'None' &&
          h.rawGestureName !== 'Unknown' &&
          h.rawGestureName !== 'Unknown Gesture' &&
          h.rawGestureName !== 'Uncertain' &&
          h.rawGestureName !== 'Uncertain Gesture'
      )
    : hands;

  // In Custom KNN mode, unrecognized ("Unknown") hands must trigger ZERO particle interactions
  if (isCustomKnn && activeHands.length === 0) {
    state.lastTriggerKey = null;
    state.smoothedExpansion = state.smoothedExpansion + (1.0 - state.smoothedExpansion) * 0.15;
    return {
      handCount: 0,
      detectedHandCount: handCount,
      unknownRejected: true,
      nextShape: null,
      engineInteraction: {
        manualControlActive: false,
        targetRotX: 0.14,
        targetOffsetX: 0,
        targetOffsetY: 0,
        targetExpansion: 1.0,
        attractionStrength: 0,
        attractionX: 0,
        attractionY: 0,
      },
      statusLabel: 'Unknown gesture · Hold a trained gesture',
    };
  }

  const activeLeftHand = isCustomKnn
    ? activeHands.length >= 2
      ? activeHands[0]
      : activeHands[0]?.side === 'left'
        ? activeHands[0]
        : null
    : leftHand;
  const activeRightHand = isCustomKnn
    ? activeHands.length >= 2
      ? activeHands[1]
      : activeHands[0]?.side === 'right'
        ? activeHands[0]
        : null
    : rightHand;

  // Two-hand interaction takes priority
  if (activeHands.length === 2 && activeLeftHand && activeRightHand) {
    const rawMidpoint = {
      x: (activeLeftHand.palmCenter.x + activeRightHand.palmCenter.x) * 0.5,
      y: (activeLeftHand.palmCenter.y + activeRightHand.palmCenter.y) * 0.5,
    };
    const smoothedMid = smoothHandPosition(state.smoothedMidpoint, rawMidpoint, 0.35);
    state.smoothedMidpoint = smoothedMid;

    const expansion = calculateParticleExpansion(
      activeLeftHand,
      activeRightHand,
      null,
      state,
      resolveOpts
    );
    const dx = smoothedMid.x - 0.5;
    const dy = smoothedMid.y - 0.5;

    const switchHand = activeHands.find(
      (h) => resolveParticleSemanticAction(h.rawGestureName, resolveOpts) === 'NEXT_SHAPE'
    );
    const nextShape = mapGestureToParticleShape(
      switchHand ? switchHand.rawGestureName : null,
      currentShapeId,
      state,
      nowMs,
      PARTICLE_SHAPES,
      resolveOpts
    );

    const statusLabel =
      expansion > 1.25
        ? 'Two hands apart · Expanding universe'
        : expansion < 0.8
          ? 'Two hands closer · Compressing core'
          : 'Two hands · Steering spatial field';

    return {
      handCount: 2,
      nextShape,
      engineInteraction: {
        manualControlActive: true,
        targetRotY: dx * 3.4,
        targetRotX: 0.14 + dy * 1.8,
        targetOffsetX: dx * 1.8,
        targetOffsetY: -dy * 1.4,
        targetExpansion: expansion,
        attractionStrength: 0,
        attractionX: 0,
        attractionY: 0,
      },
      statusLabel: nextShape
        ? `${switchHand?.gestureName ?? 'Gesture'} · Morphing to ${nextShape.label}`
        : statusLabel,
    };
  }

  // Single-hand interaction
  const hand = activeHands[0];
  const control = mapHandPositionToParticleControl(hand, state);
  const expansion = calculateParticleExpansion(null, null, hand, state, resolveOpts);
  const semanticAction = resolveParticleSemanticAction(hand.rawGestureName, resolveOpts);
  const nextShape = mapGestureToParticleShape(
    hand.rawGestureName,
    currentShapeId,
    state,
    nowMs,
    PARTICLE_SHAPES,
    resolveOpts
  );

  const isAttract = semanticAction === 'ATTRACT';
  const isCompress = semanticAction === 'COMPRESS';
  const isExpand = semanticAction === 'EXPAND';

  let statusLabel = 'Hand tracking · Rotating formation';
  if (nextShape) {
    statusLabel = `${hand.gestureName} · Morphing to ${nextShape.label}`;
  } else if (isAttract) {
    statusLabel = `${hand.gestureName} · Attracting particles`;
  } else if (isCompress) {
    statusLabel = `${hand.gestureName} · Compressing core`;
  } else if (isExpand) {
    statusLabel = `${hand.gestureName} · Expanding field`;
  }

  return {
    handCount: 1,
    nextShape,
    engineInteraction: {
      manualControlActive: true,
      targetRotX: control.targetRotX,
      targetRotY: control.targetRotY,
      targetOffsetX: control.targetOffsetX,
      targetOffsetY: control.targetOffsetY,
      targetExpansion: expansion,
      attractionStrength: isAttract ? 1.0 : 0,
      attractionX: control.attractionX,
      attractionY: control.attractionY,
    },
    statusLabel,
  };
}
