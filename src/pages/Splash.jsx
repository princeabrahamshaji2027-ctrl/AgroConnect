import React, { useEffect, useRef, useState } from 'react';
import './pages.css';

export default function Splash({ onFinish }) {
  const videoRef = useRef(null);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [fadeVideo, setFadeVideo] = useState(false);

  useEffect(() => {
    // Check if splash video already played during this session
    const hasPlayed = sessionStorage.getItem('splashPlayed');
    if (hasPlayed) {
      // If already played once, just show skeleton load for 800ms and finish
      setShowSkeleton(true);
      const timer = setTimeout(() => {
        if (onFinish) onFinish();
      }, 800);
      return () => clearTimeout(timer);
    }

    // Play video
    if (videoRef.current) {
      videoRef.current.play().catch(err => {
        console.log("Auto-play blocked or failed, skipping video:", err);
        handleVideoEnd();
      });
    }

    // Backup timer in case video fails to fire 'ended' event
    const backupTimer = setTimeout(() => {
      handleVideoEnd();
    }, 6000); // video length safety net

    return () => clearTimeout(backupTimer);
  }, []);

  const handleVideoEnd = () => {
    if (sessionStorage.getItem('splashPlayed')) return;
    sessionStorage.setItem('splashPlayed', 'true');
    setFadeVideo(true);
    // Show skeleton loading screen for 1.2 seconds after video fades
    setTimeout(() => {
      setShowSkeleton(true);
      setTimeout(() => {
        if (onFinish) onFinish();
      }, 1200);
    }, 400); // wait for fade transition of video
  };

  return (
    <div className="splash-container" style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', padding: 0, justifyContent: 'center', backgroundColor: '#121212' }}>
      {!showSkeleton ? (
        <video
          ref={videoRef}
          src="/animation.mp4"
          muted
          playsInline
          onEnded={handleVideoEnd}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transition: 'opacity 0.4s ease',
            opacity: fadeVideo ? 0 : 1
          }}
        />
      ) : (
        /* Skeleton Loading Screen */
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
