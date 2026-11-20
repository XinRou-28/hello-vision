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

/**
 * Brand-new Google Chrome T-Rex farewell mascot for the final THANK YOU! slide.
 * Features the classic stepped pixel T-Rex wearing a graduation cap, waving goodbye
 * on the Chrome Dino desert horizon with subtle Google-colour pixel sparkles.
 */
export function GoodbyeGoogleDino({ className = 'h-72 w-auto' }) {
  return (
    <svg
      viewBox="0 0 38 32"
      shapeRendering="crispEdges"
      role="img"
      aria-label="Google Chrome pixel dinosaur wearing a graduation cap and waving goodbye"
      className={className}
    >
      {/* Subtle Google-colour pixel stars & vision dots */}
      <g aria-hidden="true">
        {/* Blue 4-point pixel sparkle (top left) */}
        <rect x="6" y="7" width="1" height="1" fill="#4285F4" />
        <rect x="5" y="8" width="1" height="1" fill="#4285F4" />
        <rect x="7" y="8" width="1" height="1" fill="#4285F4" />
        <rect x="6" y="9" width="1" height="1" fill="#4285F4" />

        {/* Red pixel dot (mid left) */}
        <rect x="9" y="13" width="1" height="1" fill="#EA4335" />

        {/* Yellow 4-point pixel star (top right) */}
        <rect x="30" y="6" width="1" height="1" fill="#FBBC05" />
        <rect x="29" y="7" width="1" height="1" fill="#FBBC05" />
        <rect x="31" y="7" width="1" height="1" fill="#FBBC05" />
        <rect x="30" y="8" width="1" height="1" fill="#FBBC05" />

        {/* Green pixel dot (lower right) */}
        <rect x="32" y="15" width="1" height="1" fill="#34A853" />

        {/* Wave motion accents clearly beside raised waving paw */}
        <rect x="28" y="10" width="1" height="1" fill="#4285F4" />
        <rect x="29" y="11" width="1" height="2.2" fill="#4285F4" />
        <rect x="28" y="13.2" width="1" height="1" fill="#4285F4" />
      </g>

      {/* Pixel graduation cap perched cleanly above the head with free-hanging tassel */}
      <rect x="13" y="3.5" width="12" height="1.5" fill="#202124" />
      <rect x="15.5" y="5" width="7" height="2" fill="#3C4043" />
      <rect x="18.5" y="2.6" width="1" height="0.9" fill="#FBBC05" />
      <rect x="24.2" y="5" width="1" height="3.2" fill="#FBBC05" />
      <rect x="24" y="8.2" width="1.4" height="1.1" fill="#EA4335" />

      {/* Authentic Chrome Dino head & snout */}
      <rect x="15" y="7" width="7" height="1" fill="#535353" />
      <rect x="14" y="8" width="9" height="4" fill="#535353" />
      {/* Expressive white pixel eye */}
      <rect x="16" y="9" width="1.5" height="1.5" fill="#FFFFFF" />
      {/* Upper snout & cheerful open mouth */}
      <rect x="14" y="12" width="9" height="1" fill="#535353" />
      <rect x="18.5" y="14" width="3.5" height="1" fill="#535353" />

      {/* Neck & body */}
      <rect x="13" y="13" width="5" height="3" fill="#535353" />
      <rect x="12" y="14" width="1" height="2" fill="#535353" />
      <rect x="10" y="15" width="8" height="7" fill="#535353" />
      <rect x="9" y="17" width="2" height="4" fill="#535353" />

      {/* Tail */}
      <rect x="7" y="17" width="2" height="4" fill="#535353" />
      <rect x="5" y="16" width="2" height="3" fill="#535353" />
      <rect x="4" y="14" width="1" height="3" fill="#535353" />

      {/* Raised waving arm extended clearly out to the right of the body */}
      <rect x="18" y="16.5" width="4" height="1.5" fill="#535353" />
      <rect x="22" y="15" width="2" height="2" fill="#535353" />
      <rect x="24" y="13" width="1.6" height="2.4" fill="#535353" />
      <rect x="25" y="11.5" width="1.6" height="1.8" fill="#535353" />

      {/* Tiny tucked side arm */}
      <rect x="18" y="19.2" width="1.8" height="1" fill="#535353" />
      <rect x="19" y="20.2" width="1" height="1" fill="#535353" />

      {/* Legs (left planted, right lifted playfully) */}
      <rect x="11" y="22" width="2" height="4" fill="#535353" />
      <rect x="11" y="26" width="3" height="1" fill="#535353" />
      <rect x="15" y="22" width="2" height="2.8" fill="#535353" />
      <rect x="15" y="24.8" width="2.8" height="1" fill="#535353" />

      {/* Chrome Dino desert horizon line & pixel pebbles */}
      <rect x="2" y="27.5" width="34" height="0.6" fill="#9AA0A6" />
      <rect x="4" y="28.8" width="1.5" height="0.5" fill="#BDC1C6" />
      <rect x="9" y="29.3" width="0.8" height="0.5" fill="#9AA0A6" />
      <rect x="15" y="29" width="2" height="0.5" fill="#BDC1C6" />
      <rect x="22" y="28.7" width="1" height="0.5" fill="#9AA0A6" />
      <rect x="27" y="29.5" width="1.5" height="0.5" fill="#BDC1C6" />
      <rect x="32" y="28.9" width="1" height="0.5" fill="#9AA0A6" />
    </svg>
  );
}

