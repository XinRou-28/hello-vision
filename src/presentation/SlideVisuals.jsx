import { ArrowRight, Eye, Play } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import agricultureCropsPhoto from '../assets/images/agriculture_crops_photo_1794879960965.jpg';
import appGestureLabImg from '../assets/images/app_gesture_lab.png';
import appMagicCanvasImg from '../assets/images/app_magic_canvas.png';
import appParticleUniverseImg from '../assets/images/app_particle_universe.png';
import appPoseChallengeImg from '../assets/images/app_pose_challenge.png';
import cvDrivingPhoto from '../assets/images/cv_driving_photo_1794878401682.jpg';
import cvHandPhoto from '../assets/images/cv_hand_photo_1794878401126.jpg';
import cvMedicalPhoto from '../assets/images/cv_medical_photo_1794878400366.jpg';
import everydayOcrPhoto from '../assets/images/everyday_ocr_photo_1794879960894.jpg';
import humanHandPhoto from '../assets/images/human_hand_photo_1794878400143.jpg';
import participantWebcamPhoto from '../assets/images/participant_webcam_photo_1794879961974.jpg';
import poseAthletePhoto from '../assets/images/pose_athlete_photo_1794879961017.jpg';
import { HAND_CONNECTIONS } from '../vision/landmarkMath.js';
import ChromeDinoMascot from './ChromeDinoMascot.jsx';

const MEME_SRC = '/assets/images/image_e0e84eaa.png';
const PERFORMER_PHOTO_SRC = '/assets/images/image_968223bc.png';
const SLIDE1_DINO_SRC = '/assets/images/image_2b43bf83.png';

// 21 hand landmarks aligned to human_hand_photo_1794878400143.jpg (aspect 4:3)
const HAND_21_POINTS = [
  { id: 0, x: 50, y: 82 },
  { id: 1, x: 59, y: 74 },
  { id: 2, x: 64, y: 63 },
  { id: 3, x: 68, y: 52 },
  { id: 4, x: 71, y: 42 },
  { id: 5, x: 56, y: 50 },
  { id: 6, x: 57, y: 36 },
  { id: 7, x: 58, y: 24 },
  { id: 8, x: 58.5, y: 14 },
  { id: 9, x: 49.5, y: 47 },
  { id: 10, x: 49.5, y: 31 },
  { id: 11, x: 49, y: 19 },
  { id: 12, x: 49, y: 10 },
  { id: 13, x: 43, y: 50 },
  { id: 14, x: 42.5, y: 34 },
  { id: 15, x: 42, y: 23 },
  { id: 16, x: 42, y: 15 },
  { id: 17, x: 37.5, y: 56 },
  { id: 18, x: 36, y: 44 },
  { id: 19, x: 34.5, y: 35 },
  { id: 20, x: 33.5, y: 28 },
];

// Object detection boxes aligned to cv_driving_photo_1794878401682.jpg (aspect 4:3)
const STREET_DETECTIONS = [
  { label: 'Traffic Light', x: 59, y: 22.5, w: 4.2, h: 8.2, color: '#FBBC05' },
  { label: 'Person', x: 30, y: 50, w: 5.5, h: 14, color: '#EA4335' },
  { label: 'Person', x: 40.5, y: 50, w: 6, h: 14, color: '#EA4335' },
  { label: 'Car', x: 48.2, y: 50.2, w: 6.8, h: 7.8, color: '#4285F4' },
  { label: 'Car', x: 58.6, y: 49.8, w: 9.8, h: 11, color: '#4285F4' },
  { label: 'Person', x: 72.8, y: 50.5, w: 5.5, h: 14, color: '#EA4335' },
];

