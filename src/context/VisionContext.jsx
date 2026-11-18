import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { buildDefaultActionBindings } from '../exercises/customGestureBindings.js';
import {
  createKnnClassifier,
  createTemporalGestureSmoother,
  DEFAULT_KNN_HYPERPARAMS,
  extractDatasetFromKnnModel,
  validateKnnModelJson,
} from '../vision/knnClassifier.js';
import {
  mergeTrainingDatasets,
  parseTrainingDatasetJson,
} from '../vision/landmarkFeatures.js';
import {
  disposeGestureRecognizer,
  getGestureRecognizerDiagnostics,
  getOrCreateGestureRecognizer,
  recognizeGestureFrame,
} from '../vision/gestureRecognizer.js';
import {
  detectPoseFrame,
  disposePoseLandmarker,
  getOrCreatePoseLandmarker,
  getPoseLandmarkerDiagnostics,
} from '../vision/poseLandmarker.js';

const VisionContext = createContext(null);

const INFERENCE_INTERVAL_MS = 35; // ~28 FPS max inference rate
const HUD_UPDATE_INTERVAL_MS = 85; // ~12 Hz React HUD state refresh

const EMPTY_FRAME_RESULT = {
  handDetected: false,
  handCount: 0,
  hands: [],
  rawGestureName: null,
  gestureName: 'No hand detected',
  confidence: null,
  knnDiagnostics: null,
  landmarks: [],
  mirroredLandmarks: [],
  timestamp: 0,
};

const EMPTY_POSE_RESULT = {
  poseDetected: false,
  landmarks: [],
  mirroredLandmarks: [],
  visibleCount: 0,
  timestamp: 0,
};

/**
 * Inspects MediaStreamTrack.getCapabilities() to request the highest suitable
 * supported resolution and minimum zoom (if supported) without cropping or
 * breaking cameras that omit zoom/resolution capabilities.
 */
export async function optimizeCameraTrackConstraints(videoTrack) {
  if (!videoTrack) return null;

  const caps =
    typeof videoTrack.getCapabilities === 'function' ? videoTrack.getCapabilities() : null;

  if (caps && typeof videoTrack.applyConstraints === 'function') {
    if (caps.width?.max && caps.height?.max) {
      const targetWidth = Math.min(1920, caps.width.max);
      const targetHeight = Math.min(1080, caps.height.max);
      try {
        await videoTrack.applyConstraints({
          width: { ideal: targetWidth },
          height: { ideal: targetHeight },
        });
      } catch {
        // Ignore gracefully if camera driver rejects resolution constraints
      }
    }

    if (caps.zoom && typeof caps.zoom.min === 'number') {
      try {
        await videoTrack.applyConstraints({
          advanced: [{ zoom: caps.zoom.min }],
        });
      } catch {
        try {
          await videoTrack.applyConstraints({ zoom: caps.zoom.min });
        } catch {
          // Ignore gracefully if zoom constraint is unsupported at current resolution
        }
      }
    }
  }

  const settings =
    typeof videoTrack.getSettings === 'function' ? videoTrack.getSettings() : {};

  return {
    width: settings.width ?? null,
    height: settings.height ?? null,
    zoomSupported: Boolean(caps?.zoom && typeof caps.zoom.min === 'number'),
    zoomMin: caps?.zoom?.min ?? null,
    currentZoom: settings.zoom ?? null,
  };
}

