import {
  Camera,
  CameraOff,
  Eye,
  EyeOff,
  Flame,
  Grid,
  Play,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Timer,
  Trophy,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import ActivityShell from '../components/ActivityShell.jsx';
import PoseSilhouette from '../components/PoseSilhouette.jsx';
import { useVision } from '../context/VisionContext.jsx';
import { ACTIVITIES } from '../data/activities.js';
import {
  calculatePosePointsTier,
  calculatePoseSimilarity,
  createPoseChallengeState,
  evaluateHalfBodyCalibration,
  evaluatePoseChallenge,
  extractRelevantPoseLandmarks,
  generatePoseFeedback,
  getEffectivePoseScoring,
  getPerformanceTitle,
  normalizePoseCoordinates,
  resetPoseChallengeState,
} from '../exercises/poseChallengeMapping.js';
import {
  POSE_LIBRARY,
  POSE_LEVELS,
  selectArcadeRoundPoses,
} from '../exercises/poseLibrary.js';
import { POSE_CONNECTIONS, RELEVANT_POSE_INDICES } from '../vision/poseLandmarker.js';

const PREP_COUNTDOWN_MS = 3000;
const TRANSITION_COUNTDOWN_MS = 2000;
const LEVEL_BANNER_MS = 1800;

const INITIAL_EVAL_UI = {
  score: 0,
  rawScore: 0,
  bestAccuracy: 0,
  holdProgress: 0,
  completed: false,
  feedback: 'Copy the gold figure.',
  missingRequired: [],
  segmentScores: [],
};

function getSkeletonSegmentColor(segScore, threshold, isMatchedState) {
  if (isMatchedState) return '#34d399';
  if (typeof segScore === 'number' && segScore >= threshold) return '#34d399';
  if (typeof segScore === 'number' && segScore >= 54) return '#e4c580';
  return '#38bdf8';
}

export default function PoseChallengeActivity({ onExit }) {
  const activity = ACTIVITIES.find((item) => item.id === 'pose-challenge');
  const {
    setInferenceMode,
    cameraStatus,
    cameraEnabled,
    cameraError,
    streamRef,
    streamVersion,
    poseModelStatus,
    poseModelError,
    latestPoseFrameRef,
    toggleCamera,
    retryCamera,
  } = useVision();

  const [roundPoses, setRoundPoses] = useState(() => selectArcadeRoundPoses('All'));
  const [challengeIdx, setChallengeIdx] = useState(0);
  // 'ready' | 'level-banner' | 'prep' | 'active' | 'transition' | 'summary'
  const [phase, setPhase] = useState('ready');

  const [prepRemainingMs, setPrepRemainingMs] = useState(PREP_COUNTDOWN_MS);
  const [roundRemainingMs, setRoundRemainingMs] = useState(10000);
  const [transitionRemainingMs, setTransitionRemainingMs] = useState(TRANSITION_COUNTDOWN_MS);
  const [levelBannerRemainingMs, setLevelBannerRemainingMs] = useState(LEVEL_BANNER_MS);

  const [showGhostGuide, setShowGhostGuide] = useState(false);
  const [showLibraryModal, setShowLibraryModal] = useState(false);
  const [isHalfBodyFramed, setIsHalfBodyFramed] = useState(false);

  const [totalScore, setTotalScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [roundRecords, setRoundRecords] = useState({});
  const [transitionOutcome, setTransitionOutcome] = useState(null);
  const [evalUi, setEvalUi] = useState(INITIAL_EVAL_UI);

  const cameraBoxRef = useRef(null);
  const stageVideoRef = useRef(null);
  const skeletonCanvasRef = useRef(null);

  const poseStateRef = useRef(createPoseChallengeState());
  const lastEvalSnapshotRef = useRef(INITIAL_EVAL_UI);
  const lastEvaluatedTimestampRef = useRef(-1);
  const lastUiSyncRef = useRef(0);
  const streakRef = useRef(0);
  const roundRecordsRef = useRef({});
  const roundRemainingRef = useRef(10000);

  // Monotonic epoch counters prevent overlapping or duplicate phase/timer transitions
  const phaseEpochRef = useRef(0);
  const resolvedActiveEpochRef = useRef(-1);

  const currentChallenge = roundPoses[challengeIdx] ?? POSE_LIBRARY[0];
  const nextChallenge = roundPoses[challengeIdx + 1] ?? null;
  const scoringConfig = getEffectivePoseScoring(currentChallenge, 'Standard');
  const currentLevelMeta =
    POSE_LEVELS.find((lvl) => lvl.level === currentChallenge.level) ?? POSE_LEVELS[0];

  useEffect(() => {
    streakRef.current = streak;
  }, [streak]);

  useEffect(() => {
    roundRecordsRef.current = roundRecords;
  }, [roundRecords]);

  // Lazy-initialize MediaPipe Pose Landmarker only while Pose Challenge is mounted
  useEffect(() => {
    setInferenceMode('pose');
  }, [setInferenceMode]);

  // Bind shared MediaStream to the full-viewport object-contain video element
  useEffect(() => {
    const videoEl = stageVideoRef.current;
    const stream = streamRef.current;
    if (!videoEl || !stream) return;

    if (videoEl.srcObject !== stream) {
      videoEl.srcObject = stream;
    }
    videoEl.play().catch(() => {});
  }, [streamRef, streamVersion, cameraStatus, cameraEnabled]);

  const startPosePrep = useCallback((posesList, targetIdx) => {
    const targetPoseItem = posesList[targetIdx] ?? POSE_LIBRARY[0];
    const cfg = getEffectivePoseScoring(targetPoseItem, 'Standard');
    phaseEpochRef.current += 1;
    resolvedActiveEpochRef.current = -1;

    resetPoseChallengeState(poseStateRef.current);
    lastEvalSnapshotRef.current = INITIAL_EVAL_UI;
    lastEvaluatedTimestampRef.current = -1;
    lastUiSyncRef.current = 0;
    roundRemainingRef.current = cfg.roundDurationMs;

    setChallengeIdx(targetIdx);
    setEvalUi(INITIAL_EVAL_UI);
    setTransitionOutcome(null);
    setPrepRemainingMs(PREP_COUNTDOWN_MS);
    setRoundRemainingMs(cfg.roundDurationMs);
    setPhase('prep');
  }, []);

  const startLevelBanner = useCallback((posesList, targetIdx) => {
    phaseEpochRef.current += 1;
    resolvedActiveEpochRef.current = -1;
    resetPoseChallengeState(poseStateRef.current);
    lastEvalSnapshotRef.current = INITIAL_EVAL_UI;
    setChallengeIdx(targetIdx);
    setEvalUi(INITIAL_EVAL_UI);
    setTransitionOutcome(null);
    setLevelBannerRemainingMs(LEVEL_BANNER_MS);
    setPhase('level-banner');
  }, []);

  const handleStartChallenge = useCallback(
    (startIndex = 0, customQueue = null) => {
      const freshPoses = customQueue ?? selectArcadeRoundPoses('All');
      setRoundPoses(freshPoses);
      setTotalScore(0);
      setStreak(0);
      setBestStreak(0);
      setRoundRecords({});
      streakRef.current = 0;
      roundRecordsRef.current = {};
      startPosePrep(freshPoses, startIndex);
    },
    [startPosePrep]
  );

  const handleSelectPoseFromLibrary = (poseItem) => {
    const idx = POSE_LIBRARY.findIndex((p) => p.id === poseItem.id);
    setShowLibraryModal(false);
    handleStartChallenge(idx >= 0 ? idx : 0, selectArcadeRoundPoses('All'));
  };

  const handleResetToReady = () => {
    phaseEpochRef.current += 1;
    resolvedActiveEpochRef.current = -1;
    setPhase('ready');
  };

  const visionReady =
    poseModelStatus === 'ready' && cameraStatus === 'active' && cameraEnabled;

  // Unified automatic countdown & transition loop (guarded by phaseEpochRef so timers never overlap)
  useEffect(() => {
    if (
      phase !== 'level-banner' &&
      phase !== 'prep' &&
      phase !== 'active' &&
      phase !== 'transition'
    ) {
      return;
    }
    if (!visionReady) return;

    const myEpoch = phaseEpochRef.current;
    let rafId = 0;
    let prevTime = performance.now();

    const tickPhaseTimer = (now) => {
      if (phaseEpochRef.current !== myEpoch) return;
      rafId = requestAnimationFrame(tickPhaseTimer);

      const dt = Math.min(120, Math.max(0, now - prevTime));
      prevTime = now;

      if (phase === 'level-banner') {
        setLevelBannerRemainingMs((prev) => {
          const next = prev - dt;
          if (next <= 0 && phaseEpochRef.current === myEpoch) {
            startPosePrep(roundPoses, challengeIdx);
            return 0;
          }
          return next;
        });
        return;
      }

      if (phase === 'prep') {
        setPrepRemainingMs((prev) => {
          const next = prev - dt;
          if (next <= 0 && phaseEpochRef.current === myEpoch) {
            phaseEpochRef.current += 1;
            resolvedActiveEpochRef.current = -1;
            const cfg = getEffectivePoseScoring(currentChallenge, 'Standard');
            roundRemainingRef.current = cfg.roundDurationMs;
            setRoundRemainingMs(cfg.roundDurationMs);
            setPhase('active');
            return 0;
          }
          return next;
        });
        return;
      }

      if (phase === 'active') {
        const nextRemaining = roundRemainingRef.current - dt;
        roundRemainingRef.current = Math.max(0, nextRemaining);
        setRoundRemainingMs(roundRemainingRef.current);

        if (nextRemaining <= 0 && resolvedActiveEpochRef.current !== myEpoch) {
          resolvedActiveEpochRef.current = myEpoch;
          phaseEpochRef.current += 1;

          streakRef.current = 0;
          setStreak(0);
          const bestAcc = poseStateRef.current.bestAccuracy;
          setRoundRecords((prevRecords) => ({
            ...prevRecords,
            [currentChallenge.id]: {
              id: currentChallenge.id,
              name: currentChallenge.name,
              level: currentChallenge.level,
              levelName: currentChallenge.levelName,
              cleared: false,
              bestAccuracy: bestAcc,
              pointsEarned: 0,
              tier: 'Missed',
            },
          }));
          setTransitionOutcome({
            type: 'missed',
            accuracy: bestAcc,
            pointsEarned: 0,
            poseName: currentChallenge.name,
          });
          setTransitionRemainingMs(TRANSITION_COUNTDOWN_MS);
          setPhase('transition');
        }
        return;
      }

      if (phase === 'transition') {
        setTransitionRemainingMs((prev) => {
          const next = prev - dt;
          if (next <= 0 && phaseEpochRef.current === myEpoch) {
            const nextIdx = challengeIdx + 1;
            if (nextIdx >= roundPoses.length) {
              phaseEpochRef.current += 1;
              setPhase('summary');
              return 0;
            }
            const nextPose = roundPoses[nextIdx];
            if (nextPose.level !== currentChallenge.level) {
              startLevelBanner(roundPoses, nextIdx);
            } else {
              startPosePrep(roundPoses, nextIdx);
            }
            return 0;
          }
          return next;
        });
      }
    };

    rafId = requestAnimationFrame(tickPhaseTimer);
    return () => cancelAnimationFrame(rafId);
  }, [
    phase,
    visionReady,
    challengeIdx,
    roundPoses,
    currentChallenge,
    startPosePrep,
    startLevelBanner,
  ]);

  // Real-time Half-Body Pose Evaluation Loop
  useEffect(() => {
    if (!visionReady || (phase !== 'ready' && phase !== 'prep' && phase !== 'active')) {
      return;
    }

    const myEpoch = phaseEpochRef.current;
    let rafId = 0;

    const tickEval = (now) => {
      if (phaseEpochRef.current !== myEpoch) return;
      rafId = requestAnimationFrame(tickEval);

      const poseFrame = latestPoseFrameRef.current;
      const hasNewFrame =
        poseFrame &&
        poseFrame.timestamp > 0 &&
        poseFrame.timestamp !== lastEvaluatedTimestampRef.current;

      if (!hasNewFrame && now - lastUiSyncRef.current < 110) {
        return;
      }

      if (hasNewFrame) {
        lastEvaluatedTimestampRef.current = poseFrame.timestamp;
      }

      if (phase === 'ready') {
        if (now - lastUiSyncRef.current >= 140) {
          lastUiSyncRef.current = now;
          const calibration = evaluateHalfBodyCalibration(poseFrame?.landmarks ?? []);
          setIsHalfBodyFramed(calibration.isCalibrated);
        }
        return;
      }

      if (phase === 'prep') {
        const extracted = extractRelevantPoseLandmarks(poseFrame?.landmarks ?? [], 0.45);
        const normalized = normalizePoseCoordinates(extracted);
        const sim = calculatePoseSimilarity(normalized, currentChallenge?.targetPose);
        const preview = {
          score: sim.score,
          rawScore: sim.score,
          bestAccuracy: 0,
          holdProgress: 0,
          completed: false,
          feedback: generatePoseFeedback(sim, 0, false, sim.score),
          missingRequired: sim.missingRequired,
          segmentScores: sim.segmentScores,
        };
        lastEvalSnapshotRef.current = preview;
        if (now - lastUiSyncRef.current >= 80) {
          lastUiSyncRef.current = now;
          setEvalUi(preview);
        }
        return;
      }

      // Active scoring
      const result = evaluatePoseChallenge(
        poseFrame?.landmarks ?? [],
        currentChallenge,
        poseStateRef.current,
        now,
        'Standard'
      );
      lastEvalSnapshotRef.current = result;

      if (result.newlyCompleted && resolvedActiveEpochRef.current !== myEpoch) {
        resolvedActiveEpochRef.current = myEpoch;
        phaseEpochRef.current += 1;

        const awardScore = Math.max(result.score, result.rawScore);
        const cfg = getEffectivePoseScoring(currentChallenge, 'Standard');
        const award = calculatePosePointsTier(awardScore, streakRef.current, {
          remainingMs: roundRemainingRef.current,
          roundDurationMs: cfg.roundDurationMs,
          level: currentChallenge.level,
        });

        const nextStreak = streakRef.current + 1;
        streakRef.current = nextStreak;
        setStreak(nextStreak);
        setBestStreak((prevBest) => Math.max(prevBest, nextStreak));
        setTotalScore((prev) => prev + award.totalPoints);

        setRoundRecords((prevRecords) => ({
          ...prevRecords,
          [currentChallenge.id]: {
            id: currentChallenge.id,
            name: currentChallenge.name,
            level: currentChallenge.level,
            levelName: currentChallenge.levelName,
            cleared: true,
            bestAccuracy: Math.max(result.bestAccuracy, awardScore),
            pointsEarned: award.totalPoints,
            tier: award.tier,
          },
        }));

        setTransitionOutcome({
          type: 'success',
          accuracy: awardScore,
          pointsEarned: award.totalPoints,
          award,
          poseName: currentChallenge.name,
        });
        setEvalUi(result);
        setTransitionRemainingMs(TRANSITION_COUNTDOWN_MS);
        setPhase('transition');
        return;
      }

      if (now - lastUiSyncRef.current >= 60) {
        lastUiSyncRef.current = now;
        setEvalUi(result);
      }
    };

    rafId = requestAnimationFrame(tickEval);
    return () => cancelAnimationFrame(rafId);
  }, [phase, visionReady, currentChallenge, latestPoseFrameRef]);

  // Draw pixel-aligned half-body MediaPipe skeleton over the mirrored webcam feed
  useEffect(() => {
    let rafId = 0;

    const drawSkeleton = () => {
      rafId = requestAnimationFrame(drawSkeleton);
      const canvas = skeletonCanvasRef.current;
      const container = cameraBoxRef.current;
      const video = stageVideoRef.current;
      if (!canvas || !container) return;

      const boxW = Math.max(1, Math.round(container.clientWidth));
      const boxH = Math.max(1, Math.round(container.clientHeight));
      if (canvas.width !== boxW || canvas.height !== boxH) {
        canvas.width = boxW;
        canvas.height = boxH;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (cameraStatus !== 'active' || !cameraEnabled) return;

      const poseFrame = latestPoseFrameRef.current;
      const landmarks = poseFrame?.landmarks;
      if (!landmarks || landmarks.length === 0) return;

      const vidW = video?.videoWidth || 1280;
      const vidH = video?.videoHeight || 720;
      const videoAspect = vidW / vidH;
      const boxAspect = canvas.width / canvas.height;

      let drawW = canvas.width;
      let drawH = canvas.height;
      let offsetX = 0;
      let offsetY = 0;

      if (boxAspect > videoAspect) {
        drawH = canvas.height;
        drawW = drawH * videoAspect;
        offsetX = (canvas.width - drawW) * 0.5;
      } else {
        drawW = canvas.width;
        drawH = drawW / videoAspect;
        offsetY = (canvas.height - drawH) * 0.5;
      }

      const toX = (normX) => offsetX + normX * drawW;
      const toY = (normY) => offsetY + normY * drawH;

      const snapshot = lastEvalSnapshotRef.current;
      const segMap = new Map();
      for (const s of snapshot?.segmentScores ?? []) {
        segMap.set(`${s.from}-${s.to}`, s.score);
        segMap.set(`${s.to}-${s.from}`, s.score);
      }

      const isMatchedState =
        phase === 'ready'
          ? isHalfBodyFramed
          : (phase === 'transition' && transitionOutcome?.type === 'success') ||
            (snapshot?.holdProgress ?? 0) > 0.05 ||
            (snapshot?.score ?? 0) >= scoringConfig.threshold;

      // Head circle anchored at nose (0)
      const leftShoulder = landmarks[11];
      const rightShoulder = landmarks[12];
      const nose = landmarks[0];
      if (nose && (nose.visibility ?? 1) >= 0.45) {
        const shoulderSpan =
          leftShoulder && rightShoulder
            ? Math.hypot(
                (rightShoulder.x - leftShoulder.x) * drawW,
                (rightShoulder.y - leftShoulder.y) * drawH
              )
            : drawW * 0.1;
        const headR = Math.max(14, Math.min(34, shoulderSpan * 0.25));
        ctx.save();
        ctx.beginPath();
        ctx.arc(toX(nose.x), toY(nose.y), headR, 0, Math.PI * 2);
        ctx.strokeStyle = isMatchedState ? 'rgba(52, 211, 153, 0.92)' : 'rgba(228, 197, 128, 0.85)';
        ctx.lineWidth = 2.8;
        ctx.fillStyle = isMatchedState ? 'rgba(52, 211, 153, 0.14)' : 'rgba(228, 197, 128, 0.08)';
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      // Half-body skeleton connections (hide occluded lower shins/ankles)
      for (const [startIdx, endIdx] of POSE_CONNECTIONS) {
        const start = landmarks[startIdx];
        const end = landmarks[endIdx];
        if (!start || !end) continue;

        const isShin = startIdx === 27 || endIdx === 27 || startIdx === 28 || endIdx === 28;
        const bothVisible = (start.visibility ?? 1) >= 0.45 && (end.visibility ?? 1) >= 0.45;
        if (isShin && !bothVisible) continue;

        const segScore = segMap.get(`${startIdx}-${endIdx}`);
        const color =
          phase === 'ready'
            ? isMatchedState
              ? '#34d399'
              : '#e4c580'
            : getSkeletonSegmentColor(segScore, scoringConfig.threshold, isMatchedState);

        ctx.save();
        ctx.beginPath();
        ctx.lineCap = 'round';
        if (bothVisible) {
          ctx.lineWidth = isMatchedState ? 5.2 : 4.2;
          ctx.strokeStyle = color;
          ctx.shadowColor = color;
          ctx.shadowBlur = isMatchedState ? 14 : 6;
        } else {
          ctx.lineWidth = 2.2;
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
          ctx.setLineDash([6, 5]);
        }
        ctx.moveTo(toX(start.x), toY(start.y));
        ctx.lineTo(toX(end.x), toY(end.y));
        ctx.stroke();
        ctx.restore();
      }

      // Key half-body + visible knee joints
      for (const idx of RELEVANT_POSE_INDICES) {
        const pt = landmarks[idx];
        if (!pt) continue;
        const visible = (pt.visibility ?? 1) >= 0.45;
        if ((idx === 27 || idx === 28) && !visible) continue;
        const isExtremity =
          idx === 15 || idx === 16 || idx === 25 || idx === 26 || idx === 27 || idx === 28;

        ctx.beginPath();
        ctx.arc(toX(pt.x), toY(pt.y), isExtremity ? 6.5 : 5, 0, Math.PI * 2);
        ctx.fillStyle = !visible
          ? 'rgba(148, 163, 184, 0.35)'
          : isMatchedState
            ? '#6ee7b7'
            : isExtremity
              ? '#fef3c7'
              : '#e4c580';
        ctx.fill();

        if (visible) {
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#090a0d';
          ctx.stroke();
        }
      }
    };

    rafId = requestAnimationFrame(drawSkeleton);
    return () => cancelAnimationFrame(rafId);
  }, [
    cameraStatus,
    cameraEnabled,
    phase,
    isHalfBodyFramed,
    transitionOutcome,
    scoringConfig.threshold,
    latestPoseFrameRef,
  ]);

  const prepNumber = Math.max(1, Math.ceil(prepRemainingMs / 1000));
  const transitionSeconds = Math.max(1, Math.ceil(transitionRemainingMs / 1000));
  const roundSeconds = Math.max(0, Math.ceil(roundRemainingMs / 1000));
  const roundPct = Math.max(
    0,
    Math.min(100, (roundRemainingMs / scoringConfig.roundDurationMs) * 100)
  );
  const isHolding = phase === 'active' && evalUi.holdProgress > 0.03;
  const isAligned =
    evalUi.score >= scoringConfig.threshold && evalUi.missingRequired.length === 0;

  const clearedCount = Object.values(roundRecords).filter((r) => r.cleared).length;
  const totalCompletedRounds = Object.keys(roundRecords).length;
  const avgAccuracy =
    totalCompletedRounds > 0
      ? Math.round(
          roundPoses.reduce(
            (sum, p) => sum + (roundRecords[p.id]?.bestAccuracy ?? 0),
            0
          ) / roundPoses.length
        )
      : 0;
  const performanceTitle = getPerformanceTitle(clearedCount, roundPoses.length, avgAccuracy);

  let liveCue = evalUi.feedback;
  if (poseModelStatus === 'loading') {
    liveCue = 'Loading Pose Landmarker…';
  } else if (poseModelStatus === 'error') {
    liveCue = poseModelError || 'Unable to initialize Pose Landmarker.';
  } else if (cameraStatus === 'paused') {
    liveCue = 'Camera paused — resume webcam to continue.';
  } else if (cameraStatus === 'denied' || cameraStatus === 'unavailable' || cameraStatus === 'error') {
    liveCue = cameraError || 'Webcam access is required for Pose Challenge.';
  } else if (phase === 'prep') {
    liveCue = `Get ready! ${currentChallenge.cue}`;
  } else if (phase === 'transition') {
    liveCue =
      transitionOutcome?.type === 'success'
        ? `Locked! +${transitionOutcome.pointsEarned} pts`
        : 'Time up — moving to next pose';
  }

  const topControls = (
    <div className="flex items-center gap-1.5">
      {phase !== 'ready' && (
        <div className="hidden lg:flex items-center gap-3 rounded border border-white/12 bg-[#090a0d]/88 px-3 py-1 font-mono text-xs tabular-nums">
          <span className="font-medium text-[#e4c580] whitespace-nowrap">
            {challengeIdx + 1} / {roundPoses.length}
          </span>
          <span aria-hidden="true" className="h-3 w-px bg-white/12" />
          <span className="text-[#d6d2c9] whitespace-nowrap">
            Lv {currentChallenge.level} · {currentChallenge.levelName}
          </span>
          <span aria-hidden="true" className="h-3 w-px bg-white/12" />
          <span className="flex items-center gap-1 font-medium text-[#f2efe9] whitespace-nowrap">
            <Trophy className="h-3 w-3 text-[#e4c580]" aria-hidden="true" />
            {totalScore.toLocaleString()}
          </span>
          <span aria-hidden="true" className="h-3 w-px bg-white/12" />
          <span
            className={`flex items-center gap-1 font-medium whitespace-nowrap ${
              streak > 0 ? 'text-[#e4c580]' : 'text-[#78736a]'
            }`}
          >
            <Flame className="h-3 w-3" aria-hidden="true" />
            {streak}×
          </span>
          <span aria-hidden="true" className="h-3 w-px bg-white/12" />
          <span
            className={`flex items-center gap-1 font-medium whitespace-nowrap ${
              phase === 'active' && roundSeconds <= 3 ? 'text-rose-300' : 'text-emerald-300'
            }`}
          >
            <Timer className="h-3 w-3" aria-hidden="true" />
            {phase === 'prep'
              ? `${prepNumber}s`
              : phase === 'transition'
                ? `${transitionSeconds}s`
                : `${roundSeconds}s`}
          </span>
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowLibraryModal(true)}
        className="hidden md:inline-flex cursor-pointer items-center gap-1.5 rounded border border-white/12 bg-[#090a0d]/88 px-3 py-1.5 text-xs font-medium text-[#d6d2c9] transition-colors hover:border-white/25 hover:text-[#f2efe9] whitespace-nowrap shrink-0"
      >
        <Grid className="h-3.5 w-3.5 text-[#e4c580]" aria-hidden="true" />
        <span>Poses</span>
      </button>

      {phase !== 'ready' && phase !== 'summary' && (
        <button
          type="button"
          onClick={handleResetToReady}
          className="hidden sm:inline-flex cursor-pointer items-center gap-1.5 rounded border border-white/12 bg-[#090a0d]/88 px-3 py-1.5 text-xs font-medium text-[#d6d2c9] transition-colors hover:border-white/25 hover:text-[#f2efe9] whitespace-nowrap shrink-0"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Restart</span>
        </button>
      )}

      <button
        type="button"
        onClick={toggleCamera}
        title={cameraEnabled ? 'Pause camera' : 'Resume camera'}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-white/12 bg-[#090a0d]/88 px-3 py-1.5 text-xs font-medium text-[#d6d2c9] transition-colors hover:border-white/25 hover:text-[#f2efe9] whitespace-nowrap shrink-0"
      >
        {cameraEnabled && cameraStatus === 'active' ? (
          <Camera className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />
        ) : (
          <CameraOff className="h-3.5 w-3.5 text-rose-400" aria-hidden="true" />
        )}
        <span className="hidden sm:inline">
          {cameraEnabled && cameraStatus === 'active' ? 'Pause' : 'Resume'}
        </span>
      </button>
    </div>
  );

  return (
    <ActivityShell activity={activity} onExit={onExit} topControls={topControls} showWebcamPip={false}>
      {/* Full-Screen Camera Stage */}
      <div className="relative h-dvh w-screen overflow-hidden bg-[#030508]">
        <div ref={cameraBoxRef} className="relative h-full w-full overflow-hidden">
          <video
            ref={stageVideoRef}
            playsInline
            muted
            autoPlay
            className={`h-full w-full -scale-x-100 object-contain transition-opacity duration-200 ${
              cameraStatus === 'active' && cameraEnabled ? 'opacity-100' : 'opacity-0'
            }`}
          />

          {/* Subtle Ghost Overlay inside camera when toggled */}
          {showGhostGuide &&
            cameraStatus === 'active' &&
            cameraEnabled &&
            (phase === 'prep' || phase === 'active') && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-8 opacity-40">
                <div className="h-[80%] aspect-square">
                  <PoseSilhouette
                    targetPose={currentChallenge.targetPose}
                    variant="ghost"
                    matched={isHolding}
                  />
                </div>
              </div>
            )}

          {/* Pixel-aligned live MediaPipe skeleton overlay */}
          <canvas
            ref={skeletonCanvasRef}
            className="pointer-events-none absolute inset-0 h-full w-full -scale-x-100"
          />
        </div>

        {/* ===================== READY LAUNCH SCREEN (NO DIAGNOSTIC PANEL) ===================== */}
        {phase === 'ready' && (
          <div className="pointer-events-none fixed inset-x-0 bottom-7 z-20 flex flex-col items-center px-4">
            <div className="pointer-events-auto w-full max-w-2xl rounded border border-white/14 bg-[#090a0d]/88 p-5 text-center shadow-2xl backdrop-blur-md sm:p-6">
              <p className="font-mono text-[11px] tracking-[0.16em] text-[#e4c580] uppercase">
                {POSE_LIBRARY.length} Poses · {POSE_LEVELS.length} Levels · Auto Flow
              </p>
              <h2 className="mt-1 font-display text-2xl font-medium text-[#f2efe9] sm:text-3xl">
                Strike the Pose Before Time Runs Out
              </h2>
              <p className="mt-1.5 text-xs text-[#b5b0a6]">
                Frame from head to mid-thigh for upper-body rounds, and step back slightly when leg-lift poses appear.
              </p>

              <div className="mt-4 grid grid-cols-1 gap-2 text-left sm:grid-cols-3">
                {POSE_LEVELS.map((lvl) => (
                  <div
                    key={lvl.level}
                    className="rounded border border-white/[0.08] bg-white/[0.03] px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[10px] text-[#e4c580] uppercase">
                        Level {lvl.level}
                      </span>
                      <span className="font-mono text-[10px] text-[#8a857c] tabular-nums">
                        {Math.round(lvl.roundDurationMs / 1000)}s / pose
                      </span>
                    </div>
                    <p className="mt-0.5 font-display text-sm font-medium text-[#f2efe9]">
                      {lvl.name}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => handleStartChallenge(0)}
                  className="inline-flex cursor-pointer items-center gap-2.5 rounded bg-[#e4c580] px-9 py-2.5 font-display text-lg font-semibold tracking-wider uppercase text-[#09090b] transition-colors hover:bg-[#edd49a] whitespace-nowrap shrink-0"
                >
                  <Play className="h-4 w-4 fill-current" aria-hidden="true" />
                  <span>Start Challenge</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowLibraryModal(true)}
                  className="inline-flex cursor-pointer items-center gap-2 rounded border border-white/14 bg-white/[0.05] px-4 py-2.5 text-xs font-medium text-[#d6d2c9] transition-colors hover:border-white/25 hover:text-[#f2efe9] whitespace-nowrap shrink-0"
                >
                  <Grid className="h-3.5 w-3.5 text-[#e4c580]" aria-hidden="true" />
                  <span>Browse {POSE_LIBRARY.length} Poses</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ===================== GAMEPLAY FLOATING HUD ===================== */}
        {(phase === 'prep' || phase === 'active' || phase === 'transition') && (
          <>
            {/* Compact Mobile Top Bar */}
            <div className="fixed top-16 inset-x-4 z-20 flex lg:hidden items-center justify-between gap-2 rounded border border-white/12 bg-[#090a0d]/88 px-3 py-1.5 font-mono text-xs tabular-nums">
              <span className="font-medium text-[#e4c580]">
                {challengeIdx + 1}/{roundPoses.length}
              </span>
              <span className="truncate text-[#d6d2c9]">
                Lv {currentChallenge.level} · {currentChallenge.levelName}
              </span>
              <span className="font-medium text-[#f2efe9]">{totalScore} pts</span>
              <span className="font-medium text-emerald-300">
                {phase === 'prep'
                  ? `${prepNumber}s`
                  : phase === 'transition'
                    ? `${transitionSeconds}s`
                    : `${roundSeconds}s`}
              </span>
            </div>

            {/* Left HUD: Accuracy + Hold Ring + Level */}
            <div className="pointer-events-none fixed top-28 left-4 z-20 w-44 rounded border border-white/12 bg-[#090a0d]/88 p-3 sm:top-16 sm:left-6 sm:w-48">
              <div className="flex items-center justify-between gap-2 border-b border-white/[0.08] pb-2 font-mono text-[10px]">
                <span className="text-[#e4c580] uppercase">
                  Level {currentChallenge.level}
                </span>
                <span className="truncate text-[#b5b0a6]">{currentChallenge.levelName}</span>
              </div>

              <div className="mt-2 flex items-baseline justify-between font-mono tabular-nums">
                <span className="text-[11px] font-medium text-[#8a857c]">Accuracy</span>
                <span
                  className={`text-2xl font-semibold ${
                    isAligned || transitionOutcome?.type === 'success'
                      ? 'text-emerald-300'
                      : evalUi.score >= 54
                        ? 'text-[#e4c580]'
                        : 'text-sky-300'
                  }`}
                >
                  {evalUi.score}%
                </span>
              </div>

              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full transition-all duration-100 ${
                    isAligned || transitionOutcome?.type === 'success'
                      ? 'bg-emerald-400'
                      : evalUi.score >= 54
                        ? 'bg-[#e4c580]'
                        : 'bg-sky-400'
                  }`}
                  style={{ width: `${Math.min(100, evalUi.score)}%` }}
                />
              </div>

              <div className="mt-2.5 flex items-center gap-2.5 border-t border-white/[0.08] pt-2">
                <div className="relative flex h-9 w-9 shrink-0 items-center justify-center">
                  <svg viewBox="0 0 44 44" className="h-full w-full -rotate-90">
                    <circle
                      cx="22"
                      cy="22"
                      r="17"
                      fill="none"
                      stroke="rgba(255,255,255,0.12)"
                      strokeWidth="4"
                    />
                    <circle
                      cx="22"
                      cy="22"
                      r="17"
                      fill="none"
                      stroke={
                        isHolding || transitionOutcome?.type === 'success'
                          ? '#34d399'
                          : '#e4c580'
                      }
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeDasharray={2 * Math.PI * 17}
                      strokeDashoffset={2 * Math.PI * 17 * (1 - evalUi.holdProgress)}
                      className="transition-[stroke-dashoffset] duration-75"
                    />
                  </svg>
                  <span className="absolute font-mono text-[9px] font-semibold text-[#f2efe9] tabular-nums">
                    {Math.round(evalUi.holdProgress * 100)}%
                  </span>
                </div>
                <div className="min-w-0">
                  <span className="block font-mono text-[10px] font-medium text-emerald-300">
                    {transitionOutcome?.type === 'success'
                      ? 'Locked!'
                      : isHolding
                        ? 'Hold steady'
                        : `Need ${scoringConfig.threshold}%+`}
                  </span>
                  <span className="block font-mono text-[10px] text-[#8a857c] tabular-nums">
                    Pose {challengeIdx + 1} of {roundPoses.length}
                  </span>
                </div>
              </div>
            </div>

            {/* Right Target Pose Card (strictly gameplay only) */}
            <aside className="fixed top-28 right-4 z-20 w-44 rounded border border-[#e4c580]/25 bg-[#090a0d]/88 p-3 shadow-xl sm:top-16 sm:right-6 sm:w-52">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-[#e4c580]">Target Pose</span>
                <button
                  type="button"
                  onClick={() => setShowGhostGuide((prev) => !prev)}
                  title={showGhostGuide ? 'Hide camera ghost overlay' : 'Show camera ghost overlay'}
                  className="flex h-6 w-6 cursor-pointer items-center justify-center rounded border border-white/10 bg-white/5 text-[#c8c3b8] hover:bg-white/15"
                >
                  {showGhostGuide ? (
                    <Eye className="h-3 w-3 text-[#e4c580]" aria-hidden="true" />
                  ) : (
                    <EyeOff className="h-3 w-3 text-[#8a857c]" aria-hidden="true" />
                  )}
                </button>
              </div>

              <h2 className="mt-1 truncate font-display text-lg font-medium text-[#f2efe9]">
                {currentChallenge.name}
              </h2>

              <div className="my-2 aspect-square w-full max-w-[126px] mx-auto rounded border border-white/[0.08] bg-black/45 p-1.5">
                <PoseSilhouette
                  targetPose={currentChallenge.targetPose}
                  variant="preview"
                  matched={transitionOutcome?.type === 'success' || isHolding}
                />
              </div>

              <p className="text-[11px] leading-snug text-[#b5b0a6]">{currentChallenge.cue}</p>
            </aside>

            {/* Bottom Live Coaching & Round Timer Bar */}
            <div className="pointer-events-none fixed right-4 bottom-5 z-20 w-[min(88vw,26rem)] sm:right-auto sm:left-1/2 sm:-translate-x-1/2">
              <div className="rounded border border-white/12 bg-[#090a0d]/88 px-4 py-2">
                <p className="truncate text-center text-xs font-medium text-[#f2efe9]">
                  {liveCue}
                </p>
                <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`h-full transition-all duration-75 ${
                      phase === 'transition'
                        ? 'bg-[#e4c580]'
                        : roundSeconds <= 3
                          ? 'bg-rose-400'
                          : 'bg-emerald-400'
                    }`}
                    style={{
                      width:
                        phase === 'prep'
                          ? `${Math.min(100, (prepRemainingMs / PREP_COUNTDOWN_MS) * 100)}%`
                          : phase === 'transition'
                            ? `${Math.min(100, (transitionRemainingMs / TRANSITION_COUNTDOWN_MS) * 100)}%`
                            : `${roundPct}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </>
        )}

        {/* ===================== LEVEL TRANSITION ANIMATION ===================== */}
        <AnimatePresence>
          {phase === 'level-banner' && visionReady && (
            <motion.div
              key={`level-${currentChallenge.level}`}
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.04 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center bg-black/55 p-6 text-center backdrop-blur-[2px]"
            >
              <div className="max-w-md rounded border border-[#e4c580]/45 bg-[#090a0d]/95 px-8 py-7 shadow-2xl">
                <p className="font-mono text-xs tracking-[0.22em] text-[#e4c580] uppercase">
                  Level {currentChallenge.level} Unlocked
                </p>
                <h2 className="mt-2 font-display text-4xl font-semibold text-[#f2efe9] sm:text-5xl">
                  {currentLevelMeta.name}
                </h2>
                <p className="mt-2 text-xs text-[#b5b0a6]">{currentLevelMeta.subtitle}</p>
                <p className="mt-4 font-mono text-[11px] text-emerald-300 tabular-nums">
                  {Math.round(currentLevelMeta.roundDurationMs / 1000)}s per pose · Starting in{' '}
                  {Math.max(1, Math.ceil(levelBannerRemainingMs / 1000))}s
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ===================== 3-2-1 PREPARATION COUNTDOWN ===================== */}
        <AnimatePresence>
          {phase === 'prep' && visionReady && (
            <motion.div
              key={`prep-${challengeIdx}-${prepNumber}`}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.08 }}
              transition={{ duration: 0.16 }}
              className="pointer-events-none fixed inset-0 z-20 flex flex-col items-center justify-center bg-black/20 px-4 text-center"
            >
              <span className="font-mono text-xs tracking-[0.18em] uppercase text-[#e4c580] drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)]">
                Level {currentChallenge.level} · {currentChallenge.levelName}
              </span>
              <span className="mt-1 font-display text-3xl font-medium text-[#f2efe9] drop-shadow-[0_4px_18px_rgba(0,0,0,0.95)] sm:text-4xl">
                {currentChallenge.name}
              </span>
              <span className="mt-2 font-display text-8xl font-semibold text-[#e4c580] drop-shadow-[0_6px_30px_rgba(0,0,0,0.95)] tabular-nums sm:text-9xl">
                {prepNumber}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ===================== BRIEF NON-BLOCKING 2s TRANSITION FEEDBACK ===================== */}
        <AnimatePresence>
          {phase === 'transition' && transitionOutcome && (
            <motion.div
              key={`transition-${challengeIdx}`}
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="pointer-events-none fixed inset-0 z-20 flex items-center justify-center px-4 text-center"
            >
              <div
                className={`rounded border px-7 py-5 shadow-2xl backdrop-blur-md ${
                  transitionOutcome.type === 'success'
                    ? 'border-emerald-400/45 bg-[#06140f]/90'
                    : 'border-rose-400/35 bg-[#160a0d]/90'
                }`}
              >
                {transitionOutcome.type === 'success' ? (
                  <>
                    <div className="mx-auto flex h-10 w-10 items-center justify-center rounded border border-emerald-400/40 bg-emerald-400/15 text-emerald-300">
                      <Sparkles className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <p className="mt-2 font-mono text-[11px] tracking-widest text-emerald-300 uppercase tabular-nums">
                      {transitionOutcome.award.tier} · {transitionOutcome.accuracy}% Accuracy
                    </p>
                    <p className="mt-1 font-display text-4xl font-semibold text-[#f2efe9] tabular-nums">
                      +{transitionOutcome.pointsEarned} pts
                    </p>
                    <p className="mt-1 font-mono text-[11px] text-[#9b968c] tabular-nums">
                      Base {transitionOutcome.award.basePoints}
                      {transitionOutcome.award.speedBonus > 0
                        ? ` + ${transitionOutcome.award.speedBonus} Speed`
                        : ''}
                      {transitionOutcome.award.streakBonus > 0
                        ? ` + ${transitionOutcome.award.streakBonus} Streak`
                        : ''}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-mono text-[11px] tracking-widest text-rose-300 uppercase">
                      Time Up · +0 pts
                    </p>
                    <p className="mt-1 font-display text-2xl font-medium text-[#f2efe9]">
                      {transitionOutcome.poseName}
                    </p>
                    <p className="mt-1 font-mono text-[11px] text-[#9b968c] tabular-nums">
                      Best accuracy {transitionOutcome.accuracy}%
                    </p>
                  </>
                )}

                <p className="mt-3 border-t border-white/10 pt-2.5 font-mono text-[11px] text-[#e4c580] tabular-nums">
                  {nextChallenge
                    ? `Next: ${nextChallenge.name} in ${transitionSeconds}s…`
                    : `Final results in ${transitionSeconds}s…`}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ===================== CAMERA / MODEL STATUS OVERLAYS ===================== */}
        {(cameraStatus === 'denied' ||
          cameraStatus === 'unavailable' ||
          cameraStatus === 'error') && (
          <div className="fixed inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/85 p-6 text-center">
            <CameraOff className="h-9 w-9 text-rose-400" aria-hidden="true" />
            <h3 className="font-display text-xl font-semibold text-white">
              Camera Access Required
            </h3>
            <p className="max-w-sm text-xs leading-relaxed text-stone-300">
              {cameraError || 'Allow webcam access in your browser bar and retry.'}
            </p>
            <button
              type="button"
              onClick={retryCamera}
              className="mt-1 inline-flex cursor-pointer items-center gap-2 rounded bg-[#e4c580] px-5 py-2.5 text-xs font-semibold text-[#09090b] hover:bg-[#edd49a] whitespace-nowrap shrink-0"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Retry Camera</span>
            </button>
          </div>
        )}

        {cameraStatus === 'paused' && (
          <div className="fixed inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/80 p-6 text-center">
            <CameraOff className="h-9 w-9 text-stone-400" aria-hidden="true" />
            <p className="text-sm font-medium text-stone-200">Camera paused</p>
            <button
              type="button"
              onClick={toggleCamera}
              className="cursor-pointer rounded bg-[#e4c580] px-5 py-2.5 text-xs font-semibold text-[#09090b] hover:bg-[#edd49a] whitespace-nowrap shrink-0"
            >
              Resume Camera
            </button>
          </div>
        )}

        {(cameraStatus === 'loading' || poseModelStatus === 'loading') &&
          cameraStatus !== 'paused' && (
            <div className="pointer-events-none fixed inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/55 p-6 text-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#e4c580] border-t-transparent" />
              <p className="text-xs font-medium text-stone-200">
                {cameraStatus === 'loading'
                  ? 'Starting webcam…'
                  : 'Initializing MediaPipe Pose Landmarker…'}
              </p>
            </div>
          )}

        {/* ===================== FINAL RESULTS SCREEN ===================== */}
        {phase === 'summary' && (
          <div className="fixed inset-0 z-30 flex items-center justify-center overflow-y-auto bg-black/86 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="my-auto w-full max-w-2xl rounded border border-[#e4c580]/30 bg-[#0b0c10] p-6 text-center shadow-2xl sm:p-8"
            >
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded border border-[#e4c580]/40 bg-[#e4c580]/12 text-[#e4c580]">
                <Trophy className="h-6 w-6" aria-hidden="true" />
              </div>

              <p className="mt-3 font-mono text-xs tracking-[0.18em] text-[#e4c580] uppercase">
                {performanceTitle}
              </p>
              <h2 className="mt-1 font-display text-4xl font-semibold text-[#f2efe9] tabular-nums sm:text-5xl">
                {totalScore.toLocaleString()} pts
              </h2>

              <p className="mt-2 text-xs text-[#9b968c] tabular-nums">
                Completed{' '}
                <span className="font-mono font-medium text-emerald-300">
                  {clearedCount} / {roundPoses.length}
                </span>{' '}
                · Avg Accuracy{' '}
                <span className="font-mono font-medium text-[#f2efe9]">{avgAccuracy}%</span> ·
                Best Streak{' '}
                <span className="font-mono font-medium text-[#e4c580]">{bestStreak}×</span>
              </p>

              <div className="mt-5 max-h-[38dvh] space-y-1.5 overflow-y-auto pr-1 text-left">
                {roundPoses.map((item, idx) => {
                  const rec = roundRecords[item.id];
                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-4 rounded border border-white/[0.08] bg-white/[0.02] px-3.5 py-2"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="font-mono text-xs text-[#78736a] tabular-nums">
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        <span className="truncate text-sm font-medium text-[#f2efe9]">
                          {item.name}
                        </span>
                        <span className="hidden sm:inline font-mono text-[10px] text-[#8a857c]">
                          Lv {item.level} · {item.levelName}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-4 font-mono text-xs tabular-nums">
                        <span className="text-[#9b968c]">{rec?.bestAccuracy ?? 0}%</span>
                        <span
                          className={
                            rec?.cleared ? 'font-medium text-emerald-300' : 'text-[#6c675f]'
                          }
                        >
                          {rec?.cleared ? `+${rec.pointsEarned} (${rec.tier})` : 'Missed (+0)'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => handleStartChallenge(0)}
                  className="inline-flex cursor-pointer items-center gap-2 rounded bg-[#e4c580] px-7 py-2.5 text-xs font-semibold tracking-wide uppercase text-[#09090b] transition-colors hover:bg-[#edd49a] whitespace-nowrap shrink-0"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Play Again</span>
                </button>
                <button
                  type="button"
                  onClick={handleResetToReady}
                  className="inline-flex cursor-pointer items-center gap-2 rounded border border-white/14 bg-white/[0.06] px-5 py-2.5 text-xs font-medium text-[#f2efe9] transition-colors hover:bg-white/12 whitespace-nowrap shrink-0"
                >
                  <span>Back to Start</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* ===================== 15-POSE PROGRESSIVE LIBRARY MODAL ===================== */}
        <AnimatePresence>
          {showLibraryModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 flex items-center justify-center bg-black/84 p-4"
            >
              <motion.section
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                aria-label="Pose library"
                className="flex max-h-[86dvh] w-full max-w-6xl flex-col overflow-hidden rounded border border-white/14 bg-[#0b0c10] shadow-2xl"
              >
                <div className="flex items-center justify-between gap-4 border-b border-white/[0.08] px-6 py-4">
                  <div>
                    <h2 className="font-display text-xl font-medium text-[#f2efe9]">
                      {POSE_LIBRARY.length} Wacky Progressive Poses
                    </h2>
                    <p className="text-xs text-[#8a857c]">
                      Select any pose to jump directly into the sequence from there.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowLibraryModal(false)}
                    aria-label="Close pose library"
                    className="flex h-8 w-8 cursor-pointer items-center justify-center rounded text-[#8a857c] hover:bg-white/10 hover:text-[#f2efe9]"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>

                <div className="space-y-6 overflow-y-auto p-6">
                  {POSE_LEVELS.map((lvl) => {
                    const levelPoses = POSE_LIBRARY.filter((p) => p.level === lvl.level);
                    return (
                      <div key={lvl.level}>
                        <div className="mb-3 flex items-baseline justify-between gap-2 border-b border-white/[0.08] pb-1.5">
                          <h3 className="font-display text-lg font-medium text-[#f2efe9]">
                            Level {lvl.level} — {lvl.name}
                          </h3>
                          <span className="font-mono text-[11px] text-[#e4c580] tabular-nums">
                            {Math.round(lvl.roundDurationMs / 1000)}s per pose
                          </span>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
                          {levelPoses.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => handleSelectPoseFromLibrary(item)}
                              className="flex cursor-pointer flex-col items-start rounded border border-white/[0.08] bg-white/[0.02] p-3.5 text-left transition-colors hover:border-[#e4c580]/45 hover:bg-white/[0.04]"
                            >
                              <span className="font-display text-base font-medium text-[#f2efe9]">
                                {item.name}
                              </span>
                              <div className="my-2 aspect-square w-full max-w-[132px] self-center">
                                <PoseSilhouette targetPose={item.targetPose} variant="preview" />
                              </div>
                              <p className="text-[11px] leading-snug text-[#8a857c]">{item.cue}</p>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.section>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ActivityShell>
  );
}
