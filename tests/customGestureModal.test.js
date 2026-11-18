import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const modalPath = path.resolve(process.cwd(), 'src/components/CustomGestureModal.jsx');
const modalSource = fs.readFileSync(modalPath, 'utf-8');

test('CustomGestureModal defines the guided 3-tab workflow and beginner labels', () => {
  const requiredStrings = [
    '1. My Gestures',
    '2. Train Model',
    '3. Test & Map Actions',
    'Step 1 — Collect Your Gestures',
    'Your dataset contains examples of the gestures you want your computer to learn.',
    'Download Dataset (.json)',
    'Step 2 — Train Your Model with Google Colab',
    'Train Your Gesture Model',
    'Use Google Colab to teach your computer to recognise the gestures you collected.',
    'Open in Google Colab ↗',
    'Opens Google Colab in a new tab. Sign in with your Google account and save your',
    'Step 3 — Import &amp; Test Your Model',
    'Bring Your Model Back',
    'Import the model you trained in Colab to start recognising your custom gestures',
    'Import Model JSON',
    'knn-gesture-model.json',
    'Pretrained MediaPipe',
    'Custom KNN (Colab)',
  ];

  for (const snippet of requiredStrings) {
    assert.equal(
      modalSource.includes(snippet),
      true,
      `Expected CustomGestureModal.jsx to include "${snippet}"`
    );
  }
});

test('CustomGestureModal Colab notebook config points to existing workspace notebook without a fabricated 404 link or Google auth APIs', () => {
  const notebookAbs = path.resolve(
    process.cwd(),
    'notebooks/Custom_Gesture_KNN_Training.ipynb'
  );
  assert.equal(fs.existsSync(notebookAbs), true, 'Expected training notebook to exist');

  const notebookRaw = fs.readFileSync(notebookAbs, 'utf-8');
  assert.equal(notebookRaw.includes('HELLO, VISION!'), true);
  assert.equal(notebookRaw.includes('1. My Gestures'), true);
  assert.equal(notebookRaw.includes('2. Train Model'), true);
  assert.equal(notebookRaw.includes('3. Test & Map Actions'), true);
  assert.equal(notebookRaw.includes('Download Dataset (.json)'), true);
  assert.equal(notebookRaw.includes('Spark of Light'), false);

  assert.equal(modalSource.includes('COLAB_GITHUB_CONFIG'), true);
  assert.equal(
    modalSource.includes("notebookPath: 'notebooks/Custom_Gesture_KNN_Training.ipynb'"),
    true
  );
  assert.equal(
    modalSource.includes('https://colab.research.google.com/github/XinRou-28/absolutecinema/blob/'),
    false,
    'Should construct Colab URL from COLAB_GITHUB_CONFIG rather than hardcoding an unverified branch URL'
  );
  assert.equal(modalSource.includes('window.open'), false);
  assert.equal(modalSource.includes('window.alert'), false);
  assert.equal(modalSource.includes('gapi.'), false);
  assert.equal(modalSource.includes('googleapis.com'), false);
});
