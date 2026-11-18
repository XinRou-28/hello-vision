import { FIREWORK_PATTERNS } from '../engines/FireworksEngine.js';
import {
  getDistance2D,
  getPalmCenter,
  HAND_LANDMARK_INDEX,
  mapLandmarkToCanvas,
} from '../vision/landmarkMath.js';
import { resolveFireworkSemanticAction } from './customGestureBindings.js';

export const GESTURE_COOLDOWNS_MS = {
  'one:Open_Palm': 750,
  'one:Victory': 900,
  'one:Closed_Fist': 950,
  'two:Open_Palm': 1050,
  'two:Spread_Apart': 1600,
  'two:Converge': 1500,
};

/**
 * Creates mutable state for gesture transitions, cooldowns, and coordinate smoothing.
 */
export function createMagicCanvasGestureState() {
  return {
    lastTriggerKey: null,
    lastTriggerTimes: {},
    smoothedFingertip: null,
    smoothedPalms: {
      left: null,
      right: null,
    },
    twoHandFrames: 0,
    smoothedSpread: null,
    prevSmoothedSpread: null,
  };
}

/**
 * @workshop-exercise Exercise 3 (Magic Canvas): Coordinate Smoothing
 *
 * Applies exponential smoothing between a previous 2D point and the new detected point
 * to eliminate MediaPipe landmark jitter during fingertip drawing and two-hand tracking.
 *
 * Expected inputs:
 * - prevPoint: { x: number, y: number } | null
 * - nextPoint: { x: number, y: number } | null
 * - alpha?: number in [0..1] (higher = faster response, lower = smoother; default 0.45)
 *
 * Expected output:
 * - { x: number, y: number } | null
 *
 * Hint:
 * - Linearly interpolate: `prev + (next - prev) * alpha`.
 */
export function smoothHandPosition(prevPoint, nextPoint, alpha = 0.45) {
  if (!nextPoint) return null;
  if (!prevPoint) return { x: nextPoint.x, y: nextPoint.y };

  return {
    x: prevPoint.x + (nextPoint.x - prevPoint.x) * alpha,
    y: prevPoint.y + (nextPoint.y - prevPoint.y) * alpha,
  };
}

/**
 * @workshop-exercise Exercise 4 (Magic Canvas): Gesture Cooldown & Transition Logic
 *
 * Prevents discrete single-hand or two-hand gestures from triggering repeatedly
 * every frame while a pose is continuously held.
 *
 * Expected inputs:
 * - triggerKey: string | null (e.g. 'one:Open_Palm', 'two:Open_Palm', 'two:Spread_Apart')
 * - state: state object created by createMagicCanvasGestureState()
 * - nowMs: number (timestamp in milliseconds)
 * - cooldownMs?: number (minimum delay before the same key can fire again)
 *
 * Expected output:
 * - boolean (`true` if transition/cooldown allows firing, otherwise `false`)
 */
export function canTriggerGesture(triggerKey, state, nowMs, cooldownMs = 850) {
  if (!triggerKey) return false;

  const lastTime = state.lastTriggerTimes[triggerKey] ?? 0;
  const cooldownElapsed = nowMs - lastTime >= cooldownMs;
  const isNewTransition = triggerKey !== state.lastTriggerKey;

  if (isNewTransition && nowMs - lastTime >= 350) {
    return true;
  }

  return cooldownElapsed && isNewTransition;
}

/**
 * @workshop-exercise Exercise 5 (Magic Canvas): One-Hand vs Two-Hand Interpretation
 *
 * Inspects the MediaPipe frame to determine whether 0, 1, or 2 hands are present,
 * and returns consistently ordered left/right hand descriptors.
 *
 * Expected inputs:
 * - gestureResult: live frame object from VisionContext
 *
 * Expected output:
 * - {
 *     handCount: number,
 *     leftHand: object | null,
 *     rightHand: object | null,
 *     hands: Array<object>,
 *   }
 */
