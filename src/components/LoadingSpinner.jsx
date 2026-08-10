import React from 'react';
import Lottie from 'lottie-react';
import loadingAnimation from '../assets/loading-animation.json';

/**
 * Shared LoadingSpinner using Lottie animation.
 * Replaces all raw CSS spinners (animate-spin + border-4...) throughout the app.
 * Usage: <LoadingSpinner /> or <LoadingSpinner size={64} />
 */
export default function LoadingSpinner({ size = 48 }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '24px' }}>
      <Lottie
        animationData={loadingAnimation}
        loop
        style={{ width: size, height: size }}
      />
    </div>
  );
}
