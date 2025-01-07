export const getDeviceOS = () => {
  if (typeof window === 'undefined') {
    return 'other'; // Fallback für SSR
  }
  
  const userAgent = window.navigator.userAgent.toLowerCase();
  
  if (/iphone|ipad|ipod/.test(userAgent)) {
    return 'iOS';
  }
  if (/android/.test(userAgent)) {
    return 'Android';
  }
  return 'other';
}; 