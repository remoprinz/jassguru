"use client";

import React, { useState, useCallback, memo, useEffect, useMemo } from 'react';
import Image from 'next/image';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { backgroundOptimizer } from '@/utils/backgroundImageOptimizer';
import { getOptimizedImageUrl } from '@/utils/imageOptimization';

interface ProfileImageProps {
  src?: string | null;
  alt: string;
  size?: 'xs' | 'sm' | 'md' | 'md-sm' | 'md-lg' | 'lg' | 'xl';
  fallbackText?: string;
  className?: string;
  fallbackClassName?: string;
  style?: React.CSSProperties; // Inline styles für explizite Überlappung
  priority?: boolean;
  useNextImage?: boolean; // Option für Next.js Image vs Avatar
  lazy?: boolean; // Lazy Loading Control
  optimized?: boolean; // Optimierung für Listen
  // 🚀 NEU: Context-aware Loading
  context?: 'default' | 'list' | 'hero'; // Optimierung basierend auf Verwendungskontext
  // 🚀 NEU: Background Optimization
  autoOptimize?: boolean; // Automatische Hintergrund-Optimierung
  optimizationType?: 'profile' | 'group' | 'tournament';
  userId?: string; // Für Profile und Tournament-Optimierung
  groupId?: string; // Für Gruppen-Optimierung  
  tournamentId?: string; // Für Tournament-Optimierung
}

const sizeMapping = {
  xs: { width: 24, height: 24, className: 'h-6 w-6' },
  sm: { width: 32, height: 32, className: 'h-8 w-8' },
  md: { width: 40, height: 40, className: 'h-10 w-10' },
  'md-sm': { width: 52, height: 52, className: 'h-13 w-13' },
  'md-lg': { width: 64, height: 64, className: 'h-16 w-16' },
  lg: { width: 80, height: 80, className: 'h-20 w-20' },
  xl: { width: 128, height: 128, className: 'h-32 w-32' },
};

