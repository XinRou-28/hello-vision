import { FilesetResolver, GestureRecognizer } from '@mediapipe/tasks-vision';
import { classifyHandLandmarks } from './knnClassifier.js';
import { getPalmCenter, mirrorNormalizedX } from './landmarkMath.js';

const LOCAL_WASM_PATH = '/wasm';
const CDN_WASM_PATH = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';

const LOCAL_MODEL_PATH = '/models/gesture_recognizer.task';
const CDN_MODEL_PATH =
  'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task';

const GESTURE_LABELS = {
  Open_Palm: 'Open Palm',
  Closed_Fist: 'Closed Fist',
  Victory: 'Victory',
  Pointing_Up: 'Pointing Up',
  Thumb_Up: 'Thumb Up',
  Thumb_Down: 'Thumb Down',
  ILoveYou: 'I Love You',
  None: 'Hand Detected',
};

let recognizerSingleton = null;
let initPromise = null;
let activeDelegate = null;
let initCount = 0;

/**
 * Formats MediaPipe's raw category name into a readable label.
 *
 * @param {string | null | undefined} categoryName
 * @returns {string}
 */
export function formatGestureLabel(categoryName) {
  if (!categoryName) return 'No hand detected';
  return GESTURE_LABELS[categoryName] ?? categoryName.replace(/_/g, ' ');
}

async function hasValidLocalWasm() {
  try {
    const res = await fetch(`${LOCAL_WASM_PATH}/vision_wasm_internal.wasm`, { method: 'HEAD' });
    if (!res.ok) return false;
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    // Vite SPA fallback serves index.html (200 text/html) when .wasm is missing
    return !contentType.includes('text/html');
  } catch {
    return false;
  }
}

async function loadVisionWasmFileset() {
  if (await hasValidLocalWasm()) {
    try {
      return await FilesetResolver.forVisionTasks(LOCAL_WASM_PATH);
    } catch (localErr) {
      console.warn('[GestureRecognizer] Local WASM unavailable, falling back to CDN.', localErr);
    }
  } else {
    console.warn('[GestureRecognizer] Local WASM asset missing or invalid, falling back to CDN.');
  }
  return await FilesetResolver.forVisionTasks(CDN_WASM_PATH);
}

async function resolveModelAssetPath() {
  try {
    const res = await fetch(LOCAL_MODEL_PATH, { method: 'HEAD' });
    if (res.ok) {
      return LOCAL_MODEL_PATH;
    }
  } catch {
    // Fall through to CDN fallback
  }
  return CDN_MODEL_PATH;
}

/**
 * @workshop-exercise Exercise 1: MediaPipe Gesture Recognizer Initialization (Two-Hand Ready)
 *
 * Initializes and caches a single MediaPipe GestureRecognizer instance in VIDEO mode
 * configured to track up to 2 hands simultaneously (`numHands: 2`).
 * Attempts GPU delegate first and explicitly falls back to CPU if GPU initialization fails.
 *
 * Expected output:
 * - Promise<{ recognizer: GestureRecognizer, delegate: 'GPU' | 'CPU', initCount: number, numHands: number }>
 */
export async function getOrCreateGestureRecognizer() {
  if (recognizerSingleton) {
    return {
      recognizer: recognizerSingleton,
      delegate: activeDelegate,
      initCount,
      numHands: 2,
    };
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    const vision = await loadVisionWasmFileset();
    const modelAssetPath = await resolveModelAssetPath();

    const baseOptionsConfig = {
      modelAssetPath,
    };

    const sharedOptions = {
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    };

    async function createWithDelegateFallback(fileset) {
      try {
        const recognizer = await GestureRecognizer.createFromOptions(fileset, {
          baseOptions: {
            ...baseOptionsConfig,
            delegate: 'GPU',
          },
          ...sharedOptions,
        });
        return { recognizer, delegate: 'GPU' };
      } catch (gpuError) {
        console.warn(
          '[GestureRecognizer] GPU delegate failed; falling back to CPU delegate.',
          gpuError
        );
        const recognizer = await GestureRecognizer.createFromOptions(fileset, {
          baseOptions: {
            ...baseOptionsConfig,
            delegate: 'CPU',
          },
          ...sharedOptions,
        });
        return { recognizer, delegate: 'CPU' };
      }
    }

    try {
      const created = await createWithDelegateFallback(vision);
      recognizerSingleton = created.recognizer;
      activeDelegate = created.delegate;
    } catch (primaryErr) {
      const usingLocalWasm =
        typeof vision?.wasmLoaderPath === 'string' && vision.wasmLoaderPath.startsWith(LOCAL_WASM_PATH);
      if (!usingLocalWasm) {
        throw primaryErr;
      }
      console.warn(
        '[GestureRecognizer] Local WASM initialization failed; retrying with CDN WASM.',
        primaryErr
      );
      const cdnVision = await FilesetResolver.forVisionTasks(CDN_WASM_PATH);
      const created = await createWithDelegateFallback(cdnVision);
      recognizerSingleton = created.recognizer;
      activeDelegate = created.delegate;
    }

    initCount += 1;

    return {
      recognizer: recognizerSingleton,
      delegate: activeDelegate,
      initCount,
      numHands: 2,
    };
  })();

  try {
    return await initPromise;
  } catch (err) {
    initPromise = null;
    throw err;
  }
}

