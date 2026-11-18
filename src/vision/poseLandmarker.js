import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { mirrorNormalizedX } from './landmarkMath.js';

const LOCAL_WASM_PATH = '/wasm';
const CDN_WASM_PATH = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';

const LOCAL_MODEL_PATH = '/models/pose_landmarker_lite.task';
const CDN_MODEL_PATH =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

export const POSE_LANDMARK_INDEX = {
  NOSE: 0,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
};

export const RELEVANT_POSE_INDICES = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];

/**
 * Standard upper & lower body skeleton bone pairs connecting MediaPipe pose keypoints.
 */
export const POSE_CONNECTIONS = [
  // Torso
  [11, 12],
  [11, 23],
  [12, 24],
  [23, 24],
  // Left arm
  [11, 13],
  [13, 15],
  // Right arm
  [12, 14],
  [14, 16],
  // Left leg
  [23, 25],
  [25, 27],
  // Right leg
  [24, 26],
  [26, 28],
];

let poseLandmarkerSingleton = null;
let poseInitPromise = null;
let activePoseDelegate = null;
let poseInitCount = 0;

async function hasValidLocalWasm() {
  try {
    const res = await fetch(`${LOCAL_WASM_PATH}/vision_wasm_internal.wasm`, { method: 'HEAD' });
    if (!res.ok) return false;
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
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
      console.warn('[PoseLandmarker] Local WASM unavailable, falling back to CDN.', localErr);
    }
  } else {
    console.warn('[PoseLandmarker] Local WASM asset missing or invalid, falling back to CDN.');
  }
  return await FilesetResolver.forVisionTasks(CDN_WASM_PATH);
}

async function resolvePoseModelPath() {
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
 * @workshop-exercise Exercise 1 (Pose Challenge): Lazy Pose Landmarker Initialization
 *
 * Lazily initializes and caches a single MediaPipe PoseLandmarker instance in VIDEO mode
 * only when the participant opens Pose Challenge. Attempts GPU delegate first and
 * falls back explicitly to CPU if GPU initialization fails.
 *
 * Expected output:
 * - Promise<{ landmarker: PoseLandmarker, delegate: 'GPU' | 'CPU', initCount: number }>
 */
export async function getOrCreatePoseLandmarker() {
  if (poseLandmarkerSingleton) {
    return {
      landmarker: poseLandmarkerSingleton,
      delegate: activePoseDelegate,
      initCount: poseInitCount,
    };
  }

  if (poseInitPromise) {
    return poseInitPromise;
  }

  poseInitPromise = (async () => {
    const vision = await loadVisionWasmFileset();
    const modelAssetPath = await resolvePoseModelPath();

    const sharedOptions = {
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    };

    async function createWithDelegateFallback(fileset) {
      try {
        const landmarker = await PoseLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath,
            delegate: 'GPU',
          },
          ...sharedOptions,
        });
        return { landmarker, delegate: 'GPU' };
      } catch (gpuError) {
        console.warn(
          '[PoseLandmarker] GPU delegate failed; falling back to CPU delegate.',
          gpuError
        );
        const landmarker = await PoseLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath,
            delegate: 'CPU',
          },
          ...sharedOptions,
        });
        return { landmarker, delegate: 'CPU' };
      }
    }

    try {
      const created = await createWithDelegateFallback(vision);
      poseLandmarkerSingleton = created.landmarker;
      activePoseDelegate = created.delegate;
    } catch (primaryErr) {
      const usingLocalWasm =
        typeof vision?.wasmLoaderPath === 'string' && vision.wasmLoaderPath.startsWith(LOCAL_WASM_PATH);
      if (!usingLocalWasm) {
        throw primaryErr;
      }
      console.warn(
        '[PoseLandmarker] Local WASM initialization failed; retrying with CDN WASM.',
        primaryErr
      );
      const cdnVision = await FilesetResolver.forVisionTasks(CDN_WASM_PATH);
      const created = await createWithDelegateFallback(cdnVision);
      poseLandmarkerSingleton = created.landmarker;
      activePoseDelegate = created.delegate;
    }

    poseInitCount += 1;

    return {
      landmarker: poseLandmarkerSingleton,
      delegate: activePoseDelegate,
      initCount: poseInitCount,
    };
  })();

  try {
    return await poseInitPromise;
  } catch (err) {
    poseInitPromise = null;
    throw err;
  }
}

/**
 * @workshop-exercise Exercise 2 (Pose Challenge): Body Landmark Inference
 *
 * Runs PoseLandmarker on the current webcam video frame and returns both raw
 * landmarks (for the mirrored WebcamPip overlay) and viewer-mirrored landmarks
 * (where +x corresponds to viewer right).
 *
 * Expected inputs:
 * - landmarker: PoseLandmarker instance
 * - videoElement: HTMLVideoElement with readyState >= 2
 * - timestampMs: number (strictly increasing timestamp in milliseconds)
 *
 * Expected output:
 * - {
 *     poseDetected: boolean,
 *     landmarks: Array<{ x: number, y: number, z: number, visibility?: number }>,
 *     mirroredLandmarks: Array<{ x: number, y: number, z: number, visibility: number }>,
 *     visibleCount: number,
 *   }
 */
export function detectPoseFrame(landmarker, videoElement, timestampMs) {
  if (!landmarker || !videoElement || videoElement.readyState < 2) {
    return {
      poseDetected: false,
      landmarks: [],
      mirroredLandmarks: [],
      visibleCount: 0,
    };
  }

  const results = landmarker.detectForVideo(videoElement, timestampMs);
  const landmarks = results?.landmarks?.[0] ?? [];

  if (landmarks.length === 0) {
    return {
      poseDetected: false,
      landmarks: [],
      mirroredLandmarks: [],
      visibleCount: 0,
    };
  }

  const mirroredLandmarks = landmarks.map((pt) => ({
    x: mirrorNormalizedX(pt.x),
    y: pt.y,
    z: pt.z ?? 0,
    visibility: pt.visibility ?? 1,
  }));

  const visibleCount = RELEVANT_POSE_INDICES.filter(
    (idx) => (landmarks[idx]?.visibility ?? 1) >= 0.45
  ).length;

  return {
    poseDetected: true,
    landmarks,
    mirroredLandmarks,
    visibleCount,
  };
}

/**
 * Returns Pose Landmarker initialization diagnostics for debugging & testing.
 */
export function getPoseLandmarkerDiagnostics() {
  return {
    isInitialized: Boolean(poseLandmarkerSingleton),
    delegate: activePoseDelegate,
    initCount: poseInitCount,
  };
}

/**
 * Releases PoseLandmarker WASM/GPU resources on full application teardown.
 */
export function disposePoseLandmarker() {
  if (poseLandmarkerSingleton) {
    try {
      poseLandmarkerSingleton.close();
    } catch (err) {
      console.warn('[PoseLandmarker] Error during close():', err);
    }
    poseLandmarkerSingleton = null;
  }
  poseInitPromise = null;
  activePoseDelegate = null;
}
