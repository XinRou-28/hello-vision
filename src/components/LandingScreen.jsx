import { ArrowUpRight } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import appMagicCanvasImg from '../assets/images/app_magic_canvas.png';
import appParticleUniverseImg from '../assets/images/app_particle_universe.png';
import poseAthletePhoto from '../assets/images/pose_athlete_photo_1794879961017.jpg';
import { useVision } from '../context/VisionContext.jsx';
import { ACTIVITIES } from '../data/activities.js';
import CustomGestureModal from './CustomGestureModal.jsx';

const HERO_MEME_SRC = '/assets/images/image_fd123493.png';

const CARD_POSE_JOINTS = {
  nose: { x: 150, y: 70 },
  leftShoulder: { x: 130, y: 110 },
  rightShoulder: { x: 170, y: 110 },
  leftElbow: { x: 76, y: 143 },
  rightElbow: { x: 226, y: 141 },
  leftWrist: { x: 50, y: 105 },
  rightWrist: { x: 251, y: 102 },
  leftHip: { x: 130, y: 210 },
  rightHip: { x: 170, y: 210 },
  leftKnee: { x: 130, y: 290 },
  rightKnee: { x: 172, y: 290 },
  leftAnkle: { x: 127, y: 358 },
  rightAnkle: { x: 178, y: 358 },
};

const CARD_POSE_LINKS = [
  ['leftShoulder', 'rightShoulder'],
  ['leftShoulder', 'leftElbow'],
  ['leftElbow', 'leftWrist'],
  ['rightShoulder', 'rightElbow'],
  ['rightElbow', 'rightWrist'],
  ['leftShoulder', 'leftHip'],
  ['rightShoulder', 'rightHip'],
  ['leftHip', 'rightHip'],
  ['leftHip', 'leftKnee'],
  ['leftKnee', 'leftAnkle'],
  ['rightHip', 'rightKnee'],
  ['rightKnee', 'rightAnkle'],
];

