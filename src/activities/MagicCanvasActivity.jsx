import { Pause, Play, Rocket, SlidersHorizontal, Sparkles, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import ActivityShell from '../components/ActivityShell.jsx';
import { useVision } from '../context/VisionContext.jsx';
import { ACTIVITIES } from '../data/activities.js';
import {
  FIREWORK_PALETTES,
  FIREWORK_PATTERNS,
  FireworksEngine,
} from '../engines/FireworksEngine.js';
import {
  createMagicCanvasGestureState,
  mapGestureToFireworkAction,
} from '../exercises/magicCanvasMapping.js';

export default function MagicCanvasActivity({ onExit }) {
  const activity = ACTIVITIES.find((item) => item.id === 'magic-canvas');
  const { setInferenceMode, latestFrameRef, hudState, classifierSource, actionBindings } =
    useVision();

  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const gestureStateRef = useRef(createMagicCanvasGestureState());
  const lastFrameTimestampRef = useRef(0);
  const pointerDownRef = useRef(false);

  const [pattern, setPattern] = useState('golden-peony');
  const [palette, setPalette] = useState('imperial');
  const [explosionSize, setExplosionSize] = useState(1.0);
  const [celebrationMode, setCelebrationMode] = useState(false);
  const [celebrationFrequency, setCelebrationFrequency] = useState(1.4);
  const [isPaused, setIsPaused] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [actionBanner, setActionBanner] = useState('Open palm to launch');

  const patternRef = useRef(pattern);
  patternRef.current = pattern;
  const isPausedRef = useRef(isPaused);
  isPausedRef.current = isPaused;
  const classifierSourceRef = useRef(classifierSource);
  classifierSourceRef.current = classifierSource;
  const actionBindingsRef = useRef(actionBindings);
  actionBindingsRef.current = actionBindings;
  const lastBannerRef = useRef(actionBanner);

  const updateBanner = (text) => {
    if (lastBannerRef.current !== text) {
      lastBannerRef.current = text;
      setActionBanner(text);
    }
  };

  useEffect(() => {
    setInferenceMode('gesture');
  }, [setInferenceMode]);

  // Initialize 2D Canvas FireworksEngine and handle window resizing
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new FireworksEngine(canvas);
    engineRef.current = engine;
    engine.start();

    // Opening burst so the stage feels alive on entry
    const welcomeTimer = window.setTimeout(() => {
      engine.launchFirework(engine.width * 0.36, engine.height * 0.34, {
        pattern: 'golden-peony',
      });
      engine.launchFirework(engine.width * 0.64, engine.height * 0.28, {
        pattern: 'crimson-chrysanthemum',
      });
    }, 240);

    const handleResize = () => engine.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.clearTimeout(welcomeTimer);
      window.removeEventListener('resize', handleResize);
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  // Sync interactive controls to FireworksEngine options
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setOptions({
      pattern,
      palette,
      explosionSize,
      celebrationMode,
      celebrationFrequency,
      paused: isPaused,
    });
  }, [pattern, palette, explosionSize, celebrationMode, celebrationFrequency, isPaused]);

  // Bridge live MediaPipe Gesture Recognizer frames -> Magic Canvas mapping
  useEffect(() => {
    let rafId = 0;

    const processVisionFrame = () => {
      rafId = requestAnimationFrame(processVisionFrame);

      const engine = engineRef.current;
      const frame = latestFrameRef.current;
      if (!engine || !frame) return;

      if (frame.timestamp === lastFrameTimestampRef.current) {
        return;
      }
      lastFrameTimestampRef.current = frame.timestamp;

      const action = mapGestureToFireworkAction(
        frame,
        gestureStateRef.current,
        { width: engine.width, height: engine.height },
        patternRef.current,
        performance.now(),
        {
          classifierSource: classifierSourceRef.current,
          actionBindings: actionBindingsRef.current,
        }
      );

      switch (action.type) {
        case 'DRAW_TRAIL':
          if (isPausedRef.current) setIsPaused(false);
          engine.drawTrailPoint(action.x, action.y);
          updateBanner(
            classifierSourceRef.current === 'custom-knn'
              ? `${frame.rawGestureName && frame.rawGestureName !== 'None' ? frame.rawGestureName : 'Custom'} · Trail`
              : 'Drawing trail'
          );
          break;
        case 'LAUNCH_SIDE_FIREWORK':
          if (isPausedRef.current) setIsPaused(false);
          engine.endTrail();
          engine.setTrailCursor(null);
          engine.launchSideFirework(action.side, action.x, action.y);
          updateBanner(
            `${action.gestureLabel ?? 'Launch'} · ${
              FIREWORK_PATTERNS.find((p) => p.id === patternRef.current)?.label ?? 'Firework'
            }`
          );
          break;
        case 'LAUNCH_DUAL':
          if (isPausedRef.current) setIsPaused(false);
          engine.endTrail();
          engine.setTrailCursor(null);
          engine.launchDualFireworks(action.leftPos, action.rightPos);
          updateBanner('Twin launch');
          break;
        case 'GRAND_FINALE_SPREAD':
          if (isPausedRef.current) setIsPaused(false);
          engine.endTrail();
          engine.setTrailCursor(null);
          engine.launchGrandFinaleSpread(action.spread);
          updateBanner(
            action.handCount === 1 && action.gestureLabel
              ? `${action.gestureLabel} · Grand finale`
              : 'Grand finale'
          );
          break;
        case 'CONCENTRATED_BURST':
          if (isPausedRef.current) setIsPaused(false);
          engine.endTrail();
          engine.setTrailCursor(null);
          engine.launchConcentratedBurst(action.x, action.y);
          updateBanner(
            action.handCount === 1 && action.gestureLabel
              ? `${action.gestureLabel} · Central burst`
              : 'Central burst'
          );
          break;
        case 'SWITCH_PATTERN':
          engine.endTrail();
          engine.setTrailCursor(null);
          setPattern(action.pattern.id);
          updateBanner(`Pattern · ${action.pattern.label}`);
          break;
        case 'CLEAR_OR_PAUSE':
          engine.clear();
          setCelebrationMode(false);
          updateBanner('Cleared');
          break;
        case 'END_TRAIL':
        default:
          engine.endTrail();
          engine.setTrailCursor(null);
          break;
      }
    };

    rafId = requestAnimationFrame(processVisionFrame);
    return () => cancelAnimationFrame(rafId);
  }, [latestFrameRef]);

  const handleManualLaunch = () => {
    const engine = engineRef.current;
    if (!engine) return;
    if (isPaused) setIsPaused(false);
    engine.launchFirework();
    const label = FIREWORK_PATTERNS.find((p) => p.id === pattern)?.label ?? 'Firework';
    updateBanner(label);
  };

  const handleClear = () => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.clear();
    updateBanner('Cleared');
  };

  const handleTogglePause = () => {
    setIsPaused((prev) => {
      const next = !prev;
      updateBanner(next ? 'Paused' : 'Resumed');
      return next;
    });
  };

  const handleCanvasPointerDown = (e) => {
    const engine = engineRef.current;
    if (!engine) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (e.shiftKey) {
      pointerDownRef.current = true;
      engine.drawTrailPoint(x, y);
      return;
    }

    if (isPaused) setIsPaused(false);
    engine.launchFirework(x, y);
  };

  const handleCanvasPointerMove = (e) => {
    if (!pointerDownRef.current) return;
    const engine = engineRef.current;
    if (!engine) return;
    const rect = e.currentTarget.getBoundingClientRect();
    engine.drawTrailPoint(e.clientX - rect.left, e.clientY - rect.top);
  };

  const handleCanvasPointerUp = () => {
    if (!pointerDownRef.current) return;
    pointerDownRef.current = false;
    const engine = engineRef.current;
    if (engine) {
      engine.endTrail();
      engine.setTrailCursor(null);
    }
  };

  const activePatternLabel =
    FIREWORK_PATTERNS.find((p) => p.id === pattern)?.label ?? 'Golden Peony';
  const activePaletteLabel =
    FIREWORK_PALETTES.find((p) => p.id === palette)?.label ?? 'Champagne Gold';

  const topControls = (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={handleManualLaunch}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded bg-[#e4c580] px-3 py-1.5 text-xs font-semibold text-[#09090b] transition-colors hover:bg-[#edd49a] focus-visible:outline-2 focus-visible:outline-[#e4c580] whitespace-nowrap shrink-0"
      >
        <Rocket className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Launch</span>
      </button>

      <button
        type="button"
        onClick={() => setCelebrationMode((prev) => !prev)}
        className={`inline-flex cursor-pointer items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
          celebrationMode
            ? 'border-rose-400/50 bg-[#1c0b10]/90 text-rose-200'
            : 'border-white/12 bg-[#090a0d]/88 text-[#d6d2c9] hover:border-white/25 hover:text-[#f2efe9]'
        }`}
      >
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="hidden sm:inline">{celebrationMode ? 'Auto On' : 'Auto'}</span>
      </button>

      <button
        type="button"
        onClick={handleTogglePause}
        aria-label={isPaused ? 'Resume fireworks' : 'Pause fireworks'}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-white/12 bg-[#090a0d]/88 px-3 py-1.5 text-xs font-medium text-[#d6d2c9] transition-colors hover:border-white/25 hover:text-[#f2efe9] whitespace-nowrap shrink-0"
      >
        {isPaused ? (
          <Play className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <Pause className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        <span className="hidden md:inline">{isPaused ? 'Resume' : 'Pause'}</span>
      </button>

      <button
        type="button"
        onClick={handleClear}
        aria-label="Clear canvas"
        className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-white/12 bg-[#090a0d]/88 px-3 py-1.5 text-xs font-medium text-[#d6d2c9] transition-colors hover:border-white/25 hover:text-[#f2efe9] whitespace-nowrap shrink-0"
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="hidden md:inline">Clear</span>
      </button>

      <button
        type="button"
        onClick={() => setShowControls((prev) => !prev)}
        aria-expanded={showControls}
        className={`inline-flex cursor-pointer items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
          showControls
            ? 'border-[#e4c580]/55 bg-[#15120b]/92 text-[#e4c580]'
            : 'border-white/12 bg-[#090a0d]/88 text-[#d6d2c9] hover:border-white/25 hover:text-[#f2efe9]'
        }`}
      >
        <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="hidden sm:inline">Settings</span>
      </button>
    </div>
  );

  return (
    <ActivityShell
      activity={activity}
      onExit={onExit}
      topControls={topControls}
      externalDrawerOpen={showControls}
      onGuideOpen={() => setShowControls(false)}
    >
      <canvas
        ref={canvasRef}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={handleCanvasPointerUp}
        onPointerCancel={handleCanvasPointerUp}
        className="block h-full w-full cursor-crosshair touch-none"
      />

      {showControls && (
        <section
          aria-label="Firework settings"
          className="pointer-events-auto fixed top-16 right-4 z-40 flex max-h-[calc(100dvh-17.5rem)] min-h-[11rem] w-76 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded border border-white/14 bg-[#0b0c10]/96 shadow-2xl sm:right-6"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-white/[0.08] px-4 py-3">
            <h2 className="font-display text-base font-medium tracking-wide text-[#f2efe9]">
              Fireworks
            </h2>
            <button
              type="button"
              onClick={() => setShowControls(false)}
              aria-label="Close firework settings"
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-[#8a857c] hover:bg-white/10 hover:text-[#f2efe9]"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">
            <div>
              <p className="mb-2 text-[11px] font-medium text-[#8a857c]">Pattern</p>
              <div className="grid grid-cols-1 gap-1">
                {FIREWORK_PATTERNS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setPattern(item.id)}
                    className={`cursor-pointer rounded border px-3 py-1.5 text-left text-xs font-medium transition-colors ${
                      pattern === item.id
                        ? 'border-[#e4c580]/50 bg-[#e4c580]/12 text-[#e4c580]'
                        : 'border-white/[0.08] bg-white/[0.02] text-[#c8c3b8] hover:border-white/20 hover:text-[#f2efe9]'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-[11px] font-medium text-[#8a857c]">Palette</p>
              <div className="grid grid-cols-2 gap-1.5">
                {FIREWORK_PALETTES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setPalette(item.id)}
                    className={`flex cursor-pointer items-center gap-2 rounded border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      palette === item.id
                        ? 'border-[#e4c580]/50 bg-[#e4c580]/12 text-[#e4c580]'
                        : 'border-white/[0.08] bg-white/[0.02] text-[#c8c3b8] hover:border-white/20 hover:text-[#f2efe9]'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: item.colors[1] || item.colors[0] }}
                    />
                    <span className="truncate">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between text-xs">
                <label htmlFor="explosion-size" className="font-medium text-[#9b968c]">
                  Scale
                </label>
                <span className="font-mono text-[#e4c580] tabular-nums">
                  {explosionSize.toFixed(1)}×
                </span>
              </div>
              <input
                id="explosion-size"
                type="range"
                min="0.6"
                max="1.6"
                step="0.1"
                value={explosionSize}
                onChange={(e) => setExplosionSize(Number(e.target.value))}
                className="w-full accent-[#e4c580]"
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between text-xs">
                <label htmlFor="celebration-freq" className="font-medium text-[#9b968c]">
                  Auto Pace
                </label>
                <span className="font-mono text-[#e4c580] tabular-nums">
                  {celebrationFrequency.toFixed(1)}/s
                </span>
              </div>
              <input
                id="celebration-freq"
                type="range"
                min="0.5"
                max="3.0"
                step="0.1"
                value={celebrationFrequency}
                onChange={(e) => setCelebrationFrequency(Number(e.target.value))}
                className="w-full accent-[#e4c580]"
              />
            </div>
          </div>
        </section>
      )}

      {hudState.handCount === 2 && (
        <div className="pointer-events-none fixed top-16 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap text-center text-[11px] text-[#e4c580]/90 drop-shadow-[0_1px_6px_rgba(0,0,0,0.95)]">
          <span>Two hands</span>
          <span aria-hidden="true" className="mx-2 text-white/30">·</span>
          <span className="text-[#c8c3b8]">Apart for finale · Closer for burst</span>
        </div>
      )}

      <div className="pointer-events-none fixed bottom-4 left-1/2 z-10 hidden -translate-x-1/2 items-center gap-2 text-[11px] tracking-wide text-[#9b968c] drop-shadow-[0_1px_6px_rgba(0,0,0,0.95)] lg:flex">
        <span className="font-medium text-[#e4c580]">{activePatternLabel}</span>
        <span aria-hidden="true" className="text-white/25">·</span>
        <span>{activePaletteLabel}</span>
        <span aria-hidden="true" className="text-white/25">·</span>
        <span>{actionBanner}</span>
      </div>
    </ActivityShell>
  );
}
