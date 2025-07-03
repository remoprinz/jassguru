import React from 'react';

interface SimpleToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}

export const SimpleToggle: React.FC<SimpleToggleProps> = ({ checked, onChange, label }) => {
  return (
    <div 
      className="flex items-center justify-center cursor-pointer select-none"
      onClick={() => {
        console.log('🎯 [SimpleToggle] Klick:', { current: checked, new: !checked });
        onChange(!checked);
      }}
    >
      <div 
        className={`w-5 h-5 border-2 rounded mr-2 flex items-center justify-center transition-all duration-200 ${
          checked 
            ? 'bg-yellow-600 border-yellow-600 text-white' 
            : 'bg-gray-700 border-gray-500 hover:border-yellow-500'
        }`}
      >
        {checked && (
          <span className="text-white text-sm font-bold leading-none">✓</span>
        )}
      </div>
      <span className="text-gray-300 text-sm">{label}</span>
    </div>
  );
}; 