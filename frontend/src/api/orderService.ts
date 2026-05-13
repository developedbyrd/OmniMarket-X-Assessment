import { engineClient } from './client';
import type { OrderCreate, OrderResult } from './types';

export const orderService = {
  /**
   * Place a new order
   */
  async placeOrder(order: OrderCreate): Promise<OrderResult> {
    const response = await engineClient.post<OrderResult>('/api/orders', order);
    return response.data;
  },

  /**
   * Validate order before submission
   */
  validateOrder(order: OrderCreate): { valid: boolean; error?: string } {
    if (order.user_id <= 0) {
      return { valid: false, error: 'Invalid user ID' };
    }

    if (order.market_id <= 0) {
      return { valid: false, error: 'Invalid market ID' };
    }

    if (!['YES', 'NO'].includes(order.outcome)) {
      return { valid: false, error: 'Outcome must be YES or NO' };
    }

    if (!['MARKET', 'LIMIT'].includes(order.order_type)) {
      return { valid: false, error: 'Order type must be MARKET or LIMIT' };
    }

    if (order.price < 0 || order.price > 100) {
      return { valid: false, error: 'Price must be between 0 and 100' };
    }

    if (order.shares <= 0) {
      return { valid: false, error: 'Shares must be greater than 0' };
    }

    return { valid: true };
  },

  /**
   * Calculate estimated cost for an order
   */
  calculateEstimatedCost(
    shares: number,
    price: number,
    orderType: 'MARKET' | 'LIMIT'
  ): number {
    if (orderType === 'MARKET') {
      // Market order cost is only an estimate; final AMM slippage is computed by the engine.
      return (shares * price) / 100;
    }

    return (shares * price) / 100;
  },
};
