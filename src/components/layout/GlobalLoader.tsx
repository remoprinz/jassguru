import React from 'react';
import { Loader2 } from 'lucide-react';

const GlobalLoader: React.FC = () => {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-gray-900 bg-opacity-80 z-[9999]">
      <Loader2 className="h-16 w-16 text-purple-400 animate-spin" />
      <p className="mt-4 text-white text-lg">Wird geladen...</p>
    </div>
  );
};

export default GlobalLoader;
