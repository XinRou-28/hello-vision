import { HAND_CONNECTIONS, HAND_LANDMARK_INDEX } from './landmarkMath.js';

export const HAND_FINGERTIP_INDICES = new Set([
  HAND_LANDMARK_INDEX.THUMB_TIP,
  HAND_LANDMARK_INDEX.INDEX_TIP,
  HAND_LANDMARK_INDEX.MIDDLE_TIP,
  HAND_LANDMARK_INDEX.RING_TIP,
  HAND_LANDMARK_INDEX.PINKY_TIP,
]);

/**
 * Original minimalist workshop palette:
 * - Thin warm amber connection lines
 * - Small crisp white finger & palm joint dots
 * - Subtle amber fingertip highlights (#4, #8, #12, #16, #20)
 * - Small emerald wrist anchor (#0)
 */
export const HAND_LANDMARK_COLORS = {
  connection: 'rgba(251, 191, 36, 0.85)',
  joint: '#ffffff',
  tip: '#fbbf24',
  wrist: '#34d399',
};

/**
 * Computes the rendered content box of an `object-contain` video inside a canvas
 * so landmarks stay accurately aligned across 16:9 and 4:3 webcams.
 */
export function computeContainedVideoRect(canvasWidth, canvasHeight, videoWidth, videoHeight) {
  if (!canvasWidth || !canvasHeight) {
    return { offsetX: 0, offsetY: 0, drawWidth: 0, drawHeight: 0 };
  }
  if (!videoWidth || !videoHeight) {
    return { offsetX: 0, offsetY: 0, drawWidth: canvasWidth, drawHeight: canvasHeight };
  }

  const canvasAspect = canvasWidth / canvasHeight;
  const videoAspect = videoWidth / videoHeight;

  if (Math.abs(canvasAspect - videoAspect) < 0.01) {
    return { offsetX: 0, offsetY: 0, drawWidth: canvasWidth, drawHeight: canvasHeight };
  }

  if (videoAspect > canvasAspect) {
    const drawHeight = canvasWidth / videoAspect;
    return {
      offsetX: 0,
      offsetY: (canvasHeight - drawHeight) / 2,
      drawWidth: canvasWidth,
      drawHeight,
    };
  }

  const drawWidth = canvasHeight * videoAspect;
  return {
    offsetX: (canvasWidth - drawWidth) / 2,
    offsetY: 0,
    drawWidth,
    drawHeight: canvasHeight,
  };
}

/**
 * Syncs canvas backing dimensions to cover both the CSS display size (with DPR)
 * and the underlying video stream resolution, preventing blurry upscaled strokes
 * or shrinking landmarks inside compact PiP views.
 */
export function syncHandOverlayCanvasSize(canvas, video) {
  if (!canvas) return { width: 640, height: 360, displayWidth: 640 };

  const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
  const clientW = canvas.clientWidth || 0;
  const clientH = canvas.clientHeight || 0;
  const videoW = video?.videoWidth || 640;
  const videoH = video?.videoHeight || 360;

  let targetW = videoW;
  let targetH = videoH;

  if (clientW > 0 && clientH > 0) {
    const hiResW = Math.round(clientW * dpr);
    const hiResH = Math.round(clientH * dpr);
    if (hiResW >= targetW && hiResH >= targetH) {
      targetW = hiResW;
      targetH = hiResH;
    } else if (Math.abs(clientW / clientH - videoW / videoH) > 0.02) {
      targetW = Math.max(videoW, hiResW);
      targetH = Math.round(targetW * (clientH / clientW));
    }
  }

  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW;
    canvas.height = targetH;
  }

  return {
    width: canvas.width,
    height: canvas.height,
    displayWidth: clientW > 0 ? clientW : canvas.width,
  };
}

/**
 * Renders the 21-point MediaPipe hand skeleton in the original sleek style:
 * thin warm-amber connection lines, tiny crisp white joint dots, amber
 * fingertips, and a small emerald wrist anchor.
 */
export function drawHandLandmarksOverlay(ctx, hands, canvasWidth, canvasHeight, options = {}) {
  if (!ctx || !hands || hands.length === 0 || !canvasWidth || !canvasHeight) return;

  const {
    displayWidth = canvasWidth,
    videoWidth = 0,
    videoHeight = 0,
  } = options;

  const rect = computeContainedVideoRect(canvasWidth, canvasHeight, videoWidth, videoHeight);
  const safeDisplayWidth = Math.max(160, displayWidth || canvasWidth);
  const cssToBacking = canvasWidth / safeDisplayWidth;

  // Scale proportionally between compact corner PiP (~224px) and modal view (~460px+)
  const uiScale = Math.max(0.68, Math.min(1.1, safeDisplayWidth / 400));
  const px = cssToBacking * uiScale;

  const boneWidth = 1.25 * px;
  const jointRadius = 1.55 * px;
  const tipRadius = 2.0 * px;
  const wristRadius = 2.15 * px;

  for (const hand of hands) {
    const landmarks = hand?.landmarks;
    if (!landmarks || landmarks.length === 0) continue;

    const mapPoint = (pt) => ({
      x: rect.offsetX + pt.x * rect.drawWidth,
      y: rect.offsetY + pt.y * rect.drawHeight,
    });

    // 1. Thin warm-amber skeleton connection lines
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = boneWidth;
    ctx.strokeStyle = HAND_LANDMARK_COLORS.connection;
    ctx.beginPath();
    for (const [startIdx, endIdx] of HAND_CONNECTIONS) {
      const start = landmarks[startIdx];
      const end = landmarks[endIdx];
      if (!start || !end) continue;
      const p1 = mapPoint(start);
      const p2 = mapPoint(end);
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
    }
    ctx.stroke();
    ctx.restore();

    // 2. Small crisp white palm & finger joint dots
    ctx.save();
    ctx.fillStyle = HAND_LANDMARK_COLORS.joint;
    for (let i = 0; i < landmarks.length; i += 1) {
      if (i === HAND_LANDMARK_INDEX.WRIST || HAND_FINGERTIP_INDICES.has(i)) continue;
      const pt = landmarks[i];
      if (!pt) continue;
      const { x, y } = mapPoint(pt);
      ctx.beginPath();
      ctx.arc(x, y, jointRadius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 3. Five fingertips (#4, #8, #12, #16, #20) in subtle amber
    ctx.save();
    ctx.fillStyle = HAND_LANDMARK_COLORS.tip;
    for (const tipIdx of HAND_FINGERTIP_INDICES) {
      const tip = landmarks[tipIdx];
      if (!tip) continue;
      const { x, y } = mapPoint(tip);
      ctx.beginPath();
      ctx.arc(x, y, tipRadius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 4. Wrist anchor (#0) in emerald green
    const wrist = landmarks[HAND_LANDMARK_INDEX.WRIST];
    if (wrist) {
      const { x, y } = mapPoint(wrist);
      ctx.save();
      ctx.fillStyle = HAND_LANDMARK_COLORS.wrist;
      ctx.beginPath();
      ctx.arc(x, y, wristRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}
