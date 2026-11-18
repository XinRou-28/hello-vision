import { POSE_CONNECTIONS, RELEVANT_POSE_INDICES } from '../vision/poseLandmarker.js';

function getHeadPosition(landmarks) {
  if (landmarks?.[0]) {
    return landmarks[0];
  }
  const leftShoulder = landmarks?.[11];
  const rightShoulder = landmarks?.[12];
  if (!leftShoulder || !rightShoulder) return null;
  return {
    x: (leftShoulder.x + rightShoulder.x) * 0.5,
    y: (leftShoulder.y + rightShoulder.y) * 0.5 - 0.38,
  };
}

/**
 * Renders the data-driven target pose reference in Warm Amber/Gold (#fbbf24),
 * visually distinct from the participant's Emerald/Cyan live skeleton overlay.
 * Also supports a 'calibration' variant for half-body framing setup.
 */
export default function PoseSilhouette({
  targetPose,
  variant = 'preview', // 'preview' | 'ghost' | 'calibration'
  matched = false,
}) {
  const targetLandmarks = targetPose?.landmarks ?? {};
  const requiredSet = new Set(targetPose?.requiredIndices ?? []);
  const targetHead = getHeadPosition(targetLandmarks);

  const torsoPoints = [11, 12, 24, 23]
    .map((idx) => targetLandmarks[idx])
    .filter(Boolean)
    .map((pt) => `${pt.x},${pt.y}`)
    .join(' ');

  const isGhost = variant === 'ghost';
  const isCalibration = variant === 'calibration';

  return (
    <svg
      viewBox="-2.15 -2.15 4.3 3.65"
      role="img"
      aria-label={
        isCalibration
          ? 'Half-body camera calibration guide'
          : 'Target pose movement illustration'
      }
      className="h-full w-full select-none"
    >
      <defs>
        <radialGradient id={`targetGlow-${variant}`} cx="50%" cy="44%" r="55%">
          <stop
            offset="0%"
            stopColor={matched ? '#34d399' : '#fbbf24'}
            stopOpacity={isGhost ? '0.06' : matched ? '0.24' : '0.16'}
          />
          <stop offset="100%" stopColor="#05070a" stopOpacity="0" />
        </radialGradient>
      </defs>

      {isCalibration ? (
        <g>
          {/* Half-body framing bounding bracket (head to mid-thigh) */}
          <rect
            x="-1.55"
            y="-1.88"
            width="3.1"
            height="3.05"
            rx="0.28"
            fill="rgba(16, 185, 129, 0.03)"
            stroke={matched ? 'rgba(52, 211, 153, 0.72)' : 'rgba(251, 191, 36, 0.45)'}
            strokeWidth="0.035"
            strokeDasharray="0.14 0.1"
          />
          <line
            x1="-1.3"
            y1="1.08"
            x2="1.3"
            y2="1.08"
            stroke={matched ? 'rgba(52, 211, 153, 0.55)' : 'rgba(251, 191, 36, 0.35)'}
            strokeWidth="0.025"
            strokeDasharray="0.1 0.07"
          />
          {/* Neutral half-body calibration silhouette */}
          <circle
            cx="0"
            cy="-1.16"
            r="0.24"
            fill="none"
            stroke={matched ? 'rgba(52, 211, 153, 0.6)' : 'rgba(255, 255, 255, 0.28)'}
            strokeWidth="0.03"
            strokeDasharray="0.08 0.06"
          />
          <path
            d="M -0.5 -0.72 L 0.5 -0.72 L 0.38 0.44 L -0.38 0.44 Z"
            fill="rgba(255, 255, 255, 0.04)"
            stroke={matched ? 'rgba(52, 211, 153, 0.55)' : 'rgba(255, 255, 255, 0.24)'}
            strokeWidth="0.03"
            strokeLinejoin="round"
          />
          {/* Arms relaxed slightly outward */}
          <path
            d="M -0.5 -0.7 L -0.92 -0.05 L -1.04 0.54 M 0.5 -0.7 L 0.92 -0.05 L 1.04 0.54"
            fill="none"
            stroke={matched ? 'rgba(52, 211, 153, 0.55)' : 'rgba(255, 255, 255, 0.24)'}
            strokeWidth="0.04"
            strokeLinecap="round"
            strokeDasharray="0.08 0.06"
          />
          {/* Upper thighs down to mid-thigh crop line */}
          <path
            d="M -0.34 0.44 L -0.38 1.02 M 0.34 0.44 L 0.38 1.02"
            fill="none"
            stroke={matched ? 'rgba(52, 211, 153, 0.55)' : 'rgba(255, 255, 255, 0.24)'}
            strokeWidth="0.04"
            strokeLinecap="round"
            strokeDasharray="0.08 0.06"
          />
        </g>
      ) : (
        <>
          {!isGhost && (
            <>
              <circle cx="0" cy="-0.38" r="1.66" fill={`url(#targetGlow-${variant})`} />
              <circle
                cx="0"
                cy="-0.38"
                r="1.52"
                fill="none"
                stroke="rgba(251, 191, 36, 0.13)"
                strokeWidth="0.018"
                strokeDasharray="0.06 0.08"
              />
              <line
                x1="-1.6"
                y1="1.24"
                x2="1.6"
                y2="1.24"
                stroke="rgba(251, 191, 36, 0.16)"
                strokeWidth="0.018"
                strokeDasharray="0.09 0.07"
              />
            </>
          )}

          {/* Soft gold silhouette torso volume */}
          {torsoPoints && (
            <polygon
              points={torsoPoints}
              fill={
                isGhost
                  ? 'rgba(251, 191, 36, 0.05)'
                  : matched
                    ? 'rgba(52, 211, 153, 0.14)'
                    : 'rgba(251, 191, 36, 0.13)'
              }
              stroke={
                isGhost
                  ? 'rgba(251, 191, 36, 0.16)'
                  : matched
                    ? 'rgba(52, 211, 153, 0.35)'
                    : 'rgba(251, 191, 36, 0.3)'
              }
              strokeWidth="0.05"
              strokeLinejoin="round"
            />
          )}

          {POSE_CONNECTIONS.map(([fromIdx, toIdx]) => {
            const a = targetLandmarks[fromIdx];
            const b = targetLandmarks[toIdx];
            if (!a || !b) return null;
            return (
              <line
                key={`target-volume-${fromIdx}-${toIdx}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={
                  isGhost
                    ? 'rgba(251, 191, 36, 0.1)'
                    : matched
                      ? 'rgba(52, 211, 153, 0.22)'
                      : 'rgba(251, 191, 36, 0.2)'
                }
                strokeWidth={isGhost ? '0.2' : '0.24'}
                strokeLinecap="round"
              />
            );
          })}

          {targetHead && (
            <circle
              cx={targetHead.x}
              cy={targetHead.y}
              r="0.21"
              fill={
                isGhost
                  ? 'rgba(251, 191, 36, 0.06)'
                  : matched
                    ? 'rgba(52, 211, 153, 0.18)'
                    : 'rgba(251, 191, 36, 0.16)'
              }
              stroke={
                isGhost
                  ? 'rgba(251, 191, 36, 0.32)'
                  : matched
                    ? 'rgba(110, 231, 183, 0.65)'
                    : 'rgba(253, 230, 138, 0.65)'
              }
              strokeWidth="0.032"
            />
          )}

          {/* Crisp target bone vector lines */}
          {POSE_CONNECTIONS.map(([fromIdx, toIdx]) => {
            const a = targetLandmarks[fromIdx];
            const b = targetLandmarks[toIdx];
            if (!a || !b) return null;
            const isRequiredBone = requiredSet.has(fromIdx) && requiredSet.has(toIdx);
            return (
              <line
                key={`target-bone-${fromIdx}-${toIdx}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={
                  isGhost
                    ? isRequiredBone
                      ? 'rgba(251, 191, 36, 0.4)'
                      : 'rgba(251, 191, 36, 0.2)'
                    : matched
                      ? 'rgba(110, 231, 183, 0.92)'
                      : isRequiredBone
                        ? 'rgba(253, 224, 71, 0.92)'
                        : 'rgba(251, 191, 36, 0.45)'
                }
                strokeWidth={isRequiredBone ? '0.048' : '0.03'}
                strokeLinecap="round"
                strokeDasharray={isGhost || !isRequiredBone ? '0.08 0.07' : undefined}
              />
            );
          })}

          {/* Key target joints */}
          {RELEVANT_POSE_INDICES.map((idx) => {
            const pt = targetLandmarks[idx];
            if (!pt) return null;
            const isRequired = requiredSet.has(idx);
            const isWrist = idx === 15 || idx === 16;
            const isAnkle = idx === 27 || idx === 28;
            return (
              <circle
                key={`target-joint-${idx}`}
                cx={pt.x}
                cy={pt.y}
                r={isWrist || isAnkle ? '0.076' : isRequired ? '0.06' : '0.044'}
                fill={
                  isGhost
                    ? 'rgba(251, 191, 36, 0.35)'
                    : matched
                      ? '#34d399'
                      : isRequired
                        ? '#fbbf24'
                        : 'rgba(251, 191, 36, 0.45)'
                }
                stroke={isGhost ? 'rgba(254, 243, 199, 0.4)' : '#fef3c7'}
                strokeWidth={isRequired ? '0.024' : '0.015'}
              />
            );
          })}
        </>
      )}
    </svg>
  );
}
