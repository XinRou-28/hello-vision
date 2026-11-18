import { ArrowLeft, ChevronLeft, ChevronRight, Download, Maximize2, Minimize2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PRESENTATION_SLIDES } from './slidesData.js';
import SlideVisuals from './SlideVisuals.jsx';

const BASE_WIDTH = 1280;
const BASE_HEIGHT = 720;

function isPrintModeActive() {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('print') === '1';
}

export default function PresentationDeck({
  initialSlideIndex = 0,
  onSlideChange,
  onOpenApp,
}) {
  const printMode = isPrintModeActive();
  const [slideIndex, setSlideIndex] = useState(() =>
    Math.max(0, Math.min(PRESENTATION_SLIDES.length - 1, initialSlideIndex))
  );
  const [revealStep, setRevealStep] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [stageScale, setStageScale] = useState(0.75);
  const [hudVisible, setHudVisible] = useState(true);

  const stageHostRef = useRef(null);
  const rootRef = useRef(null);
  const hideTimerRef = useRef(null);

  const currentSlide = PRESENTATION_SLIDES[slideIndex];
  const maxRevealIndex = Math.max(0, (currentSlide.revealCount || 1) - 1);
  const progressPct = ((slideIndex + 1) / PRESENTATION_SLIDES.length) * 100;
  const formattedSlideNumber = `${String(currentSlide.number).padStart(2, '0')} / ${String(
    PRESENTATION_SLIDES.length
  ).padStart(2, '0')}`;

  useEffect(() => {
    onSlideChange?.(slideIndex);
  }, [slideIndex, onSlideChange]);

  const wakeHud = useCallback(() => {
    setHudVisible(true);
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }
    hideTimerRef.current = setTimeout(() => {
      setHudVisible(false);
    }, 2400);
  }, []);

  useEffect(() => {
    wakeHud();
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, [wakeHud]);

  useEffect(() => {
    const host = stageHostRef.current;
    if (!host) return undefined;

    const updateScale = () => {
      const rect = host.getBoundingClientRect();
      const padX = isFullscreen ? 0 : 28;
      const padY = isFullscreen ? 0 : 24;
      const availW = Math.max(320, rect.width - padX);
      const availH = Math.max(200, rect.height - padY);
      const scale = Math.min(availW / BASE_WIDTH, availH / BASE_HEIGHT);
      setStageScale(Math.max(0.2, Math.min(2, scale)));
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(host);
    window.addEventListener('resize', updateScale);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateScale);
    };
  }, [isFullscreen]);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
      wakeHud();
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, [wakeHud]);

  const advance = useCallback(() => {
    if (revealStep < maxRevealIndex) {
      setRevealStep((prev) => prev + 1);
      return;
    }
    if (slideIndex < PRESENTATION_SLIDES.length - 1) {
      setSlideIndex((prev) => prev + 1);
      setRevealStep(0);
    }
  }, [revealStep, maxRevealIndex, slideIndex]);

  const retreat = useCallback(() => {
    if (revealStep > 0) {
      setRevealStep((prev) => prev - 1);
      return;
    }
    if (slideIndex > 0) {
      const prevSlide = PRESENTATION_SLIDES[slideIndex - 1];
      setSlideIndex((prev) => prev - 1);
      setRevealStep(Math.max(0, (prevSlide.revealCount || 1) - 1));
    }
  }, [revealStep, slideIndex]);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await (rootRef.current || document.documentElement).requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Ignore fullscreen denial inside restricted iframes
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        advance();
        return;
      }

      if (e.key === ' ') {
        e.preventDefault();
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        advance();
        return;
      }

      if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        retreat();
        return;
      }

      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
        return;
      }

      if (
        e.key === 'Enter' &&
        slideIndex === PRESENTATION_SLIDES.length - 1 &&
        tag !== 'BUTTON' &&
        tag !== 'A'
      ) {
        e.preventDefault();
        onOpenApp?.(null, slideIndex);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [advance, retreat, toggleFullscreen, slideIndex, onOpenApp]);

  const handleOpenAppFromSlide = useCallback(
    (target) => {
      onOpenApp?.(target, slideIndex);
    },
    [onOpenApp, slideIndex]
  );

  if (printMode) {
    return (
      <div
        className="bg-white text-[#202124]"
        style={{ fontFamily: '"Plus Jakarta Sans", system-ui, -apple-system, sans-serif' }}
      >
        {PRESENTATION_SLIDES.map((slide, idx) => {
          const slideNum = `${String(slide.number).padStart(2, '0')} / ${String(
            PRESENTATION_SLIDES.length
          ).padStart(2, '0')}`;
          const revealMax = Math.max(0, (slide.revealCount || 1) - 1);

          return (
            <section
              key={slide.id}
              style={{
                width: BASE_WIDTH,
                height: BASE_HEIGHT,
                breakAfter: idx < PRESENTATION_SLIDES.length - 1 ? 'page' : 'auto',
                pageBreakAfter: idx < PRESENTATION_SLIDES.length - 1 ? 'always' : 'auto',
              }}
              className="relative overflow-hidden bg-[#FFFFFF] px-12 pt-10 pb-14"
            >
              <SlideVisuals
                slide={slide}
                revealStep={revealMax}
                onSetRevealStep={() => {}}
                onOpenApp={() => {}}
              />
              <div className="pointer-events-none absolute right-12 bottom-4 font-mono text-xs font-medium tracking-wider text-[#80868B] tabular-nums">
                {slideNum}
              </div>
            </section>
          );
        })}
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      onPointerMove={wakeHud}
      className="fixed inset-0 flex h-dvh w-screen flex-col overflow-hidden bg-[#0a0a0d] text-[#202124]"
      style={{ fontFamily: '"Plus Jakarta Sans", system-ui, -apple-system, sans-serif' }}
    >
      {/* Subtle theater backdrop warmth */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_75%_60%_at_50%_45%,rgba(255,255,255,0.045),transparent_72%)]"
      />

      {/* Full-Viewport 1280x720 Projected Slide Stage */}
      <main
        ref={stageHostRef}
        className="relative z-10 flex h-full w-full flex-1 items-center justify-center overflow-hidden"
      >
        <div
          style={{
            width: BASE_WIDTH,
            height: BASE_HEIGHT,
            transform: `scale(${stageScale})`,
            transformOrigin: 'center center',
          }}
          className={`relative shrink-0 overflow-hidden bg-[#FFFFFF] px-12 pt-10 pb-14 transition-shadow duration-300 ${
            isFullscreen
              ? 'rounded-none border-0 shadow-none'
              : 'rounded-xl border border-white/10 shadow-[0_28px_84px_rgba(0,0,0,0.65)]'
          }`}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={currentSlide.id}
              initial={{ opacity: 0, x: 14 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -14 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="h-full w-full"
            >
              <SlideVisuals
                slide={currentSlide}
                revealStep={revealStep}
                onSetRevealStep={setRevealStep}
                onOpenApp={handleOpenAppFromSlide}
              />
            </motion.div>
          </AnimatePresence>

          {currentSlide.revealCount > 1 && (
            <div className="pointer-events-none absolute bottom-4.5 left-12 flex items-center gap-1.5">
              {Array.from({ length: currentSlide.revealCount }).map((_, idx) => (
                <span
                  key={idx}
                  className={`h-1.5 rounded-full transition-all ${
                    idx <= revealStep ? 'w-4 bg-[#4285F4]' : 'w-1.5 bg-[#DADCE0]'
                  }`}
                />
              ))}
            </div>
          )}

          {/* Subtle consistent bottom slide number inside slide stage */}
          <div
            aria-label={`Slide ${currentSlide.number} of ${PRESENTATION_SLIDES.length}`}
            className="pointer-events-none absolute right-12 bottom-4 font-mono text-xs font-medium tracking-wider text-[#80868B] tabular-nums"
          >
            {formattedSlideNumber}
          </div>
        </div>
      </main>

      {/* Auto-hiding minimal floating slide HUD (no top bar) */}
      <div
        onMouseEnter={() => setHudVisible(true)}
        onFocus={() => setHudVisible(true)}
        className={`fixed bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-white/15 bg-[#121216]/85 px-2 py-1.5 text-white shadow-[0_16px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl transition-opacity duration-300 ${
          hudVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <button
          type="button"
          onClick={() => handleOpenAppFromSlide(null)}
          aria-label="Exit to Workshop App"
          className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3 text-xs font-medium whitespace-nowrap text-[#e6dfd1] transition-colors hover:bg-white/10 hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5 text-[#d6b15e]" aria-hidden="true" />
          <span>Workshop App</span>
        </button>

        <span aria-hidden="true" className="h-4 w-px bg-white/15" />

        <button
          type="button"
          onClick={retreat}
          disabled={slideIndex === 0 && revealStep === 0}
          aria-label="Previous slide"
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-white/85 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>

        <span className="px-2 font-mono text-xs font-medium whitespace-nowrap text-[#e6dfd1] tabular-nums">
          {formattedSlideNumber}
        </span>

        <button
          type="button"
          onClick={advance}
          disabled={slideIndex === PRESENTATION_SLIDES.length - 1 && revealStep >= maxRevealIndex}
          aria-label="Next slide"
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-white/85 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>

        <span aria-hidden="true" className="h-4 w-px bg-white/15" />

        <a
          href="/HELLO_VISION_Slides.pdf"
          download="HELLO_VISION_Slides.pdf"
          aria-label="Download slides as PDF"
          className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3 text-xs font-medium whitespace-nowrap text-[#e6dfd1] transition-colors hover:bg-white/10 hover:text-white"
        >
          <Download className="h-3.5 w-3.5 text-[#d6b15e]" aria-hidden="true" />
          <span>PDF</span>
        </a>

        <button
          type="button"
          onClick={toggleFullscreen}
          aria-label="Toggle fullscreen"
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-white/85 transition-colors hover:bg-white/10 hover:text-white"
        >
          {isFullscreen ? (
            <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Whisper-thin bottom progress hairline */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-20 h-[2px] bg-white/[0.06]"
      >
        <div
          className="h-full transition-all duration-300"
          style={{
            width: `${progressPct}%`,
            background:
              'linear-gradient(90deg, #4285F4 0%, #EA4335 35%, #FBBC05 70%, #34A853 100%)',
          }}
        />
      </div>
    </div>
  );
}
