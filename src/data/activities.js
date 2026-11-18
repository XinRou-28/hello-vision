import { POSE_LIBRARY } from '../exercises/poseLibrary.js';

export const ACTIVITIES = [
  {
    id: 'magic-canvas',
    index: '01',
    title: 'Magic Canvas',
    subtitle: 'Fireworks & Light Trails',
    mediumLabel: 'Hand Gestures',
    description:
      'Draw light trails in mid-air and launch layered fireworks with hand gestures.',
    modelType: 'Gesture Recognizer',
    accentHex: '#e4c580',
    instructions: [
      { gesture: 'Open Palm', action: 'Launch firework' },
      { gesture: 'Two Open Palms', action: 'Twin fireworks' },
      { gesture: 'Palms Apart', action: 'Grand finale' },
      { gesture: 'Hands Together', action: 'Central burst' },
      { gesture: 'Point Up', action: 'Draw light trail' },
      { gesture: 'Victory', action: 'Next pattern' },
      { gesture: 'Closed Fist', action: 'Clear sky' },
    ],
  },
  {
    id: 'particle-universe',
    index: '02',
    title: 'Particle Universe',
    subtitle: '3D Formations',
    mediumLabel: 'Hand Gestures',
    description:
      'Steer, scale, and morph a living 3D starfield across six celestial forms.',
    modelType: 'Gesture Recognizer',
    accentHex: '#93c5fd',
    instructions: [
      { gesture: 'Move Hand', action: 'Move hand to steer' },
      { gesture: 'Closer / Further', action: 'Scale size' },
      { gesture: 'Open Palm', action: 'Attract particles' },
      { gesture: 'Closed Fist', action: 'Compress core' },
      { gesture: 'Victory', action: 'Next shape' },
      { gesture: 'Two Hands', action: 'Expand or compress' },
    ],
  },
  {
    id: 'pose-challenge',
    index: '03',
    title: 'Pose Challenge',
    subtitle: '15-Pose Wacky Challenge',
    mediumLabel: 'Body Landmarks',
    description:
      'Match fifteen wacky poses across three levels using dynamic half-body & leg-lift webcam tracking.',
    modelType: 'Pose Landmarker',
    accentHex: '#6ee7b7',
    instructions: [
      { gesture: 'Frame View', action: 'Head to mid-thigh normally; step back slightly for leg poses' },
      { gesture: '3 Levels', action: 'Warming Up (10s) · Getting Weird (12s) · Absolute Chaos (15s)' },
      { gesture: 'Hold Steady', action: 'Hold matched pose briefly to score speed + accuracy points' },
    ],
  },
];

export const PARTICLE_SHAPES = [
  { id: 'galaxy', label: 'Spiral Galaxy' },
  { id: 'heart', label: 'Heart' },
  { id: 'butterfly', label: 'Butterfly' },
  { id: 'star', label: 'Star' },
  { id: 'saturn', label: 'Saturn' },
  { id: 'flower', label: 'Flower' },
];

export const POSE_CHALLENGES = POSE_LIBRARY;
