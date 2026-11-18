/**
 * Canonical Hand Landmark Feature Extraction & Normalization (63 dimensions)
 *
 * Exact Normalization Formula (must match Python implementation in
 * notebooks/Custom_Gesture_KNN_Training.ipynb):
 *
 * Given 21 unmirrored MediaPipe hand landmarks `hand.landmarks` where each
 * landmark i in [0..20] has { x, y, z } and optional MediaPipe `handedness`
 * ('Left' | 'Right' | null):
 *
 *   0. Handedness canonicalization (Left -> Right canonical space):
 *        If normalized handedness === 'Left':
 *          x'_i = 1 - landmarks[i].x
 *          y'_i = landmarks[i].y
 *          z'_i = landmarks[i].z ?? 0
 *        Otherwise ('Right' or null):
 *          (x'_i, y'_i, z'_i) = (landmarks[i].x, landmarks[i].y, landmarks[i].z ?? 0)
 *
 *   1. Wrist-center (translation invariance):
 *        dx_i = x'_i - x'_0
 *        dy_i = y'_i - y'_0
 *        dz_i = z'_i - z'_0
 *
 *   2. Scale normalization (distance-from-camera invariance):
 *        scale = max_{i = 0..20} sqrt(dx_i^2 + dy_i^2 + dz_i^2)
 *        (Rejected as invalid if scale < 1e-5 or non-finite.)
 *
 *   3. Divide by scale and flatten in landmark-major order:
 *        features = [dx_0/s, dy_0/s, dz_0/s, ..., dx_20/s, dy_20/s, dz_20/s]
 *        (Total length = 21 * 3 = 63 floats bounded in [-1, 1].)
 *
 * Notes:
 * - Always uses `hand.landmarks` (raw unmirrored camera-space coordinates)
 *   paired with MediaPipe's `handedness` from the same unmirrored result,
 *   never mixing mirrored viewer coordinates with unmirrored handedness.
 * - Because x' = 1 - x before wrist-centering yields dx' = -dx and identical scale,
 *   canonicalizing raw landmarks for a Left hand is mathematically identical to
 *   negating the x-axis components (indices 0, 3, ..., 60) of a non-canonicalized
 *   63D feature vector.
 */

export const HAND_LANDMARK_COUNT = 21;
export const HAND_FEATURE_COUNT = 63;
export const CLASSIFICATION_GEOMETRIC_FEATURE_COUNT = 32;
export const CLASSIFICATION_FEATURE_COUNT = HAND_FEATURE_COUNT + CLASSIFICATION_GEOMETRIC_FEATURE_COUNT;
export const CANONICAL_HANDEDNESS = 'Right';

export const CLASSIFICATION_COORD_WEIGHT_XY = 0.5;
export const CLASSIFICATION_COORD_WEIGHT_Z = 0.3;

// 15 joint bend triplets (3 per finger: wrist/proximal -> middle joint -> distal).
// Must match notebooks/Custom_Gesture_KNN_Training.ipynb identically.
export const HAND_BEND_ANGLE_TRIPLETS = [
  // Thumb
  [0, 1, 2],
  [1, 2, 3],
  [2, 3, 4],
  // Index
  [0, 5, 6],
  [5, 6, 7],
  [6, 7, 8],
  // Middle
  [0, 9, 10],
  [9, 10, 11],
  [10, 11, 12],
  // Ring
  [0, 13, 14],
  [13, 14, 15],
  [14, 15, 16],
  // Pinky
  [0, 17, 18],
  [17, 18, 19],
  [18, 19, 20],
];

// 5 finger extension pairs [baseKnuckle, tip]
export const HAND_EXTENSION_PAIRS = [
  [2, 4],
  [5, 8],
  [9, 12],
  [13, 16],
  [17, 20],
];

// 4 thumb-tip (#4) to other fingertips
export const HAND_THUMB_GAP_TIPS = [8, 12, 16, 20];

// 3 adjacent fingertip gaps
export const HAND_ADJACENT_GAP_PAIRS = [
  [8, 12],
  [12, 16],
  [16, 20],
];

// 5 fingertip to palm-center knuckle (#9) distances
export const HAND_PALM_DIST_TIPS = [4, 8, 12, 16, 20];

