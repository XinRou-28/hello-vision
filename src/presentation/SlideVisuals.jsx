import { ArrowRight, CheckCircle2, Eye, Play } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import agricultureCropsPhoto from '../assets/images/agriculture_crops_photo_1794879960965.jpg';
import appMagicCanvasImg from '../assets/images/app_magic_canvas.png';
import appParticleUniverseImg from '../assets/images/app_particle_universe.png';
import cvDrivingPhoto from '../assets/images/cv_driving_photo_1794878401682.jpg';
import cvMedicalPhoto from '../assets/images/cv_medical_photo_1794878400366.jpg';
import everydayOcrPhoto from '../assets/images/everyday_ocr_photo_1794879960894.jpg';
import humanHandPhoto from '../assets/images/human_hand_photo_1794878400143.jpg';
import poseAthletePhoto from '../assets/images/pose_athlete_photo_1794879961017.jpg';
import {
  HAND_FINGERTIP_INDICES,
  HAND_LANDMARK_COLORS,
} from '../vision/handOverlayRenderer.js';
import { HAND_CONNECTIONS, HAND_LANDMARK_INDEX } from '../vision/landmarkMath.js';
import ChromeDinoMascot from './ChromeDinoMascot.jsx';

const MEME_SRC = '/assets/images/image_e0e84eaa.png';
const PERFORMER_PHOTO_SRC = '/assets/images/image_968223bc.png';
const SLIDE1_DINO_SRC = '/assets/images/image_2b43bf83.png';

// 21 hand landmarks aligned to human_hand_photo_1794878400143.jpg in 400x300 (4:3) coordinates
const HAND_21_POINTS_4X3 = [
  { id: 0, x: 200, y: 246 },
  { id: 1, x: 236, y: 222 },
  { id: 2, x: 256, y: 189 },
  { id: 3, x: 272, y: 156 },
  { id: 4, x: 284, y: 126 },
  { id: 5, x: 224, y: 150 },
  { id: 6, x: 228, y: 108 },
  { id: 7, x: 232, y: 72 },
  { id: 8, x: 234, y: 42 },
  { id: 9, x: 198, y: 141 },
  { id: 10, x: 198, y: 93 },
  { id: 11, x: 196, y: 57 },
  { id: 12, x: 196, y: 30 },
  { id: 13, x: 172, y: 150 },
  { id: 14, x: 170, y: 102 },
  { id: 15, x: 168, y: 69 },
  { id: 16, x: 168, y: 45 },
  { id: 17, x: 150, y: 168 },
  { id: 18, x: 144, y: 132 },
  { id: 19, x: 138, y: 105 },
  { id: 20, x: 134, y: 84 },
];

// Object detection boxes aligned to cv_driving_photo_1794878401682.jpg (400x300)
const STREET_DETECTIONS = [
  { label: 'Traffic Light', x: 236, y: 67, w: 17, h: 25, color: '#FBBC05', labelBelow: false },
  { label: 'Person', x: 120, y: 150, w: 22, h: 42, color: '#EA4335', labelBelow: false },
  { label: 'Person', x: 162, y: 150, w: 24, h: 42, color: '#EA4335', labelBelow: true },
  { label: 'Car', x: 193, y: 151, w: 27, h: 24, color: '#4285F4', labelBelow: false },
  { label: 'Car', x: 234, y: 149, w: 39, h: 33, color: '#4285F4', labelBelow: true },
  { label: 'Person', x: 291, y: 151, w: 22, h: 42, color: '#EA4335', labelBelow: false },
];

// Full-body pose keypoints aligned to pose_athlete_photo_1794879961017.jpg (300x400)
const POSE_POINTS = {
  nose: { x: 150.6, y: 70 },
  leftEye: { x: 145.2, y: 64 },
  rightEye: { x: 156, y: 64 },
  leftShoulder: { x: 129.6, y: 110.4 },
  rightShoulder: { x: 170.4, y: 110.4 },
  leftElbow: { x: 76.5, y: 143.2 },
  rightElbow: { x: 226.5, y: 140.8 },
  leftWrist: { x: 49.5, y: 104.8 },
  rightWrist: { x: 251.4, y: 102 },
  leftHip: { x: 129.6, y: 209.6 },
  rightHip: { x: 169.5, y: 209.6 },
  leftKnee: { x: 130.2, y: 290 },
  rightKnee: { x: 172.5, y: 290 },
  leftAnkle: { x: 126.6, y: 360 },
  rightAnkle: { x: 178.5, y: 360 },
};

