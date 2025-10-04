import { useState, useEffect, useMemo } from 'react';
import { isDesktopDevice, isTabletDevice, isMobileDevice } from '@/utils/deviceDetection';

/**
 * Responsive Layout Configuration Interface
 * Definiert alle responsiven Design-Werte für Desktop, Tablet und Mobile
 */
interface ResponsiveLayoutConfig {
  // Device Detection
  isDesktop: boolean;
  isTablet: boolean;
  isMobile: boolean;
  
  // === LAYOUT & CONTAINER ===
  containerMaxWidth: string;        // max-w-7xl / max-w-none
  containerPadding: string;         // px-12 py-8 / px-4 py-4
  sectionSpacing: string;           // space-y-8 / space-y-3
  cardPadding: string;              // p-8 / p-4
  cardInnerPadding: string;         // px-6 py-5 / px-4 py-3
  listItemPadding: string;          // px-6 py-3 / px-2 py-1.5
  gap: string;                      // gap-4 / gap-2
  
  // Spacing innerhalb von Listen-Items
  listItemNumberSpacing: string;    // mr-4 / mr-2 (Abstand Nummer → Bild)
  listItemImageSpacing: string;     // mr-3 / mr-2 (Abstand Bild → Name)
  
  // === AVATAR & IMAGES ===
  avatarSize: string;               // w-56 h-56 / w-32 h-32
  avatarSizeClass: 'lg' | 'md-lg' | 'md-sm' | 'md' | 'sm';  // Für ProfileImage Komponente
  profileImageListSize: 'lg' | 'md-lg' | 'md-sm' | 'md' | 'sm'; // Für Listen
  teamAvatarSpacing: string;        // -space-x-3 / -space-x-2
  teamAvatarOverlap: string;        // Inline style px-Wert (z.B. '-32px')
  
  // === TEXT SIZES ===
  titleSize: string;                // text-6xl / text-3xl (Haupttitel)
  subtitleSize: string;             // text-2xl / text-base (Untertitel/Beschreibung)
  headingSize: string;              // text-3xl / text-base (Section Überschriften)
  subheadingSize: string;           // text-xl / text-sm (Subheadings, Tabs)
  bodySize: string;                 // text-xl / text-sm (Body Text)
  valueSize: string;                // text-4xl / text-lg (Statistik-Werte)
  labelSize: string;                // text-xl / font-medium (Statistik-Labels)
  smallTextSize: string;            // text-lg / text-sm (Kleine Texte, Klammern)
  miniTextSize: string;             // text-base / text-xs (Mini-Text, Hinweise)
  
  // Elo-Display
  eloLabelSize: string;             // text-xl / text-base
  eloValueSize: string;             // text-4xl / text-xl
  eloDeltaSize: string;             // text-2xl / text-base
  eloEmojiSize: string;             // text-3xl / text-lg
  
  // === TABS ===
  mainTabPadding: string;           // py-4 / py-2.5
  mainTabTextSize: string;          // text-xl / text-sm
  mainTabIconSize: number;          // 24 / 16
  mainTabContainerPadding: string;  // p-2 / p-1
  
  subTabPadding: string;            // py-3 / py-1.5
  subTabTextSize: string;           // text-lg / text-sm
  subTabIconSize: number;           // 22 / 18
  subTabContainerPadding: string;   // p-1.5 / p-1
  
  // === BUTTONS ===
  buttonSize: 'lg' | 'default' | 'sm';  // Für shadcn Button
  buttonIconSize: number;           // 24 / 16
  buttonPadding: string;            // px-6 py-3 / px-3 py-2
  
  // Special Buttons (Share, Zurück)
  actionButtonSize: number;         // 32 / 20
  actionButtonPadding: string;      // p-3 / p-2
  
  // === ICONS ===
  iconSize: number;                 // 28 / 20 (Standard Lucide Icons)
  smallIconSize: number;            // 20 / 16
  largeIconSize: number;            // 36 / 24
  
  // === BORDERS & ACCENTS ===
  borderWidth: string;              // border-2 / border
  accentBarWidth: string;           // w-2 / w-1
  accentBarHeight: string;          // h-8 / h-6
  
  // === LOADING STATES ===
  spinnerSize: string;              // h-16 w-16 / h-8 w-8
  skeletonTitleHeight: string;      // h-14 / h-9
  skeletonTextHeight: string;       // h-8 / h-5
}