const ProfileImage: React.FC<ProfileImageProps> = memo(({
  src,
  alt,
  size = 'md',
  fallbackText,
  className = '',
  fallbackClassName = '',
  style,
  priority = false,
  useNextImage = true, // 🔥 WICHTIG: Next.js Image als Standard für bessere Performance
  lazy = true, // Lazy Loading als Standard
  optimized = false, // Optimierung für Listen
  // 🚀 NEU: Context-aware Loading
  context = 'default',
  // 🚀 NEU: Background Optimization Props
  autoOptimize = true, // Standardmäßig aktiviert
  optimizationType = 'profile',
  userId,
  groupId,
  tournamentId,
}) => {
  const [imageError, setImageError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  const sizeConfig = sizeMapping[size];
  const displayFallbackText = fallbackText || alt.charAt(0).toUpperCase();
  
  // Prüfe, ob src verfügbar und gültig ist
  const hasValidSrc = src && src.trim() !== '' && !imageError;
  
  // 🔥 KRITISCHER PERFORMANCE-FIX: Optimiere Firebase Storage URLs für Caching
  const optimizedSrc = useMemo(() => {
    if (!src) return '';
    return getOptimizedImageUrl(src, sizeConfig.width);
  }, [src, sizeConfig.width]);

  // 🚀 NEU: Context-aware Loading Logic
  const getLoadingBehavior = useCallback(() => {
    // Hero images: priority + eager loading
    if (context === 'hero') {
      return { shouldUsePriority: true, shouldBeLazy: false };
    }
    // List images: LAZY laden, um parallele Requests zu drosseln
    if (context === 'list') {
      return { shouldUsePriority: false, shouldBeLazy: true };
    }
    // 🔥 PERFORMANCE-BOOST: Kleine Avatare in Listen automatisch mit Avatar-Component (schneller)
    if (size === 'sm' || size === 'xs') {
      return { shouldUsePriority: false, shouldBeLazy: true, useAvatarComponent: true };
    }
    // Default: respektiere explizite props
    return { shouldUsePriority: priority, shouldBeLazy: lazy };
  }, [context, priority, lazy, size]);

  const { shouldUsePriority, shouldBeLazy, useAvatarComponent } = getLoadingBehavior();

  // Optimierte responsive Größen für bessere Performance
  const getOptimizedSizes = useCallback(() => {
    // Responsive sizes für verschiedene Viewports
    const responsiveSizes = {
      xs: '(max-width: 640px) 24px, 24px',
      sm: '(max-width: 640px) 32px, 32px', 
      md: '(max-width: 640px) 40px, 40px',
      'md-sm': '(max-width: 640px) 44px, 52px',
      'md-lg': '(max-width: 640px) 48px, 64px',
      lg: '(max-width: 640px) 60px, 80px',
      xl: '(max-width: 640px) 96px, 128px'
    };
    return responsiveSizes[size] || `${sizeConfig.width}px`;
  }, [size, sizeConfig.width]);

  const handleError = useCallback(() => {
    if (process.env.NODE_ENV === 'development') {
      console.warn(`Failed to load image: ${src}`);
    }
    setImageError(true);
    setIsLoading(false);
  }, [src]);

  const handleLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  // 🚀 NEU: Background Optimization Hook
  useEffect(() => {
    if (!autoOptimize || !src || imageError || !hasValidSrc) {
      return;
    }

    // Triggere Background Optimization nach erfolgreicher Bildanzeige
    const metadata = {
      userId,
      groupId, 
      tournamentId
    };

    // Prüfe ob alle nötigen Metadaten vorhanden sind
    const hasRequiredMetadata = 
      (optimizationType === 'profile' && userId) ||
      (optimizationType === 'group' && groupId) ||
      (optimizationType === 'tournament' && userId && tournamentId);

    if (hasRequiredMetadata) {
      // Kurze Verzögerung, damit das Bild Zeit hat zu laden
      const timer = setTimeout(() => {
        // Verwende die Original-URL für den Optimizer, nicht die optimierte
        backgroundOptimizer.checkAndQueue(src, optimizationType, metadata, priority ? 1 : 3);
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [src, autoOptimize, optimizationType, userId, groupId, tournamentId, imageError, hasValidSrc, priority]);

  // 🔥 PERFORMANCE-BOOST: Kleine Avatare automatisch mit Avatar-Component (weniger Overhead)
  if (useNextImage && !useAvatarComponent) {
    // Verwende Next.js Image direkt (für größere Bilder)
    return (
      <div className={cn(`relative overflow-hidden rounded-full bg-gray-800`, sizeConfig.className, className)} style={style}>
        {hasValidSrc ? (
          <Image
            src={optimizedSrc}
            alt={alt}
            width={sizeConfig.width}
            height={sizeConfig.height}
            className="object-cover h-full w-full"
            sizes={getOptimizedSizes()}
            priority={shouldUsePriority && !shouldBeLazy}
            loading={shouldBeLazy ? 'lazy' : 'eager'}
            quality={optimized ? 50 : 75}
            placeholder="empty" // Kein Blur-Placeholder für schnelleres Laden
            onError={handleError}
            onLoad={handleLoad}
          />
        ) : (
          <div className={cn(
            "h-full w-full flex items-center justify-center bg-blue-600 text-white font-semibold",
            fallbackClassName
          )}>
            <span style={{ fontSize: `${Math.max(12, sizeConfig.width * 0.3)}px` }}>
              {displayFallbackText}
            </span>
          </div>
        )}
      </div>
    );
  }

  // Verwende Radix Avatar (Standard)
  return (
    <Avatar className={cn(sizeConfig.className, className)} style={style}>
      {hasValidSrc && (
        <AvatarImage 
          src={optimizedSrc} 
          alt={alt}
          onError={handleError}
          onLoad={handleLoad}
        />
      )}
      <AvatarFallback 
        className={cn(
          "bg-blue-600 text-white font-semibold flex items-center justify-center",
          fallbackClassName
        )}
        style={{ fontSize: `${Math.max(12, sizeConfig.width * 0.3)}px` }}
      >
        {displayFallbackText}
      </AvatarFallback>
    </Avatar>
  );
}, (prevProps, nextProps) => {
  // Memo Vergleich: Re-render nur bei Änderungen der relevanten Props
  return prevProps.src === nextProps.src &&
         prevProps.alt === nextProps.alt &&
         prevProps.size === nextProps.size &&
         prevProps.className === nextProps.className &&
         prevProps.fallbackClassName === nextProps.fallbackClassName &&
         prevProps.style === nextProps.style &&
         prevProps.priority === nextProps.priority &&
         prevProps.context === nextProps.context &&
         prevProps.optimized === nextProps.optimized &&
         prevProps.autoOptimize === nextProps.autoOptimize &&
         prevProps.optimizationType === nextProps.optimizationType &&
         prevProps.userId === nextProps.userId &&
         prevProps.groupId === nextProps.groupId &&
         prevProps.tournamentId === nextProps.tournamentId;
});

ProfileImage.displayName = 'ProfileImage';

export default ProfileImage; 