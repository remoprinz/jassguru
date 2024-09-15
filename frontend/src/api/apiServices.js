// src/api/apiServices.js

import { apiService } from './apiConfig';
import { auth } from '../firebaseInit';

const log = (...args) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(...args);
  }
};

export const handleApiError = (error) => {
  let errorMessage = 'Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.';
  let errorCode = 500;

  if (error.response) {
    errorMessage = error.response.data.message || errorMessage;
    errorCode = error.response.status;
  } else if (error.request) {
    errorMessage = 'Keine Antwort vom Server erhalten.';
  } else {
    errorMessage = error.message;
  }

  console.error('Detailed API Error:', error);

  return {
    message: errorMessage,
    status: errorCode,
  };
};

export const isEmailUnique = async (email) => {
  try {
    const response = await apiService.get('/auth/check-email', {
      params: { email }
    });
    return response.data;
  } catch (error) {
    throw handleApiError(error);
  }
};

export const registerEmail = async (email, password) => {
  try {
    const postData = { email, password };
    log(`Attempting to register email: ${email}`);
    const response = await apiService.post('/auth/register-email', postData);

    console.log("API Response for registerEmail:", response);

    if (response.status === 201 && response.data && response.data.code === 'EMAIL_REGISTRATION_SUCCESS') {
      log(`Successfully registered email. Response status: ${response.status}, code: ${response.data.code}`);
      return response.data;
    } else {
      throw new Error(`Unexpected API response. Status code: ${response.status}, code: ${response.data.code}`);
    }
  } catch (error) {
    console.log("Detailed error:", JSON.stringify(error));
    const handledError = handleApiError(error);
    log(`API Error: ${handledError.message}, Status code: ${handledError.status}`);
    throw handledError;
  }
};

export const registerJassname = async (jassname, token) => {
  try {
    const postData = { jassname, token };
    const response = await apiService.post('/auth/register-jassname', postData);

    console.log("API Response for registerJassname:", response);

    if (response.status === 200 && response.data && response.data.code === 'JASSNAME_REGISTRATION_SUCCESS') {
      return response.data;
    } else {
      throw new Error(`Unexpected API response. Status code: ${response.status}, code: ${response.data.code}`);
    }
  } catch (error) {
    console.error("Detailed error:", JSON.stringify(error));
    const handledError = handleApiError(error);
    console.error(`API Error: ${handledError.message}, Status code: ${handledError.status}`);
    throw handledError(error);
  }
};

export const decodeToken = async (token) => {
  const postData = { token };
  try {
    const response = await apiService.post('/auth/decode-token', postData);
    if (response.status === 200) {
      return response.data.email;
    }
    throw new Error(`Unerwarteter Statuscode: ${response.status}`);
  } catch (error) {
    throw handleApiError(error);
  }
};

export const confirmRegistration = async (jassname, token, password) => {
  const postData = {
    nickname: jassname,
    token: token,
    password: password,
  };
  try {
    log(`Attempting to confirm registration for nickname: ${jassname}`);
    const response = await apiService.post('/auth/confirm', postData);

    response.data.jassname = response.data.jassname || null;

    console.log("API Response for confirmRegistration:", response);

    if ([200, 201].includes(response.status) && response.data) {
      const { code } = response.data;

      log(`API Response. Status: ${response.status}, Code: ${code}`);

      if (['USER_CONFIRMED', 'ANOTHER_EXPECTED_CODE'].includes(code)) {
        return response.data;
      }

      throw new Error(`Unexpected API code: ${code}`);
    } else {
      throw new Error(`Unexpected API response. Status code: ${response.status}, code: ${response.data ? response.data.code : 'Unknown'}`);
    }
  } catch (error) {
    console.log("Detailed error:", JSON.stringify(error));
    const handledError = handleApiError(error);
    log(`API Error: ${handledError.message}, Status code: ${handledError.status}`);
    throw handledError;
  }
};

