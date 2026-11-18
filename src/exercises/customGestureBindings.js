export const MAGIC_CANVAS_ACTION_OPTIONS = [
  { id: 'none', label: 'No Action' },
  { id: 'LAUNCH_FIREWORK', label: 'Launch Firework' },
  { id: 'DRAW_TRAIL', label: 'Draw Light Ribbon' },
  { id: 'SWITCH_PATTERN', label: 'Switch Pattern' },
  { id: 'CLEAR_SKY', label: 'Clear Sky' },
  { id: 'GRAND_FINALE', label: 'Grand Finale Burst' },
  { id: 'CONCENTRATED_BURST', label: 'Concentrated Starburst' },
];

export const PARTICLE_UNIVERSE_ACTION_OPTIONS = [
  { id: 'none', label: 'No Action (Rotate & Scale Only)' },
  { id: 'ATTRACT', label: 'Attract Particles' },
  { id: 'COMPRESS', label: 'Compress Core' },
  { id: 'EXPAND', label: 'Expand Field' },
  { id: 'NEXT_SHAPE', label: 'Next 3D Shape' },
];

export const PRETRAINED_FIREWORK_MAP = {
  Open_Palm: 'LAUNCH_FIREWORK',
  Pointing_Up: 'DRAW_TRAIL',
  Victory: 'SWITCH_PATTERN',
  Closed_Fist: 'CLEAR_SKY',
};

export const PRETRAINED_PARTICLE_MAP = {
  Open_Palm: 'ATTRACT',
  Closed_Fist: 'COMPRESS',
  Victory: 'NEXT_SHAPE',
};

function inferDefaultFireworkAction(label) {
  const lower = String(label || '').toLowerCase();
  if (/lotus|bloom|palm|open|firework|launch/.test(lower)) return 'LAUNCH_FIREWORK';
  if (/pinch|point|draw|pen|ribbon/.test(lower)) return 'DRAW_TRAIL';
  if (/peace|victory|next|switch|pattern/.test(lower)) return 'SWITCH_PATTERN';
  if (/stop|fist|clear|wave|pause/.test(lower)) return 'CLEAR_SKY';
  if (/finale|spread|burst/.test(lower)) return 'GRAND_FINALE';
  return 'none';
}

function inferDefaultParticleAction(label) {
  const lower = String(label || '').toLowerCase();
  if (/lotus|bloom|palm|open|attract|pull/.test(lower)) return 'ATTRACT';
  if (/stop|fist|compress|shrink|close|wave/.test(lower)) return 'COMPRESS';
  if (/expand|spread|grow/.test(lower)) return 'EXPAND';
  if (/peace|victory|next|shape|morph/.test(lower)) return 'NEXT_SHAPE';
  return 'none';
}

/**
 * Generates initial custom-label-to-action mappings for Magic Canvas and
 * Particle Universe when a Colab KNN model is imported.
 *
 * @param {string[]} classes
 * @param {{ magicCanvas?: Record<string, string>, particleUniverse?: Record<string, string> } | null} importedBindings
 */
export function buildDefaultActionBindings(classes = [], importedBindings = null) {
  const validMcIds = new Set(MAGIC_CANVAS_ACTION_OPTIONS.map((o) => o.id));
  const validPuIds = new Set(PARTICLE_UNIVERSE_ACTION_OPTIONS.map((o) => o.id));

  const magicCanvas = {};
  const particleUniverse = {};

  for (const label of classes) {
    const importedMc = importedBindings?.magicCanvas?.[label];
    magicCanvas[label] =
      importedMc && validMcIds.has(importedMc)
        ? importedMc
        : inferDefaultFireworkAction(label);

    const importedPu = importedBindings?.particleUniverse?.[label];
    particleUniverse[label] =
      importedPu && validPuIds.has(importedPu)
        ? importedPu
        : inferDefaultParticleAction(label);
  }

  return { magicCanvas, particleUniverse };
}

/**
 * Resolves a detected gesture label into a Magic Canvas semantic action.
 */
export function resolveFireworkSemanticAction(rawGestureName, options = {}) {
  if (
    options.rejected ||
    !rawGestureName ||
    rawGestureName === 'None' ||
    rawGestureName === 'Unknown' ||
    rawGestureName === 'Unknown Gesture' ||
    rawGestureName === 'Uncertain' ||
    rawGestureName === 'Uncertain Gesture'
  ) {
    return 'none';
  }
  if (options.classifierSource === 'custom-knn') {
    return options.actionBindings?.magicCanvas?.[rawGestureName] ?? 'none';
  }
  return PRETRAINED_FIREWORK_MAP[rawGestureName] ?? 'none';
}

/**
 * Resolves a detected gesture label into a Particle Universe semantic action.
 */
export function resolveParticleSemanticAction(rawGestureName, options = {}) {
  if (
    options.rejected ||
    !rawGestureName ||
    rawGestureName === 'None' ||
    rawGestureName === 'Unknown' ||
    rawGestureName === 'Unknown Gesture' ||
    rawGestureName === 'Uncertain' ||
    rawGestureName === 'Uncertain Gesture'
  ) {
    return 'none';
  }
  if (options.classifierSource === 'custom-knn') {
    return options.actionBindings?.particleUniverse?.[rawGestureName] ?? 'none';
  }
  return PRETRAINED_PARTICLE_MAP[rawGestureName] ?? 'none';
}