export function detectHandCountAndGestures(gestureResult) {
  if (!gestureResult || !gestureResult.handDetected) {
    return { handCount: 0, leftHand: null, rightHand: null, hands: [] };
  }

  const rawHands =
    gestureResult.hands && gestureResult.hands.length > 0
      ? gestureResult.hands
      : gestureResult.landmarks?.length
        ? [
            {
              rawGestureName: gestureResult.rawGestureName ?? 'None',
              gestureName: gestureResult.gestureName ?? 'Hand Detected',
              confidence: gestureResult.confidence ?? 0,
              landmarks: gestureResult.landmarks,
              palmCenter: getPalmCenter(gestureResult.landmarks),
            },
          ]
        : [];

  const normalizedHands = rawHands.map((h) => {
    const palm = h.palmCenter ?? getPalmCenter(h.landmarks);
    const side = h.side ?? (palm && palm.x < 0.5 ? 'left' : 'right');
    return {
      ...h,
      palmCenter: palm,
      side,
    };
  });

  normalizedHands.sort((a, b) => (a.palmCenter?.x ?? 0.5) - (b.palmCenter?.x ?? 0.5));

  if (normalizedHands.length >= 2) {
    return {
      handCount: 2,
      leftHand: normalizedHands[0],
      rightHand: normalizedHands[1],
      hands: normalizedHands.slice(0, 2),
    };
  }

  const single = normalizedHands[0] ?? null;
  return {
    handCount: single ? 1 : 0,
    leftHand: single?.side === 'left' ? single : null,
    rightHand: single?.side === 'right' ? single : null,
    hands: single ? [single] : [],
  };
}

/**
 * @workshop-exercise Exercise 6 (Magic Canvas): Two-Hand Spread & Convergence Mapping
 *
 * Measures normalized distance between both palms and computes smoothed frame-to-frame
 * spread velocity (`deltaSpread`) to detect palms moving apart vs. moving closer together.
 * Safely requires at least 2 consecutive two-hand frames so temporary hand dropout
 * never produces false spikes.
 *
 * Expected inputs:
 * - leftHand: normalized hand object with palmCenter
 * - rightHand: normalized hand object with palmCenter
 * - state: gesture tracking state
 *
 * Expected output:
 * - { ready: boolean, spread: number, deltaSpread: number, midpoint: { x: number, y: number } }
 */
export function computeTwoHandSpread(leftHand, rightHand, state) {
  if (!leftHand?.palmCenter || !rightHand?.palmCenter) {
    state.twoHandFrames = 0;
    state.smoothedSpread = null;
    state.prevSmoothedSpread = null;
    return { ready: false, spread: 0, deltaSpread: 0, midpoint: { x: 0.5, y: 0.35 } };
  }

  const rawDist = getDistance2D(leftHand.palmCenter, rightHand.palmCenter);
  const smoothed =
    state.smoothedSpread === null ? rawDist : state.smoothedSpread + (rawDist - state.smoothedSpread) * 0.4;

  const prev = state.smoothedSpread;
  state.prevSmoothedSpread = prev;
  state.smoothedSpread = smoothed;
  state.twoHandFrames += 1;

  const midpoint = {
    x: (leftHand.palmCenter.x + rightHand.palmCenter.x) * 0.5,
    y: (leftHand.palmCenter.y + rightHand.palmCenter.y) * 0.5,
  };

  const ready = state.twoHandFrames >= 2 && prev !== null;
  const deltaSpread = ready ? smoothed - prev : 0;

  return {
    ready,
    spread: smoothed,
    deltaSpread,
    midpoint,
  };
}

/**
 * @workshop-exercise Exercise 7 (Magic Canvas): Index Fingertip Coordinate Mapping
 *
 * Maps landmark #8 (index fingertip) into mirrored full-screen canvas coordinates.
 */
