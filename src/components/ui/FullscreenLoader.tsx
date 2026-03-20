import React from 'react';
import { Loader2 } from 'lucide-react';

interface FullscreenLoaderProps {
  text?: string;
}

const FullscreenLoader: React.FC<FullscreenLoaderProps> = ({ text = 'Laden...' }) => {
  return (
    <div 
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center"
      style={{
        backgroundColor: '#1a1a1a',
        backgroundImage: 'url(/images/backgrounds/chalkboard-mobile.webp)',
        backgroundSize: 'cover',
        backgroundPosition: 'center top',
        backgroundRepeat: 'no-repeat',
      }}
    >
      <Loader2
        className="mb-4 h-12 w-12 animate-spin"
        style={{ color: '#ffffff' }}
      />
      <p
        className="text-lg font-semibold tracking-wide"
        style={{ color: '#ffffff' }}
      >
        {text}
      </p>
    </div>
  );
};

export default FullscreenLoader;
