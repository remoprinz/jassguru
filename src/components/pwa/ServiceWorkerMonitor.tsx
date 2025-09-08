'use client';

import { useEffect, useRef } from 'react';
import { useUIStore } from '@/store/uiStore';

/**
 * 🛡️ BULLETPROOF Service Worker Health Monitor
 * 
 * Überwacht Service Worker Gesundheit mit:
 * - Loop-Prevention-Mechanismen
 * - Intelligenten Backoff-Strategies  
 * - Circuit Breaker Pattern
 * - Graceful Error Recovery
 */
const ServiceWorkerMonitor: React.FC = () => {
  const showNotification = useUIStore(state => state.showNotification);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastCheckRef = useRef<number>(0);
  
  // 🛡️ NEU: Loop-Prevention & Circuit Breaker
  const errorCountRef = useRef<number>(0);
  const lastErrorRef = useRef<number>(0);
  const recoveryAttemptsRef = useRef<number>(0);
  const MAX_ERRORS = 3;
  const MAX_RECOVERY_ATTEMPTS = 2;
  const ERROR_RESET_TIME = 10 * 60 * 1000; // 10 Minuten
  
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }
    
    const checkServiceWorkerHealth = async () => {
      // 🛡️ Circuit Breaker: Überspringe Checks wenn zu viele Fehler
      if (errorCountRef.current >= MAX_ERRORS) {
        console.log('[SW Monitor] Circuit Breaker aktiv - Health Check übersprungen');
        return;
      }
      
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        
        if (!registration) {
          // Service Worker nicht registriert - könnte ein Problem sein
          if (window.location.pathname !== '/clear-cache' && 
              window.location.pathname !== '/recovery.html') {
            console.warn('[SW Monitor] Kein Service Worker registriert');
          }
          return;
        }
        
        // Prüfe Service Worker Status
        const sw = registration.active || registration.waiting || registration.installing;
        if (!sw) {
          console.error('[SW Monitor] Service Worker in ungültigem Zustand');
          return;
        }
        
        // Prüfe auf Version Mismatch
        if (registration.active && registration.waiting) {
          // Es gibt ein Update - aber es wurde noch nicht aktiviert
          const now = Date.now();
          const timeSinceLastCheck = now - lastCheckRef.current;
          
          // Warne nur alle 5 Minuten
          if (timeSinceLastCheck > 5 * 60 * 1000) {
            lastCheckRef.current = now;
            
            showNotification({
              message: '⚠️ App-Update verfügbar\n\nBitte laden Sie die Seite neu für die beste Erfahrung.',
              type: 'warning',
              duration: 10000,
              actions: [{
                label: 'Jetzt neu laden',
                onClick: () => window.location.reload()
              }]
            });
          }
        }
        
        // 🛡️ VEREINFACHT: Prüfe nur Service Worker Zustand ohne PING-PONG
        if (registration.active) {
          try {
            // Einfacher Zustandscheck ohne Kommunikation
            if (registration.active.state !== 'activated') {
              throw new Error(`Service Worker in unerwarteter State: ${registration.active.state}`);
            }
            
            // Erfolg - Service Worker ist aktiv und in korrektem Zustand
            
          } catch (error) {
            console.error('[SW Monitor] Service Worker reagiert nicht:', error);
            
            // 🛡️ Circuit Breaker: Prüfe Error-Count vor Recovery-Actions
            const now = Date.now();
            
            // Reset Error-Count nach Zeit-Ablauf
            if (now - lastErrorRef.current > ERROR_RESET_TIME) {
              errorCountRef.current = 0;
              recoveryAttemptsRef.current = 0;
            }
            
            errorCountRef.current++;
            lastErrorRef.current = now;
            
            // Nur Recovery anbieten wenn noch nicht zu viele Versuche
            if (errorCountRef.current < MAX_ERRORS && recoveryAttemptsRef.current < MAX_RECOVERY_ATTEMPTS) {
              showNotification({
                message: `⚠️ Service Worker Problem erkannt\n\nFehler ${errorCountRef.current}/${MAX_ERRORS}`,
                type: 'warning',
                duration: 10000,
                actions: [{
                  label: 'Seite neu laden',
                  onClick: () => {
                    recoveryAttemptsRef.current++;
                    window.location.reload();
                  }
                }]
              });
            } else {
              // Circuit Breaker offen - keine weiteren Recovery-Versuche
              console.error('[SW Monitor] 🚫 Circuit Breaker aktiviert - Service Worker Health Checks pausiert');
            }
          }
        }
        
      } catch (error) {
        console.error('[SW Monitor] Fehler beim Health Check:', error);
      }
    };
    
    // Initialer Check nach 10 Sekunden
    const initialTimeout = setTimeout(checkServiceWorkerHealth, 10000);
    
    // Periodische Checks alle 2 Minuten
    checkIntervalRef.current = setInterval(checkServiceWorkerHealth, 2 * 60 * 1000);
    
    // Cleanup
    return () => {
      clearTimeout(initialTimeout);
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    };
  }, [showNotification]);
  
  return null;
};

export default ServiceWorkerMonitor;
