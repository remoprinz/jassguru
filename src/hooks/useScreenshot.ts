import { useState } from 'react';
import html2canvas from 'html2canvas';
import { useUIStore } from '@/store/uiStore';

interface ScreenshotOptions {
  backgroundColor?: string;
  useCORS?: boolean;
  logging?: boolean;
  scale?: number;
  width?: number;
  height?: number;
}

// NEU: Konfiguration für das Splitting
const TARGET_ASPECT_RATIO = 16 / 9; // Hochformat, z.B. 1080x1920
const MASTER_SCALE_FACTOR = 3; // Höhere Auflösung für den Master-Screenshot

interface UseScreenshotReturn {
  isSharing: boolean;
  handleShare: (
    elementQuery: string,
    scrollableContentQuery: string,
    elementsToHideQueries: string[],
    shareText: string,
    fileName?: string,
    splitLongImage?: boolean
  ) => Promise<void>;
}

export const useScreenshot = (): UseScreenshotReturn => {
  const [isSharing, setIsSharing] = useState(false);
  const showNotification = useUIStore((state) => state.showNotification);

  const handleShare = async (
    elementQuery: string,
    scrollableContentQuery: string,
    elementsToHideQueries: string[],
    shareText: string,
    fileName = 'jass-resultat.png',
    splitLongImage = false
  ) => {
    setIsSharing(true);
    await new Promise((resolve) => setTimeout(resolve, 50));

    let scrollableContent: HTMLElement | null = null;
    const originalStyles = { maxHeight: '', overflowY: '', height: '' };
    const hiddenElements: { element: HTMLElement; originalDisplay: string }[] = [];
    let elementToScreenshot: HTMLElement | null = null;
    let originalInlineWidth = '';
    const textElementsWithOriginalStyles: { 
      element: HTMLElement; 
      originalOverflow: string; 
      originalTextOverflow: string; 
      originalWhiteSpace: string;
      originalObjectFit?: string;
      originalFlexShrink?: string;
      originalVerticalAlign?: string;
    }[] = [];
    const flexFixes: {
      element: HTMLElement;
      originalDisplay: string;
      children: {
        element: HTMLElement;
        originalDisplay: string;
        originalVerticalAlign: string;
      }[];
    }[] = [];

    try {
      elementToScreenshot = document.querySelector(elementQuery) as HTMLElement | null;
      if (!elementToScreenshot) {
        throw new Error(`Screenshot-Element "${elementQuery}" nicht gefunden.`);
      }

      // --- NEU: Gezielter Fix für Vertical-Align-Probleme in Flex-Containern ---
      const flexContainers = elementToScreenshot.querySelectorAll('.inline-flex.items-center') as NodeListOf<HTMLElement>;
      flexContainers.forEach(container => {
        const childrenToFix: { element: HTMLElement; originalDisplay: string; originalVerticalAlign: string; }[] = [];
        (Array.from(container.children) as HTMLElement[]).forEach(child => {
          childrenToFix.push({
            element: child,
            originalDisplay: child.style.display,
            originalVerticalAlign: child.style.verticalAlign,
          });
          child.style.display = 'inline-block';
          child.style.verticalAlign = 'middle';
        });

        flexFixes.push({
          element: container,
          originalDisplay: container.style.display,
          children: childrenToFix,
        });
        container.style.display = 'block';
      });

      // CSS-Probleme beheben: Nur problematische Text-Overflow und SVG-Object-Fit Probleme
      const problemElements = elementToScreenshot.querySelectorAll('.overflow-hidden, .text-ellipsis, img, svg') as NodeListOf<HTMLElement>;
      problemElements.forEach(element => {
        const computedStyle = window.getComputedStyle(element);
        const styleRecord: any = {
          element,
          originalOverflow: element.style.overflow,
          originalTextOverflow: element.style.textOverflow,
          originalWhiteSpace: element.style.whiteSpace
        };
        
        // Für SVG/IMG zusätzliche Properties sammeln
        if (element.tagName === 'IMG' || element.tagName === 'SVG') {
          styleRecord.originalObjectFit = element.style.objectFit;
          styleRecord.originalFlexShrink = element.style.flexShrink;
          styleRecord.originalVerticalAlign = element.style.verticalAlign;
        }
        
        textElementsWithOriginalStyles.push(styleRecord);
        
        // Nur Text-Overflow Fixes für Elemente die wirklich ellipsis haben
        if (computedStyle.textOverflow === 'ellipsis') {
          element.style.overflow = 'visible';
          element.style.textOverflow = 'clip';
        }
        
        // Nur overflow hidden zu visible für problematische Elemente
        if (computedStyle.overflow === 'hidden' && element.classList.contains('overflow-hidden')) {
          element.style.overflow = 'visible';
        }
        
        // SVG/IMG-spezifische Fixes (ohne Layout zu beeinflussen)
        if (element.tagName === 'IMG' || element.tagName === 'SVG') {
          // Object-fit nur ändern wenn es contain ist (problematisch für html2canvas)
          if (computedStyle.objectFit === 'contain') {
            (element as HTMLElement).style.objectFit = 'none';
          }
          // Vertical alignment NICHT ändern - das verursacht die Verschiebung
          // Die ursprüngliche Position beibehalten
        }
      });

      const computedWidth = elementToScreenshot.offsetWidth;
      originalInlineWidth = elementToScreenshot.style.width;
      elementToScreenshot.style.width = `${computedWidth}px`;

      elementsToHideQueries.forEach(query => {
        const element = document.querySelector(query) as HTMLElement | null;
        if (element) {
          hiddenElements.push({ element, originalDisplay: element.style.display });
          element.style.display = 'none';
        }
      });

      scrollableContent = elementToScreenshot.querySelector(scrollableContentQuery) as HTMLElement | null;
      
      if (scrollableContent) {
        originalStyles.maxHeight = scrollableContent.style.maxHeight;
        originalStyles.overflowY = scrollableContent.style.overflowY;
        originalStyles.height = scrollableContent.style.height;

        scrollableContent.style.maxHeight = 'none';
        scrollableContent.style.overflowY = 'visible';
        scrollableContent.style.height = `${scrollableContent.scrollHeight}px`;
        
        await new Promise(resolve => setTimeout(resolve, 250));
      }

      // 1. Master-Screenshot mit hoher Auflösung erstellen
      const masterCanvas = await html2canvas(elementToScreenshot, {
        backgroundColor: '#1F2937',
        useCORS: true,
        logging: false,
        scale: MASTER_SCALE_FACTOR,
      } as ScreenshotOptions);

      const filesToShare: File[] = [];
      const baseName = fileName.replace(/\.png$/, '');

      // 2. Prüfen, ob das Bild aufgeteilt werden soll und ob es lang genug ist
      const masterWidth = masterCanvas.width;
      const masterHeight = masterCanvas.height;
      const sliceHeight = Math.floor(masterWidth * TARGET_ASPECT_RATIO);

      if (splitLongImage && masterHeight > sliceHeight) {
        // --- NEUE ELEGANTE LOGIK: Bild aufteilen & letzte Seite auffüllen ---
        let y = 0;
        let page = 1;
        while (y < masterHeight) {
          const sliceCanvas = document.createElement('canvas');
          const sliceContext = sliceCanvas.getContext('2d');
          
          // Jede Canvas-Scheibe hat die Zielhöhe für einheitliche Seitenverhältnisse
          sliceCanvas.width = masterWidth;
          sliceCanvas.height = sliceHeight;

          if (sliceContext) {
            // Fülle den Hintergrund, um bei der letzten Seite leere Bereiche abzudecken
            sliceContext.fillStyle = '#1F2937'; // Hintergrundfarbe des Screenshots
            sliceContext.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);

            // Berechne, wie viel vom Master-Bild noch übrig ist
            const remainingMasterHeight = masterHeight - y;
            const heightToDraw = Math.min(sliceHeight, remainingMasterHeight);
            
            // Zeichne den Ausschnitt auf die neue Canvas
            sliceContext.drawImage(
                masterCanvas, 
                0, y, // Quelle (x, y)
                masterWidth, heightToDraw, // Quelle (Breite, Höhe)
                0, 0, // Ziel (x, y)
                masterWidth, heightToDraw // Ziel (Breite, Höhe)
            );
            
            const blob = await new Promise<Blob | null>((resolve) => sliceCanvas.toBlob(resolve, 'image/png'));
            if (blob) {
              filesToShare.push(new File([blob], `${baseName}-seite-${page}.png`, { type: 'image/png' }));
            }
          }
          y += sliceHeight;
          page++;
        }
      } else {
        // --- ALTE LOGIK: Ein einzelnes Bild ---
        const blob = await new Promise<Blob | null>((resolve) => masterCanvas.toBlob(resolve, 'image/png'));
        if (blob) {
          filesToShare.push(new File([blob], fileName, { type: 'image/png' }));
        }
      }

      if (filesToShare.length === 0) {
        throw new Error("Keine Bilder zum Teilen erstellt.");
      }

      // 3. Bilderserie (oder einzelnes Bild) teilen
      // NEU: Text nur hinzufügen, wenn es sich um ein einzelnes Bild handelt
      const finalText = filesToShare.length > 1 ? '' : shareText;

      if (navigator.share && navigator.canShare && navigator.canShare({ files: filesToShare })) {
        try {
          await navigator.share({ files: filesToShare, text: finalText });
        } catch (shareError: any) {
          if (shareError.name !== 'AbortError' && !shareError.message?.includes('abort')) {
            console.warn("Teilen mit Dateien fehlgeschlagen, versuche Text-only:", shareError);
            // Fallback zu Text-only (nur sinnvoll bei einem Bild mit Text)
            if (filesToShare.length === 1 && finalText) {
                await navigator.share({ text: finalText });
            }
          }
        }
      } else {
        showNotification({
          type: 'warning',
          message: 'Dein Browser unterstützt das Teilen von Bildern nicht.',
        });
      }
    } catch (error) {
       console.error("Fehler im Screenshot-Prozess:", error);
       showNotification({
         type: 'error',
         message: 'Fehler beim Erstellen des Screenshots.',
       });
    } finally {
      // --- NEU: Wiederherstellung des Flex-Container-Fixes ---
      flexFixes.forEach(fix => {
        fix.children.forEach(childFix => {
          childFix.element.style.display = childFix.originalDisplay;
          childFix.element.style.verticalAlign = childFix.originalVerticalAlign;
        });
        fix.element.style.display = fix.originalDisplay;
      });

      if (scrollableContent) {
        scrollableContent.style.maxHeight = originalStyles.maxHeight || '';
        scrollableContent.style.overflowY = originalStyles.overflowY || '';
        scrollableContent.style.height = originalStyles.height || '';
      }
      hiddenElements.forEach(({ element, originalDisplay }) => {
        element.style.display = originalDisplay;
      });
      textElementsWithOriginalStyles.forEach(({ element, originalOverflow, originalTextOverflow, originalWhiteSpace, originalObjectFit, originalFlexShrink, originalVerticalAlign }) => {
        element.style.overflow = originalOverflow;
        element.style.textOverflow = originalTextOverflow;
        element.style.whiteSpace = originalWhiteSpace;
        
        // SVG/IMG-spezifische Wiederherstellung
        if (element.tagName === 'IMG' || element.tagName === 'SVG') {
          if (originalObjectFit !== undefined) {
            element.style.objectFit = originalObjectFit;
          }
          if (originalFlexShrink !== undefined) {
            element.style.flexShrink = originalFlexShrink;
          }
          if (originalVerticalAlign !== undefined) {
            element.style.verticalAlign = originalVerticalAlign;
          }
        }
      });
      if (elementToScreenshot) {
        elementToScreenshot.style.width = originalInlineWidth;
      }
      setIsSharing(false);
    }
  };

  return { isSharing, handleShare };
}; 