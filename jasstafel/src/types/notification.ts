import type { SpruchMitIcon } from './sprueche';

// Position der Notification auf dem Bildschirm
export type NotificationPosition = 'top' | 'bottom';

// Art der Notification (bestimmt u.a. die Farbe)
export type NotificationType = 'warning' | 'info' | 'error' | 'success';

// Definition einer Aktion (Button) in der Notification
export interface NotificationAction {
  label: string;
  onClick: () => void;
}

// Basis-Konfiguration für neue Notifications
export interface NotificationConfig {
  message: string;
  type?: NotificationType;
  position?: NotificationPosition;
  isFlipped?: boolean;
  actions?: NotificationAction[];
  autoHideDuration?: number;
  preventClose?: boolean;
}

// Interne Notification mit zusätzlichen Pflichtfeldern
export interface Notification extends NotificationConfig {
  id: string;
  timestamp: number;
}

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