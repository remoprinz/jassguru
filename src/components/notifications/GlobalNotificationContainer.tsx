import React, {useState, useEffect} from "react";
import ReactDOM from "react-dom"; // Import ReactDOM für Portals
import {motion, AnimatePresence} from "framer-motion";
import {useUIStore} from "../../store/uiStore";
import type {
  Notification,
  NotificationAction,
  NotificationCheckbox,
  SimpleCheckbox,
} from "../../types/notification";
import { CustomCheckbox } from "../ui/checkbox-custom";
import {
  FaExclamationTriangle,
  FaCheckCircle,
  FaInfoCircle,
} from "react-icons/fa";

// AUTOMATISCHES AUSBLENDEN KOMPLETT ENTFERNT - Benutzer muss immer explizit "Verstanden" klicken!

const GlobalNotificationContainer: React.FC = () => {
  const notifications = useUIStore((state) => state.notifications);
  const removeNotification = useUIStore((state) => state.removeNotification);
  const iosNotification = useUIStore((state) => state.iosNotification);
  const setIOSNotificationDontShowAgain = useUIStore((state) => state.setIOSNotificationDontShowAgain);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    // Stelle sicher, dass dies nur auf dem Client ausgeführt wird
    setIsClient(true);
  }, []);

  const renderIcon = (notification: Notification): JSX.Element => {
    // Zuerst prüfen ob ein Image vorhanden ist
    if (notification.image) {
      return (
        <img
          src={notification.image}
          alt=""
          className="w-56 h-56 mb-4 rounded-lg object-cover"
        />
      );
    }

    // Sonst das passende Icon zeigen
    switch (notification.type) {
    case "warning":
      return <FaExclamationTriangle className="w-12 h-12 text-yellow-600 mb-2" />;
    case "success":
      return <FaCheckCircle className="w-12 h-12 text-green-600 mb-2" />;
    case "error":
      return <FaExclamationTriangle className="w-12 h-12 text-red-600 mb-2" />;
    case "bedanken":
      return <FaCheckCircle className="w-12 h-12 text-green-600 mb-2" />;
    default:
      return <FaInfoCircle className="w-12 h-12 text-blue-600 mb-2" />;
    }
  };

  const renderActions = (notification: Notification) => {
    if (!notification.actions?.length) {
      return (
        <div className="flex justify-center w-full">
          <button
            onClick={() => removeNotification(notification.id)}
            className="
              w-36
              bg-yellow-600 text-white px-6 py-2 rounded-full
              hover:bg-yellow-700 transition-all duration-100
              text-lg font-semibold
              active:scale-95 active:opacity-80
            "
          >
            Verstanden
          </button>
        </div>
      );
    }

    return notification.actions.map((action: NotificationAction, index: number) => (
      <button
        key={index}
        onClick={() => {
          action.onClick();
          // BUGFIX: Entferne Notification immer, auch bei preventClose: true
          // preventClose sollte nur das Overlay-Click und automatisches Schließen verhindern
          removeNotification(notification.id);
        }}
        className={`
          flex-1 px-6 py-2 rounded-full 
          text-lg font-semibold
          ${notification.type === "bedanken" && index === notification.actions!.length - 1 ?
        "bg-green-600 hover:bg-green-700" :
        index === notification.actions!.length - 1 ?
          "bg-yellow-600 hover:bg-yellow-700" :
          "bg-gray-600 hover:bg-gray-700"
      }
          text-white
          transition-all duration-100
          active:scale-95 active:opacity-80
        `}
      >
        {action.label}
      </button>
    ));
  };

  const notificationContent = (
    <AnimatePresence mode="wait">
      {notifications.map((notification) => (
        <motion.div
          key={`notification-${notification.id}`}
          initial={{opacity: 0}}
          animate={{opacity: 1}}
          exit={{opacity: 0}}
          className={`
            fixed inset-0 flex items-center justify-center z-[9999]
            ${notification.isFlipped ? "rotate-180" : ""}
            ${notification.type === "bedanken" ? "items-end pb-4" : ""}
          `}
        >
          <div
            className="fixed inset-0 bg-black bg-opacity-50"
            onClick={() => {
              if (!notification.preventClose) {
                removeNotification(notification.id);
              }
            }}
          />
          <motion.div
            initial={{scale: 0.95}}
            animate={{scale: 1}}
            exit={{scale: 0.95}}
            className="bg-gray-800 p-6 rounded-lg shadow-lg max-w-xs w-full relative text-white z-10"
          >
            <div className="flex flex-col items-center justify-center mb-4">
              {renderIcon(notification)}
              <p className="text-center mb-6 mt-4">{notification.message}</p>
            </div>

            {/* Checkbox (falls vorhanden) */}
            {notification.checkbox && (
              <div className="flex items-center justify-center mb-4">
                <CustomCheckbox
                  checked={notification.checkbox.checked}
                  onChange={notification.checkbox.onChange}
                  label={notification.checkbox.label}
                />
              </div>
            )}

            {/* Checkbox-Handling - Unterscheidung zwischen simpleCheckbox und iOS-Notification */}
            {(notification.simpleCheckbox || notification.isIOSNotification) && (
              <div className="flex items-center justify-center mb-6">
                <div 
                  className={`flex items-center cursor-pointer select-none px-3 py-2 rounded-lg transition-all duration-200 ${
                    (notification.isIOSNotification ? iosNotification.dontShowAgain : notification.simpleCheckbox?.checked)
                      ? 'bg-yellow-600/20' 
                      : 'bg-gray-700/30 hover:bg-gray-600/40'
                  }`}
                  onClick={() => {
                    if (notification.isIOSNotification) {
                      // iOS-Notification: Verwende uiStore direkt
                      const newValue = !iosNotification.dontShowAgain;
                      console.log('🎯 [GlobalContainer iOS] Klick:', { 
                        notificationId: notification.id,
                        current: iosNotification.dontShowAgain, 
                        new: newValue 
                      });
                      setIOSNotificationDontShowAgain(newValue);
                    } else if (notification.simpleCheckbox) {
                      // Standard simpleCheckbox: Verwende die vorhandene Logik
                      const newValue = !notification.simpleCheckbox.checked;
                      console.log('🎯 [GlobalContainer SimpleCheckbox] Klick:', { 
                        notificationId: notification.id,
                        current: notification.simpleCheckbox.checked, 
                        new: newValue 
                      });
                      notification.simpleCheckbox.onChange(newValue);
                    }
                  }}
                >
                  <div 
                    className={`w-6 h-6 border-2 rounded mr-3 flex items-center justify-center transition-all duration-200 ${
                      (notification.isIOSNotification ? iosNotification.dontShowAgain : notification.simpleCheckbox?.checked)
                        ? 'bg-yellow-600 border-yellow-600 text-white' 
                        : 'bg-gray-700 border-gray-500'
                    }`}
                  >
                    {(notification.isIOSNotification ? iosNotification.dontShowAgain : notification.simpleCheckbox?.checked) && (
                      <span className="text-white text-lg font-bold leading-none">✓</span>
                    )}
                  </div>
                  <span className={`text-sm transition-colors duration-200 ${
                    (notification.isIOSNotification ? iosNotification.dontShowAgain : notification.simpleCheckbox?.checked)
                      ? 'text-yellow-300 font-medium' 
                      : 'text-gray-300'
                  }`}>
                    {notification.isIOSNotification ? 'Nicht mehr anzeigen' : notification.simpleCheckbox?.label}
                  </span>
                </div>
              </div>
            )}

            <div className={`flex justify-${notification.actions?.length === 1 ? "center" : "between"} gap-4`}>
              {renderActions(notification)}
            </div>
          </motion.div>
        </motion.div>
      ))}
    </AnimatePresence>
  );

  // Rendere nichts serverseitig oder bevor document.body verfügbar ist
  if (!isClient) {
    return null;
  }

  // Verwende createPortal, um den Inhalt direkt in document.body zu rendern
  return ReactDOM.createPortal(
    notificationContent,
    document.body
  );
};

export default GlobalNotificationContainer;
