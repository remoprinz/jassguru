import React, { useEffect, useState, useRef, useCallback } from 'react';

interface DebugLogProps {
  initiallyVisible?: boolean;
}

const DebugLog: React.FC<DebugLogProps> = ({ initiallyVisible = false }) => {
  const [logs, setLogs] = useState<string[]>([]);
  const logsRef = useRef<string[]>([]);
  const [isVisible, setIsVisible] = useState(initiallyVisible);

  useEffect(() => {
    const originalLog = console.log;
    const logQueue: string[] = [];

    console.log = (...args) => {
      const logMessage = args.join(' ');
      logQueue.push(logMessage);
      originalLog(...args);
    };

    const processLogQueue = () => {
      if (logQueue.length > 0) {
        setLogs(prevLogs => [...prevLogs, ...logQueue]);
        logQueue.length = 0;
      }
      requestAnimationFrame(processLogQueue);
    };

    requestAnimationFrame(processLogQueue);

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

  const addLog = useCallback((log: string) => {
    // Ref aktualisieren ohne Re-Render
    logsRef.current.push(log);
    
    // Gebündelte UI-Aktualisierung mit RAF
    requestAnimationFrame(() => {
      setLogs([...logsRef.current]);
    });
  }, []);

  // Logs aufräumen wenn zu viele
  useEffect(() => {
    if (logsRef.current.length > 100) {
      logsRef.current = logsRef.current.slice(-100);
      setLogs([...logsRef.current]);
    }
  }, [logs.length]);

  React.useEffect(() => {
    const originalLog = console.log;
    console.log = (...args) => {
      addLog(args.join(' '));
      originalLog(...args);
    };

    return () => {
      console.log = originalLog;
    };
  }, [addLog]);

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
        <div key={index} className="log-entry">
          {log}
        </div>
      ))}
    </div>
  );
};

export default DebugLog;