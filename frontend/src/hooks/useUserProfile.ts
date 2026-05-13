import { useState, useEffect, useCallback } from 'react';
import { getApiErrorMessage, userService } from '../api';
import type { User } from '../api';

interface UseUserProfileResult {
  user: User | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useUserProfile(userId?: number): UseUserProfileResult {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUser = useCallback(async () => {
    const id = userId || userService.getCurrentUserId();
    
    try {
      setLoading(true);
      setError(null);
      
      const userData = await userService.getUserProfile(id);
      setUser(userData);
    } catch (err: unknown) {
      const errorMessage = getApiErrorMessage(err, 'Failed to load user profile');
      setError(errorMessage);
      console.error('Error fetching user profile:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchUser();
  }, [fetchUser]);

  return {
    user,
    loading,
    error,
    refetch: fetchUser,
  };
}
