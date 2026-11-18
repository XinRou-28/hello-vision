# HELLO, VISION! — Computer Vision & Custom Gesture Recognition Workshop

An interactive browser-based Computer Vision & Machine Learning workshop application built with **React**, **Vite**, **Tailwind CSS**, **Three.js**, **MediaPipe**, and a **custom open-set K-Nearest Neighbours (KNN)** gesture classifier.

All webcam tracking runs locally in your browser using WebAssembly—no video frames or images leave your device, and no API keys are required.

---

## Key Features

- **Magic Canvas (`/magic-canvas`)**: *Fireworks & Light Trails* — draw light trails in mid-air and launch layered fireworks with hand gestures.
- **Particle Universe (`/particle-universe`)**: *3D Formations* — steer, scale, and morph a living 3D starfield across six celestial shapes (`Spiral Galaxy`, `Heart`, `Butterfly`, `Star`, `Saturn`, `Flower`).
- **Pose Challenge (`/pose-challenge`)**: *15-Pose Wacky Challenge* — match 15 progressive poses across 3 levels (`Warming Up`, `Getting Weird`, `Absolute Chaos`) using dynamic half-body & leg-lift MediaPipe Pose tracking.
- **Custom Gestures** *(from the landing header or any activity header)*:
  - Record labelled hand gesture datasets (`samples.json`) in the browser with automatic left/right-hand canonicalisation.
  - Export your dataset, train an open-set KNN model in **Google Colab**, and import the resulting `knn-gesture-model.json` back into the app.
  - Rejects unfamiliar or borderline poses cleanly as `Unknown Gesture` or `Uncertain Gesture`.
- **Workshop Slides (`/presentation`)**: A 10-slide **HELLO, VISION!** introductory deck with interactive Computer Vision demos that launch straight into the live activities.

---

## Tech Stack

- **Frontend**: React 19, Vite 8, Tailwind CSS v4, Framer Motion (`motion`), Lucide Icons
- **Graphics & 3D**: HTML5 2D Canvas & Three.js
- **Computer Vision (On-Device)**: `@mediapipe/tasks-vision` (Hand Gesture Recognizer & Pose Landmarker Lite)
- **Custom ML Training**: Google Colab Python notebook (`scikit-learn`, `numpy`, `matplotlib`) exporting browser-compatible JSON models

---

## Project Structure

```text
├── notebooks/
│   └── Custom_Gesture_KNN_Training.ipynb   # Beginner-friendly Colab KNN training notebook
├── public/
│   ├── assets/images/                      # Landing hero & presentation visual assets
│   ├── models/                             # MediaPipe .task model bundles
│   └── wasm/                               # Local MediaPipe WASM helper scripts
├── src/
│   ├── activities/                         # Magic Canvas, Particle Universe, Pose Challenge
│   ├── assets/images/                      # Workshop slide imagery & app previews
│   ├── components/                         # WebcamPiP, CustomGestureModal, ActivityShell, etc.
│   ├── context/                            # Shared VisionProvider state & inference loop
│   ├── data/                               # Activity metadata definitions
│   ├── engines/                            # Fireworks & 3D Particle engines
│   ├── exercises/                          # Gesture/pose action mappings & 15-pose rules
│   ├── presentation/                       # 10-slide workshop deck & visual components
│   └── vision/                             # Landmark normalization, 95D features, KNN & smoothing
├── tests/                                  # Node unit & parity tests (JS ↔ Python)
├── .env.example                            # Optional local dev environment notes (no secrets needed)
├── package.json
└── vite.config.ts
```

---

## 1. Prerequisites

- **Node.js 18+** (includes `npm`) — check with `node -v` and `npm -v`
- **Git** — check with `git --version`
- **A working webcam** (built-in laptop camera or external USB webcam)
- **A modern desktop browser** (Chrome, Edge, or Firefox with WebGL enabled)
- **A Google account** (to run the training notebook in Google Colab)

---

## 2. Local Setup & Running the App

