/**
 * Subtle pixel-art Chrome T-Rex mascot in authentic stepped pixel geometry.
 * Supports 'waving', 'learning', 'teacher', 'curious', 'running', and 'celebrating' poses.
 */
export default function ChromeDinoMascot({ pose = 'waving', className = 'h-14 w-14' }) {
  const isWaving = pose === 'waving';
  const isLearning = pose === 'learning';
  const isTeacher = pose === 'teacher';
  const isCurious = pose === 'curious';
  const isRunning = pose === 'running';
  const isCelebrating = pose === 'celebrating';

  return (
    <svg
      viewBox="0 0 24 24"
      shapeRendering="crispEdges"
      role="img"
      aria-label={`Pixel dinosaur mascot (${pose})`}
      className={className}
    >
      {/* Head & snout */}
      <rect x="11" y="2" width="8" height="2" fill="#535353" />
      <rect x="10" y="3" width="10" height="4" fill="#535353" />
      <rect x="10" y="7" width="7" height="1" fill="#535353" />
      {/* Eye */}
      <rect x="12" y="4" width="1.5" height="1.5" fill="#FFFFFF" />
      {/* Friendly teacher glasses frame */}
      {isTeacher && (
        <>
          <rect x="11.5" y="3.5" width="2.5" height="2.5" fill="none" stroke="#4285F4" strokeWidth="0.6" />
          <rect x="14" y="4.3" width="6" height="0.6" fill="#4285F4" />
        </>
      )}
      {/* Mouth */}
      <rect x="15" y="7" width="4" height="1" fill="#535353" />

      {/* Neck & torso */}
      <rect x="9" y="8" width="5" height="3" fill="#535353" />
      <rect x="7" y="10" width="7" height="6" fill="#535353" />
      <rect x="5" y="12" width="3" height="4" fill="#535353" />

      {/* Tail */}
      <rect x="3" y="11" width="2" height="3" fill="#535353" />
      <rect x="2" y="10" width="1" height="2" fill="#535353" />

      {/* Arms / accessories by pose */}
      {isWaving && (
        <>
          <rect x="14" y="10" width="2" height="1.5" fill="#535353" />
          <rect x="16" y="8" width="1.5" height="2.5" fill="#4285F4" />
        </>
      )}

      {isLearning && (
        <>
          <rect x="14" y="11" width="3" height="1.5" fill="#535353" />
          <rect x="17" y="8" width="1.5" height="5" fill="#FBBC05" />
          <rect x="17" y="7" width="1.5" height="1" fill="#EA4335" />
          <rect x="17" y="13" width="1.5" height="1" fill="#202124" />
        </>
      )}

      {isTeacher && (
        <>
          {/* Friendly pointing arm holding a Google-colored wooden pointer */}
          <rect x="14" y="10.5" width="2.5" height="1.5" fill="#535353" />
          <rect x="16.5" y="9.5" width="1.2" height="1.2" fill="#FBBC05" />
          <rect x="17.7" y="8.3" width="1.2" height="1.2" fill="#FBBC05" />
          <rect x="18.9" y="7.1" width="1.2" height="1.2" fill="#EA4335" />
          <rect x="20.1" y="5.9" width="1.2" height="1.2" fill="#34A853" />
          {/* Tiny teacher tie / lapel accent */}
          <rect x="11" y="11" width="1.2" height="2.5" fill="#EA4335" />
        </>
      )}

      {isCurious && (
        <>
          <rect x="14" y="10.5" width="2.5" height="1.5" fill="#535353" />
          <rect x="20" y="1" width="2" height="1" fill="#4285F4" />
          <rect x="22" y="2" width="1" height="1.5" fill="#4285F4" />
          <rect x="20.5" y="3.5" width="1.5" height="1" fill="#4285F4" />
          <rect x="20.5" y="5.5" width="1.5" height="1" fill="#EA4335" />
        </>
      )}

      {isRunning && (
        <>
          <rect x="14" y="11" width="2.5" height="1.5" fill="#535353" />
          <rect x="1" y="15" width="3" height="1" fill="#BDC1C6" />
          <rect x="0" y="17" width="4" height="1" fill="#DADCE0" />
        </>
      )}

      {isCelebrating && (
        <>
          <rect x="14" y="9" width="2" height="1.5" fill="#535353" />
          <rect x="16" y="7" width="1.5" height="2" fill="#535353" />
          <rect x="4" y="5" width="1.5" height="1.5" fill="#4285F4" />
          <rect x="7" y="3" width="1.5" height="1.5" fill="#EA4335" />
          <rect x="19" y="3" width="1.5" height="1.5" fill="#FBBC05" />
          <rect x="21" y="7" width="1.5" height="1.5" fill="#34A853" />
        </>
      )}

      {/* Legs */}
      {isRunning ? (
        <>
          <rect x="7" y="16" width="2" height="4" fill="#535353" />
          <rect x="7" y="20" width="3" height="1" fill="#535353" />
          <rect x="12" y="16" width="2" height="2.5" fill="#535353" />
          <rect x="13" y="18.5" width="2.5" height="1" fill="#535353" />
        </>
      ) : (
        <>
          <rect x="7" y="16" width="2" height="4" fill="#535353" />
          <rect x="7" y="20" width="3" height="1" fill="#535353" />
          <rect x="11" y="16" width="2" height="4" fill="#535353" />
          <rect x="11" y="20" width="3" height="1" fill="#535353" />
        </>
      )}
    </svg>
  );
}
