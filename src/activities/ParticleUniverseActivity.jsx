import { SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import ActivityShell from '../components/ActivityShell.jsx';
import { useVision } from '../context/VisionContext.jsx';
import { ACTIVITIES, PARTICLE_SHAPES } from '../data/activities.js';
import { PARTICLE_PALETTES, ParticleEngine } from '../engines/ParticleEngine.js';
import {
  calculateParticleInteraction,
  createParticleUniverseState,
} from '../exercises/particleUniverseMapping.js';

export default function ParticleUniverseActivity({ onExit }) {
  const activity = ACTIVITIES.find((item) => item.id === 'particle-universe');
  const { setInferenceMode, latestFrameRef, hudState, classifierSource, actionBindings } =
    useVision();

  const mountRef = useRef(null);
  const engineRef = useRef(null);
  const interactionStateRef = useRef(createParticleUniverseState());
  const lastFrameTimestampRef = useRef(0);

  const [activeShape, setActiveShape] = useState(PARTICLE_SHAPES[0].id);
  const [paletteId, setPaletteId] = useState(PARTICLE_PALETTES[0].id);
  const [density, setDensity] = useState(10000);
  const [glowIntensity, setGlowIntensity] = useState(1.6);
  const [pointScale, setPointScale] = useState(1.6);
  const [twinkle, setTwinkle] = useState(true);
  const [autoOrbit, setAutoOrbit] = useState(true);
  const [showAppearance, setShowAppearance] = useState(false);
  const [statusLabel, setStatusLabel] = useState('Move hand to steer');

  const activeShapeRef = useRef(activeShape);
  activeShapeRef.current = activeShape;
  const classifierSourceRef = useRef(classifierSource);
  classifierSourceRef.current = classifierSource;
  const actionBindingsRef = useRef(actionBindings);
  actionBindingsRef.current = actionBindings;
  const lastStatusRef = useRef(statusLabel);

  const pointerDragRef = useRef({ active: false, startX: 0, startY: 0, rotY: 0, rotX: 0.14 });

  const updateStatusLabel = (text) => {
    if (lastStatusRef.current !== text) {
      lastStatusRef.current = text;
      setStatusLabel(text);
    }
  };

  useEffect(() => {
    setInferenceMode('gesture');
  }, [setInferenceMode]);

  // Mount Three.js ParticleEngine once in isolated container
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const engine = new ParticleEngine(mount);
    engineRef.current = engine;
    engine.start();

    const handleResize = () => engine.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  // Sync shape, palette, density & effects into engine without recreating geometry
  useEffect(() => {
    engineRef.current?.setShape(activeShape);
  }, [activeShape]);

  useEffect(() => {
    engineRef.current?.setPalette(paletteId);
  }, [paletteId]);

  useEffect(() => {
    engineRef.current?.setDensity(density);
  }, [density]);

  useEffect(() => {
    engineRef.current?.setEffects({
      glowIntensity,
      pointScale,
      twinkle: twinkle ? 0.85 : 0.0,
      autoOrbit,
    });
  }, [glowIntensity, pointScale, twinkle, autoOrbit]);

  // Bridge live MediaPipe Gesture Recognizer predictions -> 3D ParticleEngine
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

      const resolved = calculateParticleInteraction(
        frame,
        interactionStateRef.current,
        activeShapeRef.current,
        performance.now(),
        {
          classifierSource: classifierSourceRef.current,
          actionBindings: actionBindingsRef.current,
        }
      );

      if (resolved.nextShape) {
        setActiveShape(resolved.nextShape.id);
      }

      if (!pointerDragRef.current.active) {
        engine.setInteraction(resolved.engineInteraction);
      }

      const compactStatus =
        resolved.statusLabel === 'Show a hand to sculpt particles'
          ? 'Move hand to steer'
          : resolved.statusLabel;
      updateStatusLabel(compactStatus);
    };

    rafId = requestAnimationFrame(processVisionFrame);
    return () => cancelAnimationFrame(rafId);
  }, [latestFrameRef]);

  // Pointer drag fallback for exploring 3D formations without a webcam
  const handlePointerDown = (e) => {
    const engine = engineRef.current;
    if (!engine) return;
    pointerDragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      rotY: engine.smoothed.rotY,
      rotX: engine.smoothed.rotX,
    };
  };

  const handlePointerMove = (e) => {
    const drag = pointerDragRef.current;
    const engine = engineRef.current;
    if (!drag.active || !engine) return;
    const dx = (e.clientX - drag.startX) / Math.max(1, window.innerWidth);
    const dy = (e.clientY - drag.startY) / Math.max(1, window.innerHeight);
    engine.setInteraction({
      manualControlActive: true,
      targetRotY: drag.rotY + dx * 4.2,
      targetRotX: drag.rotX + dy * 2.4,
    });
  };

  const handlePointerUp = () => {
    if (!pointerDragRef.current.active) return;
    pointerDragRef.current.active = false;
    engineRef.current?.setInteraction({ manualControlActive: false });
  };

  const currentShapeLabel =
    PARTICLE_SHAPES.find((s) => s.id === activeShape)?.label ?? 'Spiral Galaxy';
  const currentPaletteLabel =
    PARTICLE_PALETTES.find((p) => p.id === paletteId)?.label ?? 'Celestial Mist';

  const topControls = (
    <div className="flex items-center gap-1.5">
      <div className="hidden lg:flex items-center gap-0.5 rounded border border-white/12 bg-[#090a0d]/88 p-0.5">
        {PARTICLE_SHAPES.map((shape) => (
          <button
            key={shape.id}
            type="button"
            onClick={() => setActiveShape(shape.id)}
            className={`cursor-pointer rounded-sm px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              activeShape === shape.id
                ? 'bg-[#e4c580]/16 text-[#e4c580]'
                : 'text-[#9b968c] hover:text-[#f2efe9]'
            }`}
          >
            {shape.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setShowAppearance((prev) => !prev)}
        aria-expanded={showAppearance}
        className={`inline-flex cursor-pointer items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
          showAppearance
            ? 'border-[#e4c580]/55 bg-[#15120b]/92 text-[#e4c580]'
            : 'border-white/12 bg-[#090a0d]/88 text-[#d6d2c9] hover:border-white/25 hover:text-[#f2efe9]'
        }`}
      >
        <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Settings</span>
      </button>
    </div>
  );

  return (
    <ActivityShell
      activity={activity}
      onExit={onExit}
      topControls={topControls}
      externalDrawerOpen={showAppearance}
      onGuideOpen={() => setShowAppearance(false)}
    >
      <div
        ref={mountRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="h-full w-full cursor-grab active:cursor-grabbing touch-none"
      />

      {/* Compact mobile shape switcher */}
      <div className="pointer-events-auto fixed top-16 left-1/2 z-10 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap justify-center gap-0.5 rounded border border-white/12 bg-[#090a0d]/92 p-0.5 lg:hidden">
        {PARTICLE_SHAPES.map((shape) => (
          <button
            key={shape.id}
            type="button"
            onClick={() => setActiveShape(shape.id)}
            className={`cursor-pointer rounded-sm px-2 py-1 text-[11px] font-medium whitespace-nowrap shrink-0 ${
              activeShape === shape.id
                ? 'bg-[#e4c580]/16 text-[#e4c580]'
                : 'text-[#9b968c]'
            }`}
          >
            {shape.label}
          </button>
        ))}
      </div>

      {hudState.handCount === 2 && (
        <div className="pointer-events-none fixed top-16 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap text-center text-[11px] text-[#e4c580]/90 lg:block">
          <span>Two hands</span>
          <span aria-hidden="true" className="mx-2 text-white/30">·</span>
          <span className="text-[#c8c3b8]">Apart to expand · Closer to compress</span>
        </div>
      )}

      {/* Quiet settings drawer (no backdrop-filter over WebGL) */}
      {showAppearance && (
        <section
          aria-label="Particle settings"
          className="pointer-events-auto fixed top-16 right-4 z-40 flex max-h-[calc(100dvh-17.5rem)] min-h-[11rem] w-76 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded border border-white/14 bg-[#0b0c10]/96 shadow-2xl sm:right-6"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-white/[0.08] px-4 py-3">
            <h2 className="font-display text-base font-medium tracking-wide text-[#f2efe9]">
              Universe
            </h2>
            <button
              type="button"
              onClick={() => setShowAppearance(false)}
              aria-label="Close particle settings"
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-[#8a857c] hover:bg-white/10 hover:text-[#f2efe9]"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">
            <div>
              <p className="mb-2 text-[11px] font-medium text-[#8a857c]">Palette</p>
              <div className="grid grid-cols-2 gap-1.5">
                {PARTICLE_PALETTES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setPaletteId(item.id)}
                    className={`flex cursor-pointer items-center gap-2 rounded border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      paletteId === item.id
                        ? 'border-[#e4c580]/50 bg-[#e4c580]/12 text-[#e4c580]'
                        : 'border-white/[0.08] bg-white/[0.02] text-[#c8c3b8] hover:border-white/20 hover:text-[#f2efe9]'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: item.colors[2] }}
                    />
                    <span className="truncate">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between text-xs">
                <label htmlFor="particle-density" className="font-medium text-[#9b968c]">
                  Density
                </label>
                <span className="font-mono text-[#e4c580] tabular-nums">
                  {density.toLocaleString()}
                </span>
              </div>
              <input
                id="particle-density"
                type="range"
                min="2500"
                max="10000"
                step="500"
                value={density}
                onChange={(e) => setDensity(Number(e.target.value))}
                className="w-full accent-[#e4c580]"
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between text-xs">
                <label htmlFor="particle-glow" className="font-medium text-[#9b968c]">
                  Glow
                </label>
                <span className="font-mono text-[#e4c580] tabular-nums">
                  {glowIntensity.toFixed(1)}×
                </span>
              </div>
              <input
                id="particle-glow"
                type="range"
                min="0.4"
                max="1.6"
                step="0.1"
                value={glowIntensity}
                onChange={(e) => setGlowIntensity(Number(e.target.value))}
                className="w-full accent-[#e4c580]"
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between text-xs">
                <label htmlFor="particle-size" className="font-medium text-[#9b968c]">
                  Scale
                </label>
                <span className="font-mono text-[#e4c580] tabular-nums">
                  {pointScale.toFixed(1)}×
                </span>
              </div>
              <input
                id="particle-size"
                type="range"
                min="0.6"
                max="1.6"
                step="0.1"
                value={pointScale}
                onChange={(e) => setPointScale(Number(e.target.value))}
                className="w-full accent-[#e4c580]"
              />
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={() => setTwinkle((prev) => !prev)}
                className={`flex-1 cursor-pointer rounded border px-3 py-1.5 text-xs font-medium transition-colors ${
                  twinkle
                    ? 'border-[#e4c580]/50 bg-[#e4c580]/12 text-[#e4c580]'
                    : 'border-white/[0.08] bg-white/[0.02] text-[#8a857c]'
                }`}
              >
                Shimmer: {twinkle ? 'On' : 'Off'}
              </button>
              <button
                type="button"
                onClick={() => setAutoOrbit((prev) => !prev)}
                className={`flex-1 cursor-pointer rounded border px-3 py-1.5 text-xs font-medium transition-colors ${
                  autoOrbit
                    ? 'border-[#e4c580]/50 bg-[#e4c580]/12 text-[#e4c580]'
                    : 'border-white/[0.08] bg-white/[0.02] text-[#8a857c]'
                }`}
              >
                Orbit: {autoOrbit ? 'On' : 'Off'}
              </button>
            </div>
          </div>
        </section>
      )}

      <div className="pointer-events-none fixed bottom-4 left-1/2 z-10 hidden -translate-x-1/2 items-center gap-2 text-[11px] tracking-wide text-[#9b968c] lg:flex">
        <span className="font-medium text-[#e4c580]">{currentShapeLabel}</span>
        <span aria-hidden="true" className="text-white/25">·</span>
        <span>{currentPaletteLabel}</span>
        <span aria-hidden="true" className="text-white/25">·</span>
        <span>{statusLabel}</span>
      </div>
    </ActivityShell>
  );
}
