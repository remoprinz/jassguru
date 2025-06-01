import React from 'react';
import { Loader2 } from 'lucide-react'; // Importiere ein Lade-Icon

interface FullscreenLoaderProps {
  text?: string;
}

const FullscreenLoader: React.FC<FullscreenLoaderProps> = ({ text = 'Laden...' }) => {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-gray-900 bg-opacity-90 text-white">
      <Loader2 className="h-12 w-12 animate-spin text-blue-500 mb-4" />
      <p className="text-lg font-medium">{text}</p>
    </div>
  );
};

export default FullscreenLoader; 