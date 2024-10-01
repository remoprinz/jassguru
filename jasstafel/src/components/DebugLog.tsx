import React, { useEffect, useState } from 'react';

interface DebugLogProps {
  initiallyVisible?: boolean;
}

const DebugLog: React.FC<DebugLogProps> = ({ initiallyVisible = false }) => {
  const [logs, setLogs] = useState<string[]>([]);
  const [isVisible, setIsVisible] = useState(initiallyVisible);

  useEffect(() => {
    const originalLog = console.log;
    console.log = (...args) => {
      setLogs(prevLogs => [...prevLogs, args.join(' ')]);
      originalLog(...args);
    };

    const toggleVisibility = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key === 'd') {
        setIsVisible(prev => !prev);
      }
    };

    window.addEventListener('keydown', toggleVisibility);

    return () => {
      console.log = originalLog;
      window.removeEventListener('keydown', toggleVisibility);
    };
  }, []);

  if (!isVisible) return null;

  return (
    <div className="debug-log" style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      maxHeight: '30vh',
      overflowY: 'auto',
      backgroundColor: 'rgba(0,0,0,0.8)',
      color: 'white',
      fontSize: '12px',
      padding: '10px',
      zIndex: 9999,
    }}>
      <div>Debug-Logs (Ctrl+D zum Ein-/Ausblenden)</div>
      {logs.map((log, index) => (
        <div key={index}>{log}</div>
      ))}
    </div>
  );
};

export default DebugLog;