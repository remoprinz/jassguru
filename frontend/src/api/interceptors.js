// src/api/interceptors.js
import { auth } from '../firebaseInit';

export const authInterceptor = async (config) => {
  console.log("Running auth interceptor...");
  if (!auth.currentUser) {
    console.log("No current user in Firebase auth. Skipping token retrieval.");
    return config;
  }

  try {
    const token = await auth.currentUser.getIdToken(true);
    console.log("Setting Authorization header with token:", `Bearer ${token.substring(0, 10)}...`);
    config.headers.Authorization = `Bearer ${token}`;
  } catch (error) {
    console.error("Error retrieving token:", error);
  }
  
  return config;
};

export const loggerInterceptor = (config) => {
  console.log('Sending request to:', config.baseURL + config.url);
  console.log('With headers:', config.headers);
  return config;
};