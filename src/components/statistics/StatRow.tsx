import React, { ReactNode } from 'react';
import { classNames } from '@/utils/formatUtils';

interface StatRowProps {
  label: string;
  value: ReactNode;
  className?: string;
  valueItems?: string[];
}

export const StatRow: React.FC<StatRowProps> = ({ label, value, className, valueItems }) => {
  return (
    <div className={`flex justify-between items-center ${className || ''}`}>
      <span className="font-medium text-gray-300">{label}</span>
      {valueItems ? (
        <div className="flex flex-col items-end">
          {valueItems.map((item, index) => (
            <span 
              key={`value-${index}`} 
              className="text-gray-100 inline-block whitespace-nowrap"
            >
              {item}
            </span>
          ))}
        </div>
      ) : (
        <span className="text-gray-100">{value}</span>
      )}
    </div>
  );
}; 