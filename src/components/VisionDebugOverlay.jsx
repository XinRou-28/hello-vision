import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { useVision } from '../context/VisionContext.jsx';

/**
 * Developer/debug overlay for verifying shared webcam, lazy MediaPipe
 * initialization, GPU/CPU delegate, and live inference FPS.
 * Collapsed by default so participant views remain uncluttered.
 */
export default function VisionDebugOverlay() {
  const {
    inferenceMode,
    cameraStatus,
    streamInitCount,
    modelStatus,
    modelDelegate,
    modelError,
    modelInitCount,
    poseModelStatus,
    poseModelDelegate,
    poseModelError,
    poseModelInitCount,
    classifierSource,
    customModelMeta,
    customKnnConfig,
    hudState,
  } = useVision();

  const [collapsed, setCollapsed] = useState(true);

  const isPoseMode = inferenceMode === 'pose';
  const activeModelStatus = isPoseMode ? poseModelStatus : modelStatus;
  const activeModelDelegate = isPoseMode ? poseModelDelegate : modelDelegate;
  const activeModelInitCount = isPoseMode ? poseModelInitCount : modelInitCount;
  const activeModelError = isPoseMode ? poseModelError : modelError;

  return (
    <section
      aria-label="Vision debug telemetry"
      className={`pointer-events-auto fixed bottom-4 left-4 z-30 overflow-hidden rounded border border-white/12 bg-[#090a0d]/92 text-xs shadow-xl sm:bottom-5 sm:left-6 ${
        collapsed ? 'w-auto' : 'w-64'
      }`}
    >
      <div
        className={`flex items-center justify-between gap-2 px-2.5 py-1.5 ${
          collapsed ? '' : 'border-b border-white/[0.08]'
        }`}
      >
        <button
          type="button"
          onClick={() => setCollapsed((prev) => !prev)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand debug telemetry' : 'Collapse debug telemetry'}
          className="flex w-full cursor-pointer items-center justify-between gap-3 text-[11px] font-medium text-[#9b968c] transition-colors hover:text-[#f2efe9] focus-visible:outline-2 focus-visible:outline-[#e4c580]"
        >
          <span>Debug</span>
          {collapsed ? (
            <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </button>
      </div>

      {!collapsed && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 px-3 py-2.5 text-[11px]">
          <dt className="text-[#8a857c]">Mode</dt>
          <dd className="text-right font-mono text-[#e5e2da]">{inferenceMode}</dd>

          <dt className="text-[#8a857c]">Camera</dt>
          <dd className="text-right font-mono text-[#e5e2da] tabular-nums">
            {cameraStatus} (inits: {streamInitCount})
          </dd>

          <dt className="text-[#8a857c]">{isPoseMode ? 'Pose Model' : 'Gesture Model'}</dt>
          <dd className="text-right font-mono text-[#e5e2da] tabular-nums">
            {activeModelStatus}
            {activeModelDelegate ? ` · ${activeModelDelegate}` : ''} (inits: {activeModelInitCount})
          </dd>

          <dt className="text-[#8a857c]">Model Inits</dt>
          <dd className="text-right font-mono text-[#b5b0a6] tabular-nums">
            G:{modelInitCount} · P:{poseModelInitCount}
          </dd>

          {isPoseMode ? (
            <>
              <dt className="text-[#8a857c]">Pose</dt>
              <dd className="truncate text-right font-mono text-emerald-300">
                {hudState.poseDetected ? 'detected' : 'none'}
              </dd>

              <dt className="text-[#8a857c]">Visible Pts</dt>
              <dd className="text-right font-mono text-[#e5e2da] tabular-nums">
                {hudState.poseVisibleCount} / 12 pts
              </dd>
            </>
          ) : (
            <>
              <dt className="text-[#8a857c]">Classifier</dt>
              <dd
                className={`truncate text-right font-mono ${
                  classifierSource === 'custom-knn' ? 'text-emerald-300' : 'text-[#d6d2c9]'
                }`}
              >
                {classifierSource === 'custom-knn'
                  ? `Custom KNN (k=${customKnnConfig.k}, ${customModelMeta?.classes?.length ?? 0} cls)`
                  : 'Pretrained MediaPipe'}
              </dd>

              <dt className="text-[#8a857c]">Gesture</dt>
              <dd className="truncate text-right font-mono text-[#e4c580]">
                {hudState.rawGestureName ?? hudState.gestureName}
              </dd>

              <dt className="text-[#8a857c]">
                {classifierSource === 'custom-knn' ? 'Neighbors' : 'Confidence'}
              </dt>
              <dd className="text-right font-mono text-[#e5e2da] tabular-nums">
                {classifierSource === 'custom-knn'
                  ? hudState.knnDiagnostics
                    ? `${hudState.knnDiagnostics.neighborVoteCount ?? 0}/${hudState.knnDiagnostics.k ?? customKnnConfig.k} · ${hudState.knnDiagnostics.matchQuality ?? 'Unknown'}`
                    : '—'
                  : hudState.confidence !== null
                    ? `${Math.round(hudState.confidence * 100)}%`
                    : '—'}
              </dd>

              {classifierSource === 'custom-knn' && hudState.knnDiagnostics && (
                <>
                  <dt className="text-[#8a857c]">KNN Status</dt>
                  <dd
                    className={`truncate text-right font-mono ${
                      hudState.knnDiagnostics.rejected
                        ? hudState.knnDiagnostics.predictionStatus === 'Uncertain'
                          ? 'text-amber-300'
                          : 'text-rose-300'
                        : 'text-emerald-300'
                    }`}
                  >
                    {hudState.knnDiagnostics.rawCandidateLabel} ·{' '}
                    {hudState.knnDiagnostics.rejected
                      ? `${hudState.knnDiagnostics.predictionStatus ?? 'Rejected'} (${hudState.knnDiagnostics.reason})`
                      : 'accepted'}
                  </dd>

                  <dt className="text-[#8a857c]">Dist / Cutoff</dt>
                  <dd className="truncate text-right font-mono text-sky-300 tabular-nums">
                    {(
                      hudState.knnDiagnostics.winningClassMinDist ??
                      hudState.knnDiagnostics.nearestDistance
                    ).toFixed(2)}{' '}
                    /{' '}
                    {Number.isFinite(hudState.knnDiagnostics.appliedDistanceThreshold)
                      ? hudState.knnDiagnostics.appliedDistanceThreshold.toFixed(2)
                      : 'Off'}{' '}
                    ({hudState.knnDiagnostics.thresholdSource ?? 'fallback'})
                  </dd>

                  <dt className="text-[#8a857c]">Class Gap</dt>
                  <dd className="truncate text-right font-mono text-amber-200 tabular-nums">
                    {Number.isFinite(hudState.knnDiagnostics.distanceGap)
                      ? hudState.knnDiagnostics.distanceGap.toFixed(2)
                      : '∞'}{' '}
                    /{' '}
                    {Number.isFinite(hudState.knnDiagnostics.minDistanceMargin)
                      ? hudState.knnDiagnostics.minDistanceMargin.toFixed(2)
                      : 'Off'}
                    {hudState.knnDiagnostics.secondClosestLabel
                      ? ` (vs ${hudState.knnDiagnostics.secondClosestLabel})`
                      : ''}
                  </dd>

                  <dt className="text-[#8a857c]">Top-K Neighbors</dt>
                  <dd
                    className="truncate text-right font-mono text-[#b5b0a6] tabular-nums"
                    title={hudState.knnDiagnostics.nearestNeighbors
                      .map((n) => `${n.label} (${n.distance.toFixed(3)})`)
                      .join(', ')}
                  >
                    {hudState.knnDiagnostics.nearestNeighbors
                      .slice(0, 3)
                      .map((n) => `${n.label}:${n.distance.toFixed(2)}`)
                      .join(' ')}
                  </dd>

                  <dt className="text-[#8a857c]">Class Min Dists</dt>
                  <dd
                    className="truncate text-right font-mono text-sky-300 tabular-nums"
                    title={hudState.knnDiagnostics.classMinDistances
                      .map((c) => `${c.label}: ${c.minDistance.toFixed(3)}`)
                      .join(' | ')}
                  >
                    {hudState.knnDiagnostics.classMinDistances
                      .slice(0, 3)
                      .map((c) => `${c.label}:${c.minDistance.toFixed(2)}`)
                      .join(' ')}
                  </dd>
                </>
              )}

              <dt className="text-[#8a857c]">Hands / Pts</dt>
              <dd className="text-right font-mono text-[#e5e2da] tabular-nums">
                {hudState.handCount} · {hudState.landmarkCount} pts
              </dd>
            </>
          )}

          <dt className="text-[#8a857c]">Inference FPS</dt>
          <dd className="text-right font-mono text-emerald-300 tabular-nums">
            {hudState.inferenceFps} fps
          </dd>

          {activeModelError && (
            <>
              <dt className="text-rose-400">Error</dt>
              <dd className="truncate text-right font-mono text-rose-300" title={activeModelError}>
                {activeModelError}
              </dd>
            </>
          )}
        </dl>
      )}
    </section>
  );
}
