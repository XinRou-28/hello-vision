import { ArrowLeft, BookOpen, Cpu, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useVision } from '../context/VisionContext.jsx';
import CustomGestureModal from './CustomGestureModal.jsx';
import VisionDebugOverlay from './VisionDebugOverlay.jsx';
import WebcamPip from './WebcamPip.jsx';

export default function ActivityShell({
  activity,
  onExit,
  children,
  topControls = null,
  showWebcamPip = true,
  externalDrawerOpen = false,
  onGuideOpen = null,
}) {
  const [showGuide, setShowGuide] = useState(false);
  const [showGestureLab, setShowGestureLab] = useState(false);
  const { classifierSource } = useVision();
  const supportsCustomGesture = activity?.modelType === 'Gesture Recognizer';

  useEffect(() => {
    if (externalDrawerOpen) {
      setShowGuide(false);
    }
  }, [externalDrawerOpen]);

  return (
    <div className="fixed inset-0 h-dvh w-screen overflow-hidden bg-[#070709] text-[#f2efe9]">
      <div className="absolute inset-0 z-0">{children}</div>

      <header className="pointer-events-none fixed inset-x-0 top-0 z-20 flex items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
        <div className="pointer-events-auto flex items-center gap-3">
          <button
            type="button"
            onClick={onExit}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-white/12 bg-[#090a0d]/88 px-3 py-1.5 text-xs font-medium text-[#d6d2c9] transition-colors hover:border-white/25 hover:text-[#f2efe9] focus-visible:outline-2 focus-visible:outline-[#e4c580] whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Exit</span>
          </button>

          <div className="flex min-w-0 items-baseline gap-2.5 drop-shadow-[0_1px_10px_rgba(0,0,0,0.85)]">
            <span className="hidden sm:inline font-display text-xs tracking-[0.16em] uppercase text-[#9b968c] whitespace-nowrap shrink-0">
              HELLO VISION
            </span>
            <span aria-hidden="true" className="hidden sm:inline text-xs text-white/25">
              /
            </span>
            <h1 className="truncate font-display text-lg font-medium tracking-wide text-[#f2efe9] sm:text-xl">
              {activity.title}
            </h1>
          </div>
        </div>

        <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2">
          {topControls}

          {supportsCustomGesture && (
            <button
              type="button"
              onClick={() => setShowGestureLab(true)}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-[#e4c580] whitespace-nowrap shrink-0 ${
                classifierSource === 'custom-knn'
                  ? 'border-emerald-400/45 bg-[#091512]/90 text-emerald-200 hover:border-emerald-400/70'
                  : 'border-white/12 bg-[#090a0d]/88 text-[#d6d2c9] hover:border-white/25 hover:text-[#f2efe9]'
              }`}
            >
              <Cpu className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">
                {classifierSource === 'custom-knn' ? 'Gestures · KNN' : 'Gestures'}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setShowGuide((prev) => {
                const next = !prev;
                if (next && onGuideOpen) onGuideOpen();
                return next;
              });
            }}
            aria-expanded={showGuide}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-[#e4c580] whitespace-nowrap shrink-0 ${
              showGuide
                ? 'border-[#e4c580]/55 bg-[#15120b]/92 text-[#e4c580]'
                : 'border-white/12 bg-[#090a0d]/88 text-[#d6d2c9] hover:border-white/25 hover:text-[#f2efe9]'
            }`}
          >
            <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Guide</span>
          </button>
        </div>
      </header>

      <AnimatePresence>
        {showGuide && (
          <motion.section
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            aria-label="Activity controls"
            className="pointer-events-auto fixed top-16 right-4 z-40 flex max-h-[calc(100dvh-17.5rem)] min-h-[11rem] w-76 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded border border-white/14 bg-[#0b0c10]/96 shadow-2xl sm:right-6"
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.08] px-4 py-3">
              <div>
                <h2 className="font-display text-base font-medium tracking-wide text-[#f2efe9]">
                  Controls
                </h2>
                <p className="text-[11px] text-[#8a857c]">{activity.subtitle}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                aria-label="Close guide"
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-[#8a857c] hover:bg-white/10 hover:text-[#f2efe9]"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3">
              <ul className="space-y-2">
                {activity.instructions.map((item) => (
                  <li
                    key={item.gesture}
                    className="flex items-baseline justify-between gap-4 border-b border-white/[0.05] pb-2 text-xs last:border-b-0 last:pb-0"
                  >
                    <span className="font-medium text-[#e4c580] shrink-0">{item.gesture}</span>
                    <span className="text-right text-[#b5b0a6]">{item.action}</span>
                  </li>
                ))}
              </ul>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      <VisionDebugOverlay />
      {showWebcamPip && <WebcamPip modelLabel={activity.mediumLabel ?? activity.modelType} />}
      {supportsCustomGesture && (
        <CustomGestureModal isOpen={showGestureLab} onClose={() => setShowGestureLab(false)} />
      )}
    </div>
  );
}
