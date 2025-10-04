'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import Image from 'next/image';
import { SCREENSHOT_DATA, ScreenshotData } from '@/constants/screenshotData';
import { isPWA, isIOS } from '@/utils/browserDetection';

interface DesktopFeatureSliderProps {
  isOpen: boolean
  onClose: () => void
  initialIndex?: number
}

const DesktopFeatureSlider: React.FC<DesktopFeatureSliderProps> = ({
  isOpen,
  onClose,
  initialIndex = 0
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [currentScreenshot, setCurrentScreenshot] = useState<ScreenshotData>(SCREENSHOT_DATA[0]);
  const [isImageLoading, setIsImageLoading] = useState(true);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  // Navigation handlers mit LOOP-FUNKTIONALITÄT
  const handleNext = useCallback(() => {
    if (currentIndex < SCREENSHOT_DATA.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      setCurrentIndex(0);
    }
  }, [currentIndex]);

  const handlePrevious = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    } else {
      setCurrentIndex(SCREENSHOT_DATA.length - 1);
    }
  }, [currentIndex]);

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


  // Viewport Detection
  useEffect(() => {
    const updateDimensions = () => {
      setViewportWidth(window.innerWidth);
      setViewportHeight(window.innerHeight);
    };

    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, []);

  // Device Detection
  const deviceInfo = useMemo(() => {
    const isDesktop = viewportWidth >= 1024;
    const isTablet = viewportWidth >= 768 && viewportWidth < 1024;
    const isMobile = viewportWidth < 768;
    const isPWAMode = isPWA();
    const isIOSDevice = isIOS();
    
    return { isDesktop, isTablet, isMobile, isPWAMode, isIOSDevice };
  }, [viewportWidth]);

  // Adaptive Layout Configuration
  const layoutConfig = useMemo(() => {
    if (deviceInfo.isDesktop) {
      return {
        layout: 'desktop-two-column' as const,
        imageMaxWidth: 600,
        imageMaxHeight: Math.min(viewportHeight * 0.75, 700), // Realistischere Höhe
        containerMaxWidth: 'full',
        fontSize: 'text-2xl', // VIEL GRÖSSER!
        titleSize: 'text-6xl', // MASSIV GRÖSSER!
        padding: 'p-12',
        gap: 'gap-12'
      };
    } else if (deviceInfo.isTablet) {
      return {
        layout: 'tablet-stacked' as const,
        imageMaxWidth: 450,
        imageMaxHeight: Math.min(viewportHeight * 0.6, 600),
        containerMaxWidth: '4xl',
        fontSize: 'text-base',
        titleSize: 'text-3xl',
        padding: 'p-8',
        gap: 'gap-8'
      };
    } else {
      return {
        layout: 'mobile-fullscreen' as const,
        imageMaxWidth: Math.min(viewportWidth - 60, 380),
        imageMaxHeight: Math.min(viewportHeight * 0.5, 500),
        containerMaxWidth: 'lg',
        fontSize: 'text-sm',
        titleSize: 'text-2xl',
        padding: 'p-6',
        gap: 'gap-6'
      };
    }
  }, [deviceInfo, viewportWidth, viewportHeight]);

  // Auto-preload images
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

  // Desktop Two-Column Layout
  if (layoutConfig.layout === 'desktop-two-column') {
    return (
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Background Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/95 z-[99998]"
            />

            {/* Desktop Container */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 flex items-center justify-center z-[99999] p-6"
            >
              <motion.div
                key={currentIndex}
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-gray-800 rounded-xl shadow-2xl w-[95vw] h-[90vh] p-8 relative text-white flex flex-col"
              >
                {/* Close Button */}
                <button
                  onClick={onClose}
                  className="absolute top-6 right-6 p-3 rounded-lg hover:bg-gray-700 transition-colors z-10"
                  aria-label="Features schließen"
                >
                  <X className="w-6 h-6 text-gray-400" />
                </button>

                {/* ZENTRIERTES Layout - Screenshots MASSIV, perfekt ausbalanciert */}
                <div className="flex gap-20 h-full items-center justify-center max-w-none mx-auto px-12">
                  {/* Left: Screenshot - MASSIV GRÖSSER */}
                  <div className="flex items-center justify-center flex-shrink-0">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={currentIndex}
                        initial={{ opacity: 0, x: -30 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 30 }}
                        transition={{ duration: 0.4 }}
                        className="relative"
                      >
                        <Image
                          src={currentScreenshot.src}
                          alt={currentScreenshot.title}
                          width={1000}
                          height={Math.min(viewportHeight * 0.75, 850)}
                          className="object-contain rounded-lg shadow-2xl"
                          style={{ 
                            height: `${Math.min(viewportHeight * 0.75, 850)}px`,
                            width: 'auto',
                            maxWidth: '1000px'
                          }}
                          unoptimized
                          priority
                          onLoad={() => setIsImageLoading(false)}
                          onError={() => setIsImageLoading(false)}
                        />
                        {isImageLoading && (
                          <div className="absolute inset-0 flex items-center justify-center bg-gray-700 rounded-lg">
                            <Loader2 className="w-12 h-12 animate-spin text-yellow-600" />
                          </div>
                        )}
                      </motion.div>
                    </AnimatePresence>
                  </div>

                  {/* Right: Content - FLEXIBLE STRUKTUR für kleinere Viewports */}
                  <div className="flex flex-col w-[500px] justify-center">
                    {/* Content Area - vertikal zentriert zwischen Bild-Top und Buttons */}
                    <div className="flex flex-col space-y-8">
                      {/* Title */}
                      <motion.h1 
                        key={`title-${currentIndex}`}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2, duration: 0.4 }}
                        className="text-6xl font-bold text-white leading-tight"
                      >
                        {currentScreenshot.title}
                      </motion.h1>

                      {/* Description */}
                      <motion.p 
                        key={`desc-${currentIndex}`}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3, duration: 0.4 }}
                        className="text-2xl text-gray-200 leading-relaxed whitespace-pre-line font-light"
                      >
                        {currentScreenshot.description}
                      </motion.p>
                    </div>

                    {/* Navigation Area - Mit Spacing nach oben für bessere Zentrierung */}
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4, duration: 0.4 }}
                      className="space-y-6 mt-10"
                    >
                      {/* Dots - grösser und besser sichtbar */}
                      <div className="flex justify-start space-x-4">
                        {SCREENSHOT_DATA.map((_, index) => (
                          <button
                            key={index}
                            onClick={() => handleJumpTo(index)}
                            className={`transition-all duration-200 ${
                              index === currentIndex
                                ? 'bg-yellow-600 w-12 h-5 rounded-full'
                                : 'bg-gray-600 hover:bg-gray-500 w-5 h-5 rounded-full'
                            }`}
                            aria-label={`Springe zu Feature ${index + 1}`}
                          />
                        ))}
                      </div>

                      {/* Navigation - grössere Buttons */}
                      <div className="flex space-x-6">
                        <button
                          onClick={handlePrevious}
                          className="flex-1 bg-gray-600 hover:bg-gray-700 text-white px-10 py-5 rounded-full font-semibold text-2xl transition-all duration-200 flex items-center justify-center"
                        >
                          <ChevronLeft className="w-7 h-7 mr-3" />
                          Zurück
                        </button>
                        <button
                          onClick={handleNext}
                          className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white px-10 py-5 rounded-full font-semibold text-2xl transition-all duration-200 flex items-center justify-center"
                        >
                          Weiter
                          <ChevronRight className="w-7 h-7 ml-3" />
                        </button>
                      </div>
                    </motion.div>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    );
  }

  // Tablet and Mobile Layout (optimized but similar to original)
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Background Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 z-[99998]"
          />

          {/* Mobile/Tablet Container */}
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
              className={`bg-gray-800 rounded-lg shadow-lg w-full max-w-${layoutConfig.containerMaxWidth} ${layoutConfig.padding} relative text-white max-h-[90vh] overflow-y-auto`}
            >
              {/* Close Button */}
              <div className="absolute top-4 right-4 z-10">
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg hover:bg-gray-700 transition-colors"
                  aria-label="Features schließen"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <div className="flex flex-col items-center">
                {/* Title */}
                <h1 className={`${layoutConfig.titleSize} font-bold text-center text-white mb-6`}>
                  {currentScreenshot.title}
                </h1>

                {/* Screenshot */}
                <div className="flex justify-center items-center mb-6">
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
                        width={layoutConfig.imageMaxWidth}
                        height={layoutConfig.imageMaxHeight}
                        className="object-contain rounded-lg shadow-lg"
                        style={{ 
                          height: `${layoutConfig.imageMaxHeight}px`,
                          width: 'auto',
                          maxWidth: `${layoutConfig.imageMaxWidth}px`
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

                {/* Description */}
                <p className={`${layoutConfig.fontSize} text-center whitespace-pre-line mb-6 leading-relaxed`}>
                  {currentScreenshot.description}
                </p>

                {/* Dot Navigation - Responsive */}
                <div className="flex justify-center mb-6">
                  {/* Mobile: Kompakte Anzeige */}
                  {deviceInfo.isMobile ? (
                    <div className="flex items-center space-x-3">
                      <span className="text-xs text-gray-400 font-medium">
                        {currentIndex + 1} / {SCREENSHOT_DATA.length}
                      </span>
                      <div 
                        className="flex space-x-1.5 overflow-x-auto px-2 max-w-[200px] [&::-webkit-scrollbar]:hidden"
                        style={{
                          scrollBehavior: 'smooth',
                          scrollbarWidth: 'none', /* Firefox */
                          msOverflowStyle: 'none' /* IE and Edge */
                        }}
                        ref={(ref) => {
                          if (ref) {
                            // Auto-scroll aktuellen Dot in Sichtbereich
                            const currentDot = ref.children[currentIndex] as HTMLElement;
                            if (currentDot) {
                              currentDot.scrollIntoView({
                                behavior: 'smooth',
                                block: 'nearest',
                                inline: 'center'
                              });
                            }
                          }
                        }}
                      >
                        {SCREENSHOT_DATA.map((_, index) => (
                          <button
                            key={index}
                            onClick={() => handleJumpTo(index)}
                            className={`transition-all duration-200 flex-shrink-0 ${
                              index === currentIndex
                                ? 'bg-yellow-600 w-5 h-1.5 rounded-full'
                                : 'bg-gray-600 hover:bg-gray-500 w-1.5 h-1.5 rounded-full'
                            }`}
                            aria-label={`Springe zu Feature ${index + 1}`}
                          />
                        ))}
                      </div>
                    </div>
                  ) : (
                    /* Desktop/Tablet: Alle Dots sichtbar */
                    <div className="flex space-x-2 flex-wrap justify-center max-w-2xl">
                      {SCREENSHOT_DATA.map((_, index) => (
                        <button
                          key={index}
                          onClick={() => handleJumpTo(index)}
                          className={`transition-all duration-200 ${
                            index === currentIndex
                              ? 'bg-yellow-600 w-6 h-2 rounded-full'
                              : 'bg-gray-600 hover:bg-gray-500 w-2 h-2 rounded-full'
                          }`}
                          aria-label={`Springe zu Feature ${index + 1}`}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* Navigation Buttons */}
                <div className="flex justify-between gap-4 w-full">
                  <button
                    onClick={handlePrevious}
                    className="flex-1 bg-gray-600 text-white rounded-full hover:bg-gray-700 transition-all duration-100 font-semibold flex items-center justify-center px-6 py-3"
                  >
                    <ChevronLeft className="mr-2" size={16} />
                    Zurück
                  </button>
                  <button
                    onClick={handleNext}
                    className="flex-1 bg-yellow-600 text-white rounded-full hover:bg-yellow-700 transition-all duration-100 font-semibold flex items-center justify-center px-6 py-3"
                  >
                    Weiter
                    <ChevronRight className="ml-2" size={16} />
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default DesktopFeatureSlider;
