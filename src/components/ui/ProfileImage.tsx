"use client";

import React, { useState } from 'react';
import Image from 'next/image';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

interface ProfileImageProps {
  src?: string | null;
  alt: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  fallbackText?: string;
  className?: string;
  fallbackClassName?: string;
  priority?: boolean;
  useNextImage?: boolean; // Option für Next.js Image vs Avatar
}

const sizeMapping = {
  xs: { width: 24, height: 24, className: 'h-6 w-6' },
  sm: { width: 32, height: 32, className: 'h-8 w-8' },
  md: { width: 40, height: 40, className: 'h-10 w-10' },
  lg: { width: 80, height: 80, className: 'h-20 w-20' },
  xl: { width: 128, height: 128, className: 'h-32 w-32' },
};

const ProfileImage: React.FC<ProfileImageProps> = ({
  src,
  alt,
  size = 'md',
  fallbackText,
  className = '',
  fallbackClassName = '',
  priority = false,
  useNextImage = false,
}) => {
  const [imageError, setImageError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  const sizeConfig = sizeMapping[size];
  const displayFallbackText = fallbackText || alt.charAt(0).toUpperCase();
  
  // Prüfe, ob src verfügbar und gültig ist
  const hasValidSrc = src && src.trim() !== '' && !imageError;

  if (useNextImage) {
    // Verwende Next.js Image direkt (für größere Bilder)
    return (
      <div className={cn(`relative overflow-hidden rounded-full bg-gray-800`, sizeConfig.className, className)}>
        {hasValidSrc ? (
          <Image
            src={src}
            alt={alt}
            width={sizeConfig.width}
            height={sizeConfig.height}
            className="object-cover h-full w-full"
            priority={priority}
            onError={() => {
              console.warn(`Failed to load image: ${src}`);
              setImageError(true);
            }}
            onLoad={() => setIsLoading(false)}
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
    <Avatar className={cn(sizeConfig.className, className)}>
      {hasValidSrc && (
        <AvatarImage 
          src={src} 
          alt={alt}
          onError={() => {
            console.warn(`Avatar failed to load image: ${src}`);
            setImageError(true);
          }}
          onLoad={() => setIsLoading(false)}
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
};

export default ProfileImage; 