export const initiateAddPlayer = async (nickname, email) => {
  try {
    const postData = { nickname, email };
    log(`Attempting to add player with nickname: ${nickname} and email: ${email || 'not provided'}`);
    const response = await apiService.post('/auth/add-player', postData);

    console.log("API Response for initiateAddPlayer:", response);

    if (response.status === 201 && response.data) {
      if (response.data.code === 'PLAYER_ADDED_EMAIL_SENT' || response.data.code === 'PLAYER_ADDED_NO_EMAIL_REQUIRED') {
        log(`Successfully initiated add player. Response status: ${response.status}, code: ${response.data.code}`);
        return response.data;
      } else {
        throw new Error(`Unexpected API code: ${response.data.code}`);
      }
    } else {
      throw new Error(`Unexpected API response. Status code: ${response.status}`);
    }
  } catch (error) {
    console.error("Detailed error:", JSON.stringify(error));
    const handledError = handleApiError(error);
    log(`API Error: ${handledError.message}, Status code: ${handledError.status}`);
    throw handledError;
  }
};

export const apiConfirmAddPlayer = async (nickname, password, token) => {
  console.log('apiConfirmAddPlayer called with:', { nickname, token }); // Logging hinzugefügt
  try {
    console.log('Sending request to confirm add player:', { nickname, token });
    const response = await apiService.post('/auth/confirm-add-player', {
      nickname,
      password,
      token
    });
    console.log('Received response from confirm add player:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error in apiConfirmAddPlayer:', error);
    throw handleApiError(error);
  }
};

export const confirmLogin = async (email, password) => {
  try {
    const postData = { email, password };
    console.log("Preparing to send login request...");
    console.log("Post data for login:", JSON.stringify(postData));

    if (auth.currentUser) {
      const token = await auth.currentUser.getIdToken(true);
      console.log(`Preparing to send token: ${token}`);
    } else {
      console.log("No current user in Firebase auth.");
    }

    const response = await apiService.post('/auth/login', postData);

    console.log("Received response from server:", response);

    if (response.status === 200) {
      console.log(`Successful login. Status code: ${response.status}, Data: ${JSON.stringify(response.data)}`);
      return response;
    } else {
      console.error(`Unexpected API response. Status code: ${response.status}`);
      throw new Error(`Unexpected API response. Status code: ${response.status}`);
    }
  } catch (error) {
    console.error("Error during login:", error);
    const handledError = handleApiError(error);
    console.error(`Handled API Error: ${handledError.message}, Status code: ${handledError.status}`);
    throw handledError;
  }
};

export const resendToken = async (email) => {
  const postData = { email };
  try {
    const response = await apiService.post('/auth/resend-token', postData);
    if (response.status === 201 || response.status === 200) {
      return response.data;
    }
    throw new Error(`Unerwarteter Statuscode: ${response.status}`);
  } catch (error) {
    throw handleApiError(error);
  }
};

export const setPassword = async (token, password, passwordConfirmation) => {
  const postData = {
    token: token,
    password: password,
    passwordConfirmation: passwordConfirmation,
  };
  try {
    const response = await apiService.post('/auth/set-password', postData);
    return response;
  } catch (error) {
    throw handleApiError(error);
  }
};

export const convertGuestToRegistered = async (playerId) => {
  try {
    log(`Attempting to convert guest player with ID: ${playerId}`);
    const response = await apiService.post(`/api/players/${playerId}/convert`);
    
    console.log("API Response for convertGuestToRegistered:", response);

    if (response.status === 200) {
      log(`Successfully converted guest player. Response status: ${response.status}`);
      return response.data;
    } else {
      throw new Error(`Unexpected API response. Status code: ${response.status}`);
    }
  } catch (error) {
    console.error("Error converting guest player:", error);
    throw handleApiError(error);
  }
};

export const decodeAddPlayerToken = async (token) => {
  try {
    const response = await apiService.post('/auth/decode-add-player-token', { token });
    return response.data;
  } catch (error) {
    throw handleApiError(error);
  }
};
