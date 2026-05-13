import { apiClient } from './client';
import type { Market, MarketCreate, Trade, Orderbook, AmmPrice } from './types';

export const marketService = {
  /**
   * Get all markets with optional category filter
   */
  async getMarkets(categoryId?: number): Promise<Market[]> {
    const params = categoryId ? { category_id: categoryId } : {};
    const response = await apiClient.get<Market[]>('/markets', { params });
    return response.data;
  },

  /**
   * Get a specific market by ID
   */
  async getMarket(marketId: number): Promise<Market> {
    const response = await apiClient.get<Market>(`/markets/${marketId}`);
    return response.data;
  },

  /**
   * Get all trades for a specific market
   */
  async getMarketTrades(marketId: number): Promise<Trade[]> {
    const response = await apiClient.get<Trade[]>(`/markets/${marketId}/trades`);
    return response.data;
  },

  /**
   * Get AMM prices for a specific market
   */
  async getAmmPrices(marketId: number): Promise<AmmPrice> {
    const response = await apiClient.get<AmmPrice>(`/markets/${marketId}/amm`);
    return response.data;
  },

  /**
   * Get orderbook for a specific market
   */
  async getOrderbook(marketId: number): Promise<Orderbook> {
    const response = await apiClient.get<Orderbook>(`/markets/${marketId}/orderbook`);
    return response.data;
  },

  /**
   * Create a new market (admin only)
   */
  async createMarket(market: MarketCreate): Promise<Market> {
    const response = await apiClient.post<Market>('/admin/markets', market);
    return response.data;
  },

  /**
   * Get all market data at once (optimized)
   */
  async getMarketData(marketId: number): Promise<{
    market: Market;
    trades: Trade[];
    ammPrices: AmmPrice;
    orderbook: Orderbook;
  }> {
    const [market, trades, ammPrices, orderbook] = await Promise.all([
      this.getMarket(marketId),
      this.getMarketTrades(marketId),
      this.getAmmPrices(marketId),
      this.getOrderbook(marketId),
    ]);

    return { market, trades, ammPrices, orderbook };
  },
};