// Full-body pose keypoints aligned to pose_athlete_photo_1794879961017.jpg (aspect 3:4)
const POSE_POINTS = {
  nose: { x: 50.2, y: 17.5 },
  leftEye: { x: 48.4, y: 16.0 },
  rightEye: { x: 52.0, y: 16.0 },
  leftShoulder: { x: 43.2, y: 27.6 },
  rightShoulder: { x: 56.8, y: 27.6 },
  leftElbow: { x: 25.5, y: 35.8 },
  rightElbow: { x: 75.5, y: 35.2 },
  leftWrist: { x: 16.5, y: 26.2 },
  rightWrist: { x: 83.8, y: 25.5 },
  leftHip: { x: 43.2, y: 52.4 },
  rightHip: { x: 56.5, y: 52.4 },
  leftKnee: { x: 43.4, y: 72.5 },
  rightKnee: { x: 57.5, y: 72.5 },
  leftAnkle: { x: 42.2, y: 90.0 },
  rightAnkle: { x: 59.5, y: 90.0 },
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

// Elements detected in uploaded performer photograph (aspect 1:1)
const SCENE_ELEMENTS = [
  { label: 'Person', x: 13, y: 7, w: 76, h: 91, color: '#4285F4' },
  { label: 'Face', x: 32, y: 12, w: 22, h: 24, color: '#34A853' },
  { label: 'Microphone', x: 31, y: 40, w: 10, h: 19, color: '#FBBC05' },
];

function GoogleAccentRule() {
  return (
    <div className="flex h-1 w-24 shrink-0 overflow-hidden" aria-hidden="true">
      <span className="flex-1 bg-[#4285F4]" />
      <span className="flex-1 bg-[#EA4335]" />
      <span className="flex-1 bg-[#FBBC05]" />
      <span className="flex-1 bg-[#34A853]" />
    </div>
  );
}

function SlideHeader({ title, subtitle, compactTitle = false }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-6 border-b border-[#E8EAED] pb-4">
      <div>
        <h2
          className={`${
            compactTitle ? 'text-[1.95rem]' : 'text-[2.25rem]'
          } font-extrabold tracking-tight text-[#202124] leading-[1.1]`}
          style={{ textWrap: 'balance' }}
        >
          {title}
        </h2>
        {subtitle && <p className="mt-1.5 text-base font-medium text-[#5F6368]">{subtitle}</p>}
      </div>
      <GoogleAccentRule />
    </div>
  );
}

/**
 * Slide 1 — Opening Slide: HELLO, VISION!
 */
function Slide1Opening({ slide, onOpenApp }) {
  return (
    <div className="flex h-full flex-col justify-between">
      <div className="flex items-center justify-between border-b border-[#E8EAED] pb-4 text-xs font-semibold text-[#5F6368]">
        <div className="flex items-center gap-3">
          <GoogleAccentRule />
          <span className="tracking-[0.08em] text-[#202124] uppercase">{slide.brand}</span>
        </div>
        <span>90-Minute Hands-On Workshop</span>
      </div>

      <div className="my-auto grid grid-cols-12 items-center gap-10 py-4">
        <div className="col-span-8">
          <p className="text-sm font-bold tracking-[0.12em] text-[#4285F4] uppercase">
            Computer Vision · Machine Learning · Gesture Recognition
          </p>

          <h1
            className="mt-4 text-[5.25rem] font-black tracking-tight text-[#202124] leading-[0.94]"
            style={{ textWrap: 'balance' }}
          >
            HELLO, VISION!
          </h1>

          <p className="mt-5 text-[1.65rem] font-semibold text-[#3C4043] leading-snug">
            {slide.subtitle}
          </p>

          <p className="mt-3 text-xl font-medium text-[#5F6368]">{slide.tagline}</p>

          <div className="mt-9 flex items-center gap-6">
            <button
              type="button"
              onClick={() => onOpenApp(null)}
              className="inline-flex cursor-pointer items-center gap-2.5 rounded-lg bg-[#4285F4] px-6 py-3 text-sm font-semibold whitespace-nowrap text-white transition-colors hover:bg-[#1A73E8]"
            >
              <Play className="h-4 w-4" />
              <span>Open Workshop App</span>
            </button>
            <span className="text-sm text-[#5F6368]">Press Space or → to begin</span>
          </div>
        </div>

        <div className="col-span-4 flex flex-col items-center justify-center rounded-xl border border-[#E8EAED] bg-[#F3F3F1] px-5 py-7 text-center">
          <img
            src={SLIDE1_DINO_SRC}
            alt="Chrome Dino mascot wearing a party hat"
            className="block h-auto w-full max-w-[290px] object-contain"
          />
          <p className="mt-4 text-sm font-semibold text-[#202124]">Hi there! Ready to see?</p>
          <p className="mt-1 text-xs text-[#5F6368]">Beginner-friendly · Hands-on</p>
        </div>
      </div>

      <div className="border-t border-[#E8EAED] pt-3 text-xs text-[#5F6368]">
        GDG On Campus Universiti Malaya
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
      <div className="flex items-center justify-end border-b border-[#E8EAED] pb-3">
        <GoogleAccentRule />
      </div>

      <div className="my-auto flex flex-col items-center text-center">
        <h2 className="text-[3.4rem] font-black tracking-tight text-[#202124] leading-none">
          ABSOLUTE CINEMA.
        </h2>

        <div className="mt-5 w-full max-w-xl overflow-hidden rounded-lg border border-[#DADCE0] bg-[#111318] p-2">
          {!memeMissing ? (
            <img
              src={MEME_SRC}
              alt="Absolute Cinema raised hands pose"
              onError={() => setMemeMissing(true)}
              className="block max-h-78 w-full object-contain"
            />
          ) : (
            <div className="flex h-64 flex-col items-center justify-center border border-dashed border-[#5F6368] p-6 text-white">
              <p className="text-sm font-bold">Absolute Cinema Image Unavailable</p>
              <p className="mt-1 text-xs text-[#9AA0A6]">
                Expected at public/assets/images/image_e0e84eaa.png
              </p>
            </div>
          )}
        </div>

        <p className="mt-5 text-[1.65rem] font-bold text-[#4285F4]">
          But can a computer actually see what you&apos;re doing?
        </p>
      </div>

      <div className="border-t border-[#E8EAED] pt-3 text-xs text-[#5F6368]">
        To human eyes: a famous pose · To a webcam: millions of pixels
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
      <SlideHeader title={slide.title} />

      <div className="my-auto grid grid-cols-2 items-center gap-10">
        <div className="flex flex-col">
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-[#DADCE0] bg-[#F8F9FA]">
            <img
              src={humanHandPhoto}
              alt="Human open hand seen naturally"
              className="block h-full w-full object-cover"
            />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-xl font-bold text-[#202124]">What we see</span>
            <span className="text-sm text-[#5F6368]">An open hand</span>
          </div>
        </div>

        <div className="flex flex-col">
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-[#DADCE0] bg-[#111318]">
            <img
              src={humanHandPhoto}
              alt="Hand tracked by 21 MediaPipe landmarks"
              className={`block h-full w-full object-cover transition-all duration-300 ${
                showOverlay ? 'opacity-30 grayscale contrast-125' : 'opacity-100'
              }`}
            />

            {showOverlay && (
              <motion.svg
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="pointer-events-none absolute inset-0 h-full w-full"
              >
                <rect
                  x="28"
                  y="7"
                  width="48"
                  height="80"
                  rx="2"
                  fill="none"
                  stroke="#4285F4"
                  strokeWidth="0.9"
                  strokeDasharray="2.5 2"
                />
                {HAND_CONNECTIONS.map(([a, b], idx) => (
                  <line
                    key={idx}
                    x1={HAND_21_POINTS[a].x}
                    y1={HAND_21_POINTS[a].y}
                    x2={HAND_21_POINTS[b].x}
                    y2={HAND_21_POINTS[b].y}
                    stroke="#34A853"
                    strokeWidth="1.25"
                  />
                ))}
                {HAND_21_POINTS.map((pt) => (
                  <circle
                    key={pt.id}
                    cx={pt.x}
                    cy={pt.y}
                    r="2"
                    fill={pt.id === 0 ? '#EA4335' : '#FBBC05'}
                    stroke="#FFFFFF"
                    strokeWidth="0.5"
                  />
                ))}
              </motion.svg>
            )}

            {!showOverlay && (
              <button
                type="button"
                onClick={() => onSetRevealStep(1)}
                className="absolute inset-0 flex cursor-pointer items-center justify-center bg-black/45 transition-colors hover:bg-black/55"
              >
                <span className="inline-flex items-center gap-2 rounded-lg bg-[#4285F4] px-5 py-2.5 text-sm font-semibold text-white">
                  <Eye className="h-4 w-4" />
                  <span>Reveal Computer Vision View</span>
                </span>
              </button>
            )}
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-xl font-bold text-[#4285F4]">What the computer detects</span>
            <span className="font-mono text-sm tabular-nums text-[#5F6368]">21 landmarks</span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-[#E8EAED] pt-3">
        <span className="text-lg font-extrabold text-[#202124]">
          Same hand. Different perspective.
        </span>
        <button
          type="button"
          onClick={() => onSetRevealStep(showOverlay ? 0 : 1)}
          className="cursor-pointer rounded-lg border border-[#DADCE0] bg-[#F8F9FA] px-4 py-1.5 text-xs font-semibold text-[#202124] hover:bg-[#E8EAED]"
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

      <div className="my-auto grid grid-cols-[1fr_auto_1fr_auto_1fr] items-stretch gap-4">
        {/* Step 1: Visual Input */}
        <div className="flex flex-col">
          <div className="mb-2 text-xs font-bold tracking-wider text-[#4285F4] uppercase">
            1. Ordinary image
          </div>
          <div className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-lg border border-[#DADCE0] bg-[#14161D]">
            <div className="relative h-full aspect-square">
              <img
                src={PERFORMER_PHOTO_SRC}
                alt="Performer standing at a vintage microphone"
                className="block h-full w-full object-cover"
              />
            </div>
          </div>
          <p className="mt-3 text-base font-bold text-[#202124]">Visual input</p>
          <p className="mt-1 text-sm leading-snug text-[#5F6368]">
            An ordinary photo is provided to the computer as pixels.
          </p>
        </div>

        <div className="flex items-center justify-center pt-4">
          <ArrowRight className="h-5 w-5 text-[#5F6368]" />
        </div>

        {/* Step 2: Process Visual Information */}
        <div className="flex flex-col">
          <div className="mb-2 text-xs font-bold tracking-wider text-[#B06000] uppercase">
            2. Process visual info
          </div>
          <div className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-lg border border-[#DADCE0] bg-[#111318]">
            <div className="relative h-full aspect-square">
              <img
                src={PERFORMER_PHOTO_SRC}
                alt="Visual information processed as contrast, edges, and grid regions"
                className="block h-full w-full object-cover opacity-85 contrast-150 grayscale"
              />
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="pointer-events-none absolute inset-0 h-full w-full"
              >
                {[16, 33, 50, 67, 84].map((x) => (
                  <line
                    key={`vx-${x}`}
                    x1={x}
                    y1="0"
                    x2={x}
                    y2="100"
                    stroke="#FBBC05"
                    strokeOpacity="0.35"
                    strokeWidth="0.6"
                  />
                ))}
                {[16, 33, 50, 67, 84].map((y) => (
                  <line
                    key={`hy-${y}`}
                    x1="0"
                    y1={y}
                    x2="100"
                    y2={y}
                    stroke="#FBBC05"
                    strokeOpacity="0.35"
                    strokeWidth="0.6"
                  />
                ))}
                <rect
                  x="15"
                  y="8"
                  width="72"
                  height="88"
                  fill="none"
                  stroke="#FBBC05"
                  strokeWidth="1.2"
                  strokeDasharray="3 2"
                />
              </svg>
            </div>
          </div>
          <p className="mt-3 text-base font-bold text-[#202124]">Process visual info</p>
          <p className="mt-1 text-sm leading-snug text-[#5F6368]">
            The computer scans colours, edges, shapes, and patterns.
          </p>
        </div>

        <div className="flex items-center justify-center pt-4">
          <ArrowRight className="h-5 w-5 text-[#5F6368]" />
        </div>

        {/* Step 3: Identify Patterns & Understand */}
        <div className="flex flex-col">
          <div className="mb-2 text-xs font-bold tracking-wider text-[#137333] uppercase">
            3. Understand elements
          </div>
          <div className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-lg border border-[#DADCE0] bg-[#14161D]">
            <div className="relative h-full aspect-square">
              <img
                src={PERFORMER_PHOTO_SRC}
                alt="Computer identifying a person, face, and microphone in the photograph"
                className="block h-full w-full object-cover"
              />
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="pointer-events-none absolute inset-0 h-full w-full"
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
                      strokeWidth="1.1"
                    />
                    <rect
                      x={el.x}
                      y={Math.max(0.5, el.y - 6.4)}
                      width={el.label.length * 2.7 + 4.5}
                      height="6.2"
                      fill={el.color}
                    />
                    <text
                      x={el.x + 2}
                      y={Math.max(4.8, el.y - 1.9)}
                      fontSize="4"
                      fontWeight="700"
                      fill="#FFFFFF"
                    >
                      {el.label}
                    </text>
                  </g>
                ))}
              </svg>
            </div>
          </div>
          <p className="mt-3 text-base font-bold text-[#202124]">Identify patterns</p>
          <p className="mt-1 text-sm leading-snug text-[#5F6368]">
            It recognises elements and understands what&apos;s in the image.
          </p>
        </div>
      </div>

      <div className="border-t border-[#E8EAED] pt-3 text-base font-semibold text-[#202124]">
        A camera captures pixels.{' '}
        <span className="text-[#4285F4]">Computer Vision helps a computer understand what&apos;s inside.</span>
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
      title: 'Autonomous driving',
      desc: 'Spotting lanes, pedestrians, vehicles, and traffic lights.',
      img: cvDrivingPhoto,
      color: '#4285F4',
    },
    {
      title: 'Healthcare',
      desc: 'Helping doctors review X-rays and medical scans.',
      img: cvMedicalPhoto,
      color: '#EA4335',
    },
    {
      title: 'Agriculture',
      desc: 'Checking crop health and spotting early plant disease.',
      img: agricultureCropsPhoto,
      color: '#34A853',
    },
    {
      title: 'Everyday technology',
      desc: 'Face unlock, QR codes, and scanning printed receipts.',
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
            <div
              className="aspect-[4/3] w-full overflow-hidden rounded-lg border border-[#DADCE0] bg-[#F1F3F4]"
              style={{ borderTopWidth: '4px', borderTopColor: item.color }}
            >
              <img
                src={item.img}
                alt={item.title}
                referrerPolicy="no-referrer"
                className="block h-full w-full object-cover"
              />
            </div>
            <h3 className="mt-3.5 text-lg font-extrabold tracking-tight text-[#202124]">
              {item.title}
            </h3>
            <p className="mt-1.5 text-sm leading-snug text-[#5F6368]">{item.desc}</p>
          </div>
        ))}
      </div>

      <div className="border-t border-[#E8EAED] pt-3 text-base font-semibold text-[#202124]">
        Different industries, one idea:{' '}
        <span className="text-[#4285F4]">helping computers understand visual information.</span>
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

      <div className="my-auto grid grid-cols-3 items-start gap-6">
        {/* Task 1: Object Detection */}
        <div className="flex flex-col">
          <div
            className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-[#DADCE0] bg-[#111318]"
            style={{ borderTopWidth: '4px', borderTopColor: '#4285F4' }}
          >
            <img
              src={cvDrivingPhoto}
              alt="Street scene showing object detection bounding boxes"
              className="block h-full w-full object-cover"
            />
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="pointer-events-none absolute inset-0 h-full w-full"
            >
              {STREET_DETECTIONS.map((box, idx) => (
                <g key={idx}>
                  <rect
                    x={box.x}
                    y={box.y}
                    width={box.w}
                    height={box.h}
                    fill={box.color}
                    fillOpacity="0.12"
                    stroke={box.color}
                    strokeWidth="0.9"
                  />
                  <rect
                    x={box.x}
                    y={Math.max(1, box.y - 4.8)}
                    width={box.label.length * 2.2 + 2.5}
                    height="4.6"
                    fill={box.color}
                  />
                  <text
                    x={box.x + 1.1}
                    y={Math.max(4.5, box.y - 1.3)}
                    fontSize="3.1"
                    fontWeight="700"
                    fill="#FFFFFF"
                  >
                    {box.label}
                  </text>
                </g>
              ))}
            </svg>
          </div>
          <h3 className="mt-3.5 text-lg font-extrabold text-[#202124]">Object Detection</h3>
          <p className="mt-1 text-sm text-[#5F6368]">Finds what objects are present and where they are.</p>
        </div>

        {/* Task 2: Hand Tracking */}
        <div className="flex flex-col">
          <div
            className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-[#DADCE0] bg-[#111318]"
            style={{ borderTopWidth: '4px', borderTopColor: '#34A853' }}
          >
            <img
              src={humanHandPhoto}
              alt="Human hand showing 21 landmark keypoints"
              className="block h-full w-full object-cover opacity-80"
            />
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="pointer-events-none absolute inset-0 h-full w-full"
            >
              {HAND_CONNECTIONS.map(([a, b], idx) => (
                <line
                  key={idx}
                  x1={HAND_21_POINTS[a].x}
                  y1={HAND_21_POINTS[a].y}
                  x2={HAND_21_POINTS[b].x}
                  y2={HAND_21_POINTS[b].y}
                  stroke="#34A853"
                  strokeWidth="1.25"
                />
              ))}
              {HAND_21_POINTS.map((pt) => (
                <circle
                  key={pt.id}
                  cx={pt.x}
                  cy={pt.y}
                  r="1.9"
                  fill={pt.id === 0 ? '#EA4335' : '#FBBC05'}
                  stroke="#FFFFFF"
                  strokeWidth="0.45"
                />
              ))}
            </svg>
          </div>
          <h3 className="mt-3.5 text-lg font-extrabold text-[#202124]">Hand Tracking</h3>
          <p className="mt-1 text-sm text-[#5F6368]">Follows 21 landmarks across your palm and fingers.</p>
        </div>

        {/* Task 3: Pose Estimation */}
        <div className="flex flex-col">
          <div
            className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-lg border border-[#DADCE0] bg-[#E8EAED]"
            style={{ borderTopWidth: '4px', borderTopColor: '#EA4335' }}
          >
            <div className="relative h-full aspect-[3/4]">
              <img
                src={poseAthletePhoto}
                alt="Person standing with arms raised showing full-body pose landmarks"
                className="block h-full w-full object-cover"
              />
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="pointer-events-none absolute inset-0 h-full w-full"
              >
                {POSE_LINKS.map(([a, b]) => (
                  <line
                    key={`${a}-${b}`}
                    x1={POSE_POINTS[a].x}
                    y1={POSE_POINTS[a].y}
                    x2={POSE_POINTS[b].x}
                    y2={POSE_POINTS[b].y}
                    stroke="#4285F4"
                    strokeWidth="1.4"
                  />
                ))}
                {Object.entries(POSE_POINTS).map(([key, pt]) => (
                  <circle
                    key={key}
                    cx={pt.x}
                    cy={pt.y}
                    r="2.1"
                    fill="#EA4335"
                    stroke="#FFFFFF"
                    strokeWidth="0.55"
                  />
                ))}
              </svg>
            </div>
          </div>
          <h3 className="mt-3.5 text-lg font-extrabold text-[#202124]">Pose Estimation</h3>
          <p className="mt-1 text-sm text-[#5F6368]">Tracks major joints across the whole human body.</p>
        </div>
      </div>

      <div className="border-t border-[#E8EAED] pt-3 text-base font-semibold text-[#202124]">
        Every task zooms in on a different part of the scene.
      </div>
    </div>
  );
}

/**
 * Slide 7 — CAN WE TEACH A COMPUTER TO RECOGNISE OUR GESTURES?
 * Exciting, visually driven workshop hook connecting webcam gesture -> tracking/recognition -> interactive visuals.
 */
function Slide7WorkshopHook({ slide }) {
  return (
    <div className="flex h-full flex-col justify-between">
      <SlideHeader title={slide.title} subtitle={slide.subtitle} compactTitle />

      <div className="my-auto grid grid-cols-[1fr_auto_1fr_auto_1fr] items-stretch gap-4">
        {/* Panel 1: Person making a gesture in front of webcam */}
        <div className="flex flex-col">
          <div className="aspect-[4/3] w-full overflow-hidden rounded-lg border border-[#DADCE0] bg-[#F8F9FA]">
            <img
              src={participantWebcamPhoto}
              alt="Participant making a hand gesture in front of a laptop webcam"
              className="block h-full w-full object-cover"
            />
          </div>
          <h3 className="mt-3.5 text-lg font-extrabold text-[#202124]">1. Show a gesture</h3>
          <p className="mt-1 text-sm leading-snug text-[#5F6368]">
            Hold up your own gesture in front of a laptop webcam.
          </p>
        </div>

        <div className="flex items-center justify-center pb-14">
          <ArrowRight className="h-5 w-5 text-[#5F6368]" />
        </div>

        {/* Panel 2: Computer tracking and recognising the gesture */}
        <div className="flex flex-col">
          <div className="aspect-[4/3] w-full overflow-hidden rounded-lg border border-[#DADCE0] bg-[#111318]">
            <img
              src={appGestureLabImg}
              alt="Application tracking 21 hand landmarks and recognising gesture classes"
              className="block h-full w-full object-cover object-top"
            />
          </div>
          <h3 className="mt-3.5 text-lg font-extrabold text-[#202124]">2. Teach &amp; recognise</h3>
          <p className="mt-1 text-sm leading-snug text-[#5F6368]">
            The computer tracks your hand and learns your gesture from examples.
          </p>
        </div>

        <div className="flex items-center justify-center pb-14">
          <ArrowRight className="h-5 w-5 text-[#5F6368]" />
        </div>

        {/* Panel 3: Triggering colourful interactive digital visuals */}
        <div className="flex flex-col">
          <div className="grid aspect-[4/3] w-full grid-rows-2 gap-0.5 overflow-hidden rounded-lg border border-[#DADCE0] bg-[#090B10]">
            <img
              src={appMagicCanvasImg}
              alt="Magic Canvas fireworks triggered by hand gestures"
              className="block h-full w-full object-cover"
            />
            <img
              src={appParticleUniverseImg}
              alt="Particle Universe 3D starfield controlled by hand gestures"
              className="block h-full w-full object-cover"
            />
          </div>
          <h3 className="mt-3.5 text-lg font-extrabold text-[#202124]">3. Control visuals live</h3>
          <p className="mt-1 text-sm leading-snug text-[#5F6368]">
            Your gestures launch fireworks and shape a 3D particle universe.
          </p>
        </div>
      </div>

      <div className="border-t border-[#E8EAED] pt-3 text-base font-semibold text-[#202124]">
        Your hands become the controller —{' '}
        <span className="text-[#4285F4]">built from your own examples.</span>
      </div>
    </div>
  );
}

/**
 * Slide 8 — SO, HOW DOES IT WORK?
 * Simple side-by-side layout: MediaPipe (21 landmarks) + KNN (labelled examples classifying a new sample).
 */
function Slide8HowItWorks({ slide }) {
  const openPalmSamples = [
    { x: 64, y: 68 },
    { x: 92, y: 50 },
    { x: 108, y: 78 },
    { x: 78, y: 94 },
  ];
  const victorySamples = [
    { x: 274, y: 62 },
    { x: 306, y: 50 },
    { x: 320, y: 80 },
    { x: 288, y: 94 },
  ];
  const fistSamples = [
    { x: 92, y: 184 },
    { x: 120, y: 202 },
    { x: 78, y: 208 },
    { x: 112, y: 172 },
  ];
  const newSample = { x: 256, y: 126 };
  const closestThree = [
    { x: 288, y: 94 },
    { x: 274, y: 62 },
    { x: 320, y: 80 },
  ];

  return (
    <div className="flex h-full flex-col justify-between">
      <SlideHeader title={slide.title} subtitle={slide.subtitle} />

      <div className="my-auto grid grid-cols-2 items-stretch gap-8">
        {/* Left: MEDIAPIPE */}
        <div className="flex flex-col">
          <div
            className="flex h-[280px] w-full items-center justify-center overflow-hidden rounded-lg border border-[#DADCE0] bg-[#111318]"
            style={{ borderTopWidth: '4px', borderTopColor: '#4285F4' }}
          >
            <div className="relative h-full aspect-[4/3]">
              <img
                src={humanHandPhoto}
                alt="Hand photograph overlaid with 21 MediaPipe landmarks"
                className="block h-full w-full object-cover opacity-85"
              />
              <svg
                viewBox="0 0 100 100"
                className="pointer-events-none absolute inset-0 h-full w-full"
              >
                {HAND_CONNECTIONS.map(([a, b], idx) => (
                  <line
                    key={idx}
                    x1={HAND_21_POINTS[a].x}
                    y1={HAND_21_POINTS[a].y}
                    x2={HAND_21_POINTS[b].x}
                    y2={HAND_21_POINTS[b].y}
                    stroke="#34A853"
                    strokeWidth="1.4"
                  />
                ))}
                {HAND_21_POINTS.map((pt) => (
                  <circle
                    key={pt.id}
                    cx={pt.x}
                    cy={pt.y}
                    r="2"
                    fill={pt.id === 0 ? '#EA4335' : '#FBBC05'}
                    stroke="#FFFFFF"
                    strokeWidth="0.45"
                  />
                ))}
              </svg>
            </div>
          </div>

          <h3 className="mt-4 text-2xl font-black tracking-tight text-[#202124]">MEDIAPIPE</h3>
          <p className="mt-1 text-lg font-semibold text-[#5F6368]">
            Finds and tracks your hand.
          </p>
        </div>

        {/* Right: KNN */}
        <div className="flex flex-col">
          <div
            className="relative h-[280px] w-full overflow-hidden rounded-lg border border-[#DADCE0] bg-[#F8F9FA]"
            style={{ borderTopWidth: '4px', borderTopColor: '#34A853' }}
          >
            <svg
              viewBox="0 0 420 250"
              className="h-full w-full"
              role="img"
              aria-label="KNN comparing a new gesture sample against labelled Open Palm, Victory, and Fist examples"
            >
              {/* Open Palm group */}
              <ellipse
                cx="86"
                cy="72"
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
              <text x="86" y="25" textAnchor="middle" fontSize="13" fontWeight="800" fill="#1967D2">
                Open Palm
              </text>

              {/* Victory group */}
              <ellipse
                cx="298"
                cy="70"
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
              <text x="298" y="23" textAnchor="middle" fontSize="13" fontWeight="800" fill="#137333">
                Victory
              </text>

              {/* Fist group */}
              <ellipse
                cx="100"
                cy="192"
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
              <text x="100" y="238" textAnchor="middle" fontSize="13" fontWeight="800" fill="#C5221F">
                Fist
              </text>

              {/* Nearest neighbours comparison */}
              <circle
                cx={newSample.x}
                cy={newSample.y}
                r="62"
                fill="#FEF7E0"
                fillOpacity="0.35"
                stroke="#FBBC05"
                strokeWidth="1.5"
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
                r="13"
                fill="#FBBC05"
                stroke="#202124"
                strokeWidth="2.5"
              />
              <text
                x={newSample.x}
                y={newSample.y + 5}
                textAnchor="middle"
                fontSize="14"
                fontWeight="900"
                fill="#202124"
              >
                ?
              </text>

              <rect
                x="212"
                y="166"
                width="184"
                height="50"
                rx="6"
                fill="#FFFFFF"
                stroke="#DADCE0"
              />
              <text x="224" y="187" fontSize="12" fontWeight="800" fill="#202124">
                New gesture sample
              </text>
              <text x="224" y="205" fontSize="12" fontWeight="700" fill="#137333">
                Closest match → Victory
              </text>
            </svg>
          </div>

          <h3 className="mt-4 text-2xl font-black tracking-tight text-[#202124]">KNN</h3>
          <p className="mt-1 text-lg font-semibold text-[#5F6368]">
            Learns from examples to recognise your gesture.
          </p>
        </div>
      </div>

      <div className="border-t border-[#E8EAED] pt-3 text-center text-lg font-extrabold text-[#202124]">
        <span className="text-[#4285F4]">One tracks your hand.</span>{' '}
        <span className="text-[#34A853]">The other learns what your gesture means.</span>
      </div>
    </div>
  );
}

/**
 * Slide 9 — NOW IT'S YOUR TURN.
 * Participatory workshop invitation: 01 EXPLORE -> 02 TRAIN -> 03 PLAY (+ small Pose Challenge bonus).
 */
function Slide9YourTurn({ slide }) {
  const stages = [
    {
      num: '01 — EXPLORE',
      color: '#4285F4',
      desc: 'See your hand tracked live.',
      renderVisual: () => (
        <div className="relative h-full w-full overflow-hidden bg-[#F1F3F4]">
          <img
            src={cvHandPhoto}
            alt="Participant holding up a Victory sign tracked live"
            className="block h-full w-full object-cover"
          />
          <svg
            viewBox="0 0 400 300"
            className="pointer-events-none absolute inset-0 h-full w-full"
          >
            <rect
              x="278"
              y="104"
              width="56"
              height="98"
              rx="4"
              fill="#4285F4"
              fillOpacity="0.06"
              stroke="#4285F4"
              strokeWidth="2.5"
            />
            <line x1="302" y1="191" x2="296" y2="152" stroke="#34A853" strokeWidth="2.5" />
            <line x1="296" y1="152" x2="293" y2="115" stroke="#34A853" strokeWidth="2.5" />
            <line x1="302" y1="191" x2="310" y2="152" stroke="#34A853" strokeWidth="2.5" />
            <line x1="310" y1="152" x2="319" y2="117" stroke="#34A853" strokeWidth="2.5" />
            <line x1="302" y1="191" x2="319" y2="165" stroke="#34A853" strokeWidth="2.5" />
            <line x1="302" y1="191" x2="290" y2="168" stroke="#34A853" strokeWidth="2.5" />
            <circle cx="302" cy="191" r="4" fill="#EA4335" stroke="#FFFFFF" strokeWidth="1" />
            <circle cx="296" cy="152" r="3.5" fill="#FBBC05" stroke="#FFFFFF" strokeWidth="1" />
            <circle cx="293" cy="115" r="4" fill="#FBBC05" stroke="#FFFFFF" strokeWidth="1" />
            <circle cx="310" cy="152" r="3.5" fill="#FBBC05" stroke="#FFFFFF" strokeWidth="1" />
            <circle cx="319" cy="117" r="4" fill="#FBBC05" stroke="#FFFFFF" strokeWidth="1" />
            <circle cx="319" cy="165" r="3.5" fill="#FBBC05" stroke="#FFFFFF" strokeWidth="1" />
            <circle cx="290" cy="168" r="3.5" fill="#FBBC05" stroke="#FFFFFF" strokeWidth="1" />
          </svg>
        </div>
      ),
    },
    {
      num: '02 — TRAIN',
      color: '#FBBC05',
      desc: 'Collect examples and teach your own gesture model.',
      renderVisual: () => (
        <img
          src={appGestureLabImg}
          alt="Custom Gesture Lab collecting gesture samples"
          className="block h-full w-full object-cover object-top"
        />
      ),
    },
    {
      num: '03 — PLAY',
      color: '#34A853',
      desc: 'Test your model and control interactive digital visuals.',
      renderVisual: () => (
        <img
          src={appMagicCanvasImg}
          alt="Magic Canvas fireworks controlled live by custom hand gestures"
          className="block h-full w-full object-cover"
        />
      ),
    },
  ];

  return (
    <div className="flex h-full flex-col justify-between">
      <SlideHeader title={slide.title} subtitle={slide.subtitle} />

      <div className="my-auto grid grid-cols-3 items-start gap-7">
        {stages.map((stage) => (
          <div key={stage.num} className="flex flex-col">
            <div className="mb-2.5 font-mono text-base font-black tracking-tight" style={{ color: stage.color }}>
              {stage.num}
            </div>
            <div
              className="aspect-[4/3] w-full overflow-hidden rounded-lg border border-[#DADCE0] bg-[#111318]"
              style={{ borderTopWidth: '4px', borderTopColor: stage.color }}
            >
              {stage.renderVisual()}
            </div>
            <p className="mt-3.5 text-lg font-bold leading-snug text-[#202124]">{stage.desc}</p>
          </div>
        ))}
      </div>

      {/* Small bonus note for Pose Challenge */}
      <div className="flex items-center gap-3.5 border-t border-[#E8EAED] pt-3">
        <img
          src={appPoseChallengeImg}
          alt="Pose Challenge bonus activity"
          className="h-9 w-14 shrink-0 rounded border border-[#DADCE0] object-cover"
        />
        <p className="text-sm text-[#5F6368]">
          <span className="font-bold text-[#EA4335]">Bonus:</span>{' '}
          Once you&apos;ve tested your hand gestures, try the full-body{' '}
          <span className="font-semibold text-[#202124]">Pose Challenge</span>.
        </p>
      </div>
    </div>
  );
}

/**
 * Slide 10 — YOUR MISSION STARTS NOW.
 * Chrome Dino teacher mascot leads participants into the live workshop app.
 */
function Slide10Mission({ slide, onOpenApp }) {
  return (
    <div className="flex h-full flex-col justify-between">
      <div className="flex items-center justify-end border-b border-[#E8EAED] pb-4">
        <GoogleAccentRule />
      </div>

      <div className="my-auto grid grid-cols-12 items-center gap-10">
        <div className="col-span-7 flex flex-col items-start">
          <h2
            className="text-[3.5rem] font-black tracking-tight text-[#202124] leading-[0.98]"
            style={{ textWrap: 'balance' }}
          >
            {slide.title}
          </h2>

          <p className="mt-5 text-2xl font-extrabold text-[#4285F4] leading-snug">
            {slide.subtitle}
          </p>

          <p className="mt-3 text-lg font-medium text-[#5F6368]">{slide.tagline}</p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => onOpenApp(null)}
              className="inline-flex cursor-pointer items-center gap-3 rounded-lg bg-[#202124] px-7 py-4 text-base font-extrabold whitespace-nowrap text-white transition-colors hover:bg-[#4285F4]"
            >
              <span>{slide.ctaText}</span>
              <ArrowRight className="h-5 w-5" />
            </button>

            <button
              type="button"
              onClick={() => onOpenApp('gesture-lab')}
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[#DADCE0] bg-[#F8F9FA] px-5 py-4 text-sm font-bold whitespace-nowrap text-[#202124] transition-colors hover:border-[#4285F4] hover:text-[#4285F4]"
            >
              <span>Open Custom Gesture Lab</span>
            </button>
          </div>
        </div>

        <div className="col-span-5 flex flex-col items-center justify-center rounded-xl border border-[#DADCE0] bg-[#F8F9FA] px-8 py-10 text-center">
          <ChromeDinoMascot pose="teacher" className="h-56 w-56" />
          <p className="mt-5 text-lg font-extrabold text-[#202124]">
            Teacher Dino is ready when you are.
          </p>
          <p className="mt-1.5 text-xs font-medium text-[#5F6368]">
            Custom Gesture Lab · Magic Canvas · Particle Universe · Pose Challenge
          </p>
        </div>
      </div>

      <div className="border-t border-[#E8EAED] pt-3 text-xs text-[#5F6368]">
        Press Enter or click LET&apos;S GET HANDS-ON! to launch the workshop app
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
      return <Slide9YourTurn slide={slide} />;
    case 'slide-10':
    default:
      return <Slide10Mission slide={slide} onOpenApp={onOpenApp} />;
  }
}
