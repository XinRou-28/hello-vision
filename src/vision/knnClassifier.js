import {
  analyzeDatasetBalance,
  CANONICAL_HANDEDNESS,
  canonicalizeHandFeatureVector,
  CLASSIFICATION_FEATURE_COUNT,
  extractClassificationFeatures,
  extractHandFeatureVector,
  HAND_FEATURE_COUNT,
  HAND_FEATURE_SPEC,
  hasValidHandLandmarks,
  normalizeHandedness,
  serializeRawHandLandmarks,
} from './landmarkFeatures.js';

export const DEFAULT_KNN_HYPERPARAMS = {
  k: 5,
  metric: 'euclidean',
  weighting: 'distance',
  confidenceThreshold: 0.6,
  maxDistanceThreshold: 1.15,
  minDistanceMargin: 0.1,
};

function resolveMatchQuality(distance, threshold, distanceGap) {
  if (!Number.isFinite(distance)) return 'Unknown';
  if (Number.isFinite(threshold) && distance > threshold) return 'Unknown';
  const distRatio = Number.isFinite(threshold) && threshold > 0 ? distance / threshold : distance;
  if (distRatio <= 0.45 && distanceGap >= 0.25) return 'Strong';
  if (distRatio <= 0.75 && distanceGap >= 0.12) return 'Good';
  return 'Borderline';
}

/**
 * Validates and normalizes an imported Colab `knn-gesture-model.json` payload.
 * Throws descriptive errors when schema, feature dimensions, or sample rows are invalid.
 *
 * @param {unknown} rawJson
 * @returns {object} Normalized model definition ready for `createKnnClassifier()`
 */
