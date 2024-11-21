import type { ChargeButtonReturn } from '../../hooks/useChargeButton';

interface ChargeButtonProps {
  handlers: ChargeButtonReturn['handlers'];
  isButtonActive: boolean;
  isPressed: boolean;
  showDepth: boolean;
  color: 'yellow' | 'green' | 'red';
  disabled?: boolean;
  children: React.ReactNode;
}

export const ChargeButton: React.FC<ChargeButtonProps> = ({
  handlers,
  isButtonActive,
  isPressed,
  showDepth,
  color,
  disabled = false,
  children
}) => (
  <button 
    {...handlers}
    disabled={!!disabled}
    className={`
      py-4 text-white rounded-xl font-bold
      transition-all duration-150
      ${isButtonActive 
        ? `bg-${color}-600` 
        : isPressed 
          ? 'bg-gray-700'
          : 'bg-gray-600'
      }
      ${showDepth ? 'border-b-4 border-t border-l border-r' : ''}
      ${showDepth 
        ? disabled 
          ? 'border-gray-500'
          : `border-${color}-900` 
        : ''
      }
      ${isPressed 
        ? 'translate-y-1 shadow-inner opacity-80' 
        : disabled 
          ? 'shadow-gray-500'
          : 'shadow-lg'
      }
    `}
  >
    {children}
  </button>
);