/**
 * Hook für responsive Layout-Konfiguration
 * Gibt optimierte Klassen und Werte für Desktop, Tablet und Mobile zurück
 */
export function useResponsiveLayout(): ResponsiveLayoutConfig {
  // Device Detection mit reaktivem State
  const [deviceType, setDeviceType] = useState<'desktop' | 'tablet' | 'mobile'>(() => {
    if (typeof window === 'undefined') return 'mobile';
    if (isDesktopDevice()) return 'desktop';
    if (isTabletDevice()) return 'tablet';
    return 'mobile';
  });

  // Update bei Window Resize
  useEffect(() => {
    const handleResize = () => {
      if (isDesktopDevice()) {
        setDeviceType('desktop');
      } else if (isTabletDevice()) {
        setDeviceType('tablet');
      } else {
        setDeviceType('mobile');
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Memoized Configuration für Performance
  const config = useMemo((): ResponsiveLayoutConfig => {
    const isDesktop = deviceType === 'desktop';
    const isTablet = deviceType === 'tablet';
    const isMobile = deviceType === 'mobile';

    // Desktop Configuration (>= 1024px)
    if (isDesktop) {
      return {
        isDesktop: true,
        isTablet: false,
        isMobile: false,
        
        // Layout
        containerMaxWidth: 'max-w-6xl',
        containerPadding: 'px-12 py-8',
        sectionSpacing: 'space-y-8',
        cardPadding: 'p-8',
        cardInnerPadding: 'px-6 py-5',
        listItemPadding: 'px-6 py-3', // Erhöht von px-4 für bessere Zentrierung
        gap: 'gap-4',
        listItemNumberSpacing: 'mr-4', // Mehr Abstand zwischen Nummer und Bild
        listItemImageSpacing: 'mr-3',  // Mehr Abstand zwischen Bild und Name
        
        // Avatar - VERKLEINERT für bessere Balance!
        avatarSize: 'w-48 h-48',    // Von w-56 h-56 → w-48 h-48 (192px statt 224px)
        avatarSizeClass: 'lg',
        profileImageListSize: 'md',
        teamAvatarSpacing: '-space-x-10',
        teamAvatarOverlap: '-12px',
        
        // Text - KORRIGIERT auf existierende Tailwind-Größe!
        titleSize: 'text-4xl',     // text-5xl existiert nicht! → text-4xl (36px)
        subtitleSize: 'text-2xl',
        headingSize: 'text-3xl',
        subheadingSize: 'text-xl',
        bodySize: 'text-xl',
        valueSize: 'text-2xl',
        labelSize: 'text-xl',
        smallTextSize: 'text-lg',
        miniTextSize: 'text-base',
        
        // Elo
        eloLabelSize: 'text-xl',
        eloValueSize: 'text-4xl',
        eloDeltaSize: 'text-2xl',
        eloEmojiSize: 'text-3xl',
        
        // Tabs
        mainTabPadding: 'py-3',     // Reduziert von py-4
        mainTabTextSize: 'text-xl',
        mainTabIconSize: 24,
        mainTabContainerPadding: 'p-2',
        subTabPadding: 'py-1',      // Reduziert von py-2.5 für weniger Abstand
        subTabTextSize: 'text-lg',
        subTabIconSize: 22,
        subTabContainerPadding: 'p-1.5',
        
        // Buttons
        buttonSize: 'lg',
        buttonIconSize: 24,
        buttonPadding: 'px-6 py-3',
        actionButtonSize: 32,
        actionButtonPadding: 'p-3',
        
        // Icons
        iconSize: 28,
        smallIconSize: 20,
        largeIconSize: 36,
        
        // Borders
        borderWidth: 'border-2',
        accentBarWidth: 'w-2',
        accentBarHeight: 'h-8',
        
        // Loading
        spinnerSize: 'h-16 w-16',
        skeletonTitleHeight: 'h-14',
        skeletonTextHeight: 'h-8',
      };
    }
    
    // Tablet Configuration (768-1024px)
    if (isTablet) {
      return {
        isDesktop: false,
        isTablet: true,
        isMobile: false,
        
        // Layout
        containerMaxWidth: 'max-w-4xl',
        containerPadding: 'px-8 py-6',
        sectionSpacing: 'space-y-5',
        cardPadding: 'p-6',
        cardInnerPadding: 'px-5 py-4',
        listItemPadding: 'px-3 py-2',
        gap: 'gap-3',
        listItemNumberSpacing: 'mr-2',
        listItemImageSpacing: 'mr-2',
        
        // Avatar
        avatarSize: 'w-40 h-40',
        avatarSizeClass: 'md',
        profileImageListSize: 'sm',
        teamAvatarSpacing: '-space-x-2',
        teamAvatarOverlap: '-6px',
        
        // Text
        titleSize: 'text-4xl',
        subtitleSize: 'text-xl',
        headingSize: 'text-2xl',
        subheadingSize: 'text-lg',
        bodySize: 'text-lg',
        valueSize: 'text-2xl',
        labelSize: 'text-lg',
        smallTextSize: 'text-base',
        miniTextSize: 'text-sm',
        
        // Elo
        eloLabelSize: 'text-lg',
        eloValueSize: 'text-2xl',
        eloDeltaSize: 'text-lg',
        eloEmojiSize: 'text-2xl',
        
        // Tabs
        mainTabPadding: 'py-3',
        mainTabTextSize: 'text-base',
        mainTabIconSize: 20,
        mainTabContainerPadding: 'p-1.5',
        subTabPadding: 'py-2',
        subTabTextSize: 'text-base',
        subTabIconSize: 20,
        subTabContainerPadding: 'p-1',
        
        // Buttons
        buttonSize: 'default',
        buttonIconSize: 20,
        buttonPadding: 'px-4 py-2.5',
        actionButtonSize: 26,
        actionButtonPadding: 'p-2.5',
        
        // Icons
        iconSize: 24,
        smallIconSize: 18,
        largeIconSize: 28,
        
        // Borders
        borderWidth: 'border',
        accentBarWidth: 'w-1.5',
        accentBarHeight: 'h-7',
        
        // Loading
        spinnerSize: 'h-12 w-12',
        skeletonTitleHeight: 'h-11',
        skeletonTextHeight: 'h-6',
      };
    }
    
    // Mobile Configuration (< 768px) - Aktuelle optimierte Werte
    return {
      isDesktop: false,
      isTablet: false,
      isMobile: true,
      
      // Layout
      containerMaxWidth: 'max-w-none',
      containerPadding: 'px-4 py-4',
      sectionSpacing: 'space-y-3',
      cardPadding: 'p-4',
      cardInnerPadding: 'px-4 py-3',
      listItemPadding: 'px-2 py-1.5',
      gap: 'gap-2',
      listItemNumberSpacing: 'mr-2',
      listItemImageSpacing: 'mr-2',
      
      // Avatar
      avatarSize: 'w-32 h-32',
      avatarSizeClass: 'sm',
      profileImageListSize: 'sm',
      teamAvatarSpacing: '-space-x-2',
      teamAvatarOverlap: '-6px',
      
      // Text
      titleSize: 'text-3xl',
      subtitleSize: 'text-base',
      headingSize: 'text-base',
      subheadingSize: 'text-sm',
      bodySize: 'text-sm',
      valueSize: 'text-lg',
      labelSize: 'font-medium',
      smallTextSize: 'text-sm',
      miniTextSize: 'text-xs',
      
      // Elo
      eloLabelSize: 'text-base',
      eloValueSize: 'text-xl',
      eloDeltaSize: 'text-base',
      eloEmojiSize: 'text-lg',
      
      // Tabs
      mainTabPadding: 'py-2.5',
      mainTabTextSize: 'text-sm',
      mainTabIconSize: 16,
      mainTabContainerPadding: 'p-1',
      subTabPadding: 'py-1.5',
      subTabTextSize: 'text-sm',
      subTabIconSize: 18,
      subTabContainerPadding: 'p-1',
      
      // Buttons
      buttonSize: 'sm',
      buttonIconSize: 16,
      buttonPadding: 'px-3 py-2',
      actionButtonSize: 20,
      actionButtonPadding: 'p-2',
      
      // Icons
      iconSize: 20,
      smallIconSize: 16,
      largeIconSize: 24,
      
      // Borders
      borderWidth: 'border',
      accentBarWidth: 'w-1',
      accentBarHeight: 'h-6',
      
      // Loading
      spinnerSize: 'h-8 w-8',
      skeletonTitleHeight: 'h-9',
      skeletonTextHeight: 'h-5',
    };
  }, [deviceType]);

  return config;
}

