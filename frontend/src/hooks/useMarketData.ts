import { useState, useEffect, useCallback } from 'react';
import { getApiErrorMessage, marketService } from '../api';
import type { Market, Trade, AmmPrice, Orderbook } from '../api';

interface UseMarketDataResult {
  market: Market | null;
  trades: Trade[];
  ammPrices: AmmPrice | null;
  orderbook: Orderbook;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useMarketData(marketId: number): UseMarketDataResult {
  const [market, setMarket] = useState<Market | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [ammPrices, setAmmPrices] = useState<AmmPrice | null>(null);
  const [orderbook, setOrderbook] = useState<Orderbook>({ yes_orders: [], no_orders: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await marketService.getMarketData(marketId);
      
      setMarket(data.market);
      setTrades(data.trades);
      setAmmPrices(data.ammPrices);
      setOrderbook(data.orderbook);
    } catch (err: unknown) {
      const errorMessage = getApiErrorMessage(err, 'Failed to load market data');
      setError(errorMessage);
      console.error('Error fetching market data:', err);
    } finally {
      setLoading(false);
    }
  }, [marketId]);

  useEffect(() => {
    if (marketId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void fetchData();
    }
  }, [marketId, fetchData]);

  return {
    market,
    trades,
    ammPrices,
    orderbook,
    loading,
    error,
    refetch: fetchData,
  };
}