function AmbientDustBackdrop() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const pointer = { x: width * 0.5, y: height * 0.28 };
    const motes = Array.from({ length: 22 }, (_, i) => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: 0.6 + Math.random() * 1.05,
      vx: (Math.random() - 0.5) * 0.08,
      vy: -0.04 - Math.random() * 0.09,
      phase: Math.random() * Math.PI * 2,
      warm: i % 3 !== 0,
    }));

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    const handlePointerMove = (e) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('pointermove', handlePointerMove, { passive: true });

    let rafId = 0;
    const render = (time) => {
      ctx.clearRect(0, 0, width, height);

      const glow = ctx.createRadialGradient(
        pointer.x,
        pointer.y,
        16,
        pointer.x,
        pointer.y,
        Math.min(width, height) * 0.36
      );
      glow.addColorStop(0, 'rgba(214, 177, 94, 0.032)');
      glow.addColorStop(1, 'rgba(5, 5, 7, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);

      for (const mote of motes) {
        if (!prefersReducedMotion) {
          mote.x += mote.vx + Math.sin(time * 0.00045 + mote.phase) * 0.05;
          mote.y += mote.vy;
          if (mote.y < -12) {
            mote.y = height + 12;
            mote.x = Math.random() * width;
          }
          if (mote.x < -12) mote.x = width + 12;
          if (mote.x > width + 12) mote.x = -12;
        }

        const pulse = 0.16 + 0.24 * (0.5 + 0.5 * Math.sin(time * 0.0012 + mote.phase));
        ctx.globalAlpha = pulse;
        ctx.fillStyle = mote.warm ? '#d6b15e' : '#e6dfd1';
        ctx.beginPath();
        ctx.arc(mote.x, mote.y, mote.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      if (!prefersReducedMotion) {
        rafId = requestAnimationFrame(render);
      }
    };

    rafId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('pointermove', handlePointerMove);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 h-full w-full"
    />
  );
}

function CinemaMemeFrame() {
  const [imgError, setImgError] = useState(false);

  return (
    <figure className="relative mx-auto w-full max-w-[460px] lg:ml-auto lg:mr-0">
      <div className="relative overflow-hidden rounded-2xl bg-[#0b0a0e] p-2 ring-1 ring-[#d6b15e]/22 shadow-[0_32px_90px_-20px_rgba(0,0,0,0.92),0_0_52px_-26px_rgba(214,177,94,0.18)]">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-[#e8cc84]/55 to-transparent"
        />

        <div className="relative overflow-hidden rounded-xl bg-[#050507]">
          {!imgError ? (
            <img
              src={HERO_MEME_SRC}
              alt="Frankenstein scientist wearing goggles reacting: It's Alive!"
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
              className="block h-auto w-full select-none transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] hover:scale-[1.015]"
            />
          ) : (
            <div className="flex aspect-[4/3] items-center justify-center bg-[#09080c] px-6 text-center text-sm text-[#a69e8e]">
              It&apos;s Alive! — Vision Workshop Visual
            </div>
          )}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/[0.06] rounded-xl"
          />
        </div>
      </div>

      <figcaption className="mt-4 text-center text-[13px] tracking-wide text-[#9a9284] lg:text-left">
        When your computer finally recognises your gesture.
      </figcaption>
    </figure>
  );
}

function ActivityPreview({ activity }) {
  if (activity.id === 'magic-canvas') {
    return (
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-[#060509]">
        <img
          src={appMagicCanvasImg}
          alt="Magic Canvas fireworks and glowing light trails controlled by hand gestures"
          referrerPolicy="no-referrer"
          className="block h-full w-full object-cover object-[50%_46%] scale-[1.22] transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.26]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0b0a0f] via-transparent to-[#0b0a0f]/40"
        />
      </div>
    );
  }

  if (activity.id === 'particle-universe') {
    return (
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-[#050508]">
        <img
          src={appParticleUniverseImg}
          alt="Particle Universe 3D starfield spiral galaxy controlled by hand gestures"
          referrerPolicy="no-referrer"
          className="block h-full w-full object-cover object-center scale-[1.12] transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.16]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0b0a0f] via-transparent to-[#0b0a0f]/35"
        />
      </div>
    );
  }

  return (
    <div
      className="relative flex aspect-[16/10] w-full items-center justify-center overflow-hidden bg-[#0b0a0f]"
      style={{
        background: 'radial-gradient(circle at 50% 48%, #1a1c22 0%, #0d0c11 66%, #0b0a0f 100%)',
      }}
    >
      <div className="relative h-full aspect-[3/4] transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.03]">
        <img
          src={poseAthletePhoto}
          alt="Pose Challenge full-body landmark tracking preview"
          referrerPolicy="no-referrer"
          className="block h-full w-full object-cover brightness-[0.84] contrast-[1.06] saturate-[0.86]"
          style={{
            maskImage: 'radial-gradient(ellipse 62% 76% at 50% 54%, black 26%, transparent 88%)',
            WebkitMaskImage:
              'radial-gradient(ellipse 62% 76% at 50% 54%, black 26%, transparent 88%)',
          }}
        />
        <svg
          viewBox="0 0 300 400"
          className="pointer-events-none absolute inset-0 h-full w-full"
          aria-hidden="true"
        >
          {CARD_POSE_LINKS.map(([a, b]) => (
            <line
              key={`${a}-${b}`}
              x1={CARD_POSE_JOINTS[a].x}
              y1={CARD_POSE_JOINTS[a].y}
              x2={CARD_POSE_JOINTS[b].x}
              y2={CARD_POSE_JOINTS[b].y}
              stroke="#34d399"
              strokeWidth="4.2"
              strokeLinecap="round"
            />
          ))}
          <circle
            cx={CARD_POSE_JOINTS.nose.x}
            cy={CARD_POSE_JOINTS.nose.y}
            r="22"
            fill="none"
            stroke="#34d399"
            strokeWidth="3"
          />
          {Object.entries(CARD_POSE_JOINTS)
            .filter(([key]) => key !== 'nose')
            .map(([key, pt]) => (
              <circle
                key={key}
                cx={pt.x}
                cy={pt.y}
                r="5.2"
                fill="#e4c580"
                stroke="#09080c"
                strokeWidth="1.6"
              />
            ))}
        </svg>
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0b0a0f] via-transparent to-[#0b0a0f]/25"
      />
    </div>
  );
}

export default function LandingScreen({
  onSelectActivity,
  onOpenPresentation,
  initialShowGestureLab = false,
  onReturnToPresentation = null,
}) {
  const { setInferenceMode, classifierSource } = useVision();
  const [showGestureLab, setShowGestureLab] = useState(Boolean(initialShowGestureLab));

  useEffect(() => {
    setInferenceMode('idle');
  }, [setInferenceMode]);

  useEffect(() => {
    if (initialShowGestureLab) {
      setShowGestureLab(true);
    }
  }, [initialShowGestureLab]);

  return (
    <div className="relative min-h-dvh w-full overflow-x-clip bg-[#050507] text-[#f6f1e6]">
      <AmbientDustBackdrop />

      {/* Warm overhead gallery spotlight + subtle vignette */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(ellipse_75%_44%_at_50%_-6%,rgba(214,177,94,0.085),transparent_68%),radial-gradient(circle_at_50%_50%,transparent_54%,rgba(0,0,0,0.68)_100%)]"
      />

      {/* Minimalist sticky glass header aligned to 3-zone contract */}
      <header className="sticky top-0 z-20 border-b border-white/[0.07] bg-[#050507]/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-[1180px] items-center justify-between gap-8 px-6 sm:px-10">
          <span className="font-display text-lg font-semibold tracking-[0.14em] uppercase text-[#f7f2e8] whitespace-nowrap shrink-0">
            HELLO, VISION!
          </span>

          <nav className="hidden md:flex items-center gap-7 text-[13px] font-medium text-[#a39b8d]">
            {ACTIVITIES.map((activity) => (
              <button
                key={activity.id}
                type="button"
                onClick={() => onSelectActivity(activity.id)}
                className="cursor-pointer py-1 transition-colors duration-200 hover:text-[#f6f1e6] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#d6b15e] whitespace-nowrap shrink-0"
              >
                {activity.title}
              </button>
            ))}
            {onOpenPresentation && (
              <button
                type="button"
                onClick={onOpenPresentation}
                className="cursor-pointer py-1 transition-colors duration-200 hover:text-[#f6f1e6] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#d6b15e] whitespace-nowrap shrink-0"
              >
                Workshop Slides
              </button>
            )}
          </nav>

          <div className="flex items-center gap-2.5 shrink-0">
            {onReturnToPresentation && (
              <button
                type="button"
                onClick={onReturnToPresentation}
                className="cursor-pointer rounded-full border border-[#d6b15e]/35 bg-[#0e0d12] px-3.5 py-1.5 text-xs font-medium text-[#e8cc84] transition-colors hover:border-[#d6b15e]/70 whitespace-nowrap shrink-0"
              >
                ← Slides
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowGestureLab(true)}
              className={`cursor-pointer rounded-full border px-4 py-1.5 text-xs font-medium transition-colors duration-200 whitespace-nowrap shrink-0 ${
                classifierSource === 'custom-knn'
                  ? 'border-emerald-400/45 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20'
                  : 'border-white/15 bg-white/[0.04] text-[#dfd7c8] hover:border-[#d6b15e]/50 hover:text-[#f7f2e8]'
              }`}
            >
              {classifierSource === 'custom-knn' ? 'Gestures · KNN' : 'Custom Gestures'}
            </button>

            <button
              type="button"
              onClick={() => onSelectActivity(ACTIVITIES[0].id)}
              className="hidden sm:inline-flex cursor-pointer items-center rounded-full bg-[#d6b15e] px-4.5 py-1.5 text-xs font-semibold text-[#08080a] transition-colors duration-200 hover:bg-[#e8cc84] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d6b15e] whitespace-nowrap shrink-0"
            >
              Enter
            </button>
          </div>
        </div>
      </header>

      <div className="relative z-10 mx-auto flex w-full max-w-[1180px] flex-col px-6 sm:px-10">
        {/* Hero Composition */}
        <section className="pt-12 pb-14 sm:pt-16 sm:pb-18 lg:pt-20 lg:pb-20">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-14">
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="lg:col-span-7"
            >
              <p className="text-[13px] font-medium tracking-[0.14em] uppercase text-[#d6b15e]/90">
                Interactive Vision &amp; Gesture Studio
              </p>

              <h1
                className="font-display mt-4 text-[3.65rem] font-semibold tracking-[-0.015em] leading-[0.92] text-[#faf6ec] sm:text-[5rem] lg:text-[5.75rem]"
                style={{ textWrap: 'balance' }}
              >
                HELLO,
                <br />
                VISION!
              </h1>

              <p className="mt-7 max-w-xl text-[1.05rem] font-normal leading-[1.6] text-[#c8c0b2] sm:text-[1.22rem]">
                Exploring Computer Vision, Machine Learning &amp; Gesture Recognition.
              </p>

              <div className="mt-9 flex flex-wrap items-center gap-3.5">
                <button
                  type="button"
                  onClick={() => onSelectActivity(ACTIVITIES[0].id)}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-[#f6f1e6] px-6 py-3 text-sm font-semibold text-[#09080a] transition-all duration-200 hover:bg-[#e8cc84] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d6b15e] whitespace-nowrap shrink-0"
                >
                  <span>Start with Magic Canvas</span>
                  <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                </button>

                <button
                  type="button"
                  onClick={() => setShowGestureLab(true)}
                  className="inline-flex cursor-pointer items-center rounded-full border border-[#d6b15e]/35 bg-white/[0.03] px-5.5 py-3 text-sm font-medium text-[#e8cc84] transition-colors duration-200 hover:border-[#d6b15e]/65 hover:bg-[#d6b15e]/10 whitespace-nowrap shrink-0"
                >
                  Custom Gestures
                </button>

                {onOpenPresentation && (
                  <button
                    type="button"
                    onClick={onOpenPresentation}
                    className="inline-flex cursor-pointer items-center px-2 py-2.5 text-sm font-medium text-[#a69e8e] transition-colors duration-200 hover:text-[#f6f1e6] whitespace-nowrap shrink-0 md:hidden"
                  >
                    Workshop Slides →
                  </button>
                )}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
              className="lg:col-span-5"
            >
              <CinemaMemeFrame />
            </motion.div>
          </div>
        </section>

        {/* Curated Experiences Grid */}
        <section className="border-t border-white/[0.08] pt-12 pb-16 lg:pt-14 lg:pb-20">
          <div className="mb-8 flex flex-wrap items-baseline justify-between gap-4">
            <h2 className="font-display text-2xl font-semibold tracking-tight text-[#f6f1e6] sm:text-[1.85rem]">
              Three Interactive Experiences
            </h2>
            <p className="text-xs font-medium tracking-[0.06em] text-[#8d8577]">
              Powered by real-time MediaPipe tracking in your browser
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3 lg:gap-7">
            {ACTIVITIES.map((activity, idx) => (
              <motion.button
                key={activity.id}
                type="button"
                onClick={() => onSelectActivity(activity.id)}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.45,
                  delay: 0.06 * (idx + 1),
                  ease: [0.16, 1, 0.3, 1],
                }}
                className="group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0b0a0f] text-left transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1 hover:border-[#d6b15e]/45 hover:bg-[#0f0e14] hover:shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d6b15e]"
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 z-10 h-px bg-gradient-to-r from-transparent via-[#d6b15e]/70 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                />

                <ActivityPreview activity={activity} />

                <div className="flex flex-1 flex-col justify-between p-6 lg:p-7">
                  <div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-mono font-medium tracking-[0.14em] text-[#d6b15e] tabular-nums">
                        {activity.index}
                      </span>
                      <span aria-hidden="true" className="text-white/25">
                        ·
                      </span>
                      <span className="text-[#8f8778]">{activity.mediumLabel}</span>
                    </div>

                    <h3 className="font-display mt-3.5 text-[1.9rem] font-semibold tracking-tight leading-tight text-[#f7f2e8]">
                      {activity.title}
                    </h3>
                    <p className="mt-1 text-[13px] font-medium text-[#d6b15e]">
                      {activity.subtitle}
                    </p>

                    <p className="mt-3.5 text-sm leading-relaxed text-[#a8a092]">
                      {activity.description}
                    </p>
                  </div>

                  <div className="mt-7 flex items-center justify-between border-t border-white/[0.06] pt-4 text-xs font-semibold tracking-[0.1em] uppercase text-[#e8cc84]">
                    <span>Launch</span>
                    <ArrowUpRight
                      className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                      aria-hidden="true"
                    />
                  </div>
                </div>
              </motion.button>
            ))}
          </div>
        </section>

        {/* Quiet Editorial Footer */}
        <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-white/[0.08] py-7 text-xs text-[#7f7768]">
          <span className="tracking-[0.14em] uppercase text-[#a39b8d]">HELLO, VISION!</span>
          <div className="flex flex-wrap items-center gap-5">
            <span>Local camera tracking — video stays on your device</span>
            <a
              href="/HELLO_VISION_Slides.pdf"
              download="HELLO_VISION_Slides.pdf"
              className="font-medium text-[#a39b8d] transition-colors hover:text-[#e8cc84]"
            >
              Download Slides (PDF)
            </a>
            {onOpenPresentation && (
              <button
                type="button"
                onClick={onOpenPresentation}
                className="cursor-pointer font-medium text-[#d6b15e] transition-colors hover:text-[#e8cc84]"
              >
                Workshop Slides →
              </button>
            )}
          </div>
        </footer>
      </div>

      <CustomGestureModal isOpen={showGestureLab} onClose={() => setShowGestureLab(false)} />
    </div>
  );
}
