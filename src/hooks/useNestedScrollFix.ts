import { useEffect, useRef } from 'react';

// Dieser Hook behebt das Problem des "Scroll-Trapping" in verschachtelten scrollbaren Containern,
// insbesondere auf mobilen Geräten (PWAs) und Desktop.
export function useNestedScrollFix(ref: React.RefObject<HTMLElement>) {
  const elementRef = useRef(ref.current);
  elementRef.current = ref.current;

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const handleWheel = (e: WheelEvent) => {
      // Wenn das Event bereits von einem tieferen Element behandelt wurde, ignorieren.
      if (e.defaultPrevented) return;

      const { scrollTop, scrollHeight, clientHeight } = element;
      const { deltaY } = e;

      const isAtTop = scrollTop <= 0;
      const isAtBottom = Math.ceil(scrollTop + clientHeight) >= scrollHeight;
      
      // Wenn wir nach oben scrollen und am Anfang sind, oder
      // wenn wir nach unten scrollen und am Ende sind,
      // dann lassen wir das Standardverhalten (Parent scrollt) zu.
      if ((isAtTop && deltaY < 0) || (isAtBottom && deltaY > 0)) {
        return;
      }

      // In allen anderen Fällen (wir scrollen innerhalb des Containers),
      // verhindern wir das Scrollen des Parents.
      e.preventDefault();
    };

    const handleTouchStart = (e: TouchEvent) => {
      // Speichern des Startpunkts für die Gestenerkennung
      (e.currentTarget as HTMLElement).dataset.touchStartY = String(e.targetTouches[0].clientY);
      (e.currentTarget as HTMLElement).dataset.touchStartX = String(e.targetTouches[0].clientX);
    };

    const handleTouchMove = (e: TouchEvent) => {
      const targetElement = e.currentTarget as HTMLElement;
      const touchStartY = Number(targetElement.dataset.touchStartY ?? '0');
      const touchStartX = Number(targetElement.dataset.touchStartX ?? '0');
      
      if (!touchStartY || !touchStartX) return;

      const currentY = e.targetTouches[0].clientY;
      const currentX = e.targetTouches[0].clientX;
      const deltaY = currentY - touchStartY;
      const deltaX = currentX - touchStartX;

      // Bestimmen, ob es sich um ein vertikales Scrollen handelt.
      // Wir tun dies nur einmal pro Geste, indem wir prüfen, ob die Y-Bewegung dominiert.
      if (Math.abs(deltaY) < Math.abs(deltaX)) {
        // Horizontale Geste (Swipe), also nicht eingreifen.
        return;
      }

      const { scrollTop, scrollHeight, clientHeight } = element;

      // Verwende eine kleine Toleranz für die Kantenerkennung, um Rundungsfehler zu vermeiden.
      const tolerance = 2;
      const isAtTop = scrollTop <= 0;
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - tolerance;

      // Nach unten scrollen (Finger bewegt sich nach unten -> deltaY > 0)
      if (deltaY > 0 && isAtTop) {
        return; // Am Anfang, Parent soll scrollen
      }
      
      // Nach oben scrollen (Finger bewegt sich nach oben -> deltaY < 0)
      if (deltaY < 0 && isAtBottom) {
        return; // Am Ende, Parent soll scrollen
      }
      
      // Ansonsten: wir sind in der Mitte des Containers und scrollen.
      // Verhindere das Scrollen der Seite.
      if (e.cancelable) {
        e.preventDefault();
      }
    };

    // Für Wheel (Desktop) brauchen wir `passive: false`, um `preventDefault` aufrufen zu können.
    element.addEventListener('wheel', handleWheel, { passive: false });
    // Für Touch (Mobile) brauchen wir passive Listener für den Start...
    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    // ...und einen nicht-passiven Listener für die Bewegung, um das Scrollen zu steuern.
    element.addEventListener('touchmove', handleTouchMove, { passive: false });

    return () => {
      element.removeEventListener('wheel', handleWheel);
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
    };
  }, []); // Hängt nur vom Ref ab, welches wir via useRef stabil halten.
} 