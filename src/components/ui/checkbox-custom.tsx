import React from 'react';

interface CustomCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  className?: string;
}

export const CustomCheckbox: React.FC<CustomCheckboxProps> = ({
  checked,
  onChange,
  label,
  className = ''
}) => {
  const handleClick = () => {
    const newValue = !checked;
    console.log('🎯 [Custom Checkbox] Clicked:', { current: checked, new: newValue, label });
    onChange(newValue);
  };

  return (
    <label className={`flex items-center cursor-pointer text-gray-300 text-sm hover:text-white transition-colors ${className}`}>
      <div 
        className="mr-2 w-5 h-5 border-2 rounded flex items-center justify-center transition-all duration-200 cursor-pointer"
        style={{
          backgroundColor: checked ? '#EAB308' : '#44403c',
          borderColor: checked ? '#EAB308' : '#78716c',
          color: checked ? 'white' : 'transparent'
        }}
        onClick={handleClick}
      >
        <span style={{ fontSize: '12px', fontWeight: 'bold' }}>
          {checked ? '✓' : ''}
        </span>
      </div>
      <span 
        className="select-none"
        onClick={handleClick}
      >
        {label}
      </span>
    </label>
  );
}; 