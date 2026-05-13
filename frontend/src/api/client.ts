import axios from 'axios';
import type { AxiosInstance, AxiosError, InternalAxiosRequestConfig, AxiosResponse } from 'axios';
import type { ApiErrorData } from './types';

// API Configuration
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const ENGINE_BASE_URL = import.meta.env.VITE_ENGINE_URL || 'http://localhost:8080';
const REQUEST_TIMEOUT = 30000; // 30 seconds

// Create Axios instances
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: REQUEST_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

const engineClient: AxiosInstance = axios.create({
  baseURL: ENGINE_BASE_URL,
  timeout: REQUEST_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
const requestInterceptor = (config: InternalAxiosRequestConfig) => {
  // Add auth token if available
  const token = localStorage.getItem('auth_token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  
  // Log request in development
  if (import.meta.env.DEV) {
    console.log(`[API Request] ${config.method?.toUpperCase()} ${config.url}`, config.data);
  }
  
  return config;
};

const requestErrorInterceptor = (error: AxiosError) => {
  console.error('[API Request Error]', error);
  return Promise.reject(error);
};

// Response interceptor
const responseInterceptor = (response: AxiosResponse) => {
  if (import.meta.env.DEV) {
    console.log(`[API Response] ${response.config.method?.toUpperCase()} ${response.config.url}`, response.data);
  }
  return response;
};

const responseErrorInterceptor = (error: AxiosError) => {
  if (error.response) {
    // Server responded with error status
    const status = error.response.status;
    const data = error.response.data as ApiErrorData;
    
    switch (status) {
      case 400:
        console.error('[API Error 400] Bad Request:', data);
        break;
      case 401:
        console.error('[API Error 401] Unauthorized');
        // Clear auth and redirect to login
        localStorage.removeItem('auth_token');
        window.location.href = '/login';
        break;
      case 403:
        console.error('[API Error 403] Forbidden');
        break;
      case 404:
        console.error('[API Error 404] Not Found');
        break;
      case 429:
        console.error('[API Error 429] Too Many Requests');
        break;
      case 500:
        console.error('[API Error 500] Internal Server Error');
        break;
      default:
        console.error(`[API Error ${status}]`, data);
    }
  } else if (error.request) {
    // Request made but no response
    console.error('[API Error] No response received:', error.message);
  } else {
    // Error in request setup
    console.error('[API Error] Request setup error:', error.message);
  }
  
  return Promise.reject(error);
};

const getApiErrorMessage = (error: unknown, fallback: string): string => {
  if (axios.isAxiosError<ApiErrorData>(error)) {
    const data = error.response?.data;
    return data?.error || data?.detail || data?.message || error.message || fallback;
  }

  if (error instanceof Error) {
    return error.message || fallback;
  }

  return fallback;
};

// Apply interceptors
apiClient.interceptors.request.use(requestInterceptor, requestErrorInterceptor);
apiClient.interceptors.response.use(responseInterceptor, responseErrorInterceptor);

engineClient.interceptors.request.use(requestInterceptor, requestErrorInterceptor);
engineClient.interceptors.response.use(responseInterceptor, responseErrorInterceptor);

export { apiClient, engineClient, getApiErrorMessage };
export default apiClient;
