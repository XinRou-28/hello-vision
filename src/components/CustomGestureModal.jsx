import {
  ArrowRight,
  Camera,
  CameraOff,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cpu,
  Database,
  Download,
  ExternalLink,
  FolderUp,
  Hand,
  Layers,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Sliders,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVision } from '../context/VisionContext.jsx';
import {
  MAGIC_CANVAS_ACTION_OPTIONS,
  PARTICLE_UNIVERSE_ACTION_OPTIONS,
} from '../exercises/customGestureBindings.js';
import {
  analyzeDatasetBalance,
  buildTrainingDatasetPayload,
  computeFeatureVectorDistance,
  extractHandFeatureVector,
  hasValidHandLandmarks,
  normalizeHandedness,
  SAMPLE_TARGET_PER_CLASS,
  serializeRawHandLandmarks,
} from '../vision/landmarkFeatures.js';
import {
  drawHandLandmarksOverlay,
  syncHandOverlayCanvasSize,
} from '../vision/handOverlayRenderer.js';

/**
 * Google Colab Notebook Configuration.
 *
 * `README.md` references `https://github.com/XinRou-28/absolutecinema.git` and the notebook
 * resides at `notebooks/Custom_Gesture_KNN_Training.ipynb`, but the repository currently
 * returns 404 publicly and no `.git` branch metadata exists in this workspace.
 *
 * To activate the direct GitHub-backed Colab link:
 *   1. Ensure the GitHub repository is public and includes `notebooks/Custom_Gesture_KNN_Training.ipynb`.
 *   2. Fill in `branch` below (for example `'main'`), OR set `DIRECT_COLAB_NOTEBOOK_URL` directly.
 */
export const COLAB_GITHUB_CONFIG = {
  owner: 'XinRou-28',
  repo: 'absolutecinema',
  branch: '',
  notebookPath: 'notebooks/Custom_Gesture_KNN_Training.ipynb',
};

export const DIRECT_COLAB_NOTEBOOK_URL = '';

export const COLAB_NOTEBOOK_URL =
  DIRECT_COLAB_NOTEBOOK_URL ||
  (COLAB_GITHUB_CONFIG.owner &&
  COLAB_GITHUB_CONFIG.repo &&
  COLAB_GITHUB_CONFIG.branch &&
  COLAB_GITHUB_CONFIG.notebookPath
    ? `https://colab.research.google.com/github/${COLAB_GITHUB_CONFIG.owner}/${COLAB_GITHUB_CONFIG.repo}/blob/${COLAB_GITHUB_CONFIG.branch}/${COLAB_GITHUB_CONFIG.notebookPath}`
    : '');

const TAB_CONFIG = [
  {
    id: 'dataset',
    label: '1. My Gestures',
    description: 'Create gesture classes and collect labelled hand examples using your webcam.',
    icon: Database,
  },
  {
    id: 'model',
    label: '2. Train Model',
    description: 'Download your dataset, train a model in Google Colab, and bring it back here.',
    icon: Sparkles,
  },
  {
    id: 'bindings',
    label: '3. Test & Map Actions',
    description: 'Test your trained gestures live and connect them to Magic Canvas and Particle Universe.',
    icon: Layers,
  },
];

