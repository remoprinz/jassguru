'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2 } from 'lucide-react';
import { FaArrowLeft, FaArrowRight } from 'react-icons/fa';
import Image from 'next/image';
import { SCREENSHOT_DATA, ScreenshotData } from '@/constants/screenshotData';
import { usePressableButton } from '@/hooks/usePressableButton';

interface ScreenshotSliderProps {
  isOpen: boolean
  onClose: () => void
  initialIndex?: number
}

const ScreenshotSlider: React.FC<ScreenshotSliderProps> = ({
  isOpen,
  onClose,
  initialIndex = 0
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [currentScreenshot, setCurrentScreenshot] = useState<ScreenshotData>(SCREENSHOT_DATA[0]);
  const [isImageLoading, setIsImageLoading] = useState(true);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);

  // Navigation handlers mit LOOP-FUNKTIONALITÄT (müssen vor usePressableButton definiert werden)
  const handleNext = useCallback(() => {
    if (currentIndex < SCREENSHOT_DATA.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      // LOOP: Am Ende wieder zum Anfang
      setCurrentIndex(0);
    }
  }, [currentIndex]);

  const handlePrevious = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    } else {
      // LOOP: Am Anfang zum Ende springen
      setCurrentIndex(SCREENSHOT_DATA.length - 1);
    }
  }, [currentIndex]);

  // OnboardingFlow Pattern: usePressableButton für Navigation  
  const previousButtonHandlers = usePressableButton(handlePrevious);
  const nextButtonHandlers = usePressableButton(handleNext);

  // Update current screenshot when index changes
  useEffect(() => {
    if (currentIndex >= 0 && currentIndex < SCREENSHOT_DATA.length) {
      setCurrentScreenshot(SCREENSHOT_DATA[currentIndex]);
      setIsImageLoading(true);
    }
  }, [currentIndex]);

  // Jump to specific screenshot
  const handleJumpTo = useCallback((index: number) => {
    if (index >= 0 && index < SCREENSHOT_DATA.length) {
      setCurrentIndex(index);
    }
  }, []);

  // Intelligente Dot-Navigation: Berechne sichtbare Dots
  const getVisibleDots = useCallback(() => {
    const totalDots = SCREENSHOT_DATA.length;
    const maxVisibleDots = 7; // Optimale Anzahl für Mobile
    
    if (totalDots <= maxVisibleDots) {
      // Wenige Dots: Alle anzeigen
      return SCREENSHOT_DATA.map((_, index) => ({
        index,
        type: 'dot' as const
      }));
    }

    const visibleDots: Array<{index: number, type: 'dot' | 'ellipsis'}> = [];
    const sideCount = Math.floor((maxVisibleDots - 1) / 2); // 3 pro Seite

    if (currentIndex <= sideCount) {
      // Am Anfang: [0,1,2,3,4,...,last]
      for (let i = 0; i < maxVisibleDots - 2; i++) {
        visibleDots.push({ index: i, type: 'dot' });
      }
      visibleDots.push({ index: -1, type: 'ellipsis' });
      visibleDots.push({ index: totalDots - 1, type: 'dot' });
    } else if (currentIndex >= totalDots - sideCount - 1) {
      // Am Ende: [first,...,22,23,24,25,26]
      visibleDots.push({ index: 0, type: 'dot' });
      visibleDots.push({ index: -1, type: 'ellipsis' });
      for (let i = totalDots - maxVisibleDots + 2; i < totalDots; i++) {
        visibleDots.push({ index: i, type: 'dot' });
      }
    } else {
      // In der Mitte: [first,...,current-2,current-1,current,current+1,current+2,...,last]
      visibleDots.push({ index: 0, type: 'dot' });
      visibleDots.push({ index: -1, type: 'ellipsis' });
      for (let i = currentIndex - 2; i <= currentIndex + 2; i++) {
        visibleDots.push({ index: i, type: 'dot' });
      }
      visibleDots.push({ index: -2, type: 'ellipsis' });
      visibleDots.push({ index: totalDots - 1, type: 'dot' });
    }

    return visibleDots;
  }, [currentIndex]);

  // VERBESSERTE Viewport Detection
  useEffect(() => {
    const updateDimensions = () => {
      setViewportHeight(window.innerHeight);
      setViewportWidth(window.innerWidth);
    };

    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, []);

  // ADAPTIVE Layout Detection
  const layoutMode = useMemo(() => {
    const isDesktop = viewportWidth >= 1024; // lg breakpoint
    const isTablet = viewportWidth >= 768 && viewportWidth < 1024;
    const isMobile = viewportWidth < 768;
    
    return { isDesktop, isTablet, isMobile };
  }, [viewportWidth]);

  // ADAPTIVE Image Sizing
  const imageConfig = useMemo(() => {
    if (layoutMode.isDesktop) {
      return {
        maxWidth: 450,
        maxHeight: Math.min(viewportHeight * 0.7, 600),
        containerClass: "lg:flex lg:gap-8 lg:items-start"
      };
    } else if (layoutMode.isTablet) {
      return {
        maxWidth: 400,
        maxHeight: Math.min(viewportHeight * 0.6, 500),
        containerClass: "flex flex-col items-center"
      };
    } else {
      return {
        maxWidth: Math.min(viewportWidth - 80, 350),
        maxHeight: Math.min(viewportHeight * 0.55, 450),
        containerClass: "flex flex-col items-center"
      };
    }
  }, [layoutMode, viewportHeight, viewportWidth]);

  // Auto-preload next and previous images for smoother experience
  useEffect(() => {
    if (!isOpen) return;

    const preloadImages = () => {
      const indicesToPreload = [
        currentIndex - 1,
        currentIndex + 1
      ].filter(index => index >= 0 && index < SCREENSHOT_DATA.length);

      indicesToPreload.forEach(index => {
        const img = document.createElement('img');
        img.src = SCREENSHOT_DATA[index].src;
      });
    };

    preloadImages();
  }, [currentIndex, isOpen]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'Escape':
          onClose();
          break;
        case 'ArrowLeft':
          handlePrevious();
          break;
        case 'ArrowRight':
          handleNext();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, handleNext, handlePrevious]);

  // Reset index when slider opens
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(initialIndex);
    }
  }, [isOpen, initialIndex]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Dunkler Hintergrund-Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 z-[99998]"
          />

          {/* ADAPTIVE Container */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 flex items-center justify-center z-[99999] p-4"
          >
            <motion.div
              key={currentIndex}
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className={`bg-gray-800 rounded-lg shadow-lg w-full relative text-white
                ${layoutMode.isDesktop ? 'max-w-6xl p-8' : 
                  layoutMode.isTablet ? 'max-w-2xl p-6' : 
                  'max-w-md p-5 max-h-[90vh] overflow-y-auto'}
              `}
            >
              {/* Close Button */}
              <div className="absolute top-4 right-4 z-10">
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg hover:bg-gray-700 transition-colors"
                  aria-label="Vorschau schließen"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <div className={imageConfig.containerClass}>
                {/* Screenshot Section */}
                <div className={`${layoutMode.isDesktop ? 'lg:w-1/2' : 'w-full'} flex flex-col items-center`}>
                  {/* Title - nur auf Mobile/Tablet über dem Bild */}
                  {!layoutMode.isDesktop && (
                    <h1 className={`font-bold text-center text-white mb-4 ${
                      layoutMode.isMobile ? 'text-xl' : 'text-2xl'
                    }`}>
                      {currentScreenshot.title}
                    </h1>
                  )}

                  {/* Screenshot */}
                  <div className="flex justify-center items-center mb-4">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={currentIndex}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.3 }}
                        className="relative"
                      >
                        <Image
                          src={currentScreenshot.src}
                          alt={currentScreenshot.title}
                          width={imageConfig.maxWidth}
                          height={imageConfig.maxHeight}
                          className="object-contain rounded-lg shadow-lg"
                          style={{ 
                            height: `${imageConfig.maxHeight}px`,
                            width: 'auto',
                            maxWidth: `${imageConfig.maxWidth}px`
                          }}
                          unoptimized
                          priority
                          onLoad={() => setIsImageLoading(false)}
                          onError={() => setIsImageLoading(false)}
                        />
                        {isImageLoading && (
                          <div className="absolute inset-0 flex items-center justify-center bg-gray-700 rounded-lg">
                            <Loader2 className="w-8 h-8 animate-spin text-yellow-600" />
                          </div>
                        )}
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </div>

                {/* Content Section */}
                <div className={`${layoutMode.isDesktop ? 'lg:w-1/2 lg:pl-8' : 'w-full'} flex flex-col`}>
                  {/* Title - nur auf Desktop neben dem Bild */}
                  {layoutMode.isDesktop && (
                    <h1 className="text-3xl font-bold text-white mb-6">
                      {currentScreenshot.title}
                    </h1>
                  )}

                  {/* Description */}
                  <p className={`whitespace-pre-line mb-6 ${
                    layoutMode.isDesktop ? 'text-lg leading-relaxed' : 
                    layoutMode.isTablet ? 'text-base leading-relaxed' : 
                    'text-sm leading-tight'
                  }`}>
                    {currentScreenshot.description}
                  </p>

                  {/* Elegante Progressive Dot Navigation */}
                  <div className="flex justify-center mb-6">
                    <div className="flex items-center space-x-2">
                      {getVisibleDots().map((item, idx) => {
                        if (item.type === 'ellipsis') {
                          return (
                            <div key={`ellipsis-${item.index}-${idx}`} className="flex items-center">
                              <span className="text-gray-500 text-xs px-1">⋯</span>
                            </div>
                          );
                        }
                        
                        const isActive = item.index === currentIndex;
                        return (
                          <button
                            key={item.index}
                            onClick={() => handleJumpTo(item.index)}
                            className={`transition-all duration-300 ${
                              isActive
                                ? layoutMode.isMobile 
                                  ? 'bg-yellow-600 w-6 h-2 rounded-full shadow-lg'
                                  : 'bg-yellow-600 w-8 h-2.5 rounded-full shadow-lg'
                                : layoutMode.isMobile
                                  ? 'bg-gray-600 hover:bg-gray-500 w-2 h-2 rounded-full hover:scale-110'
                                  : 'bg-gray-600 hover:bg-gray-500 w-2.5 h-2.5 rounded-full hover:scale-110'
                            }`}
                            aria-label={`Springe zu Screenshot ${item.index + 1}`}
                          />
                        );
                      })}
                    </div>
                  </div>

                  {/* Navigation Buttons */}
                  <div className="flex justify-between gap-4">
                    <button
                      {...previousButtonHandlers.handlers}
                      className={`
                        flex-1 bg-gray-600 text-white rounded-full 
                        hover:bg-gray-700 transition-all duration-100 font-semibold 
                        flex items-center justify-center
                        ${layoutMode.isDesktop ? 'px-8 py-3 text-lg' : 
                          layoutMode.isTablet ? 'px-6 py-2.5 text-base' : 
                          'px-4 py-2 text-base'}
                        ${previousButtonHandlers.buttonClasses}
                      `}
                    >
                      <FaArrowLeft className="mr-2" size={layoutMode.isDesktop ? 16 : 14} />
                      Zurück
                    </button>
                    <button
                      {...nextButtonHandlers.handlers}
                      className={`
                        flex-1 bg-yellow-600 text-white rounded-full 
                        hover:bg-yellow-700 transition-all duration-100 font-semibold 
                        flex items-center justify-center
                        ${layoutMode.isDesktop ? 'px-8 py-3 text-lg' : 
                          layoutMode.isTablet ? 'px-6 py-2.5 text-base' : 
                          'px-4 py-2 text-base'}
                        ${nextButtonHandlers.buttonClasses}
                      `}
                    >
                      Weiter
                      <FaArrowRight className="ml-2" size={layoutMode.isDesktop ? 16 : 14} />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default ScreenshotSlider;