/**
 * Standard MediaPipe 21-point hand skeleton connections.
 * Each tuple [startIdx, endIdx] connects two keypoints in `landmarks`.
 */
export const HAND_CONNECTIONS = [
  // Thumb
  [0, 1], [1, 2], [2, 3], [3, 4],
  // Index finger
  [0, 5], [5, 6], [6, 7], [7, 8],
  // Middle finger
  [0, 9], [9, 10], [10, 11], [11, 12],
  // Ring finger
  [0, 13], [13, 14], [14, 15], [15, 16],
  // Pinky
  [0, 17], [17, 18], [18, 19], [19, 20],
  // Palm bridge
  [5, 9], [9, 13], [13, 17],
];

export const HAND_LANDMARK_INDEX = {
  WRIST: 0,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
  MIDDLE_TIP: 12,
  RING_TIP: 16,
  PINKY_TIP: 20,
};

/**
 * Mirrors a normalized horizontal coordinate [0..1] for natural selfie interaction.
 *
 * @param {number} x - Normalized x coordinate from MediaPipe (0 = camera left, 1 = camera right)
 * @returns {number} Mirrored normalized x coordinate (0 = viewer left, 1 = viewer right)
 */
export function mirrorNormalizedX(x) {
  return 1 - x;
}

/**
 * @workshop-exercise Exercise 3: Fingertip Coordinate Mapping
 *
 * Maps a normalized MediaPipe landmark ({ x, y }) into pixel coordinates for a target canvas.
 *
 * Expected inputs:
 * - landmark: { x: number, y: number, z?: number } in normalized [0..1] range
 * - canvasWidth: number (pixels)
 * - canvasHeight: number (pixels)
 * - options?: { mirror?: boolean } (defaults to true so movement feels like a mirror)
 *
 * Expected output:
 * - { x: number, y: number } in canvas pixel space, clamped inside [0..canvasWidth, 0..canvasHeight]
 *
 * Hint:
 * - Multiply normalized x by canvasWidth and normalized y by canvasHeight.
 * - Apply mirrorNormalizedX(landmark.x) when options.mirror is true.
 */
export function mapLandmarkToCanvas(landmark, canvasWidth, canvasHeight, options = {}) {
  if (!landmark) return null;
  const { mirror = true } = options;
  const normX = mirror ? mirrorNormalizedX(landmark.x) : landmark.x;
  const clampedX = Math.max(0, Math.min(1, normX));
  const clampedY = Math.max(0, Math.min(1, landmark.y));

  return {
    x: clampedX * canvasWidth,
    y: clampedY * canvasHeight,
  };
}

/**
 * Extracts the index fingertip (landmark #8) in mirrored normalized coordinates.
 *
 * @param {Array<{x: number, y: number, z?: number}>} landmarks
 * @returns {{ x: number, y: number, z: number } | null}
 */
export function getIndexFingertip(landmarks) {
  if (!landmarks || landmarks.length <= HAND_LANDMARK_INDEX.INDEX_TIP) {
    return null;
  }
  const tip = landmarks[HAND_LANDMARK_INDEX.INDEX_TIP];
  return {
    x: mirrorNormalizedX(tip.x),
    y: tip.y,
    z: tip.z ?? 0,
  };
}

/**
 * Computes a stable palm center using the middle finger knuckle (landmark #9).
 *
 * @param {Array<{x: number, y: number, z?: number}>} landmarks
 * @returns {{ x: number, y: number, z: number } | null}
 */
export function getPalmCenter(landmarks) {
  if (!landmarks || landmarks.length <= HAND_LANDMARK_INDEX.MIDDLE_MCP) {
    return null;
  }
  const mcp = landmarks[HAND_LANDMARK_INDEX.MIDDLE_MCP];
  return {
    x: mirrorNormalizedX(mcp.x),
    y: mcp.y,
    z: mcp.z ?? 0,
  };
}

/**
 * Euclidean distance between two 2D landmarks.
 */
export function getDistance2D(a, b) {
  if (!a || !b) return 0;
  return Math.hypot(a.x - b.x, a.y - b.y);
}
