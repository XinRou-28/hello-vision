import { ArrowUpRight } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { useVision } from '../context/VisionContext.jsx';
import { ACTIVITIES } from '../data/activities.js';
import CustomGestureModal from './CustomGestureModal.jsx';

const HERO_MEME_SRC = '/assets/images/image_fd123493.png';

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

    const pointer = { x: width * 0.5, y: height * 0.3 };
    const motes = Array.from({ length: 32 }, (_, i) => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: 0.65 + Math.random() * 1.25,
      vx: (Math.random() - 0.5) * 0.12,
      vy: -0.06 - Math.random() * 0.14,
      phase: Math.random() * Math.PI * 2,
      warm: i % 4 !== 0,
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
        12,
        pointer.x,
        pointer.y,
        Math.min(width, height) * 0.4
      );
      glow.addColorStop(0, 'rgba(214, 177, 94, 0.04)');
      glow.addColorStop(1, 'rgba(5, 5, 7, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);

      for (const mote of motes) {
        if (!prefersReducedMotion) {
          mote.x += mote.vx + Math.sin(time * 0.00055 + mote.phase) * 0.07;
          mote.y += mote.vy;
          if (mote.y < -12) {
            mote.y = height + 12;
            mote.x = Math.random() * width;
          }
          if (mote.x < -12) mote.x = width + 12;
          if (mote.x > width + 12) mote.x = -12;
        }

        const pulse = 0.22 + 0.32 * (0.5 + 0.5 * Math.sin(time * 0.0014 + mote.phase));
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
  return (
    <div className="relative mx-auto w-full max-w-md lg:ml-auto lg:mr-0">
      <div className="relative border border-[#d6b15e]/38 bg-[#0a090c] p-2.5 sm:p-3 shadow-[0_24px_64px_rgba(0,0,0,0.8)]">
        {/* Subtle metallic gold corner accents */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-px -left-px h-3.5 w-3.5 border-t border-l border-[#e8cc84]"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-px -right-px h-3.5 w-3.5 border-t border-r border-[#e8cc84]"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-px -left-px h-3.5 w-3.5 border-b border-l border-[#e8cc84]"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-px -right-px h-3.5 w-3.5 border-b border-r border-[#e8cc84]"
        />

        <div className="relative overflow-hidden border border-[#d6b15e]/22 bg-[#050507]">
          <img
            src={HERO_MEME_SRC}
            alt="It's Alive! Frankenstein meme"
            className="block h-auto w-full select-none"
          />
        </div>
      </div>

      <p className="mt-3 text-center text-xs tracking-wide text-[#9f9788]">
        When your computer finally recognises your gesture.
      </p>
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
    <div className="relative min-h-dvh w-full overflow-x-hidden bg-[#050507] text-[#f6f1e6]">
      <AmbientDustBackdrop />

      {/* Warm overhead cinema spotlight + soft auditorium vignette */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(ellipse_70%_42%_at_50%_-4%,rgba(214,177,94,0.09),transparent_68%),radial-gradient(circle_at_50%_50%,transparent_55%,rgba(0,0,0,0.62)_100%)]"
      />

      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-6xl flex-col justify-between px-6 py-7 sm:px-10 sm:py-10">
        <header className="flex items-center justify-between gap-8 border-b border-[#d6b15e]/20 pb-5">
          <div className="flex items-center gap-3 shrink-0">
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 rotate-45 bg-[#d6b15e]"
            />
            <span className="font-display text-lg font-semibold tracking-[0.16em] uppercase text-[#f6f1e6] whitespace-nowrap">
              HELLO, VISION!
            </span>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-xs font-medium tracking-[0.06em] text-[#9f9788]">
            {ACTIVITIES.map((activity) => (
              <button
                key={activity.id}
                type="button"
                onClick={() => onSelectActivity(activity.id)}
                className="cursor-pointer transition-colors hover:text-[#e8cc84] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#d6b15e] whitespace-nowrap shrink-0"
              >
                {activity.title}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            {onReturnToPresentation && (
              <button
                type="button"
                onClick={onReturnToPresentation}
                className="cursor-pointer rounded-[2px] border border-[#d6b15e]/35 bg-[#0a090c] px-3 py-1.5 text-xs font-medium text-[#e8cc84] transition-colors hover:border-[#d6b15e]/70 whitespace-nowrap shrink-0"
              >
                ← Back to Slides
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowGestureLab(true)}
              className={`cursor-pointer rounded-[2px] border px-3.5 py-1.5 text-xs font-medium tracking-wide transition-colors whitespace-nowrap shrink-0 ${
                classifierSource === 'custom-knn'
                  ? 'border-emerald-400/45 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20'
                  : 'border-[#d6b15e]/25 bg-[#0a090c] text-[#d3cab8] hover:border-[#d6b15e]/55 hover:text-[#f6f1e6]'
              }`}
            >
              {classifierSource === 'custom-knn' ? 'Gestures · KNN' : 'Custom Gestures'}
            </button>

            <button
              type="button"
              onClick={() => onSelectActivity(ACTIVITIES[0].id)}
              className="cursor-pointer rounded-[2px] border border-[#e8cc84]/60 bg-[#d6b15e] px-4 py-1.5 text-xs font-semibold tracking-[0.08em] uppercase text-[#09080a] transition-colors hover:bg-[#e8cc84] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d6b15e] whitespace-nowrap shrink-0"
            >
              Enter
            </button>
          </div>
        </header>

        <main className="my-auto py-12 sm:py-16">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-12">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              className="lg:col-span-7"
            >
              <h1 className="font-display text-5xl font-semibold tracking-[0.035em] leading-[0.94] text-balance text-[#f7f2e8] sm:text-7xl lg:text-[5rem]">
                HELLO<span className="tracking-normal">,</span> VISION<span className="tracking-normal">!</span>
              </h1>

              <div aria-hidden="true" className="mt-6 h-px w-24 bg-gradient-to-r from-[#d6b15e]/80 to-transparent" />

              <p className="mt-6 max-w-xl text-sm leading-relaxed text-[#b8b0a2] sm:text-base">
                Exploring Computer Vision, Machine Learning &amp; Gesture Recognition.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
              className="lg:col-span-5"
            >
              <CinemaMemeFrame />
            </motion.div>
          </div>

          <div className="mt-14 grid grid-cols-1 gap-5 lg:mt-16 lg:grid-cols-3">
            {ACTIVITIES.map((activity, idx) => (
              <motion.article
                key={activity.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.45,
                  delay: 0.06 * (idx + 1),
                  ease: [0.16, 1, 0.3, 1],
                }}
                className="group relative flex flex-col justify-between overflow-hidden rounded-[2px] border border-[#d6b15e]/20 bg-[#0b0a0d] p-7 transition-colors duration-200 hover:border-[#d6b15e]/50 hover:bg-[#100f14]"
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#d6b15e]/70 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                />

                <div>
                  <div className="flex items-center justify-between gap-4 border-b border-[#d6b15e]/12 pb-3.5 text-xs">
                    <span className="font-mono font-medium tracking-[0.14em] text-[#d6b15e] tabular-nums">
                      {activity.index}
                    </span>
                    <span className="tracking-wide text-[#8f8778]">{activity.mediumLabel}</span>
                  </div>

                  <h2 className="mt-6 font-display text-3xl font-semibold tracking-[0.02em] text-[#f6f1e6]">
                    {activity.title}
                  </h2>
                  <p className="mt-1 text-xs font-medium tracking-wide text-[#b59c62]">
                    {activity.subtitle}
                  </p>

                  <p className="mt-4 text-sm leading-relaxed text-[#b2aa9c]">
                    {activity.description}
                  </p>
                </div>

                <div className="mt-8 border-t border-white/[0.07] pt-4">
                  <button
                    type="button"
                    onClick={() => onSelectActivity(activity.id)}
                    className="inline-flex w-full cursor-pointer items-center justify-between text-xs font-semibold tracking-[0.12em] uppercase text-[#d6b15e] transition-colors hover:text-[#f0d897] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#d6b15e]"
                  >
                    <span>Enter</span>
                    <ArrowUpRight
                      className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                      aria-hidden="true"
                    />
                  </button>
                </div>
              </motion.article>
            ))}
          </div>
        </main>

        <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-[#d6b15e]/15 pt-5 text-xs text-[#7f7768]">
          <span className="tracking-[0.14em] uppercase">HELLO, VISION!</span>
          <div className="flex flex-wrap items-center gap-5">
            <span>Local camera tracking — video stays on your device</span>
            {onOpenPresentation && (
              <button
                type="button"
                onClick={onOpenPresentation}
                className="cursor-pointer text-[#b59c62] transition-colors hover:text-[#e8cc84]"
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
