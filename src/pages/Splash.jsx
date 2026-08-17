import React, { useEffect, useState } from 'react';
import Lottie from 'lottie-react';
import splashAnimation from '../assets/splash-animation.json';
import './pages.css';

export default function Splash({ onFinish }) {
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [fadeLottie, setFadeLottie] = useState(false);

  useEffect(() => {
    // If splash already played this session, skip to skeleton briefly
    const hasPlayed = sessionStorage.getItem('splashPlayed');
    if (hasPlayed) {
      setShowSkeleton(true);
      const timer = setTimeout(() => {
        if (onFinish) onFinish();
      }, 800);
      return () => clearTimeout(timer);
    }

    // Backup timer: if Lottie onComplete doesn't fire (e.g. animation loop=false but no callback), proceed anyway
    const backupTimer = setTimeout(() => {
      handleAnimationEnd();
    }, 6000);

    return () => clearTimeout(backupTimer);
  }, []);

  const handleAnimationEnd = () => {
    if (sessionStorage.getItem('splashPlayed')) return;
    sessionStorage.setItem('splashPlayed', 'true');
    setFadeLottie(true);
    setTimeout(() => {
      setShowSkeleton(true);
      setTimeout(() => {
        if (onFinish) onFinish();
      }, 1200);
    }, 400);
  };

  return (
    <div
      className="splash-container"
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', padding: 0, justifyContent: 'center', backgroundColor: '#121212' }}
    >
      {!showSkeleton ? (
        /* Lottie splash animation — replaces the old <video> element */
        <div style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'opacity 0.4s ease',
          opacity: fadeLottie ? 0 : 1
        }}>
          <Lottie
            animationData={splashAnimation}
            loop={false}
            onComplete={handleAnimationEnd}
            style={{ width: '100%', height: '100%' }}
            rendererSettings={{ preserveAspectRatio: 'xMidYMid slice' }}
          />
        </div>
      ) : (
        /* Skeleton Loading Screen — unchanged from original */
        <div className="fade-in" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: '20px', padding: '24px', boxSizing: 'border-box', justifyContent: 'flex-start', paddingTop: '80px' }}>
          {/* Header Skeleton */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
            <div className="skeleton" style={{ width: '120px', height: '32px' }}></div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <div className="skeleton" style={{ width: '32px', height: '32px', borderRadius: '50%' }}></div>
              <div className="skeleton" style={{ width: '32px', height: '32px', borderRadius: '50%' }}></div>
            </div>
          </div>
          
          {/* Post Card Skeletons */}
          {[1, 2].map(i => (
            <div key={i} className="skeleton" style={{ width: '100%', height: '180px', borderRadius: 'var(--border-radius)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <div className="skeleton" style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#252525' }}></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                  <div className="skeleton" style={{ width: '40%', height: '12px', background: '#252525' }}></div>
                  <div className="skeleton" style={{ width: '20%', height: '8px', background: '#252525' }}></div>
                </div>
              </div>
              <div className="skeleton" style={{ width: '100%', height: '60px', background: '#252525' }}></div>
              <div className="skeleton" style={{ width: '90%', height: '12px', background: '#252525' }}></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
