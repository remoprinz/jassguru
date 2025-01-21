import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUIStore } from '../../store/uiStore';
import type { Notification, NotificationType } from '../../types/notification';
import { FaExclamationTriangle, FaCheckCircle, FaInfoCircle } from 'react-icons/fa';

const GlobalNotificationContainer: React.FC = () => {
  const notifications = useUIStore(state => state.notifications) as Notification[];
  const removeNotification = useUIStore(state => state.removeNotification);

  const getIcon = (type: NotificationType = 'info') => {
    switch (type) {
      case 'warning':
        return <FaExclamationTriangle className="w-12 h-12 text-yellow-600 mb-2" />;
      case 'success':
        return <FaCheckCircle className="w-12 h-12 text-green-600 mb-2" />;
      case 'error':
        return <FaExclamationTriangle className="w-12 h-12 text-red-600 mb-2" />;
      default:
        return <FaInfoCircle className="w-12 h-12 text-blue-600 mb-2" />;
    }
  };

  return (
    <AnimatePresence>
      {notifications.map((notification) => (
        <motion.div
          key={notification.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={`fixed inset-0 flex items-center justify-center z-[9999] 
            ${notification.isFlipped ? 'rotate-180' : ''}`}
        >
          <div 
            className="fixed inset-0 bg-black bg-opacity-50" 
            onClick={() => removeNotification(notification.id)}
          />
          <motion.div 
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0.95 }}
            className="bg-gray-800 p-6 rounded-lg shadow-lg max-w-xs w-full relative text-white z-10"
          >
            <div className="flex flex-col items-center justify-center mb-4">
              {getIcon(notification.type)}
              <p className="text-center mb-6">{notification.message}</p>
            </div>
            
            <div className={`flex justify-${notification.actions?.length === 1 ? 'center' : 'between'} gap-4`}>
              {notification.actions ? (
                notification.actions.map((action, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      action.onClick();
                      if (!notification.preventClose) {
                        removeNotification(notification.id);
                      }
                    }}
                    className={`
                      flex-1 px-6 py-2 rounded-full transition-colors text-lg font-semibold
                      ${index === notification.actions!.length - 1 
                        ? 'bg-yellow-600 hover:bg-yellow-700' 
                        : 'bg-gray-600 hover:bg-gray-700'
                      }
                      text-white
                    `}
                  >
                    {action.label}
                  </button>
                ))
              ) : (
                <button
                  onClick={() => removeNotification(notification.id)}
                  className="flex-1 bg-yellow-600 text-white px-6 py-2 rounded-full hover:bg-yellow-700 transition-colors text-lg font-semibold"
                >
                  Verstanden
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      ))}
    </AnimatePresence>
  );
};

export default GlobalNotificationContainer; 