export const HAND_FEATURE_SPEC = {
  featureCount: HAND_FEATURE_COUNT,
  classificationFeatureCount: CLASSIFICATION_FEATURE_COUNT,
  landmarkCount: HAND_LANDMARK_COUNT,
  dimensions: ['x', 'y', 'z'],
  coordinateSource: 'hand.landmarks',
  coordinateSpace: 'raw-landmarks-wrist-centered-maxnorm',
  handednessCanonicalization: true,
  canonicalHand: CANONICAL_HANDEDNESS,
};

/**
 * Normalizes a MediaPipe handedness label to 'Left', 'Right', or null.
 *
 * @param {unknown} handedness
 * @returns {'Left' | 'Right' | null}
 */
export function normalizeHandedness(handedness) {
  if (typeof handedness !== 'string') {
    return null;
  }
  const clean = handedness.trim().toLowerCase();
  if (clean === 'left') return 'Left';
  if (clean === 'right') return 'Right';
  return null;
}

/**
 * Validates that a landmarks array contains 21 finite { x, y, z } points.
 *
 * @param {Array<{ x: number, y: number, z?: number }>} landmarks
 * @returns {boolean}
 */
export function hasValidHandLandmarks(landmarks) {
  if (!Array.isArray(landmarks) || landmarks.length !== HAND_LANDMARK_COUNT) {
    return false;
  }
  for (let i = 0; i < HAND_LANDMARK_COUNT; i += 1) {
    const pt = landmarks[i];
    if (
      !pt ||
      !Number.isFinite(pt.x) ||
      !Number.isFinite(pt.y) ||
      (pt.z !== undefined && pt.z !== null && !Number.isFinite(pt.z))
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Transforms 21 raw MediaPipe hand landmarks into canonical Right-hand orientation
 * without mutating the input array. Left-hand landmarks are horizontally mirrored
 * across x (x' = 1 - x) while preserving y and z.
 *
 * @param {Array<{ x: number, y: number, z?: number }>} landmarks
 * @param {string | null | undefined} [handedness]
 * @returns {Array<{ x: number, y: number, z: number }> | null}
 */
export function canonicalizeHandLandmarks(landmarks, handedness = null) {
  if (!hasValidHandLandmarks(landmarks)) {
    return null;
  }
  const mirrorX = normalizeHandedness(handedness) === 'Left';
  return landmarks.map((pt) => {
    const rawX = Number(pt.x);
    return {
      x: mirrorX ? 1 - rawX : rawX,
      y: Number(pt.y),
      z: Number(pt.z ?? 0),
    };
  });
}

/**
 * Converts a non-canonicalized 63-dimensional wrist-centered feature vector
 * into canonical Right-hand space by negating x-axis components (j % 3 === 0)
 * when `handedness === 'Left'`. Should ONLY be called on confirmed
 * non-canonicalized legacy feature vectors.
 *
 * @param {number[]} features
 * @param {string | null | undefined} [handedness]
 * @returns {number[] | null}
 */
export function canonicalizeHandFeatureVector(features, handedness = null) {
  if (!Array.isArray(features) || features.length !== HAND_FEATURE_COUNT) {
    return null;
  }
  const mirrorX = normalizeHandedness(handedness) === 'Left';
  const result = new Array(HAND_FEATURE_COUNT);
  for (let j = 0; j < HAND_FEATURE_COUNT; j += 1) {
    const val = Number(features[j]);
    if (!Number.isFinite(val)) {
      return null;
    }
    if (mirrorX && j % 3 === 0) {
      result[j] = val === 0 ? 0 : -val;
    } else {
      result[j] = val;
    }
  }
  return result;
}

/**
 * Extracts a 63-dimensional canonicalized, wrist-centered, max-radius-scaled
 * feature vector from 21 raw MediaPipe hand landmarks (`hand.landmarks`).
 *
 * @param {Array<{ x: number, y: number, z?: number }>} landmarks
 * @param {{ handedness?: string | null, canonicalize?: boolean }} [options]
 * @returns {number[] | null}
 */
export function extractHandFeatureVector(landmarks, options = {}) {
  const { handedness = null, canonicalize = true } = options ?? {};
  const workingLandmarks = canonicalize
    ? canonicalizeHandLandmarks(landmarks, handedness)
    : landmarks;

  if (!hasValidHandLandmarks(workingLandmarks)) {
    return null;
  }

  const wrist = workingLandmarks[0];
  const wx = wrist.x;
  const wy = wrist.y;
  const wz = wrist.z ?? 0;

  const shifted = new Array(HAND_FEATURE_COUNT);
  let maxNorm = 0;

  for (let i = 0; i < HAND_LANDMARK_COUNT; i += 1) {
    const pt = workingLandmarks[i];
    const dx = pt.x - wx;
    const dy = pt.y - wy;
    const dz = (pt.z ?? 0) - wz;

    const base = i * 3;
    shifted[base] = dx;
    shifted[base + 1] = dy;
    shifted[base + 2] = dz;

    const norm = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (norm > maxNorm) {
      maxNorm = norm;
    }
  }

  if (!Number.isFinite(maxNorm) || maxNorm < 1e-5) {
    return null;
  }

  const invScale = 1 / maxNorm;
  for (let j = 0; j < HAND_FEATURE_COUNT; j += 1) {
    shifted[j] *= invScale;
  }

  return shifted;
}

/**
 * Derives the 95-dimensional hybrid classification feature vector directly from
 * a canonical 63-dimensional wrist-centered, max-radius-normalized hand vector:
 *   - [0..62]: Weighted canonical coordinates (x/y * 0.50, z * 0.30) preserving
 *              global hand orientation while damping monocular depth noise & rotation skew
 *   - [63..77]: 15 3D finger joint bend angles (0 = straight, 1 = curled, weight 0.70)
 *   - [78..82]: 5 palm-scale-normalized fingertip extension ratios (weight 0.75)
 *   - [83..86]: 4 thumb-tip (#4) to fingertip distances (weight 0.70)
 *   - [87..89]: 3 adjacent fingertip gaps (weight 0.55)
 *   - [90..94]: 5 fingertip to palm-center knuckle (#9) distances (weight 0.65)
 *
 * Because uniform wrist translation and uniform scaling preserve all 3D angles
 * and all distance ratios, this runs identically on live frames and legacy 63D JSON rows.
 * Must match `extract_classification_features()` in `notebooks/Custom_Gesture_KNN_Training.ipynb`.
 *
 * @param {number[] | Float32Array} features63
 * @returns {number[] | null}
 */
export function extractClassificationFeatures(features63) {
  if (!features63 || features63.length !== HAND_FEATURE_COUNT) {
    return null;
  }

  const out = new Array(CLASSIFICATION_FEATURE_COUNT);
  for (let i = 0; i < HAND_LANDMARK_COUNT; i += 1) {
    const base = i * 3;
    const x = Number(features63[base]);
    const y = Number(features63[base + 1]);
    const z = Number(features63[base + 2]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return null;
    }
    out[base] = x * CLASSIFICATION_COORD_WEIGHT_XY;
    out[base + 1] = y * CLASSIFICATION_COORD_WEIGHT_XY;
    out[base + 2] = z * CLASSIFICATION_COORD_WEIGHT_Z;
  }

  const pointNorm = (idx) => {
    const b = idx * 3;
    const px = Number(features63[b]);
    const py = Number(features63[b + 1]);
    const pz = Number(features63[b + 2]);
    return Math.sqrt(px * px + py * py + pz * pz);
  };

  const pairDist = (a, b) => {
    const ba = a * 3;
    const bb = b * 3;
    const dx = Number(features63[ba]) - Number(features63[bb]);
    const dy = Number(features63[ba + 1]) - Number(features63[bb + 1]);
    const dz = Number(features63[ba + 2]) - Number(features63[bb + 2]);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  };

  const palmSum = pointNorm(5) + pointNorm(9) + pointNorm(13) + pointNorm(17);
  const palmScale = Math.max(1e-4, palmSum * 0.25);
  const invTwoPalm = 1.0 / (2.0 * palmScale);

  let writeIdx = HAND_FEATURE_COUNT;

  // 1. 15 joint bend angles: 0.5 * (1 + cos(angle at middle joint B))
  for (let t = 0; t < HAND_BEND_ANGLE_TRIPLETS.length; t += 1) {
    const [a, b, c] = HAND_BEND_ANGLE_TRIPLETS[t];
    const ba = a * 3;
    const bb = b * 3;
    const bc = c * 3;

    const v1x = Number(features63[ba]) - Number(features63[bb]);
    const v1y = Number(features63[ba + 1]) - Number(features63[bb + 1]);
    const v1z = Number(features63[ba + 2]) - Number(features63[bb + 2]);

    const v2x = Number(features63[bc]) - Number(features63[bb]);
    const v2y = Number(features63[bc + 1]) - Number(features63[bb + 1]);
    const v2z = Number(features63[bc + 2]) - Number(features63[bb + 2]);

    const n1 = Math.sqrt(v1x * v1x + v1y * v1y + v1z * v1z);
    const n2 = Math.sqrt(v2x * v2x + v2y * v2y + v2z * v2z);
    let bend = 0.0;
    if (n1 > 1e-6 && n2 > 1e-6) {
      const cosRaw = (v1x * v2x + v1y * v2y + v1z * v2z) / (n1 * n2);
      const cosClamped = Math.max(-1.0, Math.min(1.0, cosRaw));
      bend = 0.5 * (1.0 + cosClamped);
    }
    out[writeIdx] = bend * 0.7;
    writeIdx += 1;
  }

  // 2. 5 finger extension ratios
  for (let e = 0; e < HAND_EXTENSION_PAIRS.length; e += 1) {
    const [mcp, tip] = HAND_EXTENSION_PAIRS[e];
    const ratio = (pointNorm(tip) - pointNorm(mcp)) * invTwoPalm;
    const clamped = Math.max(-0.5, Math.min(1.5, ratio));
    out[writeIdx] = clamped * 0.75;
    writeIdx += 1;
  }

  // 3. 4 thumb-tip (#4) to fingertip distances
  for (let g = 0; g < HAND_THUMB_GAP_TIPS.length; g += 1) {
    const dist = pairDist(4, HAND_THUMB_GAP_TIPS[g]) * invTwoPalm;
    out[writeIdx] = Math.min(2.0, dist) * 0.7;
    writeIdx += 1;
  }

  // 4. 3 adjacent fingertip gaps
  for (let p = 0; p < HAND_ADJACENT_GAP_PAIRS.length; p += 1) {
    const [a, b] = HAND_ADJACENT_GAP_PAIRS[p];
    const dist = pairDist(a, b) * invTwoPalm;
    out[writeIdx] = Math.min(2.0, dist) * 0.55;
    writeIdx += 1;
  }

  // 5. 5 fingertip-to-palm-center (#9) distances
  for (let k = 0; k < HAND_PALM_DIST_TIPS.length; k += 1) {
    const dist = pairDist(9, HAND_PALM_DIST_TIPS[k]) * invTwoPalm;
    out[writeIdx] = Math.min(2.0, dist) * 0.65;
    writeIdx += 1;
  }

  return out;
}

/**
 * Computes Euclidean L2 distance between two equal-length numeric feature vectors.
 *
 * @param {number[] | Float32Array} a
 * @param {number[] | Float32Array} b
 * @returns {number}
 */
export function computeFeatureVectorDistance(a, b) {
  if (!a || !b || a.length !== b.length || a.length === 0) {
    return Infinity;
  }
  let sumSq = 0;
  for (let i = 0; i < a.length; i += 1) {
    const d = Number(a[i]) - Number(b[i]);
    sumSq += d * d;
  }
  return Math.sqrt(sumSq);
}

/**
 * Analyzes per-class sample counts to detect dataset imbalance or under-collected classes.
 *
 * @param {string[]} classes
 * @param {Array<{ label: string }>} samples
 * @param {number} [targetPerClass]
 */
export function analyzeDatasetBalance(classes = [], samples = [], targetPerClass = SAMPLE_TARGET_PER_CLASS) {
  const countsByClass = {};
  for (const cls of classes) {
    countsByClass[cls] = 0;
  }
  for (const sample of samples) {
    const lbl = typeof sample?.label === 'string' ? sample.label.trim() : '';
    if (!lbl || lbl === 'None') continue;
    countsByClass[lbl] = (countsByClass[lbl] ?? 0) + 1;
  }

  const allClasses = Object.keys(countsByClass).sort((a, b) => a.localeCompare(b));
  if (allClasses.length === 0) {
    return {
      countsByClass,
      minCount: 0,
      maxCount: 0,
      medianCount: 0,
      imbalanceRatio: 1,
      isImbalanced: false,
      underrepresentedClasses: [],
      lowSampleClasses: [],
    };
  }

  const counts = allClasses.map((c) => countsByClass[c]).sort((a, b) => a - b);
  const minCount = counts[0];
  const maxCount = counts[counts.length - 1];
  const mid = Math.floor(counts.length / 2);
  const medianCount =
    counts.length % 2 === 0 ? (counts[mid - 1] + counts[mid]) * 0.5 : counts[mid];

  const nonZeroMin = counts.find((c) => c > 0) ?? 0;
  const imbalanceRatio = nonZeroMin > 0 ? maxCount / nonZeroMin : maxCount > 0 ? Infinity : 1;
  const isImbalanced =
    allClasses.length >= 2 && maxCount > 0 && (minCount === 0 || maxCount / Math.max(1, minCount) >= 1.6);

  const balanceFloor = Math.max(1, Math.round(maxCount * 0.6));
  const underrepresentedClasses = allClasses.filter(
    (c) => countsByClass[c] < balanceFloor && maxCount >= 8
  );
  const lowSampleClasses = allClasses.filter((c) => countsByClass[c] < Math.min(15, targetPerClass));

  return {
    countsByClass,
    minCount,
    maxCount,
    medianCount,
    imbalanceRatio,
    isImbalanced,
    underrepresentedClasses,
    lowSampleClasses,
  };
}

/**
 * Returns a plain serializable copy of 21 raw landmarks for JSON export.
 *
 * @param {Array<{ x: number, y: number, z?: number }>} landmarks
 * @returns {Array<{ x: number, y: number, z: number }> | null}
 */
export function serializeRawHandLandmarks(landmarks) {
  if (!hasValidHandLandmarks(landmarks)) {
    return null;
  }
  return landmarks.map((pt) => ({
    x: Number(pt.x),
    y: Number(pt.y),
    z: Number(pt.z ?? 0),
  }));
}

export const SAMPLE_TARGET_PER_CLASS = 30;

/**
 * Builds a canonical deduplication key for a labelled 63-feature sample so
 * re-importing the same `samples.json` does not create duplicate entries.
 *
 * @param {{ id?: string, label: string, features: number[] }} sample
 * @returns {string}
 */
export function getSampleFingerprint(sample) {
  const label = String(sample?.label ?? '').trim();
  const quantized = Array.isArray(sample?.features)
    ? sample.features.map((v) => Math.round(Number(v) * 1e4)).join(',')
    : '';
  return `${label}::${quantized}`;
}

/**
 * Validates and normalizes an imported `samples.json` training dataset payload.
 * Guarantees 63-dimensional normalized vectors matching `extractHandFeatureVector()`,
 * safely migrating legacy non-canonicalized datasets without double-flipping.
 *
 * @param {unknown} rawJson
 * @returns {{
 *   classes: string[],
 *   samples: Array<{
 *     id: string,
 *     label: string,
 *     handedness: 'Left' | 'Right' | null,
 *     handednessCanonicalized: boolean,
 *     capturedAt: string,
 *     rawLandmarks: Array | null,
 *     features: number[],
 *   }>,
 *   migrationReport: {
 *     sourceCanonicalized: boolean,
 *     recomputedFromRawCount: number,
 *     convertedLeftFeaturesCount: number,
 *     alreadyCanonicalCount: number,
 *     unconvertibleMissingHandednessCount: number,
 *     warnings: string[],
 *   }
 * }}
 */
export function parseTrainingDatasetJson(rawJson) {
  if (!rawJson || typeof rawJson !== 'object' || Array.isArray(rawJson)) {
    throw new Error('Invalid dataset JSON: expected an object with a "samples" array.');
  }

  const coordSpace = rawJson.featureSpec?.coordinateSpace;
  if (coordSpace && coordSpace !== HAND_FEATURE_SPEC.coordinateSpace) {
    throw new Error(
      `Incompatible feature coordinateSpace "${coordSpace}". Expected "${HAND_FEATURE_SPEC.coordinateSpace}".`
    );
  }

  if (!Array.isArray(rawJson.samples)) {
    throw new Error('Invalid dataset JSON: missing "samples" array.');
  }

  const datasetCanonicalFlag = rawJson.featureSpec?.handednessCanonicalization === true;
  const normalizedSamples = [];
  const classSet = new Set();

  let recomputedFromRawCount = 0;
  let convertedLeftFeaturesCount = 0;
  let alreadyCanonicalCount = 0;
  let unconvertibleMissingHandednessCount = 0;

  if (Array.isArray(rawJson.classes)) {
    for (const cls of rawJson.classes) {
      const cleanCls = typeof cls === 'string' ? cls.trim() : '';
      if (cleanCls && cleanCls !== 'None') {
        classSet.add(cleanCls);
      }
    }
  }

  for (let i = 0; i < rawJson.samples.length; i += 1) {
    const row = rawJson.samples[i];
    if (!row || typeof row !== 'object') {
      throw new Error(`Dataset sample at index ${i} is not a valid object.`);
    }

    const label = typeof row.label === 'string' ? row.label.trim() : '';
    if (!label || label === 'None') {
      throw new Error(`Dataset sample at index ${i} is missing a valid gesture label.`);
    }

    const handedness = normalizeHandedness(row.handedness);
    const rowCanonicalFlag =
      typeof row.handednessCanonicalized === 'boolean'
        ? row.handednessCanonicalized
        : datasetCanonicalFlag;

    let rawLandmarks = null;
    let features = null;
    let handednessCanonicalized = false;

    if (hasValidHandLandmarks(row.rawLandmarks)) {
      rawLandmarks = serializeRawHandLandmarks(row.rawLandmarks);
      features = extractHandFeatureVector(rawLandmarks, { handedness });
      if (features) {
        if (handedness !== null) {
          handednessCanonicalized = true;
          if (!rowCanonicalFlag) {
            recomputedFromRawCount += 1;
          } else {
            alreadyCanonicalCount += 1;
          }
        } else {
          handednessCanonicalized = false;
          unconvertibleMissingHandednessCount += 1;
        }
      }
    }

    if (!features && Array.isArray(row.features) && row.features.length === HAND_FEATURE_COUNT) {
      const cleanVec = new Array(HAND_FEATURE_COUNT);
      let validVec = true;
      for (let j = 0; j < HAND_FEATURE_COUNT; j += 1) {
        const val = Number(row.features[j]);
        if (!Number.isFinite(val)) {
          validVec = false;
          break;
        }
        cleanVec[j] = val;
      }
      if (validVec) {
        if (rowCanonicalFlag) {
          features = cleanVec;
          handednessCanonicalized = true;
          alreadyCanonicalCount += 1;
        } else if (handedness === 'Left') {
          features = canonicalizeHandFeatureVector(cleanVec, 'Left');
          handednessCanonicalized = true;
          convertedLeftFeaturesCount += 1;
        } else if (handedness === 'Right') {
          features = cleanVec;
          handednessCanonicalized = true;
          alreadyCanonicalCount += 1;
        } else {
          // Missing handedness on a non-canonicalized feature-only sample:
          // leave features unchanged and report explicitly.
          features = cleanVec;
          handednessCanonicalized = false;
          unconvertibleMissingHandednessCount += 1;
        }
      }
    }

    if (!features || features.length !== HAND_FEATURE_COUNT) {
      throw new Error(
        `Sample ${i} ("${label}") lacks valid 21-landmark coordinates or 63 normalized features.`
      );
    }

    classSet.add(label);
    normalizedSamples.push({
      id:
        typeof row.id === 'string' && row.id.trim()
          ? row.id.trim()
          : `imported_${Date.now()}_${i}`,
      label,
      handedness,
      handednessCanonicalized,
      capturedAt: row.capturedAt ?? new Date().toISOString(),
      rawLandmarks,
      features,
    });
  }

  const warnings = [];
  if (unconvertibleMissingHandednessCount > 0) {
    warnings.push(
      `${unconvertibleMissingHandednessCount} sample${
        unconvertibleMissingHandednessCount === 1 ? '' : 's'
      } lacked handedness metadata and could not be reliably canonicalised; original features were kept unchanged.`
    );
  }

  const classes = Array.from(classSet).sort((a, b) => a.localeCompare(b));
  return {
    classes,
    samples: normalizedSamples,
    migrationReport: {
      sourceCanonicalized: datasetCanonicalFlag,
      recomputedFromRawCount,
      convertedLeftFeaturesCount,
      alreadyCanonicalCount,
      unconvertibleMissingHandednessCount,
      warnings,
    },
  };
}

/**
 * Merges incoming dataset samples/classes into an existing dataset while
 * preventing duplicate imports (by sample ID or quantized 63-feature signature).
 *
 * @param {{ existingSamples?: Array, existingClasses?: string[], incomingSamples?: Array, incomingClasses?: string[], mode?: 'merge' | 'replace' }} params
 */
export function mergeTrainingDatasets({
  existingSamples = [],
  existingClasses = [],
  incomingSamples = [],
  incomingClasses = [],
  mode = 'merge',
}) {
  const baseSamples = mode === 'replace' ? [] : [...existingSamples];
  const classSet = new Set(mode === 'replace' ? [] : existingClasses);

  const seenIds = new Set(baseSamples.map((s) => s.id).filter(Boolean));
  const seenFingerprints = new Set(baseSamples.map((s) => getSampleFingerprint(s)));

  let addedCount = 0;
  let skippedDuplicates = 0;
  const addedClasses = [];

  for (const cls of incomingClasses) {
    const clean = String(cls || '').trim();
    if (clean && clean !== 'None' && !classSet.has(clean)) {
      classSet.add(clean);
      addedClasses.push(clean);
    }
  }

  for (const sample of incomingSamples) {
    const cleanLabel = String(sample?.label || '').trim();
    if (!cleanLabel || cleanLabel === 'None') continue;

    if (!classSet.has(cleanLabel)) {
      classSet.add(cleanLabel);
      addedClasses.push(cleanLabel);
    }

    const fp = getSampleFingerprint(sample);
    if ((sample.id && seenIds.has(sample.id)) || seenFingerprints.has(fp)) {
      skippedDuplicates += 1;
      continue;
    }

    const uniqueId =
      sample.id && !seenIds.has(sample.id)
        ? sample.id
        : `sample_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    seenIds.add(uniqueId);
    seenFingerprints.add(fp);
    baseSamples.push({
      ...sample,
      id: uniqueId,
      label: cleanLabel,
    });
    addedCount += 1;
  }

  return {
    samples: baseSamples,
    classes: Array.from(classSet).sort((a, b) => a.localeCompare(b)),
    addedCount,
    skippedDuplicates,
    addedClasses,
  };
}

/**
 * Builds the `samples.json` export payload expected by
 * `notebooks/Custom_Gesture_KNN_Training.ipynb`.
 *
 * @param {Array<{ id?: string, label: string, handedness?: string | null, handednessCanonicalized?: boolean, rawLandmarks?: Array | null, features: number[], capturedAt?: string }>} samples
 * @param {string[]} [declaredClasses]
 * @returns {object}
 */
export function buildTrainingDatasetPayload(samples, declaredClasses = []) {
  const cleanSamples = (samples ?? []).map((sample, idx) => {
    const handedness = normalizeHandedness(sample.handedness);
    const handednessCanonicalized =
      typeof sample.handednessCanonicalized === 'boolean'
        ? sample.handednessCanonicalized
        : handedness !== null;

    const row = {
      id: sample.id ?? `sample_${idx + 1}`,
      label: String(sample.label).trim(),
      handedness,
      handednessCanonicalized,
      capturedAt: sample.capturedAt ?? new Date().toISOString(),
      features: sample.features,
    };
    if (Array.isArray(sample.rawLandmarks) && sample.rawLandmarks.length === HAND_LANDMARK_COUNT) {
      row.rawLandmarks = sample.rawLandmarks;
    }
    return row;
  });

  const classSet = new Set(cleanSamples.map((s) => s.label));
  for (const cls of declaredClasses) {
    const clean = String(cls || '').trim();
    if (clean && clean !== 'None') {
      classSet.add(clean);
    }
  }
  const classes = Array.from(classSet).sort((a, b) => a.localeCompare(b));

  return {
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    featureSpec: { ...HAND_FEATURE_SPEC },
    classes,
    sampleCount: cleanSamples.length,
    samples: cleanSamples,
  };
}
