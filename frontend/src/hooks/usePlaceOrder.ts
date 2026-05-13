import { useState } from 'react';
import { getApiErrorMessage, orderService } from '../api';
import type { OrderCreate } from '../api';

interface UsePlaceOrderResult {
  placeOrder: (order: OrderCreate) => Promise<void>;
  loading: boolean;
  error: string | null;
  success: boolean;
}

export function usePlaceOrder(onSuccess?: () => void): UsePlaceOrderResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const placeOrder = async (order: OrderCreate) => {
    try {
      setLoading(true);
      setError(null);
      setSuccess(false);

      // Validate order
      const validation = orderService.validateOrder(order);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      // Place order
      await orderService.placeOrder(order);
      
      setSuccess(true);
      
      // Call success callback
      if (onSuccess) {
        onSuccess();
      }
    } catch (err: unknown) {
      const errorMessage = getApiErrorMessage(err, 'Failed to place order');
      setError(errorMessage);
      console.error('Error placing order:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    placeOrder,
    loading,
    error,
    success,
  };
}
