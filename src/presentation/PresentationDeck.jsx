import { ArrowLeft, ChevronLeft, ChevronRight, Maximize2, Minimize2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PRESENTATION_SLIDES } from './slidesData.js';
import SlideVisuals from './SlideVisuals.jsx';

const BASE_WIDTH = 1280;
const BASE_HEIGHT = 720;

export default function PresentationDeck({
  initialSlideIndex = 0,
  onSlideChange,
  onOpenApp,
}) {
  const [slideIndex, setSlideIndex] = useState(() =>
    Math.max(0, Math.min(PRESENTATION_SLIDES.length - 1, initialSlideIndex))
  );
  const [revealStep, setRevealStep] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [stageScale, setStageScale] = useState(0.75);

  const stageHostRef = useRef(null);
  const rootRef = useRef(null);

  const currentSlide = PRESENTATION_SLIDES[slideIndex];
  const maxRevealIndex = Math.max(0, (currentSlide.revealCount || 1) - 1);
  const progressPct = ((slideIndex + 1) / PRESENTATION_SLIDES.length) * 100;
  const formattedSlideNumber = `${String(currentSlide.number).padStart(2, '0')} / ${String(
    PRESENTATION_SLIDES.length
  ).padStart(2, '0')}`;

  useEffect(() => {
    onSlideChange?.(slideIndex);
  }, [slideIndex, onSlideChange]);

  useEffect(() => {
    const host = stageHostRef.current;
    if (!host) return undefined;

    const updateScale = () => {
      const rect = host.getBoundingClientRect();
      const padX = 32;
      const padY = 24;
      const availW = Math.max(320, rect.width - padX);
      const availH = Math.max(200, rect.height - padY);
      const scale = Math.min(availW / BASE_WIDTH, availH / BASE_HEIGHT);
      setStageScale(Math.max(0.2, Math.min(1.5, scale)));
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(host);
    window.addEventListener('resize', updateScale);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateScale);
    };
  }, []);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

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

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 flex h-dvh w-screen flex-col overflow-hidden bg-[#F1F3F4] text-[#202124]"
      style={{ fontFamily: '"Plus Jakarta Sans", system-ui, -apple-system, sans-serif' }}
    >
      {/* Top Progress Bar */}
      <div className="h-1 w-full bg-[#E8EAED]">
        <div
          className="h-full transition-all duration-300"
          style={{
            width: `${progressPct}%`,
            background:
              'linear-gradient(90deg, #4285F4 0%, #EA4335 35%, #FBBC05 70%, #34A853 100%)',
          }}
        />
      </div>

      {/* Minimal Presentation Toolbar */}
      <header className="flex h-13 shrink-0 items-center justify-between gap-6 border-b border-[#DADCE0] bg-[#FFFFFF] px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => handleOpenAppFromSlide(null)}
            className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-[#DADCE0] bg-[#FFFFFF] px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-[#202124] transition-colors hover:bg-[#F8F9FA]"
          >
            <ArrowLeft className="h-3.5 w-3.5 text-[#5F6368]" />
            <span>Workshop App</span>
          </button>

          <span className="hidden truncate text-xs font-semibold text-[#5F6368] sm:inline">
            GDG On Campus UM · HELLO, VISION!
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="flex items-center rounded-lg border border-[#DADCE0] bg-[#F8F9FA] p-0.5">
            <button
              type="button"
              onClick={retreat}
              disabled={slideIndex === 0 && revealStep === 0}
              aria-label="Previous slide"
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[#202124] hover:bg-white disabled:cursor-not-allowed disabled:opacity-35"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-3 font-mono text-xs font-semibold whitespace-nowrap text-[#202124] tabular-nums">
              {formattedSlideNumber}
            </span>
            <button
              type="button"
              onClick={advance}
              disabled={
                slideIndex === PRESENTATION_SLIDES.length - 1 && revealStep >= maxRevealIndex
              }
              aria-label="Next slide"
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[#202124] hover:bg-white disabled:cursor-not-allowed disabled:opacity-35"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label="Toggle fullscreen"
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-[#DADCE0] bg-white text-[#5F6368] hover:bg-[#F8F9FA] hover:text-[#202124]"
          >
            {isFullscreen ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </header>

      {/* Main 1280x720 Projected Stage */}
      <main
        ref={stageHostRef}
        className="relative flex flex-1 items-center justify-center overflow-hidden bg-[#F1F3F4]"
      >
        <div
          style={{
            width: BASE_WIDTH,
            height: BASE_HEIGHT,
            transform: `scale(${stageScale})`,
            transformOrigin: 'center center',
          }}
          className="relative shrink-0 overflow-hidden rounded-xl border border-[#DADCE0] bg-[#FFFFFF] px-12 pt-10 pb-14 shadow-[0_14px_40px_rgba(32,33,36,0.08)]"
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={currentSlide.id}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
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

          {/* Subtle consistent bottom slide number */}
          <div
            aria-label={`Slide ${currentSlide.number} of ${PRESENTATION_SLIDES.length}`}
            className="pointer-events-none absolute right-12 bottom-4 font-mono text-xs font-medium tracking-wider text-[#80868B] tabular-nums"
          >
            {formattedSlideNumber}
          </div>
        </div>
      </main>
    </div>
  );
}
