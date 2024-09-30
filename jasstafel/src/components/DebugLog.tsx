import React, { useState, useEffect } from 'react';

const DebugLog: React.FC = () => {
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    console.log = (...args) => {
      setLogs(prev => [...prev, `LOG: ${args.join(' ')}`]);
      originalLog.apply(console, args);
    };
    console.warn = (...args) => {
      setLogs(prev => [...prev, `WARN: ${args.join(' ')}`]);
      originalWarn.apply(console, args);
    };
    console.error = (...args) => {
      setLogs(prev => [...prev, `ERROR: ${args.join(' ')}`]);
      originalError.apply(console, args);
    };

    return () => {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
    };
  }, []);

  return (
    <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.8)', color: 'white', padding: '10px', maxHeight: '50vh', overflowY: 'auto' }}>
      {logs.map((log, index) => <div key={index}>{log}</div>)}
    </div>
  );
};

export default DebugLog;