/**
 * @workshop-exercise Exercise 2: Webcam Inference & Multi-Hand Gesture Extraction
 *
 * Runs MediaPipe GestureRecognizer on the current video frame and extracts gesture labels,
 * confidence scores, handedness/screen side, and 21 keypoints for up to two hands.
 * When `options.classifierSource === 'custom-knn'`, skips MediaPipe's built-in gesture
 * labels and classifies each hand's 21 raw landmarks with the custom KNN classifier.
 *
 * Expected inputs:
 * - recognizer: GestureRecognizer instance
 * - videoElement: HTMLVideoElement with readyState >= 2
 * - timestampMs: number (strictly increasing timestamp in milliseconds)
 * - minConfidence?: number (default 0.55)
 * - options?: { classifierSource?: 'pretrained' | 'custom-knn', customClassifier?: object | null, customOverrides?: object, temporalSmoother?: object | null }
 */
export function recognizeGestureFrame(
  recognizer,
  videoElement,
  timestampMs,
  minConfidence = 0.55,
  options = {}
) {
  const {
    classifierSource = 'pretrained',
    customClassifier = null,
    customOverrides = {},
    temporalSmoother = null,
  } = options;

  if (!recognizer || !videoElement || videoElement.readyState < 2) {
    if (temporalSmoother) {
      temporalSmoother.reset();
    }
    return {
      handDetected: false,
      handCount: 0,
      hands: [],
      rawGestureName: null,
      gestureName: 'No hand detected',
      confidence: null,
      landmarks: [],
      mirroredLandmarks: [],
      classifierSource,
    };
  }

  const results = recognizer.recognizeForVideo(videoElement, timestampMs);
  const allLandmarks = results?.landmarks ?? [];

  if (allLandmarks.length === 0) {
    if (temporalSmoother) {
      temporalSmoother.reset();
    }
    return {
      handDetected: false,
      handCount: 0,
      hands: [],
      rawGestureName: null,
      gestureName: 'No hand detected',
      confidence: null,
      landmarks: [],
      mirroredLandmarks: [],
      classifierSource,
    };
  }

  const useCustomKnn = classifierSource === 'custom-knn';
  const activeSmoothKeys = new Set();

  const hands = [];

  const handednessCounts = new Map();
  for (let i = 0; i < allLandmarks.length; i += 1) {
    try {
      const hEntry = results?.handedness?.[i]?.[0] ?? results?.handednesses?.[i]?.[0] ?? null;
      const cand = hEntry?.categoryName || hEntry?.displayName || null;
      const clean = typeof cand === 'string' && cand.trim() ? cand.trim().toLowerCase() : null;
      if (clean) {
        handednessCounts.set(clean, (handednessCounts.get(clean) ?? 0) + 1);
      }
    } catch {
      // Ignore malformed handedness entry
    }
  }

  for (let idx = 0; idx < allLandmarks.length; idx += 1) {
    const landmarks = allLandmarks[idx];
    if (!Array.isArray(landmarks) || landmarks.length === 0) {
      continue;
    }

    const mirroredLandmarks = landmarks.map((pt) => ({
      x: mirrorNormalizedX(pt.x),
      y: pt.y,
      z: pt.z ?? 0,
    }));

    const palmCenter = getPalmCenter(landmarks);
    let rawHandedness = null;
    try {
      const handednessEntry =
        results?.handedness?.[idx]?.[0] ?? results?.handednesses?.[idx]?.[0] ?? null;
      const candidate = handednessEntry?.categoryName || handednessEntry?.displayName || null;
      rawHandedness = typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null;
    } catch {
      rawHandedness = null;
    }

    // Assign consistent viewer screen side from mirrored palm X coordinate
    const side = palmCenter && palmCenter.x < 0.5 ? 'left' : 'right';

    let rawGestureName = 'None';
    let gestureName = 'Hand Detected';
    let confidence = null;
    let rejected = false;
    let rejectionReason = null;
    let predictionStatus = null;
    let knnDiagnostics = null;

    if (useCustomKnn) {
      if (customClassifier) {
        try {
          const rawPred = classifyHandLandmarks(
            customClassifier,
            landmarks,
            customOverrides,
            { handedness: rawHandedness }
          );
          const cleanHandKey = rawHandedness ? rawHandedness.toLowerCase() : null;
          const smoothKey =
            cleanHandKey && (handednessCounts.get(cleanHandKey) ?? 0) === 1
              ? `hand-${cleanHandKey}`
              : `slot-${cleanHandKey ?? 'unknown'}-${idx}`;
          activeSmoothKeys.add(smoothKey);
          const finalPred = temporalSmoother
            ? temporalSmoother.smooth(smoothKey, rawPred, timestampMs)
            : rawPred;

          const isRejected = Boolean(
            finalPred.rejected ||
              !finalPred.label ||
              finalPred.label === 'None' ||
              finalPred.label === 'Unknown' ||
              finalPred.label === 'Uncertain'
          );
          predictionStatus = isRejected
            ? (finalPred.predictionStatus === 'Uncertain' ? 'Uncertain' : 'Unknown')
            : 'Known';
          rawGestureName = isRejected ? 'None' : finalPred.label;
          gestureName = isRejected
            ? (predictionStatus === 'Uncertain' ? 'Uncertain Gesture' : 'Unknown Gesture')
            : finalPred.label;
          confidence = Number.isFinite(finalPred.confidence) ? finalPred.confidence : null;
          rejected = isRejected;
          rejectionReason = isRejected ? (finalPred.reason ?? rawPred.reason ?? 'unknown') : null;
          if (rawPred.diagnostics) {
            knnDiagnostics = {
              ...rawPred.diagnostics,
              handedness: rawPred.diagnostics.handedness ?? rawHandedness,
              smoothedLabel: rawGestureName,
              smoothedStatus: predictionStatus,
              smoothedRejected: finalPred.rejected,
              smoothedReason: rejectionReason,
              smoothedConfidence: confidence,
            };
          }
        } catch (knnErr) {
          console.warn(
            '[GestureRecognizer] Custom KNN classification failed; preserving MediaPipe hand landmarks.',
            knnErr
          );
          rawGestureName = 'None';
          gestureName = 'Unknown Gesture';
          predictionStatus = 'Unknown';
          confidence = null;
          rejected = true;
          rejectionReason = 'knn-error';
          knnDiagnostics = null;
        }
      } else {
        rawGestureName = 'None';
        gestureName = 'No KNN model loaded';
        predictionStatus = 'Unknown';
        confidence = null;
        rejected = true;
        rejectionReason = 'no-model';
      }
    } else {
      const topGesture = results?.gestures?.[idx]?.[0] ?? null;
      const rawScore = topGesture?.score ?? null;
      const meetsThreshold =
        topGesture &&
        rawScore !== null &&
        rawScore >= minConfidence &&
        topGesture.categoryName !== 'None';

      rawGestureName = meetsThreshold ? topGesture.categoryName : 'None';
      gestureName = formatGestureLabel(rawGestureName);
      confidence = rawScore;
    }

    hands.push({
      index: idx,
      handedness: rawHandedness,
      side,
      rawGestureName,
      gestureName,
      predictionStatus,
      confidence,
      rejected,
      rejectionReason,
      knnDiagnostics,
      landmarks,
      mirroredLandmarks,
      palmCenter,
    });
  }

  if (hands.length === 0) {
    if (temporalSmoother) {
      temporalSmoother.reset();
    }
    return {
      handDetected: false,
      handCount: 0,
      hands: [],
      rawGestureName: null,
      gestureName: 'No hand detected',
      confidence: null,
      landmarks: [],
      mirroredLandmarks: [],
      classifierSource,
    };
  }

  if (useCustomKnn && temporalSmoother) {
    temporalSmoother.pruneExcept(activeSmoothKeys);
  }

  // Sort consistently from viewer left to viewer right when two hands are visible
  hands.sort((a, b) => (a.palmCenter?.x ?? 0.5) - (b.palmCenter?.x ?? 0.5));

  const primary = hands[0];

  return {
    handDetected: true,
    handCount: hands.length,
    hands,
    rawGestureName: primary.rawGestureName,
    gestureName:
      hands.length === 2
        ? `${hands[0].gestureName} · ${hands[1].gestureName}`
        : primary.gestureName,
    confidence: primary.confidence,
    knnDiagnostics: primary.knnDiagnostics ?? null,
    landmarks: primary.landmarks,
    mirroredLandmarks: primary.mirroredLandmarks,
    classifierSource,
  };
}

/**
 * Returns initialization diagnostics for testing & debugging.
 */
export function getGestureRecognizerDiagnostics() {
  return {
    isInitialized: Boolean(recognizerSingleton),
    delegate: activeDelegate,
    initCount,
    numHands: 2,
  };
}

/**
 * Releases MediaPipe GestureRecognizer WASM/GPU resources on full application teardown.
 */
export function disposeGestureRecognizer() {
  if (recognizerSingleton) {
    try {
      recognizerSingleton.close();
    } catch (err) {
      console.warn('[GestureRecognizer] Error during close():', err);
    }
    recognizerSingleton = null;
  }
  initPromise = null;
  activeDelegate = null;
}