export function mapIndexFingertipToCanvas(landmarks, canvasWidth, canvasHeight) {
  if (!landmarks || landmarks.length <= HAND_LANDMARK_INDEX.INDEX_TIP) {
    return null;
  }
  const fingertip = landmarks[HAND_LANDMARK_INDEX.INDEX_TIP];
  return mapLandmarkToCanvas(fingertip, canvasWidth, canvasHeight, { mirror: true });
}

/**
 * Checks whether a single hand object is holding a trail-drawing gesture above confidence.
 */
export function isFingertipDrawingActive(hand, minConfidence = 0.55, options = {}) {
  if (!hand || !hand.landmarks?.length || hand.rejected) return false;
  const semanticAction = resolveFireworkSemanticAction(hand.rawGestureName, {
    ...options,
    rejected: Boolean(hand.rejected),
  });
  if (semanticAction !== 'DRAW_TRAIL') return false;
  return (hand.confidence ?? 0) >= minConfidence;
}

/**
 * Cycles cleanly to the next firework pattern.
 */
export function getNextFireworkPattern(currentPatternId, patterns = FIREWORK_PATTERNS) {
  if (!patterns || patterns.length === 0) {
    return { id: 'golden-peony', label: 'Golden Peony' };
  }
  const currentIndex = patterns.findIndex((p) => p.id === currentPatternId);
  const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % patterns.length;
  return patterns[nextIndex];
}

function clampSkyPosition(normPt, width, height) {
  const x = Math.max(width * 0.12, Math.min(width * 0.88, (normPt?.x ?? 0.5) * width));
  const y = Math.max(height * 0.14, Math.min(height * 0.52, (normPt?.y ?? 0.32) * height));
  return { x, y };
}

/**
 * @workshop-exercise Exercise 8 (Magic Canvas): Priority Gesture-to-Firework Mapping
 *
 * Resolves two-hand combos with priority over single-hand gestures:
 * 1. Two Open Palms moving apart    -> Wide Grand-Finale panoramic burst
 * 2. Two hands moving closer        -> Concentrated central starburst
 * 3. Two Open Palms                 -> Twin synchronized fireworks
 * 4. One Pointing Up                -> Delicate glowing fingertip ribbon
 * 5. One Open Palm                  -> Launch firework on that side of the sky
 * 6. One Victory                    -> Cycle firework pattern
 * 7. One Closed Fist                -> Clear the night canvas
 */
