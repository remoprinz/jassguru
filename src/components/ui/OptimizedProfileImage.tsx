"use client";

import React from 'react';
import ProfileImage from './ProfileImage';

interface OptimizedProfileImageProps {
  src?: string | null;
  alt: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  fallbackText?: string;
  className?: string;
  fallbackClassName?: string;
  priority?: boolean;
  isInList?: boolean; // Für Listen-Optimierung
}

/**
 * Wrapper für ProfileImage mit automatischer Optimierung
 * Verwendet in Listen automatisch optimierte Einstellungen
 */
const OptimizedProfileImage: React.FC<OptimizedProfileImageProps> = ({
  isInList = false,
  priority = false,
  ...props
}) => {
  return (
    <ProfileImage
      {...props}
      useNextImage={true} // Immer Next.js Image verwenden
      lazy={!priority} // Lazy Loading außer bei priority
      optimized={isInList} // Optimierung für Listen
      priority={priority && !isInList} // Priority nur wenn nicht in Liste
    />
  );
};

export default OptimizedProfileImage;
