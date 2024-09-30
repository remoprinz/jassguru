import React, { useState } from 'react';

interface CalculatorProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (value: number) => void;
  initialValue: number;
}

const Calculator: React.FC<CalculatorProps> = ({ isOpen, onClose, onSubmit, initialValue }) => {
  const [value, setValue] = useState(initialValue.toString());
  const [multiplier, setMultiplier] = useState(1);

  const handleNumberClick = (num: number) => {
    setValue(prev => prev === '0' ? num.toString() : prev + num);
  };

  const handleMultiplierClick = (mult: number) => {
    setMultiplier(mult);
  };

  const handleSubmit = () => {
    onSubmit(parseInt(value) * multiplier);
    onClose();
  };

  const handleClear = () => {
    setValue('0');
    setMultiplier(1);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
      <div className="bg-gray-800 p-4 rounded-lg">
        <h2 className="text-white text-xl mb-4">Runde schreiben</h2>
        <div className="mb-4">
          <input
            type="text"
            value={value}
            readOnly
            className="w-full bg-gray-700 text-white text-2xl p-2 rounded"
          />
        </div>
        <div className="grid grid-cols-4 gap-2 mb-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((num) => (
            <button
              key={num}
              onClick={() => handleMultiplierClick(num)}
              className={`p-2 rounded ${multiplier === num ? 'bg-orange-500' : 'bg-gray-600'} text-white`}
            >
              {num}x
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
            <button
              key={num}
              onClick={() => handleNumberClick(num)}
              className="p-4 bg-gray-600 text-white text-2xl rounded"
            >
              {num}
            </button>
          ))}
          <button onClick={() => handleNumberClick(0)} className="p-4 bg-gray-600 text-white text-2xl rounded">0</button>
          <button onClick={handleClear} className="p-4 bg-red-600 text-white text-2xl rounded">C</button>
          <button onClick={handleSubmit} className="p-4 bg-green-600 text-white text-2xl rounded">OK</button>
        </div>
      </div>
    </div>
  );
};

export default Calculator;