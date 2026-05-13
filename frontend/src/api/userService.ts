import { apiClient } from './client';
import type { User } from './types';

export const userService = {
  /**
   * Login or create user
   */
  async login(username: string): Promise<User> {
    const response = await apiClient.post<User>('/auth/login', { username });
    return response.data;
  },

  /**
   * Get user profile by ID
   */
  async getUserProfile(userId: number): Promise<User> {
    const response = await apiClient.get<User>(`/users/${userId}/profile`);
    return response.data;
  },

  /**
   * Get current user from localStorage
   */
  getCurrentUserId(): number {
    const userId = localStorage.getItem('user_id');
    return userId ? parseInt(userId, 10) : 1; // Default to 1 for MVP
  },

  /**
   * Set current user in localStorage
   */
  setCurrentUserId(userId: number): void {
    localStorage.setItem('user_id', userId.toString());
  },

  /**
   * Clear current user
   */
  clearCurrentUser(): void {
    localStorage.removeItem('user_id');
    localStorage.removeItem('auth_token');
  },
};