export function mapGestureToFireworkAction(
  gestureResult,
  state,
  canvasSize,
  currentPatternId,
  nowMs = performance.now(),
  options = {}
) {
  const { width, height } = canvasSize;
  const resolveOpts = {
    classifierSource: options.classifierSource ?? gestureResult?.classifierSource ?? 'pretrained',
    actionBindings: options.actionBindings ?? null,
  };
  const { handCount, leftHand, rightHand, hands } = detectHandCountAndGestures(gestureResult);

  if (handCount === 0) {
    state.lastTriggerKey = null;
    state.smoothedFingertip = null;
    state.twoHandFrames = 0;
    state.smoothedSpread = null;
    state.prevSmoothedSpread = null;
    return { type: 'END_TRAIL', handCount: 0 };
  }

  // --- PRIORITY 1: Two-hand interactions (only when both hands are actively tracked) ---
  if (handCount === 2 && leftHand && rightHand) {
    const spreadInfo = computeTwoHandSpread(leftHand, rightHand, state);
    const leftPalmSmoothed = smoothHandPosition(state.smoothedPalms.left, leftHand.palmCenter, 0.45);
    const rightPalmSmoothed = smoothHandPosition(state.smoothedPalms.right, rightHand.palmCenter, 0.45);
    state.smoothedPalms.left = leftPalmSmoothed;
    state.smoothedPalms.right = rightPalmSmoothed;

    const leftAction = resolveFireworkSemanticAction(leftHand.rawGestureName, {
      ...resolveOpts,
      rejected: Boolean(leftHand.rejected),
    });
    const rightAction = resolveFireworkSemanticAction(rightHand.rawGestureName, {
      ...resolveOpts,
      rejected: Boolean(rightHand.rejected),
    });
    const bothLaunchers =
      leftAction === 'LAUNCH_FIREWORK' && rightAction === 'LAUNCH_FIREWORK';
    const wantsGrandFinale =
      leftAction === 'GRAND_FINALE' || rightAction === 'GRAND_FINALE';
    const wantsConcentrated =
      leftAction === 'CONCENTRATED_BURST' || rightAction === 'CONCENTRATED_BURST';

    // 1A. Two open palms (or Grand Finale gesture) moving apart -> wide grand-finale explosion
    if (
      (bothLaunchers || wantsGrandFinale) &&
      spreadInfo.ready &&
      spreadInfo.deltaSpread > 0.024 &&
      spreadInfo.spread > 0.38
    ) {
      const key = 'two:Spread_Apart';
      const canFire = canTriggerGesture(key, state, nowMs, GESTURE_COOLDOWNS_MS[key]);
      state.lastTriggerKey = key;
      if (canFire) {
        state.lastTriggerTimes[key] = nowMs;
        state.smoothedFingertip = null;
        return {
          type: 'GRAND_FINALE_SPREAD',
          spread: spreadInfo.spread,
          handCount: 2,
        };
      }
    }

    // 1B. Two hands moving closer together -> concentrated central burst
    const eitherHandActive =
      resolveOpts.classifierSource === 'custom-knn'
        ? (!leftHand.rejected && leftAction !== 'none') ||
          (!rightHand.rejected && rightAction !== 'none')
        : (!leftHand.rejected && leftHand.rawGestureName !== 'None') ||
          (!rightHand.rejected && rightHand.rawGestureName !== 'None');
    if (
      (eitherHandActive || wantsConcentrated) &&
      spreadInfo.ready &&
      spreadInfo.deltaSpread < -0.024 &&
      spreadInfo.spread < 0.34
    ) {
      const key = 'two:Converge';
      const canFire = canTriggerGesture(key, state, nowMs, GESTURE_COOLDOWNS_MS[key]);
      state.lastTriggerKey = key;
      if (canFire) {
        state.lastTriggerTimes[key] = nowMs;
        state.smoothedFingertip = null;
        const center = clampSkyPosition(spreadInfo.midpoint, width, height);
        return {
          type: 'CONCENTRATED_BURST',
          x: center.x,
          y: center.y,
          handCount: 2,
        };
      }
    }

    // 1C. Two launch gestures -> launch two simultaneous fireworks
    if (bothLaunchers) {
      const key = 'two:Open_Palm';
      const canFire = canTriggerGesture(key, state, nowMs, GESTURE_COOLDOWNS_MS[key]);
      state.lastTriggerKey = key;
      if (canFire) {
        state.lastTriggerTimes[key] = nowMs;
        state.smoothedFingertip = null;
        return {
          type: 'LAUNCH_DUAL',
          leftPos: clampSkyPosition(leftPalmSmoothed, width, height),
          rightPos: clampSkyPosition(rightPalmSmoothed, width, height),
          handCount: 2,
        };
      }
      return { type: 'END_TRAIL', handCount: 2 };
    }

    // Allow delicate drawing if one hand draws while the second hand rests
    const pointingHand = hands.find((h) => isFingertipDrawingActive(h, 0.55, resolveOpts));
    if (pointingHand) {
      const rawPt = mapIndexFingertipToCanvas(pointingHand.landmarks, width, height);
      const smoothedPt = smoothHandPosition(state.smoothedFingertip, rawPt, 0.48);
      state.smoothedFingertip = smoothedPt;
      state.lastTriggerKey = 'one:Pointing_Up';
      if (smoothedPt) {
        return { type: 'DRAW_TRAIL', x: smoothedPt.x, y: smoothedPt.y, handCount: 2 };
      }
    }

    return { type: 'END_TRAIL', handCount: 2 };
  }

  // --- PRIORITY 2: One-hand interactions (safely reset two-hand spread baseline) ---
  state.twoHandFrames = 0;
  state.smoothedSpread = null;
  state.prevSmoothedSpread = null;

  const hand = hands[0];
  if (!hand || hand.rejected) {
    state.smoothedFingertip = null;
    state.lastTriggerKey = null;
    return { type: 'END_TRAIL', handCount: hand ? 1 : 0 };
  }

  if (isFingertipDrawingActive(hand, 0.55, resolveOpts)) {
    const rawPt = mapIndexFingertipToCanvas(hand.landmarks, width, height);
    const smoothedPt = smoothHandPosition(state.smoothedFingertip, rawPt, 0.48);
    state.smoothedFingertip = smoothedPt;
    state.lastTriggerKey = `one:DRAW_TRAIL:${hand.rawGestureName}`;
    if (smoothedPt) {
      return { type: 'DRAW_TRAIL', x: smoothedPt.x, y: smoothedPt.y, handCount: 1 };
    }
    return { type: 'END_TRAIL', handCount: 1 };
  }

  state.smoothedFingertip = null;

  const semanticAction = resolveFireworkSemanticAction(hand.rawGestureName, {
    ...resolveOpts,
    rejected: Boolean(hand.rejected),
  });
  const cooldownLookupKey =
    semanticAction === 'LAUNCH_FIREWORK'
      ? 'one:Open_Palm'
      : semanticAction === 'SWITCH_PATTERN'
        ? 'one:Victory'
        : semanticAction === 'CLEAR_SKY'
          ? 'one:Closed_Fist'
          : semanticAction === 'GRAND_FINALE'
            ? 'two:Spread_Apart'
            : semanticAction === 'CONCENTRATED_BURST'
              ? 'two:Converge'
              : null;

  const triggerKey =
    semanticAction !== 'none' ? `one:${semanticAction}:${hand.rawGestureName}` : null;
  const cooldownMs = GESTURE_COOLDOWNS_MS[cooldownLookupKey] ?? 850;
  const shouldTrigger = canTriggerGesture(triggerKey, state, nowMs, cooldownMs);
  state.lastTriggerKey = triggerKey;

  if (!shouldTrigger) {
    return { type: 'END_TRAIL', handCount: 1 };
  }

  state.lastTriggerTimes[triggerKey] = nowMs;

  if (semanticAction === 'LAUNCH_FIREWORK') {
    const pos = clampSkyPosition(hand.palmCenter, width, height);
    return {
      type: 'LAUNCH_SIDE_FIREWORK',
      side: hand.side,
      x: pos.x,
      y: pos.y,
      handCount: 1,
      gestureLabel: hand.gestureName,
    };
  }

  if (semanticAction === 'SWITCH_PATTERN') {
    const nextPattern = getNextFireworkPattern(currentPatternId, FIREWORK_PATTERNS);
    return {
      type: 'SWITCH_PATTERN',
      pattern: nextPattern,
      handCount: 1,
      gestureLabel: hand.gestureName,
    };
  }

  if (semanticAction === 'CLEAR_SKY') {
    return {
      type: 'CLEAR_OR_PAUSE',
      handCount: 1,
      gestureLabel: hand.gestureName,
    };
  }

  if (semanticAction === 'GRAND_FINALE') {
    return {
      type: 'GRAND_FINALE_SPREAD',
      spread: 0.78,
      handCount: 1,
      gestureLabel: hand.gestureName,
    };
  }

  if (semanticAction === 'CONCENTRATED_BURST') {
    const pos = clampSkyPosition(hand.palmCenter, width, height);
    return {
      type: 'CONCENTRATED_BURST',
      x: pos.x,
      y: pos.y,
      handCount: 1,
      gestureLabel: hand.gestureName,
    };
  }

  return { type: 'END_TRAIL', handCount: 1 };
}