export function validateKnnModelJson(rawJson) {
  if (!rawJson || typeof rawJson !== 'object' || Array.isArray(rawJson)) {
    throw new Error('Invalid JSON: expected a top-level model object.');
  }

  const featureCount = rawJson.featureSpec?.featureCount ?? HAND_FEATURE_COUNT;
  if (featureCount !== HAND_FEATURE_COUNT) {
    throw new Error(
      `Unsupported featureCount (${featureCount}). Expected ${HAND_FEATURE_COUNT} (21 landmarks × 3).`
    );
  }

  const coordSpace = rawJson.featureSpec?.coordinateSpace;
  if (coordSpace && coordSpace !== HAND_FEATURE_SPEC.coordinateSpace) {
    throw new Error(
      `Incompatible coordinateSpace "${coordSpace}". Expected "${HAND_FEATURE_SPEC.coordinateSpace}".`
    );
  }

  if (!Array.isArray(rawJson.samples) || rawJson.samples.length === 0) {
    throw new Error('Model JSON contains no labelled training samples.');
  }

  const modelCanonicalFlag = rawJson.featureSpec?.handednessCanonicalization === true;
  const normalizedSamples = [];
  const classCounts = {};

  let recomputedFromRawCount = 0;
  let convertedLeftCount = 0;
  let alreadyCanonicalCount = 0;
  let unconvertibleMissingHandednessCount = 0;

  for (let i = 0; i < rawJson.samples.length; i += 1) {
    const row = rawJson.samples[i];
    if (!row || typeof row !== 'object') {
      throw new Error(`Sample at index ${i} is not an object.`);
    }

    const label = typeof row.label === 'string' ? row.label.trim() : '';
    if (!label || label === 'None') {
      throw new Error(`Sample at index ${i} is missing a valid gesture label.`);
    }

    const handedness = normalizeHandedness(row.handedness);
    const rowCanonicalFlag =
      typeof row.handednessCanonicalized === 'boolean'
        ? row.handednessCanonicalized
        : modelCanonicalFlag;

    const preservedRawLandmarks = hasValidHandLandmarks(row.rawLandmarks)
      ? serializeRawHandLandmarks(row.rawLandmarks)
      : null;

    let cleanVec = null;
    let handednessCanonicalized = false;

    // Prefer recomputing from rawLandmarks + handedness when non-canonicalized or features are absent
    if (preservedRawLandmarks && (!rowCanonicalFlag || !Array.isArray(row.features))) {
      const recomputed = extractHandFeatureVector(preservedRawLandmarks, { handedness });
      if (recomputed) {
        cleanVec = recomputed;
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

    if (!cleanVec) {
      const rawFeatures = row.features;
      if (!Array.isArray(rawFeatures) || rawFeatures.length !== HAND_FEATURE_COUNT) {
        throw new Error(
          `Sample ${i} ("${label}") has ${Array.isArray(rawFeatures) ? rawFeatures.length : 0} features; expected ${HAND_FEATURE_COUNT}.`
        );
      }

      const parsedVec = new Array(HAND_FEATURE_COUNT);
      for (let j = 0; j < HAND_FEATURE_COUNT; j += 1) {
        const val = Number(rawFeatures[j]);
        if (!Number.isFinite(val)) {
          throw new Error(`Sample ${i} ("${label}") contains a non-finite number at feature ${j}.`);
        }
        parsedVec[j] = val;
      }

      if (rowCanonicalFlag) {
        cleanVec = parsedVec;
        handednessCanonicalized = true;
        alreadyCanonicalCount += 1;
      } else if (handedness === 'Left') {
        cleanVec = canonicalizeHandFeatureVector(parsedVec, 'Left');
        handednessCanonicalized = true;
        convertedLeftCount += 1;
      } else if (handedness === 'Right') {
        cleanVec = parsedVec;
        handednessCanonicalized = true;
        alreadyCanonicalCount += 1;
      } else {
        // Missing handedness on non-canonicalized feature-only sample:
        // leave features unchanged and report clearly.
        cleanVec = parsedVec;
        handednessCanonicalized = false;
        unconvertibleMissingHandednessCount += 1;
      }
    }

    const normalizedRow = {
      label,
      handedness,
      handednessCanonicalized,
      features: cleanVec,
    };
    if (preservedRawLandmarks) {
      normalizedRow.rawLandmarks = preservedRawLandmarks;
    }

    normalizedSamples.push(normalizedRow);
    classCounts[label] = (classCounts[label] ?? 0) + 1;
  }

  const classes = Object.keys(classCounts).sort();
  if (classes.length === 0) {
    throw new Error('No valid gesture classes found in model.');
  }

  const rawHyper = rawJson.hyperparams ?? {};
  const parsedK = Number(rawHyper.k ?? DEFAULT_KNN_HYPERPARAMS.k);
  const k = Math.max(1, Math.min(normalizedSamples.length, Math.round(parsedK) || 5));

  const parsedConf = Number(
    rawHyper.confidenceThreshold ?? DEFAULT_KNN_HYPERPARAMS.confidenceThreshold
  );
  const confidenceThreshold = Number.isFinite(parsedConf)
    ? Math.max(0.1, Math.min(0.99, parsedConf))
    : DEFAULT_KNN_HYPERPARAMS.confidenceThreshold;

  const rawMaxDist = rawHyper.maxDistanceThreshold;
  const maxDistanceThreshold =
    rawMaxDist === null
      ? null
      : Number.isFinite(Number(rawMaxDist))
        ? Math.max(0.2, Number(rawMaxDist))
        : DEFAULT_KNN_HYPERPARAMS.maxDistanceThreshold;

  const rawMinMargin = rawHyper.minDistanceMargin;
  const minDistanceMargin =
    rawMinMargin === null
      ? null
      : Number.isFinite(Number(rawMinMargin))
        ? Math.max(0, Math.min(1.5, Number(rawMinMargin)))
        : DEFAULT_KNN_HYPERPARAMS.minDistanceMargin;

  let classDistanceThresholds = null;
  if (
    rawHyper.classDistanceThresholds &&
    typeof rawHyper.classDistanceThresholds === 'object' &&
    !Array.isArray(rawHyper.classDistanceThresholds)
  ) {
    const parsedClassThresholds = {};
    for (const cls of classes) {
      const val = Number(rawHyper.classDistanceThresholds[cls]);
      if (Number.isFinite(val) && val > 0) {
        parsedClassThresholds[cls] = Math.max(0.2, val);
      }
    }
    if (Object.keys(parsedClassThresholds).length > 0) {
      classDistanceThresholds = parsedClassThresholds;
    }
  }

  const warnings = [];
  if (unconvertibleMissingHandednessCount > 0) {
    warnings.push(
      `${unconvertibleMissingHandednessCount} sample${
        unconvertibleMissingHandednessCount === 1 ? '' : 's'
      } lacked handedness metadata and could not be reliably canonicalised; original features were kept unchanged.`
    );
  }

  const datasetBalance = analyzeDatasetBalance(classes, normalizedSamples);
  if (datasetBalance.isImbalanced) {
    warnings.push(
      `Dataset class counts are imbalanced (${datasetBalance.minCount} to ${datasetBalance.maxCount} samples); class-balance vote weighting is applied automatically.`
    );
  }

  const hasAnyCanonicalized = normalizedSamples.some((s) => s.handednessCanonicalized);

  return {
    schemaVersion: rawJson.schemaVersion ?? 1,
    modelType: rawJson.modelType ?? 'knn-hand-landmarks',
    createdAt: rawJson.createdAt ?? null,
    featureSpec: {
      ...HAND_FEATURE_SPEC,
      ...(rawJson.featureSpec ?? {}),
      classificationFeatureCount: CLASSIFICATION_FEATURE_COUNT,
      handednessCanonicalization: hasAnyCanonicalized || modelCanonicalFlag,
      canonicalHand: rawJson.featureSpec?.canonicalHand ?? CANONICAL_HANDEDNESS,
      sourceHandednessCanonicalization: modelCanonicalFlag,
    },
    migrationReport: {
      sourceCanonicalized: modelCanonicalFlag,
      recomputedFromRawCount,
      convertedLeftCount,
      alreadyCanonicalCount,
      unconvertibleMissingHandednessCount,
      warnings,
    },
    datasetBalance,
    hyperparams: {
      k,
      metric: 'euclidean',
      weighting: rawHyper.weighting === 'uniform' ? 'uniform' : 'distance',
      confidenceThreshold,
      maxDistanceThreshold,
      minDistanceMargin,
      classDistanceThresholds,
    },
    calibration: rawJson.calibration ?? null,
    classes,
    classCounts,
    sampleCount: normalizedSamples.length,
    metrics: rawJson.metrics ?? null,
    actionBindings: rawJson.actionBindings ?? null,
    samples: normalizedSamples,
  };
}

/**
 * Validates and extracts labelled training examples from an imported
 * `knn-gesture-model.json` payload so participants can recover or continue
 * expanding a dataset without silently overwriting existing samples.
 *
 * @param {unknown} rawJson
 * @returns {{ classes: string[], samples: Array<{ id: string, label: string, handedness: 'Left' | 'Right' | null, handednessCanonicalized: boolean, capturedAt: string, rawLandmarks: Array | null, features: number[] }>, migrationReport: object }}
 */
export function extractDatasetFromKnnModel(rawJson) {
  const validated = validateKnnModelJson(rawJson);
  const stamp = validated.createdAt || new Date().toISOString();
  const samples = validated.samples.map((s, idx) => ({
    id: `model_recovered_${idx}_${s.label}`,
    label: s.label,
    handedness: s.handedness ?? null,
    handednessCanonicalized: Boolean(s.handednessCanonicalized),
    capturedAt: stamp,
    rawLandmarks: s.rawLandmarks ? serializeRawHandLandmarks(s.rawLandmarks) : null,
    features: [...s.features],
  }));

  return {
    classes: [...validated.classes],
    samples,
    migrationReport: validated.migrationReport,
  };
}

/**
 * Builds a compact, allocation-free typed-array KNN classifier from a validated model.
 * Precomputes the 95D hybrid feature vectors (weighted canonical coords + invariant
 * joint angles & relative finger distances) and balanced class priors.
 *
 * @param {object} validatedModel - Output of `validateKnnModelJson()`
 * @returns {object}
 */
export function createKnnClassifier(validatedModel) {
  const model = validatedModel?.samples?.length
    ? validatedModel
    : validateKnnModelJson(validatedModel);

  const count = model.samples.length;
  const classes = model.classes;
  const classToIndex = new Map(classes.map((cls, idx) => [cls, idx]));

  const flatFeatures = new Float32Array(count * CLASSIFICATION_FEATURE_COUNT);
  const labelIndices = new Int32Array(count);
  const countsPerClassIdx = new Int32Array(classes.length);

  for (let i = 0; i < count; i += 1) {
    const sample = model.samples[i];
    const clsIdx = classToIndex.get(sample.label);
    labelIndices[i] = clsIdx;
    countsPerClassIdx[clsIdx] += 1;

    const hybrid = extractClassificationFeatures(sample.features);
    if (!hybrid) {
      throw new Error(`Unable to derive hybrid classification features for sample ${i}.`);
    }
    const offset = i * CLASSIFICATION_FEATURE_COUNT;
    for (let j = 0; j < CLASSIFICATION_FEATURE_COUNT; j += 1) {
      flatFeatures[offset + j] = hybrid[j];
    }
  }

  // Inverse-frequency class balance weights (clamped [0.5, 2.0]) prevent large/burst classes
  // from crowding out smaller classes inside the k-nearest neighborhood.
  const sortedCounts = Array.from(countsPerClassIdx).sort((a, b) => a - b);
  const mid = Math.floor(sortedCounts.length / 2);
  const medianCount =
    sortedCounts.length === 0
      ? 1
      : sortedCounts.length % 2 === 0
        ? (sortedCounts[mid - 1] + sortedCounts[mid]) * 0.5
        : sortedCounts[mid];
  const classBalanceWeights = new Float64Array(classes.length);
  for (let c = 0; c < classes.length; c += 1) {
    const rawPrior = medianCount / Math.max(1, countsPerClassIdx[c]);
    classBalanceWeights[c] = Math.max(0.5, Math.min(2.0, rawPrior));
  }

  return {
    sampleCount: count,
    classes,
    classCounts: model.classCounts,
    datasetBalance: model.datasetBalance ?? analyzeDatasetBalance(classes, model.samples),
    featureDim: CLASSIFICATION_FEATURE_COUNT,
    flatFeatures,
    labelIndices,
    classBalanceWeights,
    hyperparams: {
      ...DEFAULT_KNN_HYPERPARAMS,
      ...model.hyperparams,
      classDistanceThresholds: model.hyperparams?.classDistanceThresholds
        ? { ...model.hyperparams.classDistanceThresholds }
        : null,
    },
    calibration: model.calibration ?? null,
    metrics: model.metrics,
    actionBindings: model.actionBindings,
    featureSpec: model.featureSpec,
    // Reusable scratch buffers for query feature vector and diagnostics
    _queryBuf: new Float32Array(CLASSIFICATION_FEATURE_COUNT),
    _classWeights: new Float64Array(classes.length),
    _classVoteCounts: new Int32Array(classes.length),
    _classMinDistSq: new Float64Array(classes.length),
  };
}

/**
 * Classifies either a canonical 63D feature vector or pre-expanded 95D hybrid
 * feature vector using Euclidean KNN with:
 *   - rotation/scale-invariant joint angles & relative finger distances
 *   - class-balance vote weighting
 *   - open-set max distance rejection ('Unknown')
 *   - closest-vs-second-closest class distance margin rejection ('Uncertain')
 *
 * @param {object} classifier - Instance from `createKnnClassifier()`
 * @param {number[] | Float32Array} features - 63-float canonical vector or 95-float hybrid vector
 * @param {{ k?: number, confidenceThreshold?: number, maxDistanceThreshold?: number | null, minDistanceMargin?: number | null }} overrides
 */
export function classifyFeatureVector(classifier, features, overrides = {}) {
  const safeOverrides = overrides && typeof overrides === 'object' ? overrides : {};
  if (
    !classifier ||
    !features ||
    (features.length !== HAND_FEATURE_COUNT && features.length !== CLASSIFICATION_FEATURE_COUNT)
  ) {
    return {
      label: 'None',
      predictionStatus: 'Unknown',
      confidence: 0,
      neighborAgreement: 0,
      neighborVoteCount: 0,
      matchQuality: 'Unknown',
      nearestDistance: Infinity,
      secondClosestLabel: null,
      secondClosestDistance: Infinity,
      distanceGap: Infinity,
      rejected: true,
      reason: 'invalid-features',
      diagnostics: null,
    };
  }

  const hybridQuery =
    features.length === HAND_FEATURE_COUNT ? extractClassificationFeatures(features) : features;

  if (!hybridQuery || hybridQuery.length !== CLASSIFICATION_FEATURE_COUNT) {
    return {
      label: 'None',
      predictionStatus: 'Unknown',
      confidence: 0,
      neighborAgreement: 0,
      neighborVoteCount: 0,
      matchQuality: 'Unknown',
      nearestDistance: Infinity,
      secondClosestLabel: null,
      secondClosestDistance: Infinity,
      distanceGap: Infinity,
      rejected: true,
      reason: 'non-finite-features',
      diagnostics: null,
    };
  }

  const {
    sampleCount,
    classes,
    flatFeatures,
    labelIndices,
    classBalanceWeights,
    hyperparams,
    _queryBuf,
    _classWeights,
    _classVoteCounts,
    _classMinDistSq,
  } = classifier;

  for (let j = 0; j < CLASSIFICATION_FEATURE_COUNT; j += 1) {
    const val = hybridQuery[j];
    if (!Number.isFinite(val)) {
      return {
        label: 'None',
        predictionStatus: 'Unknown',
        confidence: 0,
        neighborAgreement: 0,
        neighborVoteCount: 0,
        matchQuality: 'Unknown',
        nearestDistance: Infinity,
        secondClosestLabel: null,
        secondClosestDistance: Infinity,
        distanceGap: Infinity,
        rejected: true,
        reason: 'non-finite-features',
        diagnostics: null,
      };
    }
    _queryBuf[j] = val;
  }

  const effectiveK = Math.max(
    1,
    Math.min(sampleCount, Math.round(safeOverrides.k ?? hyperparams.k ?? 5))
  );
  const confidenceThreshold =
    safeOverrides.confidenceThreshold ?? hyperparams.confidenceThreshold ?? 0.6;
  const minDistanceMargin =
    safeOverrides.minDistanceMargin === null
      ? null
      : Number.isFinite(Number(safeOverrides.minDistanceMargin))
        ? Math.max(0, Number(safeOverrides.minDistanceMargin))
        : (hyperparams.minDistanceMargin ?? DEFAULT_KNN_HYPERPARAMS.minDistanceMargin);

  // Maintain top-k smallest squared distances via insertion + per-class minimum distance
  const bestDistSq = new Float64Array(effectiveK);
  const bestClassIdx = new Int32Array(effectiveK);
  const bestSampleIdx = new Int32Array(effectiveK);
  bestDistSq.fill(Infinity);
  bestClassIdx.fill(-1);
  bestSampleIdx.fill(-1);
  _classMinDistSq.fill(Infinity);

  for (let i = 0; i < sampleCount; i += 1) {
    const clsIdx = labelIndices[i];
    const offset = i * CLASSIFICATION_FEATURE_COUNT;
    let distSq = 0;
    const worstAllowed = bestDistSq[effectiveK - 1];
    const classMinAllowed = _classMinDistSq[clsIdx];
    const cutoff = worstAllowed > classMinAllowed ? worstAllowed : classMinAllowed;

    for (let j = 0; j < CLASSIFICATION_FEATURE_COUNT; j += 1) {
      const diff = _queryBuf[j] - flatFeatures[offset + j];
      distSq += diff * diff;
      if (distSq >= cutoff) {
        break;
      }
    }

    if (distSq < _classMinDistSq[clsIdx]) {
      _classMinDistSq[clsIdx] = distSq;
    }

    if (distSq < worstAllowed) {
      let pos = effectiveK - 1;
      while (pos > 0 && distSq < bestDistSq[pos - 1]) {
        bestDistSq[pos] = bestDistSq[pos - 1];
        bestClassIdx[pos] = bestClassIdx[pos - 1];
        bestSampleIdx[pos] = bestSampleIdx[pos - 1];
        pos -= 1;
      }
      bestDistSq[pos] = distSq;
      bestClassIdx[pos] = clsIdx;
      bestSampleIdx[pos] = i;
    }
  }

  const nearestDistance = Math.sqrt(bestDistSq[0]);

  _classWeights.fill(0);
  _classVoteCounts.fill(0);
  let totalWeight = 0;
  const useUniform = hyperparams.weighting === 'uniform';
  const nearestNeighbors = [];

  for (let m = 0; m < effectiveK; m += 1) {
    const clsIdx = bestClassIdx[m];
    if (clsIdx < 0) continue;
    const dist = Math.sqrt(bestDistSq[m]);
    const invDistWeight = useUniform ? 1 : dist < 1e-4 ? 1e4 : 1 / dist;
    const balanceWeight = classBalanceWeights ? (classBalanceWeights[clsIdx] ?? 1) : 1;
    const weight = invDistWeight * balanceWeight;
    _classWeights[clsIdx] += weight;
    _classVoteCounts[clsIdx] += 1;
    totalWeight += weight;
    nearestNeighbors.push({
      label: classes[clsIdx],
      distance: dist,
      weight,
      sampleIndex: bestSampleIdx[m],
    });
  }

  const classMinDistances = [];
  for (let c = 0; c < classes.length; c += 1) {
    classMinDistances.push({
      classIdx: c,
      label: classes[c],
      minDistance: Number.isFinite(_classMinDistSq[c]) ? Math.sqrt(_classMinDistSq[c]) : Infinity,
    });
  }
  classMinDistances.sort((a, b) => a.minDistance - b.minDistance);

  let winningIdx = 0;
  let winningWeight = _classWeights[0] ?? 0;
  for (let c = 1; c < classes.length; c += 1) {
    if (_classWeights[c] > winningWeight) {
      winningWeight = _classWeights[c];
      winningIdx = c;
    }
  }

  const rawCandidateLabel = totalWeight > 0 ? classes[winningIdx] : 'None';
  const rawNeighborShare = totalWeight > 0 ? winningWeight / totalWeight : 0;
  const neighborVoteCount = totalWeight > 0 ? (_classVoteCounts[winningIdx] ?? 0) : 0;
  const neighborAgreement = effectiveK > 0 ? neighborVoteCount / effectiveK : 0;
  const winningClassMinDist =
    totalWeight > 0 && Number.isFinite(_classMinDistSq[winningIdx])
      ? Math.sqrt(_classMinDistSq[winningIdx])
      : nearestDistance;

  const closestClassEntry = classMinDistances[0] ?? null;
  const secondClosestEntry = classMinDistances[1] ?? null;
  const closestDist = closestClassEntry?.minDistance ?? nearestDistance;
  const secondClosestLabel = secondClosestEntry?.label ?? null;
  const secondClosestDistance = secondClosestEntry?.minDistance ?? Infinity;
  const distanceGap =
    classes.length >= 2 && Number.isFinite(secondClosestDistance) && Number.isFinite(closestDist)
      ? Math.max(0, secondClosestDistance - closestDist)
      : Infinity;

  let appliedDistanceThreshold = DEFAULT_KNN_HYPERPARAMS.maxDistanceThreshold;
  let thresholdSource = 'fallback';

  const manualOverrideActive =
    safeOverrides.useManualDistanceOverride === true ||
    (safeOverrides.useManualDistanceOverride === undefined &&
      safeOverrides.maxDistanceThreshold !== undefined);

  if (manualOverrideActive) {
    if (safeOverrides.maxDistanceThreshold === null) {
      appliedDistanceThreshold = null;
      thresholdSource = 'disabled';
    } else if (Number.isFinite(Number(safeOverrides.maxDistanceThreshold))) {
      appliedDistanceThreshold = Number(safeOverrides.maxDistanceThreshold);
      thresholdSource = 'manual-override';
    }
  } else {
    const classCalibrated = hyperparams.classDistanceThresholds?.[rawCandidateLabel];
    if (Number.isFinite(classCalibrated) && classCalibrated > 0) {
      appliedDistanceThreshold = classCalibrated;
      thresholdSource = 'class-calibrated';
    } else if (hyperparams.maxDistanceThreshold === null) {
      appliedDistanceThreshold = null;
      thresholdSource = 'disabled';
    } else if (Number.isFinite(hyperparams.maxDistanceThreshold)) {
      appliedDistanceThreshold = hyperparams.maxDistanceThreshold;
      thresholdSource = 'model-global';
    }
  }

  const effectiveDistance =
    totalWeight > 0 && Number.isFinite(winningClassMinDist)
      ? winningClassMinDist
      : nearestDistance;

  const rejectedByDistance =
    appliedDistanceThreshold !== null &&
    Number.isFinite(appliedDistanceThreshold) &&
    effectiveDistance > appliedDistanceThreshold;

  const rejectedByZeroWeight = !rejectedByDistance && totalWeight <= 0;

  // Reject as Uncertain when closest and second-closest classes lie within `minDistanceMargin`
  // (unless it is a near-exact match clearly separated from the runner-up), OR when vote winner
  // disagrees with nearest-class prototype across a narrow boundary gap.
  const marginGateActive =
    !rejectedByDistance &&
    !rejectedByZeroWeight &&
    classes.length >= 2 &&
    minDistanceMargin !== null &&
    Number.isFinite(minDistanceMargin) &&
    minDistanceMargin > 0;

  const nearExactMatch = closestDist < 0.08 && distanceGap >= 0.02;
  const closestDisagreesWithVote =
    closestClassEntry !== null && closestClassEntry.classIdx !== winningIdx;

  const rejectedByMargin =
    marginGateActive &&
    !nearExactMatch &&
    (distanceGap < minDistanceMargin ||
      (closestDisagreesWithVote && distanceGap < Math.max(0.16, minDistanceMargin * 1.5)));

  const rejectedByAgreement =
    !rejectedByDistance &&
    !rejectedByZeroWeight &&
    !rejectedByMargin &&
    totalWeight > 0 &&
    rawNeighborShare < confidenceThreshold;

  let rejected = false;
  let predictionStatus = 'Known';
  let reason = null;
  if (rejectedByDistance) {
    rejected = true;
    predictionStatus = 'Unknown';
    reason = thresholdSource === 'class-calibrated' ? 'class-distance' : 'unknown-distance';
  } else if (rejectedByZeroWeight) {
    rejected = true;
    predictionStatus = 'Unknown';
    reason = 'zero-weight';
  } else if (rejectedByMargin) {
    rejected = true;
    predictionStatus = 'Uncertain';
    reason = 'ambiguous-margin';
  } else if (rejectedByAgreement) {
    rejected = true;
    predictionStatus = 'Uncertain';
    reason = 'low-confidence';
  }

  // Kept numerically on accepted predictions for downstream action-gating compatibility;
  // UI surfaces show distance, class gap, and neighbor agreement instead of calibrated %.
  const confidence = rejectedByDistance || rejectedByZeroWeight ? 0 : rawNeighborShare;
  const matchQuality = rejected
    ? predictionStatus
    : resolveMatchQuality(effectiveDistance, appliedDistanceThreshold, distanceGap);

  const publicClassMinDistances = classMinDistances.map(({ label, minDistance }) => ({
    label,
    minDistance,
  }));

  const diagnostics = {
    rawCandidateLabel,
    rawConfidence: rawNeighborShare,
    neighborShare: rawNeighborShare,
    neighborAgreement,
    neighborVoteCount,
    k: effectiveK,
    predictionStatus,
    matchQuality,
    nearestDistance,
    winningClassMinDist: effectiveDistance,
    secondClosestLabel,
    secondClosestDistance,
    distanceGap,
    minDistanceMargin,
    appliedDistanceThreshold,
    thresholdSource,
    rejected,
    reason,
    thresholds: {
      k: effectiveK,
      confidenceThreshold,
      minDistanceMargin,
      maxDistanceThreshold: appliedDistanceThreshold,
      globalMaxDistanceThreshold: hyperparams.maxDistanceThreshold ?? null,
    },
    nearestNeighbors,
    classMinDistances: publicClassMinDistances,
  };

  if (rejected) {
    return {
      label: 'None',
      predictionStatus,
      confidence,
      neighborAgreement,
      neighborVoteCount,
      matchQuality,
      nearestDistance,
      secondClosestLabel,
      secondClosestDistance,
      distanceGap,
      rejected: true,
      reason,
      diagnostics,
    };
  }

  return {
    label: classes[winningIdx],
    predictionStatus,
    confidence,
    neighborAgreement,
    neighborVoteCount,
    matchQuality,
    nearestDistance,
    secondClosestLabel,
    secondClosestDistance,
    distanceGap,
    rejected: false,
    reason: null,
    diagnostics,
  };
}

/**
 * Convenience wrapper that canonicalizes (using MediaPipe handedness) and
 * normalizes 21 raw MediaPipe landmarks (`hand.landmarks`) and runs KNN inference.
 *
 * @param {object} classifier
 * @param {Array<{ x: number, y: number, z?: number }>} landmarks
 * @param {object} overrides
 * @param {{ handedness?: string | null }} [context]
 */
export function classifyHandLandmarks(classifier, landmarks, overrides = {}, context = {}) {
  const safeOverrides = overrides && typeof overrides === 'object' ? overrides : {};
  const safeContext = context && typeof context === 'object' ? context : {};
  const rawHandedness = safeContext.handedness ?? safeOverrides.handedness ?? null;
  const normalizedHandedness = normalizeHandedness(rawHandedness);
  const features = extractHandFeatureVector(landmarks, { handedness: normalizedHandedness });
  if (!features) {
    return {
      label: 'None',
      predictionStatus: 'Unknown',
      confidence: 0,
      neighborAgreement: 0,
      neighborVoteCount: 0,
      matchQuality: 'Unknown',
      nearestDistance: Infinity,
      secondClosestLabel: null,
      secondClosestDistance: Infinity,
      distanceGap: Infinity,
      rejected: true,
      reason: 'invalid-landmarks',
      diagnostics: null,
    };
  }
  const prediction = classifyFeatureVector(classifier, features, safeOverrides);
  if (prediction.diagnostics) {
    prediction.diagnostics.handedness = normalizedHandedness;
    prediction.diagnostics.handednessCanonicalized = normalizedHandedness !== null;
    prediction.diagnostics.canonicalHand = CANONICAL_HANDEDNESS;
  }
  return prediction;
}

/**
 * Creates a per-hand temporal stabilizer combining short entry consistency and
 * label-switch hysteresis so noisy single-frame blips do not flip between
 * similar gestures (e.g. Open Palm <-> Number 6) while keeping recognition snappy.
 */
export function createTemporalGestureSmoother(options = {}) {
  const windowSize = Math.max(1, options.windowSize ?? 5);
  const staleMs = options.staleMs ?? 450;
  const minConsistentFrames = Math.max(1, options.minConsistentFrames ?? 2);
  const switchConsistentFrames = Math.max(2, options.switchConsistentFrames ?? 3);
  const states = new Map();

  return {
    reset() {
      states.clear();
    },

    pruneExcept(activeKeys) {
      for (const key of states.keys()) {
        if (!activeKeys.has(key)) {
          states.delete(key);
        }
      }
    },

    smooth(handKey, prediction, nowMs = performance.now()) {
      let state = states.get(handKey);
      if (!state) {
        state = {
          history: [],
          activeLabel: 'None',
          candidateLabel: 'None',
          candidateStreak: 0,
          rejectedStreak: 0,
        };
        states.set(handKey, state);
      }

      const { history } = state;

      // Reset stale state when hand disappears or pauses longer than `staleMs`
      if (history.length > 0 && nowMs - history[history.length - 1].timestamp > staleMs) {
        history.length = 0;
        state.activeLabel = 'None';
        state.candidateLabel = 'None';
        state.candidateStreak = 0;
        state.rejectedStreak = 0;
      }

      while (history.length > 0 && nowMs - history[0].timestamp > staleMs) {
        history.shift();
      }

      const isRejectedFrame = Boolean(
        !prediction ||
          prediction.rejected ||
          !prediction.label ||
          prediction.label === 'None' ||
          prediction.label === 'Unknown' ||
          prediction.label === 'Uncertain'
      );

      const frameStatus = isRejectedFrame
        ? (prediction?.predictionStatus === 'Uncertain' ? 'Uncertain' : 'Unknown')
        : 'Known';

      history.push({
        label: isRejectedFrame ? 'None' : prediction.label,
        rejected: isRejectedFrame,
        confidence: prediction?.confidence ?? 0,
        nearestDistance: prediction?.nearestDistance ?? Infinity,
        distanceGap: prediction?.distanceGap ?? Infinity,
        reason: prediction?.reason ?? null,
        timestamp: nowMs,
      });

      if (history.length > windowSize) {
        history.shift();
      }

      // Current Unknown/Uncertain frame must NEVER become a known gesture from prior frames
      if (isRejectedFrame) {
        state.candidateLabel = 'None';
        state.candidateStreak = 0;
        state.rejectedStreak += 1;
        if (state.rejectedStreak >= 2) {
          state.activeLabel = 'None';
        }
        return {
          label: 'None',
          predictionStatus: frameStatus,
          confidence: prediction?.confidence ?? 0,
          nearestDistance: prediction?.nearestDistance ?? Infinity,
          distanceGap: prediction?.distanceGap ?? Infinity,
          rejected: true,
          reason: prediction?.reason ?? 'unknown-rejected',
        };
      }

      state.rejectedStreak = 0;

      if (state.candidateLabel === prediction.label) {
        state.candidateStreak += 1;
      } else {
        state.candidateLabel = prediction.label;
        state.candidateStreak = 1;
      }

      // Entry from None / Unknown / Uncertain requires `minConsistentFrames` consecutive consistent predictions
      if (state.activeLabel === 'None') {
        if (state.candidateStreak < minConsistentFrames) {
          return {
            label: 'None',
            predictionStatus: 'Uncertain',
            confidence: prediction.confidence,
            nearestDistance: prediction.nearestDistance,
            distanceGap: prediction.distanceGap,
            rejected: true,
            reason: 'smoothing-transition',
          };
        }
        state.activeLabel = prediction.label;
        return {
          label: state.activeLabel,
          predictionStatus: 'Known',
          confidence: prediction.confidence,
          nearestDistance: prediction.nearestDistance,
          distanceGap: prediction.distanceGap,
          rejected: false,
          reason: null,
        };
      }

      // Holding an already-confirmed gesture:
      // Switching to a different label requires `switchConsistentFrames` consecutive frames
      // so 1-2 noisy transition frames never trigger rapid label flapping.
      if (prediction.label !== state.activeLabel) {
        if (state.candidateStreak < switchConsistentFrames) {
          // Hold active label on a single glitch frame, or report transitioning once streak === 2
          if (state.candidateStreak === 1) {
            return {
              label: state.activeLabel,
              predictionStatus: 'Known',
              confidence: prediction.confidence,
              nearestDistance: prediction.nearestDistance,
              distanceGap: prediction.distanceGap,
              rejected: false,
              reason: null,
            };
          }
          return {
            label: 'None',
            predictionStatus: 'Uncertain',
            confidence: prediction.confidence,
            nearestDistance: prediction.nearestDistance,
            distanceGap: prediction.distanceGap,
            rejected: true,
            reason: 'smoothing-hysteresis',
          };
        }
        state.activeLabel = prediction.label;
      }

      return {
        label: state.activeLabel,
        predictionStatus: 'Known',
        confidence: prediction.confidence,
        nearestDistance: prediction.nearestDistance,
        distanceGap: prediction.distanceGap,
        rejected: false,
        reason: null,
      };
    },
  };
}
