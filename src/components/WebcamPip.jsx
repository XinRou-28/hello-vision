import { Camera, CameraOff, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useVision } from '../context/VisionContext.jsx';
import {
  drawHandLandmarksOverlay,
  syncHandOverlayCanvasSize,
} from '../vision/handOverlayRenderer.js';
import { POSE_CONNECTIONS, RELEVANT_POSE_INDICES } from '../vision/poseLandmarker.js';

const CAMERA_STATUS_LABELS = {
  idle: 'Standby',
  loading: 'Starting',
  active: 'Live',
  paused: 'Paused',
  denied: 'Blocked',
  unavailable: 'No camera',
  error: 'Camera error',
};

export default function WebcamPip({ modelLabel }) {
  const {
    inferenceMode,
    classifierSource,
    cameraStatus,
    cameraEnabled,
    cameraError,
    streamRef,
    streamVersion,
    modelStatus,
    poseModelStatus,
    latestFrameRef,
    latestPoseFrameRef,
    hudState,
    toggleCamera,
    retryCamera,
  } = useVision();

  const [minimized, setMinimized] = useState(false);
  const [videoAspect, setVideoAspect] = useState('16 / 9');
  const pipVideoRef = useRef(null);
  const overlayCanvasRef = useRef(null);

  // Bind the shared MediaStream to the visible PiP video without reopening getUserMedia
  useEffect(() => {
    const videoEl = pipVideoRef.current;
    const stream = streamRef.current;
    if (!videoEl || !stream || minimized) return;

    if (videoEl.srcObject !== stream) {
      videoEl.srcObject = stream;
    }

    const syncAspect = () => {
      if (videoEl.videoWidth && videoEl.videoHeight) {
        setVideoAspect(`${videoEl.videoWidth} / ${videoEl.videoHeight}`);
      }
    };
    videoEl.addEventListener('loadedmetadata', syncAspect);
    syncAspect();

    videoEl.play().catch(() => {});
    return () => videoEl.removeEventListener('loadedmetadata', syncAspect);
  }, [streamRef, streamVersion, minimized, cameraStatus]);

  // Draw live hand or body pose landmarks & skeleton connections aligned with mirrored video
  useEffect(() => {
    if (minimized) return;

    let rafId = 0;
    const drawOverlay = () => {
      rafId = requestAnimationFrame(drawOverlay);
      const canvas = overlayCanvasRef.current;
      const video = pipVideoRef.current;
      if (!canvas) return;

      const { width, height, displayWidth } = syncHandOverlayCanvasSize(canvas, video);

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);

      if (cameraStatus !== 'active' || !cameraEnabled) {
        return;
      }

      if (inferenceMode === 'gesture') {
        const frame = latestFrameRef.current;
        const hands =
          frame?.hands && frame.hands.length > 0
            ? frame.hands
            : frame?.landmarks?.length
              ? [{ landmarks: frame.landmarks, side: 'left' }]
              : [];

        if (hands.length === 0) {
          return;
        }

        drawHandLandmarksOverlay(ctx, hands, width, height, {
          displayWidth,
          videoWidth: video?.videoWidth || 0,
          videoHeight: video?.videoHeight || 0,
        });
      } else if (inferenceMode === 'pose') {
        const poseFrame = latestPoseFrameRef.current;
        const landmarks = poseFrame?.landmarks;
        if (!landmarks || landmarks.length === 0) {
          return;
        }

        for (const [startIdx, endIdx] of POSE_CONNECTIONS) {
          const start = landmarks[startIdx];
          const end = landmarks[endIdx];
          if (!start || !end) continue;

          const bothVisible = (start.visibility ?? 1) >= 0.45 && (end.visibility ?? 1) >= 0.45;
          ctx.save();
          ctx.beginPath();
          ctx.lineCap = 'round';
          ctx.lineWidth = bothVisible ? 2.2 : 1.3;
          ctx.strokeStyle = bothVisible
            ? 'rgba(52, 211, 153, 0.9)'
            : 'rgba(148, 163, 184, 0.35)';
          if (!bothVisible) {
            ctx.setLineDash([4, 3]);
          }
          ctx.moveTo(start.x * canvas.width, start.y * canvas.height);
          ctx.lineTo(end.x * canvas.width, end.y * canvas.height);
          ctx.stroke();
          ctx.restore();
        }

        for (const idx of RELEVANT_POSE_INDICES) {
          const pt = landmarks[idx];
          if (!pt) continue;
          const visible = (pt.visibility ?? 1) >= 0.45;
          const isWrist = idx === 15 || idx === 16;
          const px = pt.x * canvas.width;
          const py = pt.y * canvas.height;

          ctx.beginPath();
          ctx.arc(px, py, isWrist ? 4 : 3.2, 0, Math.PI * 2);
          ctx.fillStyle = !visible
            ? 'rgba(148, 163, 184, 0.45)'
            : isWrist
              ? '#fde68a'
              : '#34d399';
          ctx.fill();

          if (visible) {
            ctx.lineWidth = 1.2;
            ctx.strokeStyle = '#06281e';
            ctx.stroke();
          }
        }
      }
    };

    rafId = requestAnimationFrame(drawOverlay);
    return () => cancelAnimationFrame(rafId);
  }, [minimized, inferenceMode, cameraStatus, cameraEnabled, latestFrameRef, latestPoseFrameRef]);

  const statusText = CAMERA_STATUS_LABELS[cameraStatus] ?? 'Standby';
  const showGestureBadge =
    inferenceMode === 'gesture' && cameraStatus === 'active' && cameraEnabled;

  let footerLabel = statusText;
  if (inferenceMode === 'gesture') {
    footerLabel = !showGestureBadge
      ? modelStatus === 'loading'
        ? 'Loading model…'
        : statusText
      : hudState.gestureName;
  } else if (inferenceMode === 'pose') {
    if (cameraStatus !== 'active' || !cameraEnabled) {
      footerLabel = statusText;
    } else if (poseModelStatus === 'loading') {
      footerLabel = 'Loading model…';
    } else if (poseModelStatus === 'error') {
      footerLabel = 'Model error';
    } else if (hudState.poseDetected) {
      footerLabel = `Tracked (${hudState.poseVisibleCount}/12)`;
    } else {
      footerLabel = 'Step into frame';
    }
  }

  return (
    <aside
      aria-label="Camera preview"
      className="pointer-events-auto fixed right-4 bottom-4 z-30 w-52 overflow-hidden rounded border border-white/12 bg-[#090a0d]/92 shadow-xl sm:right-6 sm:bottom-5 sm:w-58"
    >
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.08] px-2.5 py-1.5">
        <span className="truncate text-[11px] font-medium text-[#9b968c]">
          {modelLabel || 'Camera'}
        </span>

        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={toggleCamera}
            title={cameraEnabled ? 'Pause camera' : 'Resume camera'}
            aria-label={cameraEnabled ? 'Pause camera' : 'Resume camera'}
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-[#9b968c] transition-colors hover:bg-white/10 hover:text-[#f2efe9] focus-visible:outline-2 focus-visible:outline-[#e4c580]"
          >
            {cameraEnabled && cameraStatus === 'active' ? (
              <Camera className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <CameraOff className="h-3.5 w-3.5 text-rose-400" aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setMinimized((prev) => !prev)}
            aria-label={minimized ? 'Expand camera preview' : 'Minimize camera preview'}
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-[#9b968c] transition-colors hover:bg-white/10 hover:text-[#f2efe9] focus-visible:outline-2 focus-visible:outline-[#e4c580]"
          >
            {minimized ? (
              <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {!minimized && (
        <div className="relative w-full bg-black/85" style={{ aspectRatio: videoAspect }}>
          <video
            ref={pipVideoRef}
            playsInline
            muted
            autoPlay
            className={`h-full w-full -scale-x-100 object-contain transition-opacity duration-200 ${
              cameraStatus === 'active' && cameraEnabled ? 'opacity-100' : 'opacity-0'
            }`}
          />

          <canvas
            ref={overlayCanvasRef}
            className="pointer-events-none absolute inset-0 h-full w-full -scale-x-100"
          />

          {(cameraStatus === 'denied' ||
            cameraStatus === 'unavailable' ||
            cameraStatus === 'error') && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-3 text-center">
              <CameraOff className="h-5 w-5 text-rose-400" aria-hidden="true" />
              <p className="text-[11px] font-medium text-[#e5e2da]">{statusText}</p>
              <p className="text-[10px] leading-snug text-[#8a857c]">
                {cameraError || 'Allow camera access and retry.'}
              </p>
              <button
                type="button"
                onClick={retryCamera}
                className="mt-1 inline-flex cursor-pointer items-center gap-1 rounded border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-[#f2efe9] hover:bg-white/20 whitespace-nowrap shrink-0"
              >
                <RefreshCw className="h-3 w-3" aria-hidden="true" />
                <span>Retry</span>
              </button>
            </div>
          )}

          {cameraStatus === 'loading' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-center">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#e4c580] border-t-transparent" />
              <p className="text-[11px] text-[#9b968c]">Starting camera…</p>
            </div>
          )}

          {cameraStatus === 'paused' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 p-3 text-center">
              <p className="text-[11px] text-[#9b968c]">Camera paused</p>
              <button
                type="button"
                onClick={toggleCamera}
                className="cursor-pointer rounded border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-[#f2efe9] hover:bg-white/20 whitespace-nowrap shrink-0"
              >
                Resume
              </button>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-white/[0.08] px-2.5 py-1.5 text-[11px]">
        <span className="truncate font-medium text-[#e5e2da]">{footerLabel}</span>
        {showGestureBadge && classifierSource === 'custom-knn' && hudState.knnDiagnostics ? (
          <span
            className={`font-mono text-[10px] tabular-nums shrink-0 ${
              hudState.knnDiagnostics.smoothedStatus === 'Unknown'
                ? 'text-rose-300'
                : hudState.knnDiagnostics.smoothedStatus === 'Uncertain'
                  ? 'text-amber-300'
                  : 'text-emerald-300'
            }`}
          >
            {hudState.knnDiagnostics.smoothedStatus === 'Known' &&
            Number.isFinite(hudState.knnDiagnostics.winningClassMinDist)
              ? `d=${hudState.knnDiagnostics.winningClassMinDist.toFixed(2)}`
              : hudState.knnDiagnostics.smoothedStatus ?? 'Unknown'}
          </span>
        ) : (
          showGestureBadge &&
          hudState.confidence !== null && (
            <span className="font-mono text-[11px] text-[#e4c580] tabular-nums shrink-0">
              {Math.round(hudState.confidence * 100)}%
            </span>
          )
        )}
      </div>
    </aside>
  );
}