const POSE_LINKS = [
  ['leftEye', 'nose'],
  ['rightEye', 'nose'],
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

// Elements detected in uploaded performer photograph (300x300)
const SCENE_ELEMENTS = [
  { label: 'Person', x: 39, y: 21, w: 228, h: 273, color: '#4285F4' },
  { label: 'Face', x: 96, y: 36, w: 66, h: 72, color: '#34A853' },
  { label: 'Microphone', x: 93, y: 120, w: 30, h: 57, color: '#FBBC05' },
];

function GoogleAccentRule({ widthClass = 'w-24' }) {
  return (
    <div className={`flex h-1 ${widthClass} shrink-0 overflow-hidden rounded-full`} aria-hidden="true">
      <span className="flex-1 bg-[#4285F4]" />
      <span className="flex-1 bg-[#EA4335]" />
      <span className="flex-1 bg-[#FBBC05]" />
      <span className="flex-1 bg-[#34A853]" />
    </div>
  );
}

function SlideHeader({ title, subtitle, compactTitle = false }) {
  return (
    <header className="mb-4 flex items-end justify-between gap-6 border-b border-[#E8EAED] pb-3.5">
      <div className="min-w-0">
        <h2
          className={`font-display ${
            compactTitle ? 'text-[2.15rem]' : 'text-[2.45rem]'
          } font-bold tracking-tight text-[#202124] leading-[1.06]`}
          style={{ textWrap: 'balance' }}
        >
          {title}
        </h2>
        {subtitle && (
          <p className="mt-1.5 text-[1.05rem] font-medium text-[#5F6368] leading-snug">
            {subtitle}
          </p>
        )}
      </div>
      <div className="pb-1">
        <GoogleAccentRule />
      </div>
    </header>
  );
}

function HandSkeletonSvg({
  points = HAND_21_POINTS_4X3,
  workshopStyle = false,
  pointScale = 1,
  className = 'pointer-events-none absolute inset-0 h-full w-full',
}) {
  return (
    <svg viewBox="0 0 400 300" className={className} aria-hidden="true">
      {HAND_CONNECTIONS.map(([a, b], idx) => (
        <line
          key={idx}
          x1={points[a].x}
          y1={points[a].y}
          x2={points[b].x}
          y2={points[b].y}
          stroke={workshopStyle ? HAND_LANDMARK_COLORS.connection : '#34A853'}
          strokeWidth={(workshopStyle ? 2.6 : 3.4) * pointScale}
          strokeLinecap="round"
        />
      ))}
      {points.map((pt) => {
        const isWrist = pt.id === HAND_LANDMARK_INDEX.WRIST;
        const isTip = HAND_FINGERTIP_INDICES.has(pt.id);
        const fill = workshopStyle
          ? isWrist
            ? HAND_LANDMARK_COLORS.wrist
            : isTip
              ? HAND_LANDMARK_COLORS.tip
              : HAND_LANDMARK_COLORS.joint
          : isWrist
            ? '#EA4335'
            : isTip
              ? '#FBBC05'
              : '#FFFFFF';
        const radius = workshopStyle
          ? (isWrist ? 4.4 : isTip ? 4.0 : 3.2) * pointScale
          : (isWrist ? 6.8 : isTip ? 5.8 : 4.8) * pointScale;

        return (
          <circle
            key={pt.id}
            cx={pt.x}
            cy={pt.y}
            r={radius}
            fill={fill}
            stroke={workshopStyle ? 'rgba(9, 10, 13, 0.55)' : '#202124'}
            strokeWidth={workshopStyle ? 0.9 * pointScale : 1.3 * pointScale}
          />
        );
      })}
    </svg>
  );
}

/**
 * Slide 1 — Opening Slide: HELLO, VISION!
 */
function Slide1Opening({ slide, onOpenApp }) {
  return (
    <div className="flex h-full flex-col justify-between">
      <div className="flex items-center justify-between border-b border-[#E8EAED] pb-3.5 text-xs font-semibold text-[#5F6368]">
        <div className="flex items-center gap-3.5">
          <GoogleAccentRule widthClass="w-20" />
          <span className="tracking-[0.1em] text-[#202124] uppercase">{slide.brand}</span>
        </div>
        <span className="font-mono tracking-wide text-[#5F6368]">90-Minute Hands-On Workshop</span>
      </div>

      <div className="my-auto grid grid-cols-12 items-center gap-10 py-2">
        <div className="col-span-7 flex flex-col items-start">
          <p className="text-xs font-bold tracking-[0.14em] text-[#4285F4] uppercase">
            Computer Vision · Machine Learning · Gesture Recognition
          </p>

          <h1
            className="font-display mt-3.5 text-[5.5rem] font-bold tracking-tight text-[#202124] leading-[0.92]"
            style={{ textWrap: 'balance' }}
          >
            HELLO, VISION!
          </h1>

          <p className="mt-5 max-w-xl text-[1.5rem] font-semibold text-[#3C4043] leading-snug">
            {slide.subtitle}
          </p>

          <p className="mt-3 text-lg font-medium text-[#5F6368]">{slide.tagline}</p>

          <div className="mt-8 flex items-center gap-6">
            <button
              type="button"
              onClick={() => onOpenApp(null)}
              className="inline-flex cursor-pointer items-center gap-2.5 rounded-lg bg-[#4285F4] px-6 py-3.5 text-sm font-bold whitespace-nowrap text-white shadow-[0_8px_20px_rgba(66,133,244,0.22)] transition-colors hover:bg-[#1A73E8]"
            >
              <Play className="h-4 w-4 fill-current" />
              <span>Open Workshop App</span>
            </button>
            <span className="text-sm font-medium text-[#5F6368]">Press Space or → to begin</span>
          </div>
        </div>

        <div className="col-span-5 flex flex-col items-center justify-center rounded-2xl border border-[#DADCE0] bg-[#F8F9FA] px-6 py-7 text-center">
          <img
            src={SLIDE1_DINO_SRC}
            alt="Chrome Dino mascot wearing a party hat"
            className="block h-auto w-full max-w-[380px] object-contain mix-blend-multiply"
          />
          <div className="mt-3 flex items-center gap-2.5 text-sm">
            <span className="font-bold text-[#202124]">Hi there! Ready to see?</span>
            <span aria-hidden="true" className="text-[#BDC1C6]">·</span>
            <span className="text-[#5F6368]">Beginner-friendly</span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-[#E8EAED] pt-3 text-xs font-medium text-[#5F6368]">
        <span>GDG On Campus Universiti Malaya</span>
        <span>Interactive Browser Workshop</span>
      </div>
    </div>
  );
}

/**
 * Slide 2 — The Hook: ABSOLUTE CINEMA.
 */
function Slide2Hook() {
  const [memeMissing, setMemeMissing] = useState(false);

  return (
    <div className="flex h-full flex-col justify-between">
      <div className="flex items-center justify-between border-b border-[#E8EAED] pb-3.5">
        <span className="font-mono text-xs font-semibold tracking-wider text-[#5F6368] uppercase">
          Opening Question
        </span>
        <GoogleAccentRule />
      </div>

      <div className="my-auto grid grid-cols-12 items-center gap-12 py-2">
        <div className="col-span-6 flex items-center justify-center">
          <div className="w-full max-w-[500px] overflow-hidden rounded-xl border border-[#DADCE0] bg-[#111318] p-2.5 shadow-[0_14px_32px_rgba(32,33,36,0.1)]">
            {!memeMissing ? (
              <img
                src={MEME_SRC}
                alt="Absolute Cinema raised hands pose"
                onError={() => setMemeMissing(true)}
                className="block h-auto w-full rounded-lg bg-[#090A0D]"
              />
            ) : (
              <div className="flex aspect-[6/5] flex-col items-center justify-center border border-dashed border-[#5F6368] p-6 text-white">
                <p className="text-sm font-bold">Absolute Cinema Image Unavailable</p>
                <p className="mt-1 text-xs text-[#9AA0A6]">
                  Expected at public/assets/images/image_e0e84eaa.png
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="col-span-6 flex flex-col items-start text-left">
          <h2 className="font-display text-[4.25rem] font-bold tracking-tight text-[#202124] leading-[0.95]">
            ABSOLUTE
            <br />
            CINEMA.
          </h2>

          <div className="my-6">
            <GoogleAccentRule widthClass="w-16" />
          </div>

          <p
            className="text-[2rem] font-bold tracking-tight text-[#4285F4] leading-[1.22]"
            style={{ textWrap: 'balance' }}
          >
            But can a computer actually see what you&apos;re doing?
          </p>

          <p className="mt-5 max-w-md text-base font-medium text-[#5F6368] leading-relaxed">
            Try raising both hands right now. You instantly recognise the meme — a webcam only sees a grid of numbers.
          </p>
        </div>
      </div>

      <div className="border-t border-[#E8EAED] pt-3 text-sm font-medium text-[#5F6368]">
        To human eyes: an iconic pose · To a camera: millions of brightness values
      </div>
    </div>
  );
}

/**
 * Slide 3 — Visual Contrast: CAN COMPUTERS SEE?
 */
function Slide3Contrast({ slide, revealStep, onSetRevealStep }) {
  const showOverlay = revealStep >= 1;

  return (
    <div className="flex h-full flex-col justify-between">
      <SlideHeader title={slide.title} subtitle="Human eyes see meaning. Computers start with measurements." />

      <div className="my-auto grid grid-cols-2 items-start gap-8">
        <div className="flex flex-col">
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-[#EAE8E4]">
            <img
              src={humanHandPhoto}
              alt="Human open hand seen naturally"
              className="block h-full w-full object-cover"
            />
          </div>
          <div className="mt-3.5 flex items-baseline justify-between">
            <span className="text-xl font-bold text-[#202124]">What we see</span>
            <span className="text-sm font-medium text-[#5F6368]">An open hand</span>
          </div>
        </div>

        <div className="flex flex-col">
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-[#111318]">
            <img
              src={humanHandPhoto}
              alt="Hand tracked by 21 MediaPipe landmarks"
              className={`block h-full w-full object-cover transition-all duration-300 ${
                showOverlay ? 'opacity-60 contrast-115 saturate-50' : 'opacity-100'
              }`}
            />

            {showOverlay && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.25 }}
                className="pointer-events-none absolute inset-0"
              >
                <HandSkeletonSvg points={HAND_21_POINTS_4X3} pointScale={1.08} />
              </motion.div>
            )}

            {!showOverlay && (
              <button
                type="button"
                onClick={() => onSetRevealStep(1)}
                className="absolute inset-0 flex cursor-pointer items-center justify-center bg-black/40 transition-colors hover:bg-black/50"
              >
                <span className="inline-flex items-center gap-2.5 rounded-lg bg-[#4285F4] px-5 py-3 text-sm font-bold text-white shadow-lg">
                  <Eye className="h-4 w-4" />
                  <span>Reveal 21 Landmarks</span>
                </span>
              </button>
            )}
          </div>
          <div className="mt-3.5 flex items-baseline justify-between">
            <span className="text-xl font-bold text-[#4285F4]">What the computer detects</span>
            <span className="font-mono text-sm font-semibold tabular-nums text-[#137333]">
              21 landmarks · 63 coordinates
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-[#E8EAED] pt-3">
        <span className="text-base font-bold text-[#202124]">
          Same hand. Different perspective.
        </span>
        <button
          type="button"
          onClick={() => onSetRevealStep(showOverlay ? 0 : 1)}
          className="cursor-pointer rounded-lg border border-[#DADCE0] bg-[#F8F9FA] px-4 py-1.5 text-xs font-semibold text-[#202124] transition-colors hover:bg-[#E8EAED]"
        >
          {showOverlay ? 'Show Original Photo' : 'Reveal Landmarks (Space)'}
        </button>
      </div>
    </div>
  );
}

/**
 * Slide 4 — WHAT IS COMPUTER VISION?
 * Uses an ordinary real-world photograph (no hand tracking / gesture claims) to explain visual input -> patterns -> understanding.
 */
function Slide4WhatIsCV({ slide }) {
  return (
    <div className="flex h-full flex-col justify-between">
      <SlideHeader title={slide.title} subtitle={slide.subtitle} />

      <div className="my-auto grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-4">
        {/* Step 1: Ordinary Image */}
        <div className="flex flex-col">
          <div className="mb-2.5 flex items-baseline gap-2">
            <span className="font-mono text-sm font-bold text-[#4285F4]">01</span>
            <span className="text-xs font-bold tracking-wider text-[#4285F4] uppercase">
              Ordinary Image
            </span>
          </div>
          <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-[#DADCE0] bg-[#F8F9FA]">
            <img
              src={PERFORMER_PHOTO_SRC}
              alt="Performer standing at a vintage microphone"
              className="block h-full w-full object-cover"
            />
          </div>
          <h3 className="font-display mt-3 text-xl font-bold text-[#202124]">Visual Input</h3>
          <p className="mt-1 text-[15px] leading-snug text-[#5F6368]">
            Raw pixels enter from a photo or camera.
          </p>
        </div>

        <div className="flex items-center justify-center pb-14">
          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[#DADCE0] bg-[#F8F9FA]">
            <ArrowRight className="h-4 w-4 text-[#5F6368]" />
          </div>
        </div>

        {/* Step 2: Process Visual Information */}
        <div className="flex flex-col">
          <div className="mb-2.5 flex items-baseline gap-2">
            <span className="font-mono text-sm font-bold text-[#B06000]">02</span>
            <span className="text-xs font-bold tracking-wider text-[#B06000] uppercase">
              Process Visual Information
            </span>
          </div>
          <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-[#DADCE0] bg-[#111318]">
            <img
              src={PERFORMER_PHOTO_SRC}
              alt="Visual information processed as contrast, edges, and grid regions"
              className="block h-full w-full object-cover opacity-85 contrast-150 grayscale"
            />
            <svg
              viewBox="0 0 300 300"
              className="pointer-events-none absolute inset-0 h-full w-full"
              aria-hidden="true"
            >
              {[50, 100, 150, 200, 250].map((x) => (
                <line
                  key={`vx-${x}`}
                  x1={x}
                  y1="0"
                  x2={x}
                  y2="300"
                  stroke="#FBBC05"
                  strokeOpacity="0.38"
                  strokeWidth="1.2"
                />
              ))}
              {[50, 100, 150, 200, 250].map((y) => (
                <line
                  key={`hy-${y}`}
                  x1="0"
                  y1={y}
                  x2="300"
                  y2={y}
                  stroke="#FBBC05"
                  strokeOpacity="0.38"
                  strokeWidth="1.2"
                />
              ))}
              <rect
                x="42"
                y="22"
                width="222"
                height="268"
                fill="none"
                stroke="#FBBC05"
                strokeWidth="2.4"
                strokeDasharray="8 5"
              />
            </svg>
          </div>
          <h3 className="font-display mt-3 text-xl font-bold text-[#202124]">Find Patterns</h3>
          <p className="mt-1 text-[15px] leading-snug text-[#5F6368]">
            Scans colours, edges, contrast, and shapes.
          </p>
        </div>

        <div className="flex items-center justify-center pb-14">
          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[#DADCE0] bg-[#F8F9FA]">
            <ArrowRight className="h-4 w-4 text-[#5F6368]" />
          </div>
        </div>

        {/* Step 3: Understand Elements */}
        <div className="flex flex-col">
          <div className="mb-2.5 flex items-baseline gap-2">
            <span className="font-mono text-sm font-bold text-[#137333]">03</span>
            <span className="text-xs font-bold tracking-wider text-[#137333] uppercase">
              Understand Elements
            </span>
          </div>
          <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-[#DADCE0] bg-[#14161D]">
            <img
              src={PERFORMER_PHOTO_SRC}
              alt="Computer identifying a person, face, and microphone in the photograph"
              className="block h-full w-full object-cover"
            />
            <svg
              viewBox="0 0 300 300"
              className="pointer-events-none absolute inset-0 h-full w-full"
              aria-hidden="true"
            >
              {SCENE_ELEMENTS.map((el) => (
                <g key={el.label}>
                  <rect
                    x={el.x}
                    y={el.y}
                    width={el.w}
                    height={el.h}
                    fill={el.color}
                    fillOpacity="0.08"
                    stroke={el.color}
                    strokeWidth="2.8"
                  />
                  <rect
                    x={el.x}
                    y={Math.max(2, el.y - 20)}
                    width={el.label.length * 8 + 16}
                    height="20"
                    rx="2"
                    fill={el.color}
                  />
                  <text
                    x={el.x + 7}
                    y={Math.max(16, el.y - 6)}
                    fontSize="12"
                    fontWeight="700"
                    fill="#FFFFFF"
                  >
                    {el.label}
                  </text>
                </g>
              ))}
            </svg>
          </div>
          <h3 className="font-display mt-3 text-xl font-bold text-[#202124]">Recognise Scene</h3>
          <p className="mt-1 text-[15px] leading-snug text-[#5F6368]">
            Identifies people, faces, and objects inside.
          </p>
        </div>
      </div>

      <div className="border-t border-[#E8EAED] pt-3 text-base font-semibold text-[#202124]">
        A camera captures pixels.{' '}
        <span className="text-[#4285F4]">Computer Vision turns those pixels into understanding.</span>
      </div>
    </div>
  );
}

/**
 * Slide 5 — COMPUTER VISION IS EVERYWHERE.
 */
function Slide5Everywhere({ slide }) {
  const domains = [
    {
      title: 'Autonomous Driving',
      desc: 'Spots lanes, pedestrians, vehicles, and traffic lights.',
      img: cvDrivingPhoto,
      color: '#4285F4',
    },
    {
      title: 'Healthcare',
      desc: 'Helps doctors review X-rays and medical scans.',
      img: cvMedicalPhoto,
      color: '#EA4335',
    },
    {
      title: 'Agriculture',
      desc: 'Checks crop health and detects early plant disease.',
      img: agricultureCropsPhoto,
      color: '#34A853',
    },
    {
      title: 'Everyday Technology',
      desc: 'Face unlock, QR codes, and receipt scanning.',
      img: everydayOcrPhoto,
      color: '#FBBC05',
    },
  ];

  return (
    <div className="flex h-full flex-col justify-between">
      <SlideHeader title={slide.title} subtitle={slide.subtitle} />

      <div className="my-auto grid grid-cols-4 items-start gap-5">
        {domains.map((item) => (
          <div key={item.title} className="flex flex-col">
            <div className="aspect-[4/3] w-full overflow-hidden rounded-xl border border-[#DADCE0] bg-[#F1F3F4]">
              <img
                src={item.img}
                alt={item.title}
                referrerPolicy="no-referrer"
                className="block h-full w-full object-cover"
              />
            </div>
            <div
              className="mt-4 h-1 w-9 rounded-full"
              style={{ backgroundColor: item.color }}
              aria-hidden="true"
            />
            <h3 className="font-display mt-2.5 text-[1.35rem] font-bold tracking-tight text-[#202124] leading-tight">
              {item.title}
            </h3>
            <p className="mt-1.5 text-[15px] leading-snug text-[#5F6368]">{item.desc}</p>
          </div>
        ))}
      </div>

      <div className="border-t border-[#E8EAED] pt-3 text-base font-semibold text-[#202124]">
        Different industries, one goal:{' '}
        <span className="text-[#4285F4]">helping computers understand what they see.</span>
      </div>
    </div>
  );
}

/**
 * Slide 6 — DIFFERENT WAYS COMPUTERS SEE.
 */
function Slide6Tasks({ slide }) {
  return (
    <div className="flex h-full flex-col justify-between">
      <SlideHeader title={slide.title} subtitle={slide.subtitle} />

      <div className="my-auto grid grid-cols-3 items-start gap-7">
        {/* Task 1: Object Detection */}
        <div className="flex flex-col">
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-[#DADCE0] bg-[#111318]">
            <img
              src={cvDrivingPhoto}
              alt="Street scene showing object detection bounding boxes"
              className="block h-full w-full object-cover"
            />
            <svg
              viewBox="0 0 400 300"
              className="pointer-events-none absolute inset-0 h-full w-full"
              aria-hidden="true"
            >
              {STREET_DETECTIONS.map((box, idx) => {
                const labelY = box.labelBelow
                  ? Math.min(282, box.y + box.h + 2)
                  : Math.max(2, box.y - 16);
                const textY = box.labelBelow
                  ? Math.min(293, box.y + box.h + 13)
                  : Math.max(13, box.y - 5);

                return (
                  <g key={idx}>
                    <rect
                      x={box.x}
                      y={box.y}
                      width={box.w}
                      height={box.h}
                      fill={box.color}
                      fillOpacity="0.14"
                      stroke={box.color}
                      strokeWidth="2.2"
                    />
                    <rect
                      x={box.x}
                      y={labelY}
                      width={box.label.length * 6.8 + 12}
                      height="15"
                      rx="2"
                      fill={box.color}
                    />
                    <text
                      x={box.x + 5}
                      y={textY}
                      fontSize="10.5"
                      fontWeight="700"
                      fill="#FFFFFF"
                    >
                      {box.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
          <div className="mt-4 h-1 w-9 rounded-full bg-[#4285F4]" aria-hidden="true" />
          <h3 className="font-display mt-2.5 text-2xl font-bold text-[#202124]">Object Detection</h3>
          <p className="mt-1 text-[15px] leading-snug text-[#5F6368]">
            Finds what objects are present and draws boxes around them.
          </p>
        </div>

        {/* Task 2: Hand Tracking */}
        <div className="flex flex-col">
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-[#DADCE0] bg-[#111318]">
            <img
              src={humanHandPhoto}
              alt="Human hand showing 21 landmark keypoints"
              className="block h-full w-full object-cover opacity-80"
            />
            <HandSkeletonSvg points={HAND_21_POINTS_4X3} pointScale={1.05} />
          </div>
          <div className="mt-4 h-1 w-9 rounded-full bg-[#34A853]" aria-hidden="true" />
          <h3 className="font-display mt-2.5 text-2xl font-bold text-[#202124]">Hand Tracking</h3>
          <p className="mt-1 text-[15px] leading-snug text-[#5F6368]">
            Follows 21 landmarks across your palm, knuckles, and fingertips.
          </p>
        </div>

        {/* Task 3: Pose Estimation */}
        <div className="flex flex-col">
          <div
            className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-xl border border-[#DADCE0]"
            style={{
              background: 'linear-gradient(180deg, #E3E4E2 0%, #DADBD9 64%, #CECECC 100%)',
            }}
          >
            <div className="relative h-full aspect-[3/4]">
              <img
                src={poseAthletePhoto}
                alt="Person standing with arms raised showing full-body pose landmarks"
                className="block h-full w-full object-cover"
                style={{
                  maskImage: 'linear-gradient(90deg, transparent 0%, black 8%, black 92%, transparent 100%)',
                  WebkitMaskImage: 'linear-gradient(90deg, transparent 0%, black 8%, black 92%, transparent 100%)',
                }}
              />
              <svg
                viewBox="0 0 300 400"
                className="pointer-events-none absolute inset-0 h-full w-full"
                aria-hidden="true"
              >
                {POSE_LINKS.map(([a, b]) => (
                  <line
                    key={`${a}-${b}`}
                    x1={POSE_POINTS[a].x}
                    y1={POSE_POINTS[a].y}
                    x2={POSE_POINTS[b].x}
                    y2={POSE_POINTS[b].y}
                    stroke="#4285F4"
                    strokeWidth="4.2"
                    strokeLinecap="round"
                  />
                ))}
                {Object.entries(POSE_POINTS).map(([key, pt]) => {
                  const isHead = key === 'nose' || key === 'leftEye' || key === 'rightEye';
                  return (
                    <circle
                      key={key}
                      cx={pt.x}
                      cy={pt.y}
                      r={isHead ? 4.2 : 5.6}
                      fill="#EA4335"
                      stroke="#FFFFFF"
                      strokeWidth="1.6"
                    />
                  );
                })}
              </svg>
            </div>
          </div>
          <div className="mt-4 h-1 w-9 rounded-full bg-[#EA4335]" aria-hidden="true" />
          <h3 className="font-display mt-2.5 text-2xl font-bold text-[#202124]">Pose Estimation</h3>
          <p className="mt-1 text-[15px] leading-snug text-[#5F6368]">
            Tracks major joints from head to ankle across the whole body.
          </p>
        </div>
      </div>

      <div className="border-t border-[#E8EAED] pt-3 text-base font-semibold text-[#202124]">
        Different models focus on different clues in the same frame.
      </div>
    </div>
  );
}

/**
 * Slide 7 — CAN WE TEACH A COMPUTER TO RECOGNISE OUR GESTURES?
 * Bridges the intro into the real HELLO, VISION! workshop app:
 * 01 — SHOW (Live Sample Collector / 21 landmarks) -> 02 — RECOGNISE (WebcamPip & Test & Map Actions) -> 03 — RESPOND (Magic Canvas & Particle Universe)
 */
function Slide7WorkshopHook({ slide }) {
  return (
    <div className="flex h-full flex-col justify-between">
      <SlideHeader title={slide.title} subtitle={slide.subtitle} compactTitle />

      <div className="my-auto grid grid-cols-[1fr_auto_1fr_auto_1.06fr] items-start gap-3.5">
        {/* 01 — SHOW: Real Live Sample Collector UI from CustomGestureModal.jsx */}
        <div className="flex flex-col">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="font-mono text-sm font-bold tracking-tight text-[#4285F4]">
              01 — SHOW
            </span>
            <span className="text-[11px] font-semibold text-[#5F6368]">Live Sample Collector</span>
          </div>

          <div className="flex h-[340px] flex-col justify-between overflow-hidden rounded-xl border border-[#DADCE0] bg-[#0b0c10] p-3.5 text-[#f2efe9] shadow-sm">
            <div className="flex items-center justify-between gap-2 whitespace-nowrap text-[10.5px]">
              <span className="font-semibold tracking-wider text-[#9b968c] uppercase">
                Live Sample Collector
              </span>
              <span className="font-mono text-[#e8cc84]">
                Active: <strong>Open Palm</strong> (24/30)
              </span>
            </div>

            <div className="relative my-2 flex-1 overflow-hidden rounded-lg border border-white/15 bg-black">
              <img
                src={humanHandPhoto}
                alt="Hand tracked in Live Sample Collector with 21 MediaPipe landmarks"
                className="block h-full w-full object-cover"
              />
              <HandSkeletonSvg
                points={HAND_21_POINTS_4X3}
                workshopStyle
                pointScale={1.08}
              />
              <div className="pointer-events-none absolute right-2 bottom-2 left-2 flex items-center justify-between rounded-md bg-black/75 px-2.5 py-1 text-[11px] text-stone-200">
                <span>21 landmarks ready (21 pts)</span>
                <span className="font-mono text-[#e8cc84]">63 features</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md bg-[#d6b15e] py-1.5 text-center text-[11px] font-semibold text-[#09080a]">
                + Capture Sample
              </div>
              <div className="rounded-md border border-white/15 bg-white/[0.05] py-1.5 text-center text-[11px] font-semibold text-stone-100">
                Burst ×10
              </div>
            </div>
          </div>

          <h3 className="font-display mt-3 text-[1.35rem] font-bold text-[#202124] leading-tight">
            Perform a hand gesture
          </h3>
          <p className="mt-1 text-sm leading-snug text-[#5F6368]">
            Your webcam tracks 21 hand landmarks live as 63 coordinate features.
          </p>
        </div>

        <div className="flex h-[340px] items-center justify-center pt-7">
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[#DADCE0] bg-[#F8F9FA]">
            <ArrowRight className="h-4 w-4 text-[#5F6368]" />
          </div>
        </div>

        {/* 02 — RECOGNISE: Real WebcamPip + Tab 3 (Test & Map Actions) UI from the app */}
        <div className="flex flex-col">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="font-mono text-sm font-bold tracking-tight text-[#B06000]">
              02 — RECOGNISE
            </span>
            <span className="text-[11px] font-semibold text-[#5F6368]">Test &amp; Map Actions</span>
          </div>

          <div className="flex h-[340px] flex-col justify-between overflow-hidden rounded-xl border border-[#DADCE0] bg-[#090a0d] p-3.5 text-[#f2efe9] shadow-sm">
            {/* Real WebcamPip recognition readout */}
            <div className="overflow-hidden rounded-lg border border-white/15 bg-[#0b0c10]">
              <div className="flex items-center justify-between border-b border-white/[0.08] px-3 py-1.5 text-[11px] text-[#9b968c]">
                <span>Hand Gestures</span>
                <span className="font-mono text-[10px] text-emerald-300">Live</span>
              </div>
              <div className="relative h-28 w-full overflow-hidden bg-black">
                <img
                  src={humanHandPhoto}
                  alt="Recognised Open Palm hand inside WebcamPip"
                  className="block h-full w-full object-cover"
                />
                <HandSkeletonSvg points={HAND_21_POINTS_4X3} workshopStyle pointScale={1.0} />
              </div>
              <div className="flex items-center justify-between border-t border-white/[0.08] px-3 py-2 text-xs">
                <span className="font-semibold text-[#f2efe9]">Open Palm</span>
                <span className="font-mono font-semibold text-[#e4c580] tabular-nums">94%</span>
              </div>
            </div>

            {/* Real CustomGestureModal Tab 3: Live readout & Action Mapping */}
            <div className="mt-2.5 flex-1 rounded-lg border border-white/12 bg-white/[0.03] p-2.5">
              <div className="flex items-center justify-between border-b border-white/10 pb-2 text-xs">
                <span className="font-mono text-stone-300">
                  Live: <strong className="text-[#e8cc84]">Open Palm</strong>
                </span>
                <span className="inline-flex items-center gap-1 rounded bg-emerald-400/20 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-300">
                  <CheckCircle2 className="h-2.5 w-2.5" aria-hidden="true" />
                  <span>LIVE</span>
                </span>
              </div>

              <div className="mt-2 space-y-1.5 text-[11px]">
                <div className="flex items-center justify-between rounded bg-[#121622] px-2.5 py-1.5">
                  <span className="text-stone-400">Magic Canvas</span>
                  <span className="font-semibold tracking-normal text-[#e8cc84]">
                    Launch Firework
                  </span>
                </div>
                <div className="flex items-center justify-between rounded bg-[#121622] px-2.5 py-1.5">
                  <span className="text-stone-400">Particle Universe</span>
                  <span className="font-semibold tracking-normal text-sky-300">
                    Attract Particles
                  </span>
                </div>
              </div>
            </div>
          </div>

          <h3 className="font-display mt-3 text-[1.35rem] font-bold text-[#202124] leading-tight">
            Computer identifies it
          </h3>
          <p className="mt-1 text-sm leading-snug text-[#5F6368]">
            Matches your hand pose and routes the gesture to a visual action.
          </p>
        </div>

        <div className="flex h-[340px] items-center justify-center pt-7">
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[#DADCE0] bg-[#F8F9FA]">
            <ArrowRight className="h-4 w-4 text-[#5F6368]" />
          </div>
        </div>

        {/* 03 — RESPOND: Real Magic Canvas & Particle Universe screenshots */}
        <div className="flex flex-col">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="font-mono text-sm font-bold tracking-tight text-[#137333]">
              03 — RESPOND
            </span>
            <span className="text-[11px] font-semibold text-[#5F6368]">Interactive Canvas</span>
          </div>

          <div className="flex h-[340px] flex-col gap-2">
            <div className="relative flex-1 overflow-hidden rounded-xl border border-[#DADCE0] bg-[#070709] shadow-sm">
              <img
                src={appMagicCanvasImg}
                alt="Magic Canvas fireworks launched by Open Palm gesture"
                className="block h-full w-full object-cover"
              />
              <div className="pointer-events-none absolute bottom-2 left-2.5 rounded bg-black/75 px-2 py-0.5 text-[11px] font-semibold text-[#e8cc84]">
                Magic Canvas · Fireworks
              </div>
            </div>

            <div className="relative flex-1 overflow-hidden rounded-xl border border-[#DADCE0] bg-[#070709] shadow-sm">
              <img
                src={appParticleUniverseImg}
                alt="Particle Universe 3D starfield controlled by Open Palm gesture"
                className="block h-full w-full object-cover"
              />
              <div className="pointer-events-none absolute bottom-2 left-2.5 rounded bg-black/75 px-2 py-0.5 text-[11px] font-semibold text-sky-300">
                Particle Universe · 3D Formations
              </div>
            </div>
          </div>

          <h3 className="font-display mt-3 text-[1.35rem] font-bold text-[#202124] leading-tight">
            Visuals respond live
          </h3>
          <p className="mt-1 text-sm leading-snug text-[#5F6368]">
            Launch fireworks in Magic Canvas or sculpt a 3D Particle Universe.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-[#E8EAED] pt-3 text-base font-bold text-[#202124]">
        <span>
          I perform a gesture{' '}
          <span className="mx-1.5 text-[#5F6368]">→</span>
          <span className="text-[#4285F4]">The computer recognises it</span>
          <span className="mx-1.5 text-[#5F6368]">→</span>
          <span className="text-[#137333]">The visuals respond.</span>
        </span>
        <span className="hidden text-xs font-medium text-[#5F6368] lg:inline">
          Works with built-in gestures or your own trained model
        </span>
      </div>
    </div>
  );
}

/**
 * Slide 8 — SO, HOW DOES IT WORK?
 * Explains how MediaPipe (21 landmarks) feeds into Custom KNN (comparing against collected examples).
 */
function Slide8HowItWorks({ slide }) {
  const openPalmSamples = [
    { x: 64, y: 74 },
    { x: 92, y: 56 },
    { x: 108, y: 84 },
    { x: 78, y: 100 },
  ];
  const victorySamples = [
    { x: 278, y: 66 },
    { x: 310, y: 54 },
    { x: 324, y: 84 },
    { x: 292, y: 98 },
  ];
  const fistSamples = [
    { x: 92, y: 192 },
    { x: 120, y: 210 },
    { x: 78, y: 216 },
    { x: 112, y: 180 },
  ];
  const newSample = { x: 256, y: 132 };
  const closestThree = [
    { x: 292, y: 98 },
    { x: 278, y: 66 },
    { x: 324, y: 84 },
  ];

  return (
    <div className="flex h-full flex-col justify-between">
      <SlideHeader
        title={slide.title}
        subtitle="Two distinct steps in our custom gesture workflow."
      />

      <div className="my-auto grid grid-cols-[430px_auto_1fr] items-start gap-6">
        {/* Left: MEDIAPIPE */}
        <div className="flex flex-col">
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-[#DADCE0] bg-[#111318]">
            <img
              src={humanHandPhoto}
              alt="Hand photograph overlaid with 21 MediaPipe landmarks"
              className="block h-full w-full object-cover opacity-80"
            />
            <HandSkeletonSvg points={HAND_21_POINTS_4X3} pointScale={1.08} />
            <div className="pointer-events-none absolute top-3 left-3 rounded-md bg-black/75 px-2.5 py-1 font-mono text-xs font-semibold text-white">
              21 keypoints → 63 numbers
            </div>
          </div>

          <div className="mt-4 flex items-baseline gap-3">
            <h3 className="font-display text-3xl font-bold tracking-tight text-[#202124]">
              MEDIAPIPE
            </h3>
            <span className="text-xs font-bold tracking-wider text-[#4285F4] uppercase">
              Hand Landmark Tracker
            </span>
          </div>
          <p className="mt-1.5 text-base font-medium text-[#5F6368]">
            Finds and tracks your hand as 21 landmarks in real time.
          </p>
        </div>

        {/* Connector showing data flow from MediaPipe -> KNN */}
        <div className="flex h-[322px] flex-col items-center justify-center gap-1.5 px-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#DADCE0] bg-[#F8F9FA]">
            <ArrowRight className="h-5 w-5 text-[#202124]" />
          </div>
          <span className="font-mono text-[11px] font-semibold text-[#5F6368]">63 features</span>
        </div>

        {/* Right: KNN */}
        <div className="flex flex-col">
          <div className="relative h-[322px] w-full overflow-hidden rounded-xl border border-[#DADCE0] bg-[#F8F9FA]">
            <svg
              viewBox="0 0 420 260"
              className="h-full w-full"
              role="img"
              aria-label="KNN comparing a new gesture sample against labelled Open Palm, Victory, and Fist examples"
            >
              {/* Open Palm group */}
              <ellipse
                cx="86"
                cy="78"
                rx="50"
                ry="36"
                fill="#E8F0FE"
                stroke="#4285F4"
                strokeOpacity="0.45"
                strokeDasharray="4 3"
              />
              {openPalmSamples.map((pt, i) => (
                <circle
                  key={`op-${i}`}
                  cx={pt.x}
                  cy={pt.y}
                  r="6.5"
                  fill="#4285F4"
                  stroke="#FFFFFF"
                  strokeWidth="1.5"
                />
              ))}
              <text x="86" y="29" textAnchor="middle" fontSize="13" fontWeight="700" fill="#1967D2">
                Open Palm
              </text>

              {/* Victory group */}
              <ellipse
                cx="302"
                cy="75"
                rx="54"
                ry="38"
                fill="#E6F4EA"
                stroke="#34A853"
                strokeOpacity="0.55"
                strokeDasharray="4 3"
              />
              {victorySamples.map((pt, i) => (
                <circle
                  key={`vic-${i}`}
                  cx={pt.x}
                  cy={pt.y}
                  r="6.5"
                  fill="#34A853"
                  stroke="#FFFFFF"
                  strokeWidth="1.5"
                />
              ))}
              <text x="302" y="27" textAnchor="middle" fontSize="13" fontWeight="700" fill="#137333">
                Victory
              </text>

              {/* Fist group */}
              <ellipse
                cx="100"
                cy="200"
                rx="46"
                ry="32"
                fill="#FCE8E6"
                stroke="#EA4335"
                strokeOpacity="0.45"
                strokeDasharray="4 3"
              />
              {fistSamples.map((pt, i) => (
                <circle
                  key={`fist-${i}`}
                  cx={pt.x}
                  cy={pt.y}
                  r="6.5"
                  fill="#EA4335"
                  stroke="#FFFFFF"
                  strokeWidth="1.5"
                />
              ))}
              <text x="100" y="247" textAnchor="middle" fontSize="13" fontWeight="700" fill="#C5221F">
                Fist
              </text>

              {/* Nearest neighbours comparison */}
              <circle
                cx={newSample.x}
                cy={newSample.y}
                r="62"
                fill="#FEF7E0"
                fillOpacity="0.38"
                stroke="#FBBC05"
                strokeWidth="1.6"
                strokeDasharray="5 4"
              />
              {closestThree.map((pt, idx) => (
                <line
                  key={`nn-${idx}`}
                  x1={newSample.x}
                  y1={newSample.y}
                  x2={pt.x}
                  y2={pt.y}
                  stroke="#202124"
                  strokeWidth="2"
                  strokeDasharray="4 3"
                />
              ))}

              {/* New sample */}
              <circle
                cx={newSample.x}
                cy={newSample.y}
                r="13.5"
                fill="#FBBC05"
                stroke="#202124"
                strokeWidth="2.4"
              />
              <text
                x={newSample.x}
                y={newSample.y + 5}
                textAnchor="middle"
                fontSize="14"
                fontWeight="800"
                fill="#202124"
              >
                ?
              </text>

              <rect
                x="212"
                y="178"
                width="190"
                height="52"
                rx="8"
                fill="#FFFFFF"
                stroke="#DADCE0"
              />
              <text x="225" y="200" fontSize="12" fontWeight="700" fill="#202124">
                New gesture sample
              </text>
              <text x="225" y="218" fontSize="12" fontWeight="700" fill="#137333">
                Closest class → Victory
              </text>
            </svg>
          </div>

          <div className="mt-4 flex items-baseline gap-3">
            <h3 className="font-display text-3xl font-bold tracking-tight text-[#202124]">KNN</h3>
            <span className="text-xs font-bold tracking-wider text-[#137333] uppercase">
              Custom Gesture Classifier
            </span>
          </div>
          <p className="mt-1.5 text-base font-medium text-[#5F6368]">
            Compares a new gesture with your collected examples to pick the closest match.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-[#E8EAED] pt-3">
        <span className="text-lg font-bold text-[#202124]">
          <span className="text-[#4285F4]">One tracks your hand.</span>{' '}
          <span className="text-[#137333]">The other recognises your gesture.</span>
        </span>
        <span className="hidden text-xs font-medium text-[#5F6368] lg:inline">
          Custom KNN learns your own gestures · Built-in MediaPipe gestures remain available anytime
        </span>
      </div>
    </div>
  );
}

/**
 * Slide 9 — YOUR MISSION STARTS NOW.
 * Chrome Dino teacher mascot invites participants into the hands-on workshop app.
 */
function Slide9Mission({ slide, onOpenApp }) {
  return (
    <div className="flex h-full flex-col justify-between">
      <div className="flex items-center justify-between border-b border-[#E8EAED] pb-3.5">
        <span className="text-xs font-bold tracking-[0.14em] text-[#5F6368] uppercase">
          {slide.title}
        </span>
        <GoogleAccentRule />
      </div>

      <div className="my-auto grid grid-cols-12 items-center gap-12">
        <div className="col-span-7 flex flex-col items-start">
          <h2
            className="font-display text-[4.85rem] font-bold tracking-tight text-[#202124] leading-[0.95]"
            style={{ textWrap: 'balance' }}
          >
            LET&apos;S GET
            <br />
            <span className="text-[#4285F4]">HANDS-ON!</span>
          </h2>

          <p className="mt-6 max-w-xl text-[1.35rem] font-medium leading-relaxed text-[#5F6368]">
            {slide.tagline}
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => onOpenApp(null)}
              className="inline-flex cursor-pointer items-center gap-3 rounded-lg bg-[#4285F4] px-8 py-4 text-lg font-extrabold whitespace-nowrap text-white shadow-[0_10px_24px_rgba(66,133,244,0.28)] transition-colors hover:bg-[#1A73E8]"
            >
              <span>{slide.ctaText}</span>
              <ArrowRight className="h-5 w-5" />
            </button>

            <button
              type="button"
              onClick={() => onOpenApp('gesture-lab')}
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[#DADCE0] bg-[#FFFFFF] px-5 py-4 text-sm font-bold whitespace-nowrap text-[#202124] transition-colors hover:border-[#4285F4] hover:text-[#4285F4]"
            >
              <span>Open Custom Gesture Lab</span>
            </button>
          </div>
        </div>

        <div className="col-span-5 flex flex-col items-center justify-center rounded-2xl border border-[#DADCE0] bg-[#F8F9FA] px-8 py-9 text-center">
          <ChromeDinoMascot pose="teacher" className="h-64 w-64" />
          <p className="mt-4 text-lg font-bold text-[#202124]">
            Teacher Dino is ready when you are.
          </p>
          <div className="mt-2.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs font-semibold text-[#5F6368]">
            <button
              type="button"
              onClick={() => onOpenApp('gesture-lab')}
              className="cursor-pointer transition-colors hover:text-[#4285F4]"
            >
              Custom Gesture Lab
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => onOpenApp('magic-canvas')}
              className="cursor-pointer transition-colors hover:text-[#4285F4]"
            >
              Magic Canvas
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => onOpenApp('particle-universe')}
              className="cursor-pointer transition-colors hover:text-[#4285F4]"
            >
              Particle Universe
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => onOpenApp('pose-challenge')}
              className="cursor-pointer transition-colors hover:text-[#4285F4]"
            >
              Pose Challenge
            </button>
          </div>
        </div>
      </div>

      <div className="border-t border-[#E8EAED] pt-3 text-xs font-medium text-[#5F6368]">
        Press Enter or click LET&apos;S GET HANDS-ON! to launch the workshop app
      </div>
    </div>
  );
}

/**
 * Slide 10 — WHAT POWERS OUR APP?
 * Clean Apple-like editorial slide introducing MediaPipe (pretrained hand tracking)
 * before transitioning into participants training their own KNN gesture model.
 */
function Slide10WhatPowersOurApp({ slide }) {
  return (
    <div className="flex h-full flex-col justify-between">
      {/* Header with eyebrow label, large serif headline, and short subtitle */}
      <header className="flex items-end justify-between gap-6 border-b border-[#E8EAED] pb-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold tracking-[0.16em] text-[#9A6B16] uppercase">
            {slide.eyebrow || 'HELLO, VISION! / BEHIND THE SCENES'}
          </p>
          <h2
            className="font-display mt-1 text-[2.6rem] font-bold tracking-tight text-[#202124] leading-[1.02]"
            style={{ textWrap: 'balance' }}
          >
            {slide.title}
          </h2>
          <p className="mt-1 text-[1rem] font-medium text-[#5F6368] leading-snug">
            {slide.subtitle}
          </p>
        </div>
        <div className="pb-1">
          <GoogleAccentRule />
        </div>
      </header>

      {/* Main visual focus + two minimal model cards */}
      <div className="my-auto flex flex-col items-center gap-4">
        {/* Authentic application camera feed frame with MediaPipe 21-landmark overlay */}
        <div className="w-full max-w-[580px] overflow-hidden rounded-2xl border border-[#DADCE0] bg-[#0b0c10] p-2.5 shadow-[0_14px_34px_rgba(32,33,36,0.08)]">
          <div className="flex items-center justify-between px-1.5 pb-2 text-[11px]">
            <span className="font-medium tracking-wide text-[#d4cfc4]">Camera Feed</span>
            <span className="font-mono text-[10.5px] font-medium text-[#e8cc84]">
              Pretrained MediaPipe
            </span>
          </div>

          <div className="relative flex h-[264px] w-full items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black">
            <div className="relative aspect-[4/3] h-full">
              <img
                src={humanHandPhoto}
                alt="Live camera feed showing a hand with MediaPipe's 21 landmarks and connecting lines"
                className="block h-full w-full object-cover"
              />
              <HandSkeletonSvg
                points={HAND_21_POINTS_4X3}
                workshopStyle
                pointScale={1.08}
              />
            </div>

            <div className="pointer-events-none absolute right-2.5 bottom-2.5 left-2.5 flex items-center justify-between rounded-lg bg-black/75 px-3 py-1 text-[11px] text-stone-200">
              <span>21 landmarks ready (21 pts)</span>
              <span className="font-mono text-[#e8cc84]">63 features</span>
            </div>
          </div>
        </div>

        {/* Two minimal editorial cards subtly connected by a small arrow */}
        <div className="grid w-full max-w-[780px] grid-cols-[1fr_auto_1fr] items-center gap-4">
          <div className="rounded-xl border border-[#E6E2D8] bg-[#FAF8F3] px-5 py-3.5">
            <p className="text-[11px] font-bold tracking-[0.14em] text-[#137333] uppercase">
              PRETRAINED MODEL
            </p>
            <h3 className="font-display mt-1 text-[1.6rem] font-bold tracking-tight text-[#202124] leading-tight">
              MediaPipe
            </h3>
            <p className="mt-1 text-[14.5px] font-medium text-[#5F6368]">
              Tracks 21 hand landmarks.
            </p>
          </div>

          <div
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[#E6E2D8] bg-[#FAF8F3]"
            aria-hidden="true"
          >
            <ArrowRight className="h-4 w-4 text-[#5F6368]" />
          </div>

          <div className="rounded-xl border border-[#E6E2D8] bg-[#FAF8F3] px-5 py-3.5">
            <p className="text-[11px] font-bold tracking-[0.14em] text-[#9A6B16] uppercase">
              OUR OWN MODEL
            </p>
            <h3 className="font-display mt-1 text-[1.6rem] font-bold tracking-tight text-[#202124] leading-tight">
              KNN
            </h3>
            <p className="mt-1 text-[14.5px] font-medium text-[#5F6368]">
              Learns gestures from our samples.
            </p>
          </div>
        </div>
      </div>

      {/* Closing transition */}
      <div className="border-t border-[#E8EAED] pt-3">
        <p className="text-[15px] font-bold tracking-[0.06em] text-[#202124] uppercase">
          NOW, LET&apos;S TRAIN OUR OWN MODEL.
        </p>
      </div>
    </div>
  );
}

export default function SlideVisuals({ slide, revealStep, onSetRevealStep, onOpenApp }) {
  switch (slide.id) {
    case 'slide-1':
      return <Slide1Opening slide={slide} onOpenApp={onOpenApp} />;
    case 'slide-2':
      return <Slide2Hook />;
    case 'slide-3':
      return (
        <Slide3Contrast
          slide={slide}
          revealStep={revealStep}
          onSetRevealStep={onSetRevealStep}
        />
      );
    case 'slide-4':
      return <Slide4WhatIsCV slide={slide} />;
    case 'slide-5':
      return <Slide5Everywhere slide={slide} />;
    case 'slide-6':
      return <Slide6Tasks slide={slide} />;
    case 'slide-7':
      return <Slide7WorkshopHook slide={slide} />;
    case 'slide-8':
      return <Slide8HowItWorks slide={slide} />;
    case 'slide-9':
      return <Slide9Mission slide={slide} onOpenApp={onOpenApp} />;
    case 'slide-10':
    default:
      return <Slide10WhatPowersOurApp slide={slide} />;
  }
}
