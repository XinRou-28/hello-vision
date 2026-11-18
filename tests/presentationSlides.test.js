import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { PRESENTATION_SLIDES } from '../src/presentation/slidesData.js';

test('Presentation contains all 10 HELLO, VISION! slides in the refined story arc without section labels or presenter notes', () => {
  assert.equal(PRESENTATION_SLIDES.length, 10);

  const expectedTitles = [
    'HELLO, VISION!',
    'ABSOLUTE CINEMA.',
    'CAN COMPUTERS SEE?',
    'WHAT IS COMPUTER VISION?',
    'COMPUTER VISION IS EVERYWHERE.',
    'DIFFERENT WAYS COMPUTERS SEE.',
    'CAN WE TEACH A COMPUTER TO RECOGNISE OUR GESTURES?',
    'SO, HOW DOES IT WORK?',
    "NOW IT'S YOUR TURN.",
    'YOUR MISSION STARTS NOW.',
  ];

  PRESENTATION_SLIDES.forEach((slide, idx) => {
    assert.equal(slide.number, idx + 1);
    assert.equal(slide.title, expectedTitles[idx]);
    assert.equal(slide.section, undefined, `Slide ${slide.number} should not include section label`);
    assert.equal(slide.notes, undefined, `Slide ${slide.number} should not expose presenter notes`);
  });

  assert.equal(
    PRESENTATION_SLIDES[7].takeaway,
    'One tracks your hand. The other learns what your gesture means.'
  );
  assert.equal(
    PRESENTATION_SLIDES[9].subtitle,
    'TEACH A COMPUTER TO RECOGNISE YOUR GESTURES.'
  );
  assert.equal(PRESENTATION_SLIDES[9].ctaText, "LET'S GET HANDS-ON!");
});

test('Presentation deck UI omits Presenter Notes and Overview controls', () => {
  const deckSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/presentation/PresentationDeck.jsx'),
    'utf-8'
  );
  assert.equal(deckSource.includes('Presenter Notes'), false);
  assert.equal(deckSource.includes('Overview'), false);
  assert.equal(deckSource.includes('showNotes'), false);
  assert.equal(deckSource.includes('showOverview'), false);
});

test('All required presentation photographs, meme, and app screenshots exist in workspace', () => {
  const requiredAssets = [
    'public/assets/images/image_fd123493.png',
    'public/assets/images/image_e0e84eaa.png',
    'public/assets/images/image_968223bc.png',
    'public/assets/images/image_2b43bf83.png',
    'src/assets/images/human_hand_photo_1794878400143.jpg',
    'src/assets/images/cv_hand_photo_1794878401126.jpg',
    'src/assets/images/cv_driving_photo_1794878401682.jpg',
    'src/assets/images/cv_medical_photo_1794878400366.jpg',
    'src/assets/images/agriculture_crops_photo_1794879960965.jpg',
    'src/assets/images/everyday_ocr_photo_1794879960894.jpg',
    'src/assets/images/pose_athlete_photo_1794879961017.jpg',
    'src/assets/images/participant_webcam_photo_1794879961974.jpg',
    'src/assets/images/app_magic_canvas.png',
    'src/assets/images/app_particle_universe.png',
    'src/assets/images/app_gesture_lab.png',
    'src/assets/images/app_pose_challenge.png',
  ];

  for (const relPath of requiredAssets) {
    const absPath = path.resolve(process.cwd(), relPath);
    assert.equal(fs.existsSync(absPath), true, `Missing asset: ${relPath}`);
  }
});