export default function CustomGestureModal({ isOpen, onClose, initialTab = 'dataset' }) {
  const {
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
    datasetDirtySinceModelImport,
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
    streamRef,
    streamVersion,
    modelStatus,
    modelError,
    latestFrameRef,
    hudState,
    toggleCamera,
    retryCamera,
  } = useVision();

  const [activeTab, setActiveTab] = useState(initialTab);

  // Model import & Colab guidance state
  const [importError, setImportError] = useState(null);
  const [importSuccess, setImportSuccess] = useState(null);
  const [recoveryFeedback, setRecoveryFeedback] = useState(null);
  const [showColabConfigHelp, setShowColabConfigHelp] = useState(false);
  const [showAdvancedTuning, setShowAdvancedTuning] = useState(false);

  // Dataset management & sample collection UI state
  const [newClassInput, setNewClassInput] = useState('');
  const [datasetImportMode, setDatasetImportMode] = useState('merge'); // 'merge' | 'replace'
  const [datasetNotice, setDatasetNotice] = useState(null);
  const [renamingClass, setRenamingClass] = useState(null);
  const [renameInput, setRenameInput] = useState('');
  const [confirmDeleteClass, setConfirmDeleteClass] = useState(null);
  const [confirmClearDataset, setConfirmClearDataset] = useState(false);
  const [expandedClassSamples, setExpandedClassSamples] = useState(null);

  const [handFilter, setHandFilter] = useState('Any'); // 'Any' | 'Left' | 'Right'
  const [collectorMessage, setCollectorMessage] = useState(null);
  const [burstRemaining, setBurstRemaining] = useState(0);

  const modelFileInputRef = useRef(null);
  const datasetFileInputRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const burstTimerRef = useRef(null);
  const lastBurstFeaturesRef = useRef(null);
  const restoredIdleOnOpenRef = useRef(false);

  // Sync tab when opened
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // If opened from LandingScreen (idle), temporarily enable shared gesture pipeline
  useEffect(() => {
    if (!isOpen) return undefined;

    if (inferenceMode === 'idle') {
      restoredIdleOnOpenRef.current = true;
      setInferenceMode('gesture');
    } else {
      restoredIdleOnOpenRef.current = false;
    }

    return () => {
      if (burstTimerRef.current) {
        window.clearInterval(burstTimerRef.current);
        burstTimerRef.current = null;
      }
      setBurstRemaining(0);
      if (restoredIdleOnOpenRef.current) {
        restoredIdleOnOpenRef.current = false;
        setInferenceMode('idle');
      }
    };
    // Intentionally run when modal opens/closes only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  // Bind shared MediaStream to Collector preview video
  useEffect(() => {
    if (!isOpen || activeTab !== 'dataset') return undefined;
    const videoEl = videoRef.current;
    const stream = streamRef.current;
    if (!videoEl || !stream) return undefined;

    if (videoEl.srcObject !== stream) {
      videoEl.srcObject = stream;
    }
    videoEl.play().catch(() => {});
    return undefined;
  }, [isOpen, activeTab, streamRef, streamVersion, cameraStatus, cameraEnabled]);

  // Draw live 21-point hand skeleton onto Collector preview canvas
  useEffect(() => {
    if (!isOpen || activeTab !== 'dataset') return undefined;

    let rafId = 0;
    const draw = () => {
      rafId = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas) return;

      const { width, height, displayWidth } = syncHandOverlayCanvasSize(canvas, video);

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);

      if (cameraStatus !== 'active' || !cameraEnabled) return;
      const frame = latestFrameRef.current;
      const hands = frame?.hands ?? [];
      if (hands.length === 0) return;

      drawHandLandmarksOverlay(ctx, hands, width, height, {
        displayWidth,
        videoWidth: video?.videoWidth || 0,
        videoHeight: video?.videoHeight || 0,
      });
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [isOpen, activeTab, cameraStatus, cameraEnabled, latestFrameRef]);

  // Group dataset samples per class
  const samplesByClass = useMemo(() => {
    const grouped = new Map();
    for (const cls of datasetClasses) {
      grouped.set(cls, []);
    }
    for (const sample of datasetSamples) {
      const list = grouped.get(sample.label);
      if (list) {
        list.push(sample);
      } else {
        grouped.set(sample.label, [sample]);
      }
    }
    return grouped;
  }, [datasetClasses, datasetSamples]);

  const readyClassCount = useMemo(() => {
    let count = 0;
    for (const cls of datasetClasses) {
      if ((samplesByClass.get(cls)?.length ?? 0) >= SAMPLE_TARGET_PER_CLASS) {
        count += 1;
      }
    }
    return count;
  }, [datasetClasses, samplesByClass]);

  const datasetBalance = useMemo(
    () => analyzeDatasetBalance(datasetClasses, datasetSamples),
    [datasetClasses, datasetSamples]
  );

  const handleCreateClass = (e) => {
    e.preventDefault();
    const res = createDatasetClass(newClassInput);
    if (!res.ok) {
      setDatasetNotice({ type: 'error', text: res.error });
      return;
    }
    setNewClassInput('');
    setDatasetNotice({
      type: 'success',
      text: `Created gesture "${res.name}" and selected it for sample collection.`,
    });
  };

  const handleConfirmRename = (oldName) => {
    const res = renameDatasetClass(oldName, renameInput);
    if (!res.ok) {
      setDatasetNotice({ type: 'error', text: res.error });
      return;
    }
    setRenamingClass(null);
    setRenameInput('');
    if (expandedClassSamples === oldName) {
      setExpandedClassSamples(res.name);
    }
    setDatasetNotice({
      type: 'success',
      text: `Renamed gesture "${oldName}" to "${res.name}".`,
    });
  };

  const handleConfirmDeleteClass = (cls) => {
    deleteDatasetClass(cls);
    setConfirmDeleteClass(null);
    if (expandedClassSamples === cls) {
      setExpandedClassSamples(null);
    }
    setDatasetNotice({
      type: 'info',
      text: `Deleted gesture "${cls}" and its samples from the dataset.`,
    });
  };

  const handleDatasetFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDatasetNotice(null);

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const res = importTrainingDataset(
          parsed,
          datasetSamples.length > 0 ? datasetImportMode : 'replace'
        );
        const dupMsg =
          res.skippedDuplicates > 0
            ? ` (${res.skippedDuplicates} duplicate sample${res.skippedDuplicates === 1 ? '' : 's'} skipped)`
            : '';
        const warningMsg =
          res.migrationReport?.warnings?.length > 0
            ? ` Warning: ${res.migrationReport.warnings.join(' ')}`
            : '';
        setDatasetNotice({
          type: res.migrationReport?.warnings?.length > 0 ? 'info' : 'success',
          text: `Imported ${res.addedCount} new samples across ${res.classes.length} gesture classes${dupMsg}. Total dataset: ${res.totalSamples} samples.${warningMsg}`,
        });
      } catch (err) {
        setDatasetNotice({
          type: 'error',
          text: err?.message || 'Failed to parse or validate samples.json.',
        });
      }
    };
    reader.onerror = () => {
      setDatasetNotice({ type: 'error', text: 'Unable to read the selected dataset file.' });
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleModelFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    setImportSuccess(null);
    setRecoveryFeedback(null);

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const meta = importCustomKnnModel(parsed, file.name);
        const warningMsg =
          meta.migrationReport?.warnings?.length > 0
            ? ` Warning: ${meta.migrationReport.warnings.join(' ')}`
            : '';
        setImportSuccess(
          `Imported "${meta.fileName}" (${meta.classes.length} gestures, ${meta.sampleCount} samples). Custom KNN is now active and your original dataset was kept intact.${warningMsg}`
        );
      } catch (err) {
        setImportError(err?.message || 'Failed to parse or validate KNN model JSON.');
      }
    };
    reader.onerror = () => {
      setImportError('Unable to read the selected model file.');
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleRecoverFromModel = (mode) => {
    setRecoveryFeedback(null);
    try {
      const res = recoverDatasetFromLoadedModel(mode);
      const dupText =
        res.skippedDuplicates > 0 ? ` (${res.skippedDuplicates} duplicates skipped)` : '';
      setRecoveryFeedback(
        `Recovered ${res.addedCount} examples into My Gestures${dupText}. Total: ${res.totalSamples} samples across ${res.classes.length} classes.`
      );
    } catch (err) {
      setRecoveryFeedback(err?.message || 'Unable to recover dataset samples from model.');
    }
  };

  const captureSingleSample = useCallback((options = {}) => {
    const { deduplicateWithLastBurst = false } = options;
    const cleanLabel = String(activeDatasetClass || '').trim();
    if (!cleanLabel || cleanLabel === 'None') {
      setCollectorMessage('Create or select a gesture class before capturing samples.');
      return false;
    }

    if (cameraStatus !== 'active' || !cameraEnabled) {
      setCollectorMessage('Start or resume the webcam before capturing samples.');
      return false;
    }

    const frame = latestFrameRef.current;
    const hands = frame?.hands ?? [];
    if (!frame?.handDetected || hands.length === 0) {
      setCollectorMessage('No hand detected. Keep all fingers clearly inside the webcam frame.');
      return false;
    }

    const matchingHand =
      handFilter === 'Any'
        ? hands[0]
        : hands.find((h) => (h.handedness || '').toLowerCase() === handFilter.toLowerCase());

    if (!matchingHand) {
      setCollectorMessage(
        `No ${handFilter} hand detected right now (seeing: ${hands
          .map((h) => h.handedness || 'Unknown')
          .join(', ')}).`
      );
      return false;
    }

    if (!hasValidHandLandmarks(matchingHand.landmarks)) {
      setCollectorMessage('Incomplete hand detection (need all 21 landmarks). Hold hand steady.');
      return false;
    }

    const normalizedHandedness = normalizeHandedness(matchingHand.handedness);
    const rawLandmarks = serializeRawHandLandmarks(matchingHand.landmarks);
    const features = extractHandFeatureVector(matchingHand.landmarks, {
      handedness: normalizedHandedness,
    });
    if (!rawLandmarks || !features) {
      setCollectorMessage('Hand landmarks were too small or invalid; move slightly closer.');
      return false;
    }

    if (deduplicateWithLastBurst && lastBurstFeaturesRef.current) {
      const frameDelta = computeFeatureVectorDistance(features, lastBurstFeaturesRef.current);
      if (frameDelta < 0.015) {
        setCollectorMessage(
          `Skipped near-identical frame during burst — slightly tilt or move your hand for "${cleanLabel}".`
        );
        return false;
      }
    }

    if (deduplicateWithLastBurst) {
      lastBurstFeaturesRef.current = features;
    }

    const newSample = {
      id: `sample_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      label: cleanLabel,
      handedness: normalizedHandedness,
      handednessCanonicalized: normalizedHandedness !== null,
      capturedAt: new Date().toISOString(),
      rawLandmarks,
      features,
    };

    addDatasetSamples(newSample);
    setCollectorMessage(
      `Captured "${cleanLabel}" (${normalizedHandedness || 'Unknown hand'}) · 63 ${
        normalizedHandedness ? 'canonical' : 'normalized'
      } features saved.`
    );
    return true;
  }, [activeDatasetClass, addDatasetSamples, cameraEnabled, cameraStatus, handFilter, latestFrameRef]);

  const handleStartBurst = () => {
    if (burstTimerRef.current) {
      window.clearInterval(burstTimerRef.current);
      burstTimerRef.current = null;
      lastBurstFeaturesRef.current = null;
      setBurstRemaining(0);
      return;
    }

    if (!activeDatasetClass) {
      setCollectorMessage('Create or select a gesture class before starting Burst ×10.');
      return;
    }
    if (!hudState.handDetected) {
      setCollectorMessage('No hand detected. Show your hand in frame before capturing.');
      return;
    }

    lastBurstFeaturesRef.current = null;
    let ticksLeft = 10;
    setBurstRemaining(ticksLeft);
    if (captureSingleSample({ deduplicateWithLastBurst: true })) {
      ticksLeft -= 1;
      setBurstRemaining(ticksLeft);
    }

    burstTimerRef.current = window.setInterval(() => {
      if (ticksLeft <= 0) {
        window.clearInterval(burstTimerRef.current);
        burstTimerRef.current = null;
        lastBurstFeaturesRef.current = null;
        setBurstRemaining(0);
        return;
      }
      captureSingleSample({ deduplicateWithLastBurst: true });
      ticksLeft -= 1;
      setBurstRemaining(ticksLeft);
      if (ticksLeft <= 0) {
        window.clearInterval(burstTimerRef.current);
        burstTimerRef.current = null;
        lastBurstFeaturesRef.current = null;
      }
    }, 180);
  };

  const handleDownloadSamples = () => {
    if (datasetSamples.length === 0) return;
    const payload = buildTrainingDatasetPayload(datasetSamples, datasetClasses);
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'samples.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setDatasetNotice({
      type: 'success',
      text: `Downloaded samples.json (${datasetSamples.length} samples across ${payload.classes.length} classes). Upload it in Google Colab to train.`,
    });
  };

  if (!isOpen) return null;

  const hasCustomModel = Boolean(customModelMeta);
  const hasDatasetSamples = datasetSamples.length > 0;
  const activeTabInfo = TAB_CONFIG.find((t) => t.id === activeTab) ?? TAB_CONFIG[0];
  const activeClassCount = activeDatasetClass
    ? (samplesByClass.get(activeDatasetClass)?.length ?? 0)
    : 0;
  const canCapture =
    Boolean(activeDatasetClass) &&
    cameraStatus === 'active' &&
    cameraEnabled &&
    hudState.handDetected &&
    hudState.landmarkCount >= 21;

  const workflowSteps = [
    {
      num: '1',
      label: 'Collect',
      tabId: 'dataset',
      done: hasDatasetSamples,
      current: !hasDatasetSamples,
    },
    {
      num: '2',
      label: 'Train',
      tabId: 'model',
      done: hasCustomModel,
      current: hasDatasetSamples && !hasCustomModel,
    },
    {
      num: '3',
      label: 'Test & Use',
      tabId: 'bindings',
      done: hasCustomModel && classifierSource === 'custom-knn',
      current: hasCustomModel && classifierSource !== 'custom-knn',
    },
  ];

  const contextualGuidance = !hasDatasetSamples && !hasCustomModel
    ? {
        tone: 'amber',
        text: 'Start in 1. My Gestures to create classes and capture examples with your webcam.',
        actionLabel: activeTab !== 'dataset' ? 'Go to My Gestures' : null,
        targetTab: 'dataset',
      }
    : hasDatasetSamples && !hasCustomModel
      ? {
          tone: 'sky',
          text: `You have ${datasetSamples.length} sample${datasetSamples.length === 1 ? '' : 's'} ready. Download your dataset and train your model in Google Colab.`,
          actionLabel: activeTab !== 'model' ? 'Go to Train Model' : null,
          targetTab: 'model',
        }
      : {
          tone: 'emerald',
          text:
            classifierSource === 'custom-knn'
              ? `Your custom model (${customModelMeta.classes.length} gestures) is active! Test it live and map actions.`
              : `Your custom model is imported. Switch the active classifier to Custom KNN or map actions.`,
          actionLabel: activeTab !== 'bindings' ? 'Go to Test & Map Actions' : null,
          targetTab: 'bindings',
        };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="gesture-lab-title"
      className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/78 p-4 backdrop-blur-sm sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[#d6b15e]/25 bg-[#0b0d14] text-stone-100 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#d6b15e]/35 bg-[#d6b15e]/15 text-[#e8cc84]">
              <Cpu className="h-4.5 w-4.5" aria-hidden="true" />
            </span>
            <div>
              <h2 id="gesture-lab-title" className="font-display text-lg font-semibold text-stone-50">
                Custom Gesture Lab
              </h2>
              <p className="text-xs text-stone-400">{activeTabInfo.description}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs md:flex">
              <span className="text-stone-400">Active Engine:</span>
              <span
                className={`font-semibold ${
                  classifierSource === 'custom-knn' ? 'text-emerald-300' : 'text-[#e8cc84]'
                }`}
              >
                {classifierSource === 'custom-knn' ? 'Custom KNN (Colab)' : 'Pretrained MediaPipe'}
              </span>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close Custom Gesture Lab"
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs + Beginner Progress Indicator */}
        <div className="border-b border-white/10 bg-white/[0.02] px-5 py-3 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <nav aria-label="Custom Gesture Lab steps" className="flex flex-wrap items-center gap-2">
              {TAB_CONFIG.map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    aria-current={active ? 'page' : undefined}
                    className={`inline-flex cursor-pointer items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
                      active
                        ? 'bg-[#d6b15e] text-[#09080a]'
                        : 'border border-white/10 bg-white/[0.03] text-stone-300 hover:border-white/20 hover:bg-white/[0.07] hover:text-white'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </nav>

            {/* Derived 3-Step Progress Indicator */}
            <div className="hidden items-center gap-2 text-xs lg:flex" aria-label="Workflow progress">
              {workflowSteps.map((step, idx) => (
                <div key={step.num} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab(step.tabId)}
                    className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 transition-colors ${
                      step.done
                        ? 'text-emerald-300'
                        : step.current
                          ? 'text-[#e8cc84]'
                          : 'text-stone-500 hover:text-stone-300'
                    }`}
                  >
                    {step.done ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                    ) : (
                      <span
                        className={`flex h-4 w-4 items-center justify-center rounded-full border font-mono text-[10px] font-bold ${
                          step.current
                            ? 'border-[#d6b15e] bg-[#d6b15e]/15 text-[#e8cc84]'
                            : 'border-white/20 text-stone-500'
                        }`}
                      >
                        {step.num}
                      </span>
                    )}
                    <span className="font-medium">{step.label}</span>
                  </button>
                  {idx < workflowSteps.length - 1 && (
                    <ArrowRight className="h-3 w-3 text-stone-600" aria-hidden="true" />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Contextual Guidance Strip */}
          <div
            className={`mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg px-3.5 py-2 text-xs ${
              contextualGuidance.tone === 'emerald'
                ? 'border border-emerald-400/25 bg-emerald-500/10 text-emerald-100'
                : contextualGuidance.tone === 'sky'
                  ? 'border border-sky-400/25 bg-sky-500/10 text-sky-100'
                  : 'border border-[#d6b15e]/25 bg-[#d6b15e]/10 text-amber-100'
            }`}
          >
            <span>{contextualGuidance.text}</span>
            {contextualGuidance.actionLabel && (
              <button
                type="button"
                onClick={() => setActiveTab(contextualGuidance.targetTab)}
                className="inline-flex cursor-pointer items-center gap-1 font-semibold underline decoration-current/50 underline-offset-4 hover:opacity-80"
              >
                <span>{contextualGuidance.actionLabel}</span>
                <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6">
          {/* TAB 1: 1. MY GESTURES */}
          {activeTab === 'dataset' && (
            <div className="space-y-5">
              {/* Dataset Summary & File Actions */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.025] p-4">
                <div className="flex flex-wrap items-center gap-5 text-xs">
                  <div>
                    <span className="text-stone-400">Classes: </span>
                    <span className="font-mono font-semibold text-stone-100">
                      {datasetClasses.length}
                    </span>
                  </div>
                  <div>
                    <span className="text-stone-400">Total Samples: </span>
                    <span className="font-mono font-semibold text-[#e8cc84]">
                      {datasetSamples.length}
                    </span>
                  </div>
                  <div>
                    <span className="text-stone-400">Ready ({SAMPLE_TARGET_PER_CLASS}+): </span>
                    <span className="font-mono font-semibold text-emerald-300">
                      {readyClassCount} / {datasetClasses.length}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={datasetFileInputRef}
                    type="file"
                    accept=".json,application/json"
                    onChange={handleDatasetFileUpload}
                    className="hidden"
                  />

                  {datasetSamples.length > 0 && (
                    <select
                      aria-label="Dataset import mode"
                      value={datasetImportMode}
                      onChange={(e) => setDatasetImportMode(e.target.value)}
                      className="rounded-lg border border-white/15 bg-[#121622] px-2.5 py-1.5 text-xs text-stone-200 focus:border-[#d6b15e] focus:outline-none"
                    >
                      <option value="merge">Import Mode: Merge</option>
                      <option value="replace">Import Mode: Replace</option>
                    </select>
                  )}

                  <button
                    type="button"
                    onClick={() => datasetFileInputRef.current?.click()}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.05] px-3 py-1.5 text-xs font-semibold text-stone-100 transition-colors hover:bg-white/10"
                  >
                    <FolderUp className="h-3.5 w-3.5 text-sky-300" aria-hidden="true" />
                    <span>Import samples.json</span>
                  </button>

                  <button
                    type="button"
                    disabled={datasetSamples.length === 0}
                    onClick={handleDownloadSamples}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-emerald-400 px-3.5 py-1.5 text-xs font-semibold text-stone-950 transition-colors hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Download Dataset (.json)</span>
                  </button>

                  {datasetSamples.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('model')}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#d6b15e] px-3.5 py-1.5 text-xs font-semibold text-[#09080a] transition-colors hover:bg-[#e8cc84]"
                    >
                      <span>Next: Train Model</span>
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  )}

                  {datasetClasses.length > 0 && !confirmClearDataset && (
                    <button
                      type="button"
                      onClick={() => setConfirmClearDataset(true)}
                      className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-stone-400 hover:border-rose-400/40 hover:text-rose-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Reset</span>
                    </button>
                  )}

                  {confirmClearDataset && (
                    <div className="flex items-center gap-1.5 rounded-lg border border-rose-400/40 bg-rose-500/15 px-2.5 py-1 text-xs">
                      <span className="text-rose-200">Clear all?</span>
                      <button
                        type="button"
                        onClick={() => {
                          clearTrainingDataset();
                          setConfirmClearDataset(false);
                          setDatasetNotice({ type: 'info', text: 'Cleared training dataset.' });
                        }}
                        className="cursor-pointer font-semibold text-rose-300 hover:underline"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmClearDataset(false)}
                        className="cursor-pointer text-stone-300 hover:underline"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {datasetNotice && (
                <div
                  className={`rounded-xl border px-3.5 py-2.5 text-xs ${
                    datasetNotice.type === 'error'
                      ? 'border-rose-400/40 bg-rose-500/15 text-rose-200'
                      : datasetNotice.type === 'success'
                        ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
                        : 'border-sky-400/40 bg-sky-500/15 text-sky-200'
                  }`}
                >
                  {datasetNotice.text}
                </div>
              )}

              {datasetBalance.isImbalanced && (
                <div className="rounded-xl border border-amber-400/35 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-100">
                  <strong className="text-[#e8cc84]">Balance check:</strong> Sample counts vary
                  from {datasetBalance.minCount} to {datasetBalance.maxCount} per gesture
                  {datasetBalance.underrepresentedClasses.length > 0
                    ? ` (collect more for: ${datasetBalance.underrepresentedClasses.join(', ')})`
                    : ''}
                  . Balanced classes prevent crowded gestures from dominating nearest neighbours.
                </div>
              )}

              <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.05fr_1.15fr]">
                {/* Left: Gesture Class Manager */}
                <div className="flex flex-col space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-300">
                      Gesture Classes
                    </h3>
                    <span className="text-[11px] text-stone-400">
                      Goal: {SAMPLE_TARGET_PER_CLASS} samples/gesture
                    </span>
                  </div>

                  {/* Create New Gesture Class */}
                  <form onSubmit={handleCreateClass} className="flex gap-2">
                    <input
                      type="text"
                      value={newClassInput}
                      onChange={(e) => setNewClassInput(e.target.value)}
                      placeholder="New gesture name (e.g. Open Palm, Victory, Fist)"
                      aria-label="New gesture class name"
                      className="flex-1 rounded-lg border border-white/15 bg-[#121622] px-3 py-2 text-xs text-stone-100 placeholder:text-stone-500 focus:border-[#d6b15e] focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-[#d6b15e] px-3 py-2 text-xs font-semibold text-[#09080a] transition-colors hover:bg-[#e8cc84] shrink-0"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Create Gesture</span>
                    </button>
                  </form>

                  {/* Class Cards */}
                  {datasetClasses.length === 0 ? (
                    <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-white/15 bg-black/25 p-6 text-center">
                      <Hand className="h-6 w-6 text-[#e8cc84]" aria-hidden="true" />
                      <p className="mt-2 text-xs font-medium text-stone-200">
                        No custom gestures yet
                      </p>
                      <p className="mt-1 max-w-xs text-[11px] leading-relaxed text-stone-400">
                        Type any gesture name above (such as Open Palm, Victory, or Rock) to begin,
                        or click <strong className="text-stone-200">Import samples.json</strong> to
                        continue an existing dataset.
                      </p>
                    </div>
                  ) : (
                    <div className="max-h-[410px] space-y-2.5 overflow-y-auto pr-1">
                      {datasetClasses.map((cls) => {
                        const clsSamples = samplesByClass.get(cls) ?? [];
                        const count = clsSamples.length;
                        const pct = Math.min(100, Math.round((count / SAMPLE_TARGET_PER_CLASS) * 100));
                        const isReady = count >= SAMPLE_TARGET_PER_CLASS;
                        const isSelected = activeDatasetClass === cls;
                        const isRenaming = renamingClass === cls;
                        const isConfirmingDelete = confirmDeleteClass === cls;
                        const isExpanded = expandedClassSamples === cls;

                        return (
                          <div
                            key={cls}
                            className={`rounded-xl border p-3 transition-colors ${
                              isSelected
                                ? 'border-[#d6b15e]/60 bg-[#d6b15e]/10'
                                : 'border-white/10 bg-black/30 hover:border-white/20'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              {isRenaming ? (
                                <div className="flex flex-1 items-center gap-1.5">
                                  <input
                                    type="text"
                                    value={renameInput}
                                    onChange={(e) => setRenameInput(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleConfirmRename(cls);
                                      if (e.key === 'Escape') setRenamingClass(null);
                                    }}
                                    aria-label={`Rename ${cls}`}
                                    autoFocus
                                    className="w-full rounded border border-[#d6b15e]/60 bg-[#121622] px-2 py-1 text-xs text-stone-100 focus:outline-none"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleConfirmRename(cls)}
                                    className="cursor-pointer rounded bg-emerald-400 px-2 py-1 text-[11px] font-semibold text-stone-950"
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setRenamingClass(null)}
                                    className="cursor-pointer rounded bg-white/10 px-2 py-1 text-[11px] text-stone-300"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setActiveDatasetClass(cls)}
                                  className="flex flex-1 cursor-pointer items-center gap-2 text-left"
                                >
                                  <span className="font-semibold text-sm text-stone-100">{cls}</span>
                                  {isSelected && (
                                    <span className="rounded bg-[#d6b15e]/25 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#e8cc84]">
                                      COLLECTING
                                    </span>
                                  )}
                                  {isReady && (
                                    <span className="inline-flex items-center gap-1 rounded bg-emerald-400/20 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-300">
                                      <Check className="h-2.5 w-2.5" aria-hidden="true" />
                                      Ready
                                    </span>
                                  )}
                                </button>
                              )}

                              {!isRenaming && (
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => setActiveDatasetClass(cls)}
                                    className={`cursor-pointer rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                                      isSelected
                                        ? 'bg-[#d6b15e] text-[#09080a]'
                                        : 'bg-white/10 text-stone-200 hover:bg-white/20'
                                    }`}
                                  >
                                    {isSelected ? 'Selected' : 'Collect'}
                                  </button>
                                  <button
                                    type="button"
                                    title={`Rename ${cls}`}
                                    aria-label={`Rename ${cls}`}
                                    onClick={() => {
                                      setRenamingClass(cls);
                                      setRenameInput(cls);
                                      setConfirmDeleteClass(null);
                                    }}
                                    className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-stone-400 hover:bg-white/10 hover:text-white"
                                  >
                                    <Pencil className="h-3 w-3" aria-hidden="true" />
                                  </button>
                                  <button
                                    type="button"
                                    title={`Delete ${cls}`}
                                    aria-label={`Delete ${cls}`}
                                    onClick={() => {
                                      setConfirmDeleteClass(isConfirmingDelete ? null : cls);
                                      setRenamingClass(null);
                                    }}
                                    className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-stone-400 hover:bg-rose-500/20 hover:text-rose-300"
                                  >
                                    <Trash2 className="h-3 w-3" aria-hidden="true" />
                                  </button>
                                </div>
                              )}
                            </div>

                            {/* Progress Bar */}
                            <div className="mt-2.5">
                              <div className="mb-1 flex items-center justify-between text-[11px]">
                                <span className="font-mono text-stone-300 tabular-nums">
                                  {count} / {SAMPLE_TARGET_PER_CLASS} samples
                                </span>
                                <span
                                  className={`font-mono tabular-nums ${
                                    isReady
                                      ? 'text-emerald-300'
                                      : count > 0
                                        ? 'text-[#e8cc84]'
                                        : 'text-stone-500'
                                  }`}
                                >
                                  {isReady ? 'Target reached' : `${pct}%`}
                                </span>
                              </div>
                              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                                <div
                                  className={`h-full transition-all duration-200 ${
                                    isReady ? 'bg-emerald-400' : 'bg-[#d6b15e]'
                                  }`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>

                            {/* Delete Confirmation Prompt */}
                            {isConfirmingDelete && (
                              <div className="mt-2.5 flex items-center justify-between gap-2 rounded-lg border border-rose-400/40 bg-rose-500/15 px-2.5 py-1.5 text-[11px]">
                                <span className="text-rose-200">
                                  Delete &ldquo;{cls}&rdquo; and all {count} sample{count === 1 ? '' : 's'}?
                                </span>
                                <div className="flex items-center gap-2 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => handleConfirmDeleteClass(cls)}
                                    className="cursor-pointer rounded bg-rose-500 px-2 py-0.5 font-semibold text-white hover:bg-rose-400"
                                  >
                                    Confirm
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteClass(null)}
                                    className="cursor-pointer text-stone-300 hover:underline"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Inspect & Delete Individual Samples */}
                            {count > 0 && (
                              <div className="mt-2">
                                <button
                                  type="button"
                                  onClick={() => setExpandedClassSamples(isExpanded ? null : cls)}
                                  className="inline-flex cursor-pointer items-center gap-1 text-[11px] text-stone-400 hover:text-stone-200"
                                >
                                  {isExpanded ? (
                                    <ChevronUp className="h-3 w-3" aria-hidden="true" />
                                  ) : (
                                    <ChevronDown className="h-3 w-3" aria-hidden="true" />
                                  )}
                                  <span>{isExpanded ? 'Hide samples' : `Inspect samples (${count})`}</span>
                                </button>

                                {isExpanded && (
                                  <ul className="mt-2 max-h-28 space-y-1 overflow-y-auto rounded-lg border border-white/10 bg-black/40 p-2">
                                    {clsSamples.map((s, idx) => (
                                      <li
                                        key={s.id}
                                        className="flex items-center justify-between gap-2 text-[11px] text-stone-300"
                                      >
                                        <span className="truncate font-mono">
                                          #{idx + 1} · {s.handedness || 'Hand'} · 63 features
                                        </span>
                                        <button
                                          type="button"
                                          aria-label={`Delete sample ${idx + 1} from ${cls}`}
                                          onClick={() => deleteDatasetSample(s.id)}
                                          className="cursor-pointer text-stone-500 hover:text-rose-300"
                                        >
                                          <Trash2 className="h-3 w-3" aria-hidden="true" />
                                        </button>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Right: Live Shared Webcam & Capture Controls */}
                <div className="flex flex-col space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-300">
                      Live Sample Collector
                    </h3>
                    {activeDatasetClass ? (
                      <span className="font-mono text-xs text-[#e8cc84]">
                        Active: <strong>{activeDatasetClass}</strong> ({activeClassCount}/
                        {SAMPLE_TARGET_PER_CLASS})
                      </span>
                    ) : (
                      <span className="text-xs text-stone-500">Select or create a gesture</span>
                    )}
                  </div>

                  <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-white/15 bg-black">
                    <video
                      ref={videoRef}
                      playsInline
                      muted
                      autoPlay
                      className={`h-full w-full -scale-x-100 object-contain ${
                        cameraStatus === 'active' && cameraEnabled ? 'opacity-100' : 'opacity-0'
                      }`}
                    />
                    <canvas
                      ref={canvasRef}
                      className="pointer-events-none absolute inset-0 h-full w-full -scale-x-100"
                    />

                    {(cameraStatus === 'denied' ||
                      cameraStatus === 'unavailable' ||
                      cameraStatus === 'error') && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
                        <CameraOff className="h-6 w-6 text-rose-400" aria-hidden="true" />
                        <p className="text-xs font-medium text-stone-200">
                          {cameraError || 'Camera unavailable'}
                        </p>
                        <button
                          type="button"
                          onClick={retryCamera}
                          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/25"
                        >
                          <RefreshCw className="h-3 w-3" aria-hidden="true" />
                          <span>Retry Camera</span>
                        </button>
                      </div>
                    )}

                    {cameraStatus === 'paused' && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 p-4 text-center">
                        <Camera className="h-5 w-5 text-stone-400" aria-hidden="true" />
                        <p className="text-xs text-stone-300">Camera paused</p>
                        <button
                          type="button"
                          onClick={toggleCamera}
                          className="cursor-pointer rounded-lg bg-white/15 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/25"
                        >
                          Resume Camera
                        </button>
                      </div>
                    )}

                    {cameraStatus === 'loading' && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70">
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#d6b15e] border-t-transparent" />
                        <p className="text-xs text-stone-300">Starting shared webcam…</p>
                      </div>
                    )}

                    <div className="pointer-events-none absolute right-2.5 bottom-2.5 left-2.5 flex items-center justify-between rounded-lg bg-black/70 px-2.5 py-1 text-[11px] text-stone-200">
                      <span>
                        {modelStatus === 'loading'
                          ? 'Loading hand landmark model…'
                          : modelStatus === 'error'
                            ? modelError || 'Hand landmark model failed to load'
                            : hudState.handDetected
                              ? `21 landmarks ready (${hudState.landmarkCount} pts)`
                              : 'No hand detected — show hand in frame'}
                      </span>
                      <span className="font-mono text-[#e8cc84]">63 features</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <label
                      htmlFor="sample-hand-filter"
                      className="text-xs font-medium text-stone-300 shrink-0"
                    >
                      Hand Filter:
                    </label>
                    <select
                      id="sample-hand-filter"
                      value={handFilter}
                      onChange={(e) => setHandFilter(e.target.value)}
                      className="flex-1 rounded-lg border border-white/15 bg-[#121622] px-2.5 py-1.5 text-xs text-stone-100 focus:border-[#d6b15e] focus:outline-none"
                    >
                      <option value="Any">Any Visible Hand (Primary)</option>
                      <option value="Right">Right Hand Only</option>
                      <option value="Left">Left Hand Only</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={!canCapture}
                      onClick={captureSingleSample}
                      className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-[#d6b15e] px-3 py-2.5 text-xs font-semibold text-[#09080a] transition-colors hover:bg-[#e8cc84] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Capture Sample</span>
                    </button>

                    <button
                      type="button"
                      disabled={!canCapture && burstRemaining === 0}
                      onClick={handleStartBurst}
                      className={`inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                        burstRemaining > 0
                          ? 'border-rose-400/50 bg-rose-500/20 text-rose-200'
                          : 'border-white/15 bg-white/[0.05] text-stone-100 hover:bg-white/10'
                      }`}
                    >
                      <span>
                        {burstRemaining > 0 ? `Stop Burst (${burstRemaining})` : 'Burst ×10'}
                      </span>
                    </button>
                  </div>

                  {!canCapture && (
                    <p className="text-[11px] text-stone-400">
                      {!activeDatasetClass
                        ? 'Create or select a gesture class on the left to enable capture.'
                        : !hudState.handDetected
                          ? 'Show your full hand inside the webcam frame to enable capture.'
                          : 'Waiting for valid 21-landmark detection…'}
                    </p>
                  )}

                  {collectorMessage && (
                    <p className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-[11px] text-stone-300">
                      {collectorMessage}
                    </p>
                  )}

                  <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-[11px] leading-relaxed text-stone-300">
                    <strong className="text-[#e8cc84]">Collection Tips:</strong> Aim for{' '}
                    <strong>{SAMPLE_TARGET_PER_CLASS} samples per gesture</strong>. While holding
                    the same hand shape, slightly vary your <strong>distance</strong>,{' '}
                    <strong>wrist tilt</strong>, and <strong>position</strong>. Only landmark
                    coordinates are stored—never camera photos.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: 2. TRAIN MODEL */}
          {activeTab === 'model' && (
            <div className="space-y-6">
              {/* STEP 1 — COLLECT YOUR GESTURES */}
              <section
                aria-labelledby="step-1-heading"
                className="rounded-xl border border-white/10 bg-white/[0.025] p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="max-w-xl">
                    <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] uppercase text-[#d6b15e]">
                      <Database className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Step 1 — Collect Your Gestures</span>
                    </div>
                    <h3 id="step-1-heading" className="mt-1.5 font-display text-2xl font-semibold text-stone-50">
                      Your Gesture Dataset
                    </h3>
                    <p className="mt-1 text-sm text-stone-300">
                      Your dataset contains examples of the gestures you want your computer to learn.
                    </p>
                  </div>

                  <div className="flex flex-col items-start gap-2 sm:items-end">
                    <button
                      type="button"
                      disabled={!hasDatasetSamples}
                      onClick={handleDownloadSamples}
                      className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-stone-100 px-4 py-2.5 text-xs font-semibold text-stone-950 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Download className="h-4 w-4" aria-hidden="true" />
                      <span>Download Dataset (.json)</span>
                    </button>

                    {!hasDatasetSamples && (
                      <p className="text-[11px] text-amber-200/90">
                        Collect at least one sample in{' '}
                        <button
                          type="button"
                          onClick={() => setActiveTab('dataset')}
                          className="cursor-pointer font-semibold underline underline-offset-2 hover:text-white"
                        >
                          1. My Gestures
                        </button>{' '}
                        before downloading.
                      </p>
                    )}
                  </div>
                </div>

                {/* Dataset Metrics & Collected Class List */}
                <div className="mt-5 flex flex-wrap items-center gap-6 border-t border-white/10 pt-4">
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-stone-400">
                      Gesture Classes
                    </div>
                    <div className="mt-0.5 font-mono text-xl font-semibold text-stone-100 tabular-nums">
                      {datasetClasses.length}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-stone-400">
                      Collected Samples
                    </div>
                    <div className="mt-0.5 font-mono text-xl font-semibold text-[#e8cc84] tabular-nums">
                      {datasetSamples.length}
                    </div>
                  </div>

                  <div className="flex-1 min-w-[220px]">
                    <div className="text-[11px] uppercase tracking-wider text-stone-400">
                      Collected Gestures
                    </div>
                    {datasetClasses.length > 0 ? (
                      <div className="mt-1.5 flex flex-wrap gap-2">
                        {datasetClasses.map((cls) => {
                          const count = samplesByClass.get(cls)?.length ?? 0;
                          return (
                            <span
                              key={cls}
                              className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-black/35 px-2.5 py-1 text-xs text-stone-200"
                            >
                              <span className="font-medium">{cls}</span>
                              <span className="font-mono text-[11px] text-[#e8cc84] tabular-nums">
                                {count}
                              </span>
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="mt-1 text-xs text-stone-500">
                        No gesture classes created yet.
                      </p>
                    )}
                  </div>
                </div>

                {(datasetBalance.isImbalanced || datasetDirtySinceModelImport) && (
                  <div className="mt-4 space-y-2 border-t border-white/10 pt-3">
                    {datasetBalance.isImbalanced && (
                      <p className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                        <strong className="text-[#e8cc84]">Class imbalance noticed:</strong>{' '}
                        {datasetBalance.minCount}–{datasetBalance.maxCount} samples across classes.
                        Colab training balances your training split automatically, and adding more
                        examples for smaller classes improves boundary stability.
                      </p>
                    )}
                    {datasetDirtySinceModelImport && (
                      <p className="rounded-lg border border-sky-400/35 bg-sky-500/10 px-3 py-2 text-xs text-sky-100">
                        Your dataset in <strong>1. My Gestures</strong> changed after{' '}
                        <code className="font-mono">{customModelMeta?.fileName}</code> was imported.
                        Download <code className="font-mono">samples.json</code> and retrain in
                        Colab so the active classifier uses your updated samples.
                      </p>
                    )}
                  </div>
                )}
              </section>

              {/* STEP 2 — TRAIN YOUR MODEL WITH GOOGLE COLAB (Main Visual Focus) */}
              <section
                aria-labelledby="step-2-heading"
                className="rounded-xl border border-[#d6b15e]/45 bg-gradient-to-br from-[#d6b15e]/[0.11] via-[#131520] to-[#0d1018] p-6 shadow-[0_12px_36px_rgba(0,0,0,0.35)]"
              >
                <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                  <div className="max-w-2xl">
                    <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] uppercase text-[#e8cc84]">
                      <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Step 2 — Train Your Model with Google Colab</span>
                    </div>

                    <h3
                      id="step-2-heading"
                      className="mt-2 font-display text-3xl font-semibold tracking-wide text-[#f7f2e8]"
                    >
                      Train Your Gesture Model
                    </h3>
                    <p className="mt-1.5 text-sm text-stone-200">
                      Use Google Colab to teach your computer to recognise the gestures you collected.
                    </p>

                    <ol className="mt-5 space-y-2.5 text-sm text-stone-200">
                      {[
                        'Download your gesture dataset.',
                        'Open the Google Colab training notebook and save your own copy to Google Drive.',
                        'Upload your dataset, run the training notebook and download your trained model.',
                      ].map((stepText, idx) => (
                        <li key={stepText} className="flex items-start gap-3">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#d6b15e]/20 font-mono text-xs font-bold text-[#e8cc84]">
                            {idx + 1}
                          </span>
                          <span>{stepText}</span>
                        </li>
                      ))}
                    </ol>
                  </div>

                  <div className="flex shrink-0 flex-col items-start gap-2.5 lg:max-w-xs lg:items-end lg:text-right">
                    {COLAB_NOTEBOOK_URL ? (
                      <a
                        href={COLAB_NOTEBOOK_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#d6b15e] px-5 py-3 text-sm font-semibold text-[#09080a] shadow-lg transition-colors hover:bg-[#e8cc84]"
                      >
                        <span>Open in Google Colab ↗</span>
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowColabConfigHelp((prev) => !prev)}
                        className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#d6b15e] px-5 py-3 text-sm font-semibold text-[#09080a] shadow-lg transition-colors hover:bg-[#e8cc84]"
                      >
                        <span>Open in Google Colab ↗</span>
                      </button>
                    )}

                    <p className="text-[11px] leading-relaxed text-stone-300">
                      Opens Google Colab in a new tab. Sign in with your Google account and save your
                      own copy before training.
                    </p>
                  </div>
                </div>

                {!COLAB_NOTEBOOK_URL && showColabConfigHelp && (
                  <div className="mt-5 rounded-lg border border-amber-400/35 bg-black/45 p-4 text-xs text-stone-200">
                    <p className="font-semibold text-[#e8cc84]">
                      GitHub Colab Link Configuration Needed
                    </p>
                    <p className="mt-1 leading-relaxed text-stone-300">
                      The workspace notebook lives at{' '}
                      <code className="font-mono text-stone-100">
                        {COLAB_GITHUB_CONFIG.notebookPath}
                      </code>
                      , but the repository{' '}
                      <code className="font-mono text-stone-100">
                        {COLAB_GITHUB_CONFIG.owner}/{COLAB_GITHUB_CONFIG.repo}
                      </code>{' '}
                      could not be verified publicly (returned 404 / no branch metadata). Make the
                      repository public and set <code className="font-mono text-[#e8cc84]">COLAB_GITHUB_CONFIG.branch</code>{' '}
                      (or <code className="font-mono text-[#e8cc84]">DIRECT_COLAB_NOTEBOOK_URL</code>) in{' '}
                      <code className="font-mono text-stone-100">
                        src/components/CustomGestureModal.jsx
                      </code>
                      .
                    </p>
                    <div className="mt-2.5">
                      <a
                        href="https://colab.research.google.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 font-semibold text-[#e8cc84] underline underline-offset-4 hover:text-white"
                      >
                        <span>Open Google Colab homepage to upload notebook manually</span>
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                    </div>
                  </div>
                )}
              </section>

              {/* STEP 3 — IMPORT & TEST YOUR MODEL */}
              <section
                aria-labelledby="step-3-heading"
                className="rounded-xl border border-white/10 bg-white/[0.025] p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="max-w-xl">
                    <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] uppercase text-emerald-300">
                      <FolderUp className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Step 3 — Import &amp; Test Your Model</span>
                    </div>
                    <h3 id="step-3-heading" className="mt-1.5 font-display text-2xl font-semibold text-stone-50">
                      Bring Your Model Back
                    </h3>
                    <p className="mt-1 text-sm text-stone-300">
                      Import the model you trained in Colab to start recognising your custom gestures
                      in real time.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      ref={modelFileInputRef}
                      type="file"
                      accept=".json,application/json"
                      onChange={handleModelFileUpload}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => modelFileInputRef.current?.click()}
                      className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-emerald-400 px-4 py-2.5 text-xs font-semibold text-stone-950 transition-colors hover:bg-emerald-300"
                    >
                      <FolderUp className="h-4 w-4" aria-hidden="true" />
                      <span>{hasCustomModel ? 'Replace Model JSON' : 'Import Model JSON'}</span>
                    </button>

                    {hasCustomModel && (
                      <button
                        type="button"
                        onClick={() => {
                          clearCustomKnnModel();
                          setImportSuccess(null);
                          setImportError(null);
                          setRecoveryFeedback(null);
                        }}
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2.5 text-xs font-medium text-stone-300 hover:bg-white/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Unload</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Expected Filename & Dataset Preservation Note */}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4 text-xs">
                  <span className="text-stone-300">
                    Expected file:{' '}
                    <code className="rounded bg-black/45 px-2 py-0.5 font-mono text-[#e8cc84]">
                      knn-gesture-model.json
                    </code>
                  </span>
                  <span className="text-stone-400">
                    Importing a custom model activates it without overwriting your original training
                    dataset.
                  </span>
                </div>

                {importError && (
                  <p className="mt-3 rounded-lg border border-rose-400/40 bg-rose-500/15 px-3.5 py-2.5 text-xs text-rose-200">
                    {importError}
                  </p>
                )}
                {importSuccess && (
                  <p className="mt-3 rounded-lg border border-emerald-400/40 bg-emerald-500/15 px-3.5 py-2.5 text-xs text-emerald-200">
                    {importSuccess}
                  </p>
                )}

                {/* Model Import Status & Active Classifier Switcher */}
                <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                  {/* Model Import Status */}
                  <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
                      Model Import Status
                    </div>
                    {hasCustomModel ? (
                      <div className="mt-2 space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-300">
                            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                            <span>Model Loaded</span>
                          </span>
                          <span className="font-mono text-[11px] text-stone-400">
                            {customModelMeta.fileName}
                          </span>
                        </div>
                        <p className="text-xs text-stone-300">
                          {customModelMeta.classes.length} gestures · {customModelMeta.sampleCount}{' '}
                          training examples
                          {typeof customModelMeta.metrics?.validationAccuracy === 'number'
                            ? ` · ${Math.round(customModelMeta.metrics.validationAccuracy * 100)}% validation accuracy`
                            : ''}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {customModelMeta.classes.map((cls) => (
                            <span
                              key={cls}
                              className="rounded border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-stone-200"
                            >
                              {cls} ({customModelMeta.classCounts?.[cls] ?? 0})
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2">
                        <p className="text-sm font-medium text-stone-300">No custom model imported yet</p>
                        <p className="mt-1 text-xs text-stone-400">
                          Once Google Colab finishes training, click{' '}
                          <strong className="text-stone-200">Import Model JSON</strong> above.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Active Classifier Distinction & Switcher */}
                  <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
                        Active Classifier
                      </span>
                      {hasCustomModel && (
                        <button
                          type="button"
                          onClick={() => setActiveTab('bindings')}
                          className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-[#e8cc84] hover:underline"
                        >
                          <span>Test &amp; Map Actions</span>
                          <ArrowRight className="h-3 w-3" aria-hidden="true" />
                        </button>
                      )}
                    </div>

                    <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => setClassifierSource('pretrained')}
                        className={`cursor-pointer rounded-lg border p-3 text-left transition-colors ${
                          classifierSource === 'pretrained'
                            ? 'border-[#d6b15e]/70 bg-[#d6b15e]/15'
                            : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.05]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-stone-100">
                            Pretrained MediaPipe
                          </span>
                          {classifierSource === 'pretrained' && (
                            <CheckCircle2 className="h-3.5 w-3.5 text-[#e8cc84]" aria-hidden="true" />
                          )}
                        </div>
                        <p className="mt-1 text-[11px] leading-snug text-stone-400">
                          Built-in gestures (Open Palm, Victory, Fist, Pointing Up).
                        </p>
                      </button>

                      <button
                        type="button"
                        disabled={!hasCustomModel}
                        onClick={() => setClassifierSource('custom-knn')}
                        className={`rounded-lg border p-3 text-left transition-colors ${
                          !hasCustomModel
                            ? 'cursor-not-allowed border-white/10 bg-white/[0.01] opacity-50'
                            : classifierSource === 'custom-knn'
                              ? 'cursor-pointer border-emerald-400/70 bg-emerald-500/15'
                              : 'cursor-pointer border-white/10 bg-white/[0.02] hover:bg-white/[0.05]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-stone-100">
                            Custom KNN (Colab)
                          </span>
                          {classifierSource === 'custom-knn' && (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />
                          )}
                        </div>
                        <p className="mt-1 text-[11px] leading-snug text-stone-400">
                          {hasCustomModel
                            ? `Your Colab-trained model (${customModelMeta.classes.length} gestures).`
                            : 'Import knn-gesture-model.json to enable.'}
                        </p>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Collapsible Advanced Tuning & Dataset Recovery (kept out of the way for beginners) */}
                {hasCustomModel && (
                  <div className="mt-4 border-t border-white/10 pt-3">
                    <button
                      type="button"
                      onClick={() => setShowAdvancedTuning((prev) => !prev)}
                      className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-stone-400 hover:text-stone-200"
                    >
                      <Sliders className="h-3.5 w-3.5 text-[#d6b15e]" aria-hidden="true" />
                      <span>
                        {showAdvancedTuning
                          ? 'Hide Advanced Tuning & Dataset Recovery'
                          : 'Advanced Tuning, Diagnostics & Dataset Recovery'}
                      </span>
                      {showAdvancedTuning ? (
                        <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                    </button>

                    {showAdvancedTuning && (
                      <div className="mt-4 space-y-4 rounded-xl border border-white/10 bg-black/35 p-4">
                        {/* Dataset recovery from loaded model */}
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
                          <span className="text-xs text-stone-300">
                            Recover labelled vectors from this model back into{' '}
                            <strong className="text-stone-100">1. My Gestures</strong>:
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleRecoverFromModel('merge')}
                              className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-sky-400/40 bg-sky-500/15 px-2.5 py-1 text-[11px] font-medium text-sky-200 hover:bg-sky-500/25"
                            >
                              <RotateCcw className="h-3 w-3" aria-hidden="true" />
                              <span>Merge into Dataset</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRecoverFromModel('replace')}
                              className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-white/15 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-stone-300 hover:bg-white/10"
                            >
                              <span>Load as Dataset</span>
                            </button>
                          </div>
                        </div>

                        {recoveryFeedback && (
                          <p className="rounded-lg border border-sky-400/30 bg-sky-500/15 px-3 py-2 text-[11px] text-sky-200">
                            {recoveryFeedback}
                          </p>
                        )}

                        {/* Hyperparameters */}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-stone-300">
                            KNN Inference Tuning
                          </span>
                          <div className="flex items-center gap-2">
                            <span
                              className={`rounded-md px-2 py-0.5 font-mono text-[10px] font-semibold ${
                                customKnnConfig.distanceThresholdMode === 'manual'
                                  ? 'border border-amber-400/40 bg-amber-400/15 text-amber-200'
                                  : 'border border-emerald-400/40 bg-emerald-400/15 text-emerald-200'
                              }`}
                            >
                              {customKnnConfig.distanceThresholdMode === 'manual'
                                ? 'Manual Override'
                                : 'Calibrated Defaults'}
                            </span>
                            {(customKnnConfig.distanceThresholdMode === 'manual' ||
                              customKnnConfig.k !== customModelMeta.hyperparams?.k ||
                              customKnnConfig.confidenceThreshold !==
                                customModelMeta.hyperparams?.confidenceThreshold ||
                              customKnnConfig.minDistanceMargin !==
                                customModelMeta.hyperparams?.minDistanceMargin) && (
                              <button
                                type="button"
                                onClick={resetCustomKnnConfig}
                                className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-white/15 bg-white/[0.05] px-2 py-0.5 text-[10px] font-medium text-stone-200 hover:bg-white/10"
                              >
                                <RotateCcw className="h-2.5 w-2.5" aria-hidden="true" />
                                <span>Reset Defaults</span>
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                          <div>
                            <div className="mb-1 flex justify-between text-xs">
                              <label htmlFor="knn-k" className="text-stone-300">
                                K Neighbors
                              </label>
                              <span className="font-mono text-[#e8cc84] tabular-nums">
                                k={customKnnConfig.k}
                              </span>
                            </div>
                            <input
                              id="knn-k"
                              type="range"
                              min="1"
                              max={Math.min(15, customModelMeta.sampleCount)}
                              step="1"
                              value={Math.min(customKnnConfig.k, customModelMeta.sampleCount)}
                              onChange={(e) => updateCustomKnnConfig({ k: Number(e.target.value) })}
                              className="w-full accent-[#d6b15e]"
                            />
                          </div>

                          <div>
                            <div className="mb-1 flex justify-between text-xs">
                              <label htmlFor="knn-conf" className="text-stone-300">
                                Min Neighbor Share
                              </label>
                              <span className="font-mono text-[#e8cc84] tabular-nums">
                                {customKnnConfig.confidenceThreshold.toFixed(2)}
                              </span>
                            </div>
                            <input
                              id="knn-conf"
                              type="range"
                              min="0.4"
                              max="0.95"
                              step="0.05"
                              value={customKnnConfig.confidenceThreshold}
                              onChange={(e) =>
                                updateCustomKnnConfig({ confidenceThreshold: Number(e.target.value) })
                              }
                              className="w-full accent-[#d6b15e]"
                            />
                          </div>

                          <div>
                            <div className="mb-1 flex items-center justify-between text-xs">
                              <label htmlFor="knn-dist" className="text-stone-300">
                                Max Distance
                              </label>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-[#e8cc84] tabular-nums">
                                  {customKnnConfig.maxDistanceThreshold === null
                                    ? 'Off'
                                    : customKnnConfig.maxDistanceThreshold.toFixed(2)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateCustomKnnConfig({
                                      distanceThresholdMode: 'manual',
                                      maxDistanceThreshold:
                                        customKnnConfig.maxDistanceThreshold === null
                                          ? (customModelMeta.hyperparams?.maxDistanceThreshold ?? 1.15)
                                          : null,
                                    })
                                  }
                                  className="cursor-pointer rounded border border-white/15 px-1.5 py-0.5 text-[10px] text-stone-300 hover:bg-white/10"
                                >
                                  {customKnnConfig.maxDistanceThreshold === null ? 'Enable' : 'Disable'}
                                </button>
                              </div>
                            </div>
                            <input
                              id="knn-dist"
                              type="range"
                              min="0.25"
                              max="3.0"
                              step="0.05"
                              disabled={customKnnConfig.maxDistanceThreshold === null}
                              value={customKnnConfig.maxDistanceThreshold ?? 1.15}
                              onChange={(e) =>
                                updateCustomKnnConfig({
                                  distanceThresholdMode: 'manual',
                                  maxDistanceThreshold: Number(e.target.value),
                                })
                              }
                              className="w-full accent-[#d6b15e] disabled:opacity-40"
                            />
                          </div>

                          <div>
                            <div className="mb-1 flex items-center justify-between text-xs">
                              <label htmlFor="knn-margin" className="text-stone-300">
                                Min Class Gap
                              </label>
                              <span className="font-mono text-[#e8cc84] tabular-nums">
                                {customKnnConfig.minDistanceMargin === null
                                  ? 'Off'
                                  : Number(customKnnConfig.minDistanceMargin ?? 0.1).toFixed(2)}
                              </span>
                            </div>
                            <input
                              id="knn-margin"
                              type="range"
                              min="0"
                              max="0.5"
                              step="0.02"
                              value={customKnnConfig.minDistanceMargin ?? 0.1}
                              onChange={(e) =>
                                updateCustomKnnConfig({
                                  minDistanceMargin: Number(e.target.value),
                                })
                              }
                              className="w-full accent-[#d6b15e]"
                            />
                          </div>
                        </div>

                        {/* Live Diagnostics */}
                        <div className="rounded-lg border border-white/10 bg-black/40 p-3 text-xs">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
                              Live Recognition Diagnostics
                            </span>
                            {classifierSource !== 'custom-knn' ? (
                              <span className="text-[11px] text-[#e8cc84]">
                                Switch Active Classifier to Custom KNN above to inspect live frames
                              </span>
                            ) : hudState.knnDiagnostics ? (
                              <span
                                className={`font-mono text-[11px] font-semibold ${
                                  hudState.knnDiagnostics.rejected
                                    ? hudState.knnDiagnostics.predictionStatus === 'Uncertain'
                                      ? 'text-amber-300'
                                      : 'text-rose-300'
                                    : 'text-emerald-300'
                                }`}
                              >
                                {hudState.knnDiagnostics.rejected
                                  ? `${hudState.knnDiagnostics.predictionStatus ?? 'Rejected'} (${hudState.knnDiagnostics.reason})`
                                  : `Accepted · ${hudState.knnDiagnostics.smoothedLabel}`}
                              </span>
                            ) : (
                              <span className="text-[11px] text-stone-500">Show hand in webcam</span>
                            )}
                          </div>

                          {classifierSource === 'custom-knn' && hudState.knnDiagnostics && (
                            <div className="mt-2.5 grid grid-cols-2 gap-2 border-t border-white/10 pt-2.5 text-[11px] sm:grid-cols-4">
                              <div>
                                <div className="text-stone-400">Candidate</div>
                                <div className="font-mono font-semibold text-stone-100">
                                  {hudState.knnDiagnostics.rawCandidateLabel || 'None'}
                                </div>
                              </div>
                              <div>
                                <div className="text-stone-400">Neighbors</div>
                                <div className="font-mono font-semibold text-[#e8cc84]">
                                  {hudState.knnDiagnostics.neighborVoteCount ?? 0}/
                                  {hudState.knnDiagnostics.k ?? customKnnConfig.k} ·{' '}
                                  {hudState.knnDiagnostics.matchQuality ?? 'Unknown'}
                                </div>
                              </div>
                              <div>
                                <div className="text-stone-400">Nearest / Max</div>
                                <div className="font-mono font-semibold text-stone-100">
                                  {Number.isFinite(hudState.knnDiagnostics.nearestDistance)
                                    ? hudState.knnDiagnostics.nearestDistance.toFixed(2)
                                    : '∞'}{' '}
                                  /{' '}
                                  {Number.isFinite(hudState.knnDiagnostics.appliedDistanceThreshold)
                                    ? hudState.knnDiagnostics.appliedDistanceThreshold.toFixed(2)
                                    : 'Off'}
                                </div>
                              </div>
                              <div>
                                <div className="text-stone-400">Class Gap / Min</div>
                                <div className="font-mono font-semibold text-sky-300">
                                  {Number.isFinite(hudState.knnDiagnostics.distanceGap)
                                    ? hudState.knnDiagnostics.distanceGap.toFixed(2)
                                    : '∞'}{' '}
                                  /{' '}
                                  {Number.isFinite(hudState.knnDiagnostics.minDistanceMargin)
                                    ? hudState.knnDiagnostics.minDistanceMargin.toFixed(2)
                                    : 'Off'}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </section>
            </div>
          )}

          {/* TAB 3: 3. TEST & MAP ACTIONS */}
          {activeTab === 'bindings' && (
            <div className="space-y-4">
              {!hasCustomModel ? (
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-8 text-center">
                  <Sparkles className="mx-auto h-7 w-7 text-[#e8cc84]" aria-hidden="true" />
                  <h3 className="mt-3 text-sm font-semibold text-stone-100">
                    No Trained KNN Model Loaded Yet
                  </h3>
                  <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-stone-400">
                    Collect gesture samples in <strong className="text-stone-200">1. My Gestures</strong>,
                    train your classifier in Google Colab, and import{' '}
                    <code className="font-mono text-[#e8cc84]">knn-gesture-model.json</code> to
                    test your gestures and bind them to Magic Canvas and Particle Universe.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('model')}
                    className="mt-4 cursor-pointer rounded-lg bg-[#d6b15e] px-4 py-2 text-xs font-semibold text-[#09080a] hover:bg-[#e8cc84]"
                  >
                    Go to Train Model
                  </button>
                </div>
              ) : (
                <>
                  {classifierSource !== 'custom-knn' && (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#d6b15e]/35 bg-[#d6b15e]/10 px-4 py-3 text-xs text-amber-100">
                      <span>
                        <strong>Pretrained MediaPipe</strong> is currently active. Switch to{' '}
                        <strong>Custom KNN (Colab)</strong> to test your trained gestures live.
                      </span>
                      <button
                        type="button"
                        onClick={() => setClassifierSource('custom-knn')}
                        className="cursor-pointer rounded-lg bg-[#d6b15e] px-3 py-1.5 text-xs font-semibold text-[#09080a] hover:bg-[#e8cc84]"
                      >
                        Switch to Custom KNN
                      </button>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.025] px-4 py-3 text-xs text-stone-300">
                    <div>
                      <p className="font-medium text-stone-100">
                        Test your gestures live in front of your webcam and choose what each gesture triggers.
                      </p>
                      <p className="mt-0.5 text-[11px] text-stone-400">
                        Action mappings apply immediately in Magic Canvas and Particle Universe without retraining.
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-stone-300">
                        Live:{' '}
                        <strong className="text-[#e8cc84]">
                          {hudState.rawGestureName === 'None' && hudState.handDetected
                            ? hudState.gestureName || 'Unknown Gesture'
                            : hudState.rawGestureName && hudState.rawGestureName !== 'None'
                              ? hudState.rawGestureName
                              : 'Waiting for hand'}
                        </strong>
                        {classifierSource === 'custom-knn'
                          ? hudState.knnDiagnostics &&
                            Number.isFinite(hudState.knnDiagnostics.nearestDistance)
                            ? ` (dist ${hudState.knnDiagnostics.nearestDistance.toFixed(2)}, gap ${
                                Number.isFinite(hudState.knnDiagnostics.distanceGap)
                                  ? hudState.knnDiagnostics.distanceGap.toFixed(2)
                                  : '∞'
                              })`
                            : ''
                          : hudState.confidence !== null
                            ? ` (${Math.round(hudState.confidence * 100)}%)`
                            : ''}
                      </span>
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-xl border border-white/10">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-white/10 bg-white/[0.03] text-stone-400">
                        <tr>
                          <th className="px-4 py-3 font-medium">Custom Gesture</th>
                          <th className="px-4 py-3 font-medium">Magic Canvas (Fireworks)</th>
                          <th className="px-4 py-3 font-medium">Particle Universe (3D)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/10">
                        {customModelMeta.classes.map((cls) => {
                          const isLive =
                            classifierSource === 'custom-knn' && hudState.rawGestureName === cls;
                          const mcVal = actionBindings.magicCanvas?.[cls] ?? 'none';
                          const puVal = actionBindings.particleUniverse?.[cls] ?? 'none';
                          return (
                            <tr
                              key={cls}
                              className={isLive ? 'bg-emerald-500/10' : 'bg-transparent'}
                            >
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-stone-100">{cls}</span>
                                  <span className="font-mono text-[11px] text-stone-400">
                                    ({customModelMeta.classCounts?.[cls] ?? 0})
                                  </span>
                                  {isLive && (
                                    <span className="rounded bg-emerald-400/20 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-300">
                                      LIVE
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <select
                                  aria-label={`Magic Canvas action for ${cls}`}
                                  value={mcVal}
                                  onChange={(e) =>
                                    setActionBinding('magicCanvas', cls, e.target.value)
                                  }
                                  className="w-full rounded-lg border border-white/15 bg-[#121622] px-2.5 py-1.5 text-xs text-stone-100 focus:border-[#d6b15e] focus:outline-none"
                                >
                                  {MAGIC_CANVAS_ACTION_OPTIONS.map((opt) => (
                                    <option key={opt.id} value={opt.id}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-4 py-3">
                                <select
                                  aria-label={`Particle Universe action for ${cls}`}
                                  value={puVal}
                                  onChange={(e) =>
                                    setActionBinding('particleUniverse', cls, e.target.value)
                                  }
                                  className="w-full rounded-lg border border-white/15 bg-[#121622] px-2.5 py-1.5 text-xs text-stone-100 focus:border-sky-400 focus:outline-none"
                                >
                                  {PARTICLE_UNIVERSE_ACTION_OPTIONS.map((opt) => (
                                    <option key={opt.id} value={opt.id}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
