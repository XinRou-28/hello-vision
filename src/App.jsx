import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useState } from 'react';
import MagicCanvasActivity from './activities/MagicCanvasActivity.jsx';
import ParticleUniverseActivity from './activities/ParticleUniverseActivity.jsx';
import PoseChallengeActivity from './activities/PoseChallengeActivity.jsx';
import LandingScreen from './components/LandingScreen.jsx';
import { VisionProvider } from './context/VisionContext.jsx';
import PresentationDeck from './presentation/PresentationDeck.jsx';

const ROUTE_BY_SCREEN = {
  landing: '/',
  presentation: '/presentation',
  'magic-canvas': '/magic-canvas',
  'particle-universe': '/particle-universe',
  'pose-challenge': '/pose-challenge',
};

function resolveScreenFromLocation() {
  if (typeof window === 'undefined') return null;
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  const params = new URLSearchParams(window.location.search);

  if (path === '/presentation' || path === '/slides' || params.get('mode') === 'presentation') {
    return 'presentation';
  }
  if (path === '/magic-canvas') return 'magic-canvas';
  if (path === '/particle-universe') return 'particle-universe';
  if (path === '/pose-challenge') return 'pose-challenge';
  return null;
}

export default function App() {
  const [activeActivity, setActiveActivity] = useState(resolveScreenFromLocation);
  const [presentationSlideIndex, setPresentationSlideIndex] = useState(0);
  const [returnToPresentation, setReturnToPresentation] = useState(false);
  const [openGestureLabOnLanding, setOpenGestureLabOnLanding] = useState(false);

  const syncUrlForScreen = useCallback((screen) => {
    if (typeof window === 'undefined') return;
    const targetPath = ROUTE_BY_SCREEN[screen ?? 'landing'] ?? '/';
    if (window.location.pathname !== targetPath) {
      window.history.pushState({ screen }, '', targetPath);
    }
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setActiveActivity(resolveScreenFromLocation());
      setOpenGestureLabOnLanding(false);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigateToScreen = useCallback(
    (screen, { fromPresentation = false, openGestureLab = false } = {}) => {
      setReturnToPresentation(fromPresentation);
      setOpenGestureLabOnLanding(openGestureLab);
      setActiveActivity(screen);
      syncUrlForScreen(screen);
    },
    [syncUrlForScreen]
  );

  const handleExitActivity = useCallback(() => {
    if (returnToPresentation) {
      navigateToScreen('presentation');
    } else {
      navigateToScreen(null);
    }
  }, [returnToPresentation, navigateToScreen]);

  const handleOpenAppFromPresentation = useCallback(
    (target, currentSlideIdx) => {
      if (typeof currentSlideIdx === 'number') {
        setPresentationSlideIndex(currentSlideIdx);
      }
      if (target === 'gesture-lab') {
        navigateToScreen(null, { fromPresentation: true, openGestureLab: true });
        return;
      }
      navigateToScreen(target ?? null, { fromPresentation: true, openGestureLab: false });
    },
    [navigateToScreen]
  );

  const renderScreen = () => {
    switch (activeActivity) {
      case 'presentation':
        return (
          <PresentationDeck
            initialSlideIndex={presentationSlideIndex}
            onSlideChange={setPresentationSlideIndex}
            onOpenApp={handleOpenAppFromPresentation}
          />
        );
      case 'magic-canvas':
        return <MagicCanvasActivity onExit={handleExitActivity} />;
      case 'particle-universe':
        return <ParticleUniverseActivity onExit={handleExitActivity} />;
      case 'pose-challenge':
        return <PoseChallengeActivity onExit={handleExitActivity} />;
      default:
        return (
          <LandingScreen
            onSelectActivity={(id) => navigateToScreen(id, { fromPresentation: false })}
            onOpenPresentation={() => navigateToScreen('presentation')}
            initialShowGestureLab={openGestureLabOnLanding}
            onReturnToPresentation={
              returnToPresentation ? () => navigateToScreen('presentation') : null
            }
          />
        );
    }
  };

  return (
    <VisionProvider>
      <AnimatePresence mode="wait">
        <motion.div
          key={activeActivity ?? 'landing'}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="min-h-dvh w-full"
        >
          {renderScreen()}
        </motion.div>
      </AnimatePresence>
    </VisionProvider>
  );
}