1. Clone the repository and enter the project folder:
   ```bash
   git clone https://github.com/XinRou-28/hello-vision.git
   cd hello-vision
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the local development server:
   ```bash
   npm run dev
   ```

4. Open your browser to:
   - **Workshop Application**: `http://localhost:3000/`
   - **Workshop Slides**: `http://localhost:3000/presentation` *(or click **Workshop Slides →** in the landing page footer)*

### Presentation Keyboard Controls
- **`→` / `Space` / `PageDown`**: Reveal next step or advance to next slide
- **`←` / `PageUp`**: Step back
- **`F`**: Toggle fullscreen mode
- **`Enter`** *(on Slide 10)*: Launch the Workshop App

---

## 3. Custom Gesture Training Workflow (App ↔ Google Colab)

### Step 1 — Collect Samples in Custom Gesture Lab
1. Click **Custom Gestures** on the landing page (or **Gestures** in an activity top bar).
2. On **1. My Gestures**, add or choose your gesture classes (e.g. `Open_Palm`, `Victory`, `Closed_Fist`, `Number_6`).
3. Hold your hand in view of the webcam and capture **~30 samples per gesture**:
   - Vary position, camera distance, and slight wrist tilt so your dataset generalises well.
   - You can record with either your **left or right hand**—both are automatically canonicalised into a shared coordinate space.
4. Click **Download Dataset (.json)** to save `samples.json`.

### Step 2 — Train Your Model in Google Colab
1. Open [`notebooks/Custom_Gesture_KNN_Training.ipynb`](notebooks/Custom_Gesture_KNN_Training.ipynb) in **Google Colab** (via **Open in Google Colab ↗** inside **2. Train Model**, or by uploading the `.ipynb` file to Colab).
2. Run **Runtime → Run all** (or run the cells one by one from top to bottom).
3. In **Step 1**, upload your `samples.json` file when prompted.
4. The notebook walks through:
   - **Steps 1–2**: Loading `samples.json` and visualising class counts & dataset balance.
   - **Step 3**: Normalising 63D hand coordinates and deriving 95D hybrid geometric features (joint bend angles + fingertip ratios) identical to the browser app.
   - **Steps 4–6**: Splitting train/validation data, training a `KNeighborsClassifier`, and plotting a confusion matrix.
   - **Step 7**: Calibrating open-set distance & class-gap thresholds (`Unknown` / `Uncertain` rejection).
   - **Step 8**: Downloading your trained **`knn-gesture-model.json`**.

### Step 3 — Import & Test Back in the App
1. Return to **Custom Gestures → 2. Train Model** and click **Import Model JSON** to upload `knn-gesture-model.json`.
2. Switch to **3. Test & Map Actions** and verify **Custom KNN (Colab)** is active.
3. Test your gestures live across hand angles, distances, your opposite hand, and unfamiliar poses (`Unknown Gesture`).
4. Map your custom gestures to actions in **Magic Canvas** and **Particle Universe**.

---

## 4. Verification Commands

Run the full test suite, TypeScript type check, and production build anytime:
```bash
npm test
npm run lint
npm run build
```

---

## 5. Troubleshooting

- **Camera permission denied / black Webcam PiP**
  - Click the camera/lock icon in your browser address bar, set Camera to **Allow**, and reload.
  - Ensure no other application (Zoom, Teams, OBS) is locking your webcam.
- **MediaPipe is not detecting my hand**
  - Ensure even front lighting and keep your entire hand inside the Webcam PiP frame.
  - Allow a few seconds on first load for the MediaPipe model files (`public/models/`) to initialise.
- **Custom gesture keeps showing `Unknown Gesture` or `Uncertain Gesture`**
  - Verify your trained model is imported and **Custom KNN (Colab)** is selected in **3. Test & Map Actions**.
  - Collect ~30 clear samples per class with mild angle/distance variation, ensure classes aren't heavily imbalanced, and re-run the Colab notebook.
- **Colab blocks `samples.json` upload or `knn-gesture-model.json` download**
  - Allow downloads/popups for `colab.research.google.com`, or download `knn-gesture-model.json` from Colab's left-hand **Files** sidebar.
