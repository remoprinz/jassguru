import type { SpruchMitIcon } from './sprueche';
import React from 'react';
import type { ReactNode } from 'react';

// Position der Notification auf dem Bildschirm
export type NotificationPosition = 'top' | 'bottom';

// 1. Basis-Types
export type NotificationVariant = 
  | 'success' 
  | 'error' 
  | 'warning' 
  | 'info' 
  | 'bedanken'
  | 'select'  // Neue Variante für Spielerauswahl
  | 'history';

// Definition einer Aktion in der Notification
export interface NotificationAction {
  label: ReactNode;  // Erlaubt React-Komponenten als Label
  onClick: () => void;
  className?: string; // Optionale className-Eigenschaft für benutzerdefiniertes Styling
}

// 2. Basis-Notification Interface
export interface BaseNotification {
  id: string;
  message: string | ReactNode;
  type: NotificationVariant;
  timestamp: number;
  duration?: number;
  position?: 'top' | 'bottom';
  isFlipped?: boolean;
  preventClose?: boolean;
  actions?: NotificationAction[];
  image?: string;
}

// Union Type für Notification-Konfigurationen (ohne id/timestamp)
export type NotificationConfig = Omit<BaseNotification, 'id' | 'timestamp'>;

// 3. Union Type für alle möglichen Notifications
export type Notification = BaseNotification;

// Type Guard für NotificationAction mit ReactNode Label
export const isNotificationActionWithReactNode = (
  action: NotificationAction
): action is NotificationAction & { label: ReactNode } => {
  return React.isValidElement(action.label);
};

// Props für die JassFinish-Notification
export interface JassFinishNotificationConfig {
  message?: SpruchMitIcon;
  mode?: 'share' | 'continue'; 
  onShare?: () => Promise<void>;
  onBack?: () => void;
  onContinue?: () => void;
}

// Die vollständige Notification mit internem State
export interface JassFinishNotificationState extends JassFinishNotificationConfig {
  isOpen: boolean;
}

// Props für die History-Warning-Notification
export interface HistoryWarningConfig {
  message: string;
  isFlipped?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
}