import React, { useState, useRef, useEffect } from 'react';

interface YearFilterProps {
  availableYears: number[]; // Sorted DESCENDING (newest first)
  selectedYear: 'gesamt' | number;
  onChange: (year: 'gesamt' | number) => void;
}

/**
 * Dezenter Dropdown-Filter für „Gesamt / Jahre".
 * Wird mittig zwischen Sub-Tabs und erstem Chart in GroupView platziert.
 */
export const YearFilter: React.FC<YearFilterProps> = ({
  availableYears,
  selectedYear,
  onChange,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Tap-outside zu schliessen
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [open]);

  const label = selectedYear === 'gesamt' ? 'Gesamt' : String(selectedYear);

  const select = (year: 'gesamt' | number) => {
    onChange(year);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="px-4 py-1.5 rounded-lg text-sm text-gray-200 bg-white/5 hover:bg-white/10 border border-white/10 transition-colors flex items-center gap-2 min-w-[120px] justify-center"
      >
        <span>{label}</span>
        <span className="text-xs text-gray-400">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div className="absolute left-1/2 -translate-x-1/2 mt-1 z-40 bg-gray-900 border border-white/10 rounded-lg shadow-xl py-1 min-w-[140px]">
          <button
            type="button"
            onClick={() => select('gesamt')}
            className="w-full text-left px-4 py-2 text-sm hover:bg-white/10 flex items-center justify-between"
          >
            <span className={selectedYear === 'gesamt' ? 'text-white font-medium' : 'text-gray-300'}>Gesamt</span>
            {selectedYear === 'gesamt' && <span className="text-emerald-400 text-xs">✓</span>}
          </button>
          {availableYears.map(year => (
            <button
              key={year}
              type="button"
              onClick={() => select(year)}
              className="w-full text-left px-4 py-2 text-sm hover:bg-white/10 flex items-center justify-between"
            >
              <span className={selectedYear === year ? 'text-white font-medium' : 'text-gray-300'}>{year}</span>
              {selectedYear === year && <span className="text-emerald-400 text-xs">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
