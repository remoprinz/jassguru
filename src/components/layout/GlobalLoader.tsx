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
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-gray-900 bg-opacity-80 z-[9999]">
      <Loader2 className={`h-16 w-16 ${colorClass} animate-spin`} />
      <p className="mt-4 text-white text-lg">{message || 'Wird geladen...'}</p>
    </div>
  );
};

export default GlobalLoader;