export function VisionProvider({ children }) {
  const persistentVideoRef = useRef(null);
  const streamRef = useRef(null);
  const cameraStartPromiseRef = useRef(null);
  const recognizerRef = useRef(null);
  const poseLandmarkerRef = useRef(null);

  const rafIdRef = useRef(0);
  const lastInferenceTimeRef = useRef(0);
  const lastVideoTimeRef = useRef(-1);
  const lastTimestampMsRef = useRef(0);
  const lastHudUpdateRef = useRef(0);
  const lastLoggedGestureRef = useRef(null);
  const lastLoggedHandCountRef = useRef(0);
  const lastLoggedPoseVisibleRef = useRef(-1);

  const fpsWindowStartRef = useRef(0);
  const fpsFrameCountRef = useRef(0);

  // High-frequency refs read directly by Canvas / Three.js / Pose / PiP renderers
  const latestFrameRef = useRef(EMPTY_FRAME_RESULT);
  const latestPoseFrameRef = useRef(EMPTY_POSE_RESULT);

  // Custom KNN classifier refs & state (read in rAF without stale closures)
  const customClassifierRef = useRef(null);
  const customModelDataRef = useRef(null);
  const classifierSourceRef = useRef('pretrained');
  const initialCustomKnnConfig = {
    ...DEFAULT_KNN_HYPERPARAMS,
    distanceThresholdMode: 'calibrated', // 'calibrated' | 'manual'
  };
  const customKnnConfigRef = useRef(initialCustomKnnConfig);
  const temporalSmootherRef = useRef(
    createTemporalGestureSmoother({
      windowSize: 5,
      minConsistentFrames: 2,
      switchConsistentFrames: 3,
    })
  );

  const [classifierSource, setClassifierSourceState] = useState('pretrained'); // 'pretrained' | 'custom-knn'
  const [customModelMeta, setCustomModelMeta] = useState(null);
  const [customKnnConfig, setCustomKnnConfig] = useState(initialCustomKnnConfig);
  const [actionBindings, setActionBindings] = useState({
    magicCanvas: {},
    particleUniverse: {},
  });

  // Persistent Training Dataset state (strictly separate from loaded KNN model)
  const [datasetClasses, setDatasetClasses] = useState([]);
  const [datasetSamples, setDatasetSamples] = useState([]);
  const [activeDatasetClass, setActiveDatasetClass] = useState('');
  const [datasetVersion, setDatasetVersion] = useState(0);
  const [modelSyncedDatasetVersion, setModelSyncedDatasetVersion] = useState(null);
  const datasetStateRef = useRef({ classes: [], samples: [], version: 0 });
  datasetStateRef.current = { classes: datasetClasses, samples: datasetSamples, version: datasetVersion };

  const [inferenceMode, setInferenceMode] = useState('idle'); // 'idle' | 'gesture' | 'pose'
  const [cameraStatus, setCameraStatus] = useState('idle'); // 'idle' | 'loading' | 'active' | 'paused' | 'denied' | 'unavailable' | 'error'
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [cameraError, setCameraError] = useState(null);
  const [cameraTrackInfo, setCameraTrackInfo] = useState(null);
  const [streamVersion, setStreamVersion] = useState(0);
  const [streamInitCount, setStreamInitCount] = useState(0);

  const [modelStatus, setModelStatus] = useState('idle'); // 'idle' | 'loading' | 'ready' | 'error'
  const [modelDelegate, setModelDelegate] = useState(null);
  const [modelError, setModelError] = useState(null);
  const [modelInitCount, setModelInitCount] = useState(0);

  const [poseModelStatus, setPoseModelStatus] = useState('idle'); // 'idle' | 'loading' | 'ready' | 'error'
  const [poseModelDelegate, setPoseModelDelegate] = useState(null);
  const [poseModelError, setPoseModelError] = useState(null);
  const [poseModelInitCount, setPoseModelInitCount] = useState(0);

  const [hudState, setHudState] = useState({
    handDetected: false,
    handCount: 0,
    rawGestureName: null,
    gestureName: 'Waiting for camera',
    confidence: null,
    knnDiagnostics: null,
    landmarkCount: 0,
    poseDetected: false,
    poseVisibleCount: 0,
    inferenceFps: 0,
  });

  const attachStreamToVideo = useCallback(async (stream) => {
    const videoEl = persistentVideoRef.current;
    if (!videoEl || !stream) return;

    if (videoEl.srcObject !== stream) {
      videoEl.srcObject = stream;
    }

    if (videoEl.readyState < 1) {
      await new Promise((resolve) => {
        const onLoaded = () => {
          videoEl.removeEventListener('loadedmetadata', onLoaded);
          resolve();
        };
        videoEl.addEventListener('loadedmetadata', onLoaded);
      });
    }

    try {
      await videoEl.play();
    } catch (playErr) {
      console.warn('[VisionContext] Video autoplay warning:', playErr);
    }
  }, []);

  const ensureCameraStarted = useCallback(async () => {
    const existingStream = streamRef.current;
    const hasLiveTrack =
      existingStream &&
      existingStream.getVideoTracks().some((track) => track.readyState === 'live');

    if (hasLiveTrack) {
      await attachStreamToVideo(existingStream);
      setCameraStatus((prev) => (prev === 'paused' ? 'paused' : 'active'));
      return existingStream;
    }

    if (cameraStartPromiseRef.current) {
      return cameraStartPromiseRef.current;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraStatus('unavailable');
      setCameraError('Webcam API is unavailable in this browser.');
      return null;
    }

    setCameraStatus('loading');
    setCameraError(null);

    cameraStartPromiseRef.current = (async () => {
      try {
        let stream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              frameRate: { ideal: 30 },
              facingMode: 'user',
            },
            audio: false,
          });
        } catch (highResErr) {
          if (highResErr?.name === 'OverconstrainedError') {
            stream = await navigator.mediaDevices.getUserMedia({
              video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: 'user',
              },
              audio: false,
            });
          } else {
            throw highResErr;
          }
        }

        const primaryTrack = stream.getVideoTracks()[0];
        const trackInfo = await optimizeCameraTrackConstraints(primaryTrack);
        setCameraTrackInfo(trackInfo);

        streamRef.current = stream;
        setStreamInitCount((count) => count + 1);
        setStreamVersion((v) => v + 1);
        setCameraEnabled(true);

        await attachStreamToVideo(stream);
        setCameraStatus('active');
        return stream;
      } catch (err) {
        const errorName = err?.name || '';
        if (errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError') {
          setCameraStatus('denied');
          setCameraError('Camera permission was denied.');
        } else if (
          errorName === 'NotFoundError' ||
          errorName === 'DevicesNotFoundError' ||
          errorName === 'OverconstrainedError'
        ) {
          setCameraStatus('unavailable');
          setCameraError('No compatible webcam was found.');
        } else {
          setCameraStatus('error');
          setCameraError(err?.message || 'Unable to start webcam.');
        }
        return null;
      } finally {
        cameraStartPromiseRef.current = null;
      }
    })();

    return cameraStartPromiseRef.current;
  }, [attachStreamToVideo]);

  const ensureGestureModelLoaded = useCallback(async () => {
    if (recognizerRef.current) {
      const diag = getGestureRecognizerDiagnostics();
      setModelStatus('ready');
      setModelDelegate(diag.delegate);
      setModelInitCount(diag.initCount);
      return recognizerRef.current;
    }

    setModelStatus('loading');
    setModelError(null);

    try {
      const { recognizer, delegate, initCount } = await getOrCreateGestureRecognizer();
      recognizerRef.current = recognizer;
      setModelDelegate(delegate);
      setModelInitCount(initCount);
      setModelStatus('ready');
      return recognizer;
    } catch (err) {
      console.error('[VisionContext] Failed to initialize GestureRecognizer:', err);
      setModelStatus('error');
      setModelError(err?.message || 'Failed to load gesture model.');
      return null;
    }
  }, []);

  const ensurePoseModelLoaded = useCallback(async () => {
    if (poseLandmarkerRef.current) {
      const diag = getPoseLandmarkerDiagnostics();
      setPoseModelStatus('ready');
      setPoseModelDelegate(diag.delegate);
      setPoseModelInitCount(diag.initCount);
      return poseLandmarkerRef.current;
    }

    setPoseModelStatus('loading');
    setPoseModelError(null);

    try {
      const { landmarker, delegate, initCount } = await getOrCreatePoseLandmarker();
      poseLandmarkerRef.current = landmarker;
      setPoseModelDelegate(delegate);
      setPoseModelInitCount(initCount);
      setPoseModelStatus('ready');
      return landmarker;
    } catch (err) {
      console.error('[VisionContext] Failed to initialize PoseLandmarker:', err);
      setPoseModelStatus('error');
      setPoseModelError(err?.message || 'Failed to load pose model.');
      return null;
    }
  }, []);

  const pauseCamera = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    stream.getVideoTracks().forEach((track) => {
      track.enabled = false;
    });
    setCameraEnabled(false);
    setCameraStatus('paused');
    latestFrameRef.current = EMPTY_FRAME_RESULT;
    latestPoseFrameRef.current = EMPTY_POSE_RESULT;
    setHudState({
      handDetected: false,
      handCount: 0,
      rawGestureName: null,
      gestureName: 'Camera paused',
      confidence: null,
      knnDiagnostics: null,
      landmarkCount: 0,
      poseDetected: false,
      poseVisibleCount: 0,
      inferenceFps: 0,
    });
  }, []);

  const resumeCamera = useCallback(async () => {
    const stream = streamRef.current;
    const hasLiveTrack = stream && stream.getVideoTracks().some((t) => t.readyState === 'live');
    if (hasLiveTrack) {
      stream.getVideoTracks().forEach((track) => {
        track.enabled = true;
      });
      setCameraEnabled(true);
      setCameraStatus('active');
      await attachStreamToVideo(stream);
      return;
    }
    await ensureCameraStarted();
  }, [attachStreamToVideo, ensureCameraStarted]);

  const toggleCamera = useCallback(() => {
    if (cameraEnabled && cameraStatus === 'active') {
      pauseCamera();
    } else {
      resumeCamera();
    }
  }, [cameraEnabled, cameraStatus, pauseCamera, resumeCamera]);

  const setClassifierSource = useCallback((nextSource) => {
    const resolved =
      nextSource === 'custom-knn' && customClassifierRef.current ? 'custom-knn' : 'pretrained';
    classifierSourceRef.current = resolved;
    temporalSmootherRef.current.reset();
    setClassifierSourceState(resolved);
  }, []);

  const importCustomKnnModel = useCallback((rawJson, fileName = 'knn-gesture-model.json') => {
    const validated = validateKnnModelJson(rawJson);
    const classifier = createKnnClassifier(validated);
    const nextConfig = {
      ...validated.hyperparams,
      distanceThresholdMode: 'calibrated',
    };
    const nextBindings = buildDefaultActionBindings(validated.classes, validated.actionBindings);

    customClassifierRef.current = classifier;
    customModelDataRef.current = validated;
    customKnnConfigRef.current = nextConfig;
    classifierSourceRef.current = 'custom-knn';
    temporalSmootherRef.current.reset();

    const meta = {
      fileName,
      classes: validated.classes,
      classCounts: validated.classCounts,
      sampleCount: validated.sampleCount,
      hyperparams: validated.hyperparams,
      calibration: validated.calibration,
      metrics: validated.metrics,
      featureSpec: validated.featureSpec,
      migrationReport: validated.migrationReport,
      createdAt: validated.createdAt,
    };

    setCustomKnnConfig(nextConfig);
    setActionBindings(nextBindings);
    setCustomModelMeta(meta);
    setModelSyncedDatasetVersion(datasetStateRef.current.version);
    setClassifierSourceState('custom-knn');

    return meta;
  }, []);

  const clearCustomKnnModel = useCallback(() => {
    customClassifierRef.current = null;
    customModelDataRef.current = null;
    classifierSourceRef.current = 'pretrained';
    temporalSmootherRef.current.reset();
    const fallbackConfig = {
      ...DEFAULT_KNN_HYPERPARAMS,
      distanceThresholdMode: 'calibrated',
    };
    customKnnConfigRef.current = fallbackConfig;
    setCustomKnnConfig(fallbackConfig);
    setCustomModelMeta(null);
    setModelSyncedDatasetVersion(null);
    setActionBindings({ magicCanvas: {}, particleUniverse: {} });
    setClassifierSourceState('pretrained');
  }, []);

  const createDatasetClass = useCallback((rawName) => {
    const clean = String(rawName ?? '').trim();
    if (!clean || clean === 'None') {
      return { ok: false, error: 'Enter a valid gesture name (cannot be empty or "None").' };
    }
    const currentClasses = datasetStateRef.current.classes;
    if (currentClasses.some((c) => c.toLowerCase() === clean.toLowerCase())) {
      const existing = currentClasses.find((c) => c.toLowerCase() === clean.toLowerCase());
      setActiveDatasetClass(existing);
      return { ok: false, error: `Gesture "${existing}" already exists; selected it for capture.` };
    }
    const nextClasses = [...currentClasses, clean].sort((a, b) => a.localeCompare(b));
    setDatasetClasses(nextClasses);
    setActiveDatasetClass(clean);
    setDatasetVersion((v) => v + 1);
    return { ok: true, name: clean };
  }, []);

  const renameDatasetClass = useCallback((oldName, rawNewName) => {
    const next = String(rawNewName ?? '').trim();
    if (!next || next === 'None') {
      return { ok: false, error: 'Gesture name cannot be empty or "None".' };
    }
    if (next === oldName) {
      return { ok: true, name: next };
    }
    const currentClasses = datasetStateRef.current.classes;
    if (currentClasses.some((c) => c !== oldName && c.toLowerCase() === next.toLowerCase())) {
      return { ok: false, error: `Another gesture class named "${next}" already exists.` };
    }
    setDatasetClasses((prev) =>
      prev.map((c) => (c === oldName ? next : c)).sort((a, b) => a.localeCompare(b))
    );
    setDatasetSamples((prev) =>
      prev.map((s) => (s.label === oldName ? { ...s, label: next } : s))
    );
    setActiveDatasetClass((prev) => (prev === oldName ? next : prev));
    setDatasetVersion((v) => v + 1);
    return { ok: true, name: next };
  }, []);

  const deleteDatasetClass = useCallback((className) => {
    setDatasetClasses((prev) => {
      const remaining = prev.filter((c) => c !== className);
      setActiveDatasetClass((curr) => (curr === className ? remaining[0] ?? '' : curr));
      return remaining;
    });
    setDatasetSamples((prev) => prev.filter((s) => s.label !== className));
    setDatasetVersion((v) => v + 1);
  }, []);

  const addDatasetSamples = useCallback((incoming) => {
    const items = Array.isArray(incoming) ? incoming : [incoming];
    const validItems = items.filter((s) => s && s.label && Array.isArray(s.features));
    if (validItems.length === 0) return;

    setDatasetClasses((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const item of validItems) {
        if (!next.has(item.label)) {
          next.add(item.label);
          changed = true;
        }
      }
      return changed ? Array.from(next).sort((a, b) => a.localeCompare(b)) : prev;
    });
    setDatasetSamples((prev) => [...prev, ...validItems]);
    setDatasetVersion((v) => v + 1);
  }, []);

  const deleteDatasetSample = useCallback((sampleId) => {
    setDatasetSamples((prev) => prev.filter((s) => s.id !== sampleId));
    setDatasetVersion((v) => v + 1);
  }, []);

  const importTrainingDataset = useCallback((rawJson, mode = 'merge') => {
    const parsed = parseTrainingDatasetJson(rawJson);
    const merged = mergeTrainingDatasets({
      existingSamples: datasetStateRef.current.samples,
      existingClasses: datasetStateRef.current.classes,
      incomingSamples: parsed.samples,
      incomingClasses: parsed.classes,
      mode,
    });

    setDatasetClasses(merged.classes);
    setDatasetSamples(merged.samples);
    setActiveDatasetClass((prev) => {
      if (mode === 'replace' || !prev || !merged.classes.includes(prev)) {
        return merged.classes[0] ?? '';
      }
      return prev;
    });
    setDatasetVersion((v) => v + 1);

    return {
      addedCount: merged.addedCount,
      skippedDuplicates: merged.skippedDuplicates,
      addedClasses: merged.addedClasses,
      totalSamples: merged.samples.length,
      classes: merged.classes,
      migrationReport: parsed.migrationReport,
    };
  }, []);

  const recoverDatasetFromLoadedModel = useCallback((mode = 'merge') => {
    if (!customModelDataRef.current) {
      throw new Error('No KNN model is currently loaded to recover samples from.');
    }
    const extracted = extractDatasetFromKnnModel(customModelDataRef.current);
    const merged = mergeTrainingDatasets({
      existingSamples: datasetStateRef.current.samples,
      existingClasses: datasetStateRef.current.classes,
      incomingSamples: extracted.samples,
      incomingClasses: extracted.classes,
      mode,
    });

    setDatasetClasses(merged.classes);
    setDatasetSamples(merged.samples);
    setActiveDatasetClass((prev) => {
      if (mode === 'replace' || !prev || !merged.classes.includes(prev)) {
        return merged.classes[0] ?? '';
      }
      return prev;
    });
    setDatasetVersion((v) => v + 1);

    return {
      addedCount: merged.addedCount,
      skippedDuplicates: merged.skippedDuplicates,
      addedClasses: merged.addedClasses,
      totalSamples: merged.samples.length,
      classes: merged.classes,
      migrationReport: extracted.migrationReport,
    };
  }, []);

  const clearTrainingDataset = useCallback(() => {
    setDatasetClasses([]);
    setDatasetSamples([]);
    setActiveDatasetClass('');
    setDatasetVersion((v) => v + 1);
  }, []);

  const updateCustomKnnConfig = useCallback((partial) => {
    setCustomKnnConfig((prev) => {
      const next = { ...prev, ...partial };
      customKnnConfigRef.current = next;
      return next;
    });
  }, []);

  const resetCustomKnnConfig = useCallback(() => {
    const baseHyper = customModelDataRef.current?.hyperparams ?? DEFAULT_KNN_HYPERPARAMS;
    const next = {
      ...baseHyper,
      distanceThresholdMode: 'calibrated',
    };
    customKnnConfigRef.current = next;
    setCustomKnnConfig(next);
  }, []);

  const setActionBinding = useCallback((activityKey, gestureLabel, actionId) => {
    setActionBindings((prev) => ({
      ...prev,
      [activityKey]: {
        ...(prev[activityKey] ?? {}),
        [gestureLabel]: actionId,
      },
    }));
  }, []);

  const retryCamera = useCallback(async () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    await ensureCameraStarted();
  }, [ensureCameraStarted]);

  // Lazily start camera & only the required MediaPipe model for the active mode
  useEffect(() => {
    if (inferenceMode === 'idle') {
      latestFrameRef.current = EMPTY_FRAME_RESULT;
      latestPoseFrameRef.current = EMPTY_POSE_RESULT;
      return;
    }

    ensureCameraStarted();
    if (inferenceMode === 'gesture') {
      latestPoseFrameRef.current = EMPTY_POSE_RESULT;
      ensureGestureModelLoaded();
    } else if (inferenceMode === 'pose') {
      latestFrameRef.current = EMPTY_FRAME_RESULT;
      ensurePoseModelLoaded();
    }
  }, [inferenceMode, ensureCameraStarted, ensureGestureModelLoaded, ensurePoseModelLoaded]);

  // Throttled MediaPipe inference loop (~24-30 FPS, strictly one active model at a time)
  useEffect(() => {
    const gestureReady = inferenceMode === 'gesture' && modelStatus === 'ready';
    const poseReady = inferenceMode === 'pose' && poseModelStatus === 'ready';

    if ((!gestureReady && !poseReady) || cameraStatus !== 'active' || !cameraEnabled) {
      cancelAnimationFrame(rafIdRef.current);
      return;
    }

    fpsWindowStartRef.current = performance.now();
    fpsFrameCountRef.current = 0;

    const tick = (now) => {
      rafIdRef.current = requestAnimationFrame(tick);

      if (now - lastInferenceTimeRef.current < INFERENCE_INTERVAL_MS) {
        return;
      }

      const videoEl = persistentVideoRef.current;
      if (!videoEl || videoEl.readyState < 2 || videoEl.videoWidth === 0) {
        return;
      }

      if (videoEl.currentTime === lastVideoTimeRef.current) {
        return;
      }

      const timestampMs = Math.max(Math.floor(now), lastTimestampMsRef.current + 1);

      if (inferenceMode === 'gesture') {
        const recognizer = recognizerRef.current;
        if (!recognizer) return;

        lastVideoTimeRef.current = videoEl.currentTime;
        lastInferenceTimeRef.current = now;
        lastTimestampMsRef.current = timestampMs;

        const activeConfig = customKnnConfigRef.current;
        const parsed = recognizeGestureFrame(recognizer, videoEl, timestampMs, 0.55, {
          classifierSource: classifierSourceRef.current,
          customClassifier: customClassifierRef.current,
          customOverrides: {
            ...activeConfig,
            useManualDistanceOverride: activeConfig.distanceThresholdMode === 'manual',
          },
          temporalSmoother: temporalSmootherRef.current,
        });
        latestFrameRef.current = {
          ...parsed,
          timestamp: timestampMs,
        };

        fpsFrameCountRef.current += 1;
        const elapsedFpsMs = now - fpsWindowStartRef.current;
        let computedFps = null;
        if (elapsedFpsMs >= 500) {
          computedFps = Math.round((fpsFrameCountRef.current * 1000) / elapsedFpsMs);
          fpsWindowStartRef.current = now;
          fpsFrameCountRef.current = 0;
        }

        const gestureChanged =
          parsed.gestureName !== lastLoggedGestureRef.current ||
          parsed.handCount !== lastLoggedHandCountRef.current;
        const shouldRefreshHud =
          gestureChanged ||
          computedFps !== null ||
          now - lastHudUpdateRef.current >= HUD_UPDATE_INTERVAL_MS;

        if (shouldRefreshHud) {
          lastHudUpdateRef.current = now;
          lastLoggedGestureRef.current = parsed.gestureName;
          lastLoggedHandCountRef.current = parsed.handCount;
          const totalLandmarks = parsed.hands.reduce((acc, h) => acc + h.landmarks.length, 0);

          setHudState((prev) => ({
            ...prev,
            handDetected: parsed.handDetected,
            handCount: parsed.handCount,
            rawGestureName: parsed.rawGestureName,
            gestureName: parsed.gestureName,
            confidence: parsed.confidence,
            knnDiagnostics: parsed.knnDiagnostics ?? null,
            landmarkCount: totalLandmarks,
            poseDetected: false,
            poseVisibleCount: 0,
            inferenceFps: computedFps ?? prev.inferenceFps,
          }));
        }
      } else if (inferenceMode === 'pose') {
        const landmarker = poseLandmarkerRef.current;
        if (!landmarker) return;

        lastVideoTimeRef.current = videoEl.currentTime;
        lastInferenceTimeRef.current = now;
        lastTimestampMsRef.current = timestampMs;

        const parsedPose = detectPoseFrame(landmarker, videoEl, timestampMs);
        latestPoseFrameRef.current = {
          ...parsedPose,
          timestamp: timestampMs,
        };

        fpsFrameCountRef.current += 1;
        const elapsedFpsMs = now - fpsWindowStartRef.current;
        let computedFps = null;
        if (elapsedFpsMs >= 500) {
          computedFps = Math.round((fpsFrameCountRef.current * 1000) / elapsedFpsMs);
          fpsWindowStartRef.current = now;
          fpsFrameCountRef.current = 0;
        }

        const poseChanged = parsedPose.visibleCount !== lastLoggedPoseVisibleRef.current;
        const shouldRefreshHud =
          poseChanged ||
          computedFps !== null ||
          now - lastHudUpdateRef.current >= HUD_UPDATE_INTERVAL_MS;

        if (shouldRefreshHud) {
          lastHudUpdateRef.current = now;
          lastLoggedPoseVisibleRef.current = parsedPose.visibleCount;
          setHudState((prev) => ({
            ...prev,
            handDetected: false,
            handCount: 0,
            rawGestureName: null,
            gestureName: parsedPose.poseDetected ? 'Pose tracked' : 'Step into frame',
            confidence: null,
            knnDiagnostics: null,
            landmarkCount: parsedPose.landmarks.length,
            poseDetected: parsedPose.poseDetected,
            poseVisibleCount: parsedPose.visibleCount,
            inferenceFps: computedFps ?? prev.inferenceFps,
          }));
        }
      }
    };

    rafIdRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafIdRef.current);
    };
  }, [inferenceMode, cameraStatus, cameraEnabled, modelStatus, poseModelStatus]);

  // Clean up media tracks & MediaPipe resources when app unmounts
  useEffect(() => {
    const videoEl = persistentVideoRef.current;
    return () => {
      cancelAnimationFrame(rafIdRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (videoEl) {
        videoEl.srcObject = null;
      }
      recognizerRef.current = null;
      poseLandmarkerRef.current = null;
      disposeGestureRecognizer();
      disposePoseLandmarker();
    };
  }, []);

  const value = useMemo(
    () => ({
      inferenceMode,
      setInferenceMode,
      classifierSource,
      setClassifierSource,
      customModelMeta,
      customKnnConfig,
      updateCustomKnnConfig,
      resetCustomKnnConfig,
      importCustomKnnModel,
      clearCustomKnnModel,
      actionBindings,
      setActionBinding,
      datasetClasses,
      datasetSamples,
      activeDatasetClass,
      datasetDirtySinceModelImport:
        Boolean(customModelMeta) &&
        modelSyncedDatasetVersion !== null &&
        datasetVersion !== modelSyncedDatasetVersion &&
        datasetSamples.length > 0,
      setActiveDatasetClass,
      createDatasetClass,
      renameDatasetClass,
      deleteDatasetClass,
      addDatasetSamples,
      deleteDatasetSample,
      importTrainingDataset,
      recoverDatasetFromLoadedModel,
      clearTrainingDataset,
      cameraStatus,
      cameraEnabled,
      cameraError,
      cameraTrackInfo,
      streamRef,
      streamVersion,
      streamInitCount,
      modelStatus,
      modelDelegate,
      modelError,
      modelInitCount,
      poseModelStatus,
      poseModelDelegate,
      poseModelError,
      poseModelInitCount,
      latestFrameRef,
      latestPoseFrameRef,
      hudState,
      toggleCamera,
      pauseCamera,
      resumeCamera,
      retryCamera,
    }),
    [
      inferenceMode,
      classifierSource,
      setClassifierSource,
      customModelMeta,
      customKnnConfig,
      updateCustomKnnConfig,
      resetCustomKnnConfig,
      importCustomKnnModel,
      clearCustomKnnModel,
      actionBindings,
      setActionBinding,
      datasetClasses,
      datasetSamples,
      activeDatasetClass,
      datasetVersion,
      modelSyncedDatasetVersion,
      createDatasetClass,
      renameDatasetClass,
      deleteDatasetClass,
      addDatasetSamples,
      deleteDatasetSample,
      importTrainingDataset,
      recoverDatasetFromLoadedModel,
      clearTrainingDataset,
      cameraStatus,
      cameraEnabled,
      cameraError,
      cameraTrackInfo,
      streamVersion,
      streamInitCount,
      modelStatus,
      modelDelegate,
      modelError,
      modelInitCount,
      poseModelStatus,
      poseModelDelegate,
      poseModelError,
      poseModelInitCount,
      hudState,
      toggleCamera,
      pauseCamera,
      resumeCamera,
      retryCamera,
    ]
  );

  return (
    <VisionContext.Provider value={value}>
      {/* Single persistent video element used across all activities */}
      <video
        ref={persistentVideoRef}
        playsInline
        muted
        autoPlay
        aria-hidden="true"
        className="pointer-events-none fixed -left-[9999px] top-0 h-px w-px opacity-0"
      />
      {children}
    </VisionContext.Provider>
  );
}

export function useVision() {
  const ctx = useContext(VisionContext);
  if (!ctx) {
    throw new Error('useVision must be used inside a VisionProvider');
  }
  return ctx;
}
