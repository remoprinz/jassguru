import React from 'react';
import { Loader2 } from 'lucide-react';

interface GlobalLoaderProps {
  message?: string;
  color?: string;
}

const GlobalLoader: React.FC<GlobalLoaderProps> = ({ message, color = 'white' }) => {
  const colorClass = color === 'white' ? 'text-white' : 
                     color === 'purple' ? 'text-purple-400' : 
                     `text-${color}`;

  return (
    <div 
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
      style={{
        backgroundColor: '#1a1a1a',
        backgroundImage: 'url(/images/backgrounds/chalkboard-mobile.webp)',
        backgroundSize: 'cover',
        backgroundPosition: 'center top',
        backgroundRepeat: 'no-repeat',
      }}
    >
      <Loader2
        className={`h-16 w-16 animate-spin ${colorClass}`}
        style={{ color: '#ffffff' }}
      />
      <p
        className="mt-4 text-lg font-semibold tracking-wide"
        style={{ color: '#ffffff' }}
      >
        {message || 'Wird geladen...'}
      </p>
    </div>
  );
};

export default GlobalLoader;
