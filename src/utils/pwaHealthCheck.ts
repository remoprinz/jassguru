export const performHealthCheck = () => {
  if (typeof window === 'undefined') {
    return;
  }

  const checkIndexedDB = () => {
    return new Promise((resolve, reject) => {
      try {
        const dbRequest = window.indexedDB.open('health-check-db', 1);

        dbRequest.onupgradeneeded = () => {
          // Success
        };

        dbRequest.onsuccess = () => {
          dbRequest.result.close();
          window.indexedDB.deleteDatabase('health-check-db');
          resolve(true);
        };

        dbRequest.onerror = () => {
          reject(new Error('IndexedDB could not be opened.'));
        };
      } catch (error) {
        reject(error);
      }
    });
  };

  checkIndexedDB().catch(() => {
    window.location.href = '/kill-sw.html?auto=true&reason=healthcheck_failed';
  });
};
