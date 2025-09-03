"use client";

import React from 'react';
import ProfileImage from './ProfileImage';

interface SmartProfileImageProps {
  src?: string | null;
  alt: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  fallbackText?: string;
  className?: string;
  fallbackClassName?: string;
  priority?: boolean;
  // Smart Auto-Detection
  userId?: string; // Wenn verfügbar, automatisch Profile-Optimization
  groupId?: string; // Wenn verfügbar, automatisch Group-Optimization  
  tournamentId?: string; // Wenn verfügbar, automatisch Tournament-Optimization
}

/**
 * Intelligente ProfileImage-Wrapper 
 * Erkennt automatisch den Typ und aktiviert Background-Optimization
 */
const SmartProfileImage: React.FC<SmartProfileImageProps> = ({
  userId,
  groupId,
  tournamentId,
  ...props
}) => {
  // Auto-Detect Optimization Type
  let optimizationType: 'profile' | 'group' | 'tournament' = 'profile';
  if (groupId && !userId) {
    optimizationType = 'group';
  } else if (tournamentId && userId) {
    optimizationType = 'tournament';
  }

  return (
    <ProfileImage
      {...props}
      autoOptimize={true} // Immer aktiviert
      optimizationType={optimizationType}
      userId={userId}
      groupId={groupId}
      tournamentId={tournamentId}
    />
  );
};

export default SmartProfileImage;
