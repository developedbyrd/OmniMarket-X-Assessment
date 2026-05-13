import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, TrendingUp, TrendingDown, DollarSign, Activity, Clock, AlertCircle } from 'lucide-react';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { getApiErrorMessage, marketService, userService, orderService } from '../api';
import type {
  AmmPrice,
  AmmPriceUpdate,
  Market,
  Orderbook,
  OrderCreate,
  OrderResult,
  Trade,
  User,
  WebSocketMessage,
} from '../api';

const CURRENT_USER_ID = 1; // MVP: hardcoded user
const WS_ENGINE_URL = import.meta.env.VITE_ENGINE_URL || 'ws://localhost:8080';
const WS_RECONNECT_INTERVAL = 3000; // 3 seconds
const WS_MAX_RETRIES = 5;

export function MarketView() {
  const { id } = useParams<{ id: string }>();
  const marketId = Number(id);
  
  // Data state
  const [market, setMarket] = useState<Market | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [ammPrices, setAmmPrices] = useState<AmmPrice | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [orderbook, setOrderbook] = useState<Orderbook>({ yes_orders: [], no_orders: [] });

  // Loading states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [outcome, setOutcome] = useState<'YES' | 'NO'>('YES');
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('LIMIT');
  const [price, setPrice] = useState<string>('0.50');
  const [shares, setShares] = useState<string>('10');
  const [loadingOrder, setLoadingOrder] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [lastOrderResult, setLastOrderResult] = useState<OrderResult | null>(null);

  // WebSocket state
  const ws = useRef<WebSocket | null>(null);
  const wsRetries = useRef(0);
  const wsReconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Fetch all market data
   */
  const fetchMarketData = useCallback(async () => {
    try {
      setError(null);
      const data = await marketService.getMarketData(marketId);
      
      setMarket(data.market);
      setTrades(data.trades);
      setAmmPrices(data.ammPrices);
      setOrderbook(data.orderbook);
    } catch (err: unknown) {
      const errorMsg = getApiErrorMessage(err, 'Failed to load market data');
      setError(errorMsg);
      console.error('Error fetching market data:', err);
    }
  }, [marketId]);

  /**
   * Fetch user data
   */
  const fetchUserData = useCallback(async () => {
    try {
      const userData = await userService.getUserProfile(CURRENT_USER_ID);
      setUser(userData);
    } catch (err) {
      console.error('Error fetching user data:', err);
    }
  }, []);

  /**
   * Refresh trading data after order execution
   */
  const refreshTradingData = useCallback(async () => {
    try {
      const [tradesData, orderbookData, ammPricesData, userData] = await Promise.all([
        marketService.getMarketTrades(marketId),
        marketService.getOrderbook(marketId),
        marketService.getAmmPrices(marketId),
        userService.getUserProfile(CURRENT_USER_ID),
      ]);

      setTrades(tradesData);
      setOrderbook(orderbookData);
      setAmmPrices(ammPricesData);
      setUser(userData);
    } catch (err) {
      console.error('Error refreshing trading data:', err);
    }
  }, [marketId]);

  /**
   * Connect to WebSocket
   */
  const connectWebSocket = useCallback(() => {
    try {
      const wsUrl = `${WS_ENGINE_URL}/ws?market_id=${marketId}`;
      ws.current = new WebSocket(wsUrl);

      ws.current.onopen = () => {
        console.log('[WebSocket] Connected to engine');
        wsRetries.current = 0;
      };

      ws.current.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as WebSocketMessage;
          
          if (msg.type === 'AMM_PRICE_UPDATE' && msg.data) {
            const priceUpdate = msg.data as AmmPriceUpdate;
            const priceYes = priceUpdate.price_yes ?? 0.5;
            const priceNo = priceUpdate.price_no ?? 0.5;

            setAmmPrices({
              price_yes: priceYes,
              price_no: priceNo,
            });

            // Add pseudo-trade for chart
            const newTrade: Trade = {
              id: Date.now(),
              market_id: marketId,
              price: priceYes * 100,
              shares: 0,
              executed_at: new Date().toISOString(),
              maker_order_id: undefined,
              taker_order_id: 0,
            };
            setTrades(prev => [newTrade, ...prev].slice(0, 100)); // Keep last 100 trades
          }

          if (msg.type === 'TRADE_EXECUTED') {
            console.log('[WebSocket] Trade executed, refreshing data');
            refreshTradingData();
          }
        } catch (parseErr) {
          console.error('[WebSocket] Error parsing message:', parseErr);
        }
      };

      ws.current.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
      };

      ws.current.onclose = () => {
        console.log('[WebSocket] Disconnected');
        // Attempt to reconnect
        if (wsRetries.current < WS_MAX_RETRIES) {
          wsRetries.current++;
          wsReconnectTimer.current = setTimeout(() => {
            console.log(`[WebSocket] Reconnecting (attempt ${wsRetries.current}/${WS_MAX_RETRIES})`);
            // eslint-disable-next-line react-hooks/immutability
            connectWebSocket();
          }, WS_RECONNECT_INTERVAL);
        }
      };
    } catch (err) {
      console.error('[WebSocket] Connection error:', err);
    }
  }, [marketId, refreshTradingData]);

  /**
   * Initial data load and WebSocket connection
   */
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        await Promise.all([fetchMarketData(), fetchUserData()]);
        connectWebSocket();
      } finally {
        setLoading(false);
      }
    };

    if (marketId) {
      loadData();
    }

    return () => {
      if (ws.current) {
        ws.current.close();
      }
      if (wsReconnectTimer.current) {
        clearTimeout(wsReconnectTimer.current);
      }
    };
  }, [marketId, fetchMarketData, fetchUserData, connectWebSocket]);

  /**
   * Handle order placement
   */
  const placeOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingOrder(true);
    setOrderError(null);
    setOrderSuccess(false);
    setLastOrderResult(null);

    try {
      // Validate inputs
      const sharesToPlace = Number(shares);
      const priceToUse = orderType === 'MARKET' 
        ? (outcome === 'YES' ? ammPrices?.price_yes || 0.5 : ammPrices?.price_no || 0.5)
        : Number(price);

      if (sharesToPlace <= 0) {
        throw new Error('Shares must be greater than 0');
      }

      if (priceToUse <= 0 || priceToUse > 1) {
        throw new Error('Price must be between 0 and 1');
      }

      // Check user balance
      if (user && (sharesToPlace * priceToUse) > user.balance) {
        throw new Error('Insufficient balance for this order');
      }

      const orderPayload: OrderCreate = {
        user_id: CURRENT_USER_ID,
        market_id: marketId,
        outcome: outcome,
        order_type: orderType,
        price: priceToUse * 100, // Convert to basis points
        shares: sharesToPlace,
      };

      // Validate order
      const validation = orderService.validateOrder(orderPayload);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      // Place order
      const orderResult = await orderService.placeOrder(orderPayload);
      
      setLastOrderResult(orderResult);
      setOrderSuccess(true);
      // Reset form
      setShares('10');
      setPrice('0.50');

      // Refresh data after order placement completes
      await refreshTradingData();
      
      // Keep success message visible for 2 seconds
      setTimeout(() => {
        setOrderSuccess(false);
      }, 2000);
    } catch (err: unknown) {
      const errorMsg = getApiErrorMessage(err, 'Failed to place order');
      setOrderError(errorMsg);
      console.error('Order placement error:', err);
    } finally {
      setLoadingOrder(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center h-64 space-y-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        <p className="text-slate-400 text-sm">Loading market data...</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col justify-center items-center h-64 space-y-6">
        <div className="flex items-center gap-3 text-red-400 text-lg bg-red-500/10 border border-red-500/30 rounded-lg p-4">
          <AlertCircle className="w-6 h-6 shrink-0" />
          <div className="flex flex-col gap-1">
            <span className="font-semibold">Error Loading Market</span>
            <span className="text-sm">{error}</span>
          </div>
        </div>
        <div className="flex gap-4">
          <button 
            onClick={() => window.location.reload()} 
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg text-white font-medium transition-colors cursor-pointer"
          >
            Retry
          </button>
          <Link to="/" className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white font-medium transition-colors cursor-pointer">
            Back to Markets
          </Link>
        </div>
      </div>
    );
  }

  // Market not found state
  if (!market) {
    return (
      <div className="flex flex-col justify-center items-center h-64 space-y-4">
        <div className="text-slate-400 text-lg">Market not found</div>
        <Link to="/" className="text-blue-400 hover:text-blue-300 underline">
          Back to Markets
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header Section */}
      <div>
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-blue-400 transition-colors mb-6">
          <ArrowLeft className="w-4 h-4" />
          Back to Markets
        </Link>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                {market.category?.name || "Uncategorized"}
              </span>
              {market.is_resolved && (
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Resolved
                </span>
              )}
            </div>
            {user && (
              <div className="flex items-center gap-2 px-4 py-2 bg-slate-800/60 rounded-xl border border-slate-700">
                <DollarSign className="w-4 h-4 text-emerald-400" />
                <span className="text-slate-400 text-xs font-medium uppercase tracking-wider">Wallet:</span>
                <span className="text-white font-bold">${user.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            )}
          </div>
          <h1 className="text-3xl font-bold text-white">{market.question}</h1>
          <p className="text-slate-400 text-sm">
            Expires: {new Date(market.expiry).toLocaleDateString()} - Category: {market.category?.name || "Uncategorized"}
          </p>
        </div>
      </div>

      {/* Price Chart */}
      <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-6">
        <h3 className="text-lg font-medium text-slate-300 mb-6 flex items-center gap-2">
          <Clock className="w-5 h-5 text-indigo-400" />
          Price History
        </h3>
        {trades.length > 0 ? (
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trades.map(t => ({
                time: new Date(t.executed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                yes: Number(t.price) / 100,
                no: 1 - (Number(t.price) / 100)
              }))}>
                <defs>
                  <linearGradient id="colorYes" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorNo" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis
                  dataKey="time"
                  stroke="#64748b"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={40}
                />
                <YAxis
                  stroke="#64748b"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => `${(val * 100).toFixed(0)}%`}
                  domain={[0, 1]}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' }}
                  itemStyle={{ padding: '0px' }}
                />
                <Area
                  type="monotone"
                  dataKey="yes"
                  name="YES"
                  stroke="#10b981"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorYes)"
                />
                <Area
                  type="monotone"
                  dataKey="no"
                  name="NO"
                  stroke="#f43f5e"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorNo)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-[300px] flex items-center justify-center text-slate-500">
            <p>No trades yet. Place the first order!</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* AMM Price Card */}
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-indigo-500"></div>
          <h3 className="text-lg font-medium text-slate-300 mb-6 flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-400" />
            Live AMM Probability
          </h3>

          <div className="space-y-6">
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-emerald-400 font-medium flex items-center gap-1">
                  <TrendingUp className="w-4 h-4" /> YES
                </span>
                <span className="text-emerald-400 font-bold">
                  {ammPrices ? (ammPrices.price_yes * 100).toFixed(1) : '50.0'}%
                </span>
              </div>
              <div className="h-3 w-full bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${ammPrices ? ammPrices.price_yes * 100 : 50}%` }}
                ></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-2">
                <span className="text-rose-400 font-medium flex items-center gap-1">
                  <TrendingDown className="w-4 h-4" /> NO
                </span>
                <span className="text-rose-400 font-bold">
                  {ammPrices ? (ammPrices.price_no * 100).toFixed(1) : '50.0'}%
                </span>
              </div>
              <div className="h-3 w-full bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-rose-500 transition-all duration-500"
                  style={{ width: `${ammPrices ? ammPrices.price_no * 100 : 50}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>

        {/* Trade Form */}
        <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-6">
          <h3 className="text-lg font-medium text-slate-100 mb-6 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-emerald-400" />
            Place Order
          </h3>

          <form onSubmit={placeOrder} className="space-y-5">
            {/* Outcome Selection */}
            <div className="flex p-1 bg-slate-900 rounded-lg">
              <button
                type="button"
                onClick={() => setOutcome('YES')}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all cursor-pointer ${outcome === 'YES'
                    ? 'bg-emerald-500/20 text-emerald-400 shadow-sm border border-emerald-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                  }`}
              >
                Buy YES
              </button>
              <button
                type="button"
                onClick={() => setOutcome('NO')}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all cursor-pointer ${outcome === 'NO'
                    ? 'bg-rose-500/20 text-rose-400 shadow-sm border border-rose-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                  }`}
              >
                Buy NO
              </button>
            </div>

            {/* Order Type Selection */}
            <div className="flex p-1 bg-slate-900/50 border border-slate-700/50 rounded-lg">
              <button
                type="button"
                onClick={() => setOrderType('MARKET')}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer ${orderType === 'MARKET'
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    : 'text-slate-500 hover:text-slate-300'
                  }`}
              >
                Market
              </button>
              <button
                type="button"
                onClick={() => setOrderType('LIMIT')}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${orderType === 'LIMIT'
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    : 'text-slate-500 hover:text-slate-300'
                  }`}
              >
                Limit
              </button>
            </div>

            {orderType === 'MARKET' && (
              <p className="text-xs text-slate-400">
                Market orders fill immediately and appear in the Order Book marked as executed.
              </p>
            )}

            {/* Price Input */}
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1.5">
                {orderType === 'MARKET' ? 'Estimated Price' : 'Limit Price (0-1)'}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="0.99"
                  required
                  disabled={orderType === 'MARKET'}
                  value={orderType === 'MARKET' 
                    ? (outcome === 'YES' ? ammPrices?.price_yes || 0.5 : ammPrices?.price_no || 0.5).toFixed(2)
                    : price}
                  onChange={(e) => setPrice(e.target.value)}
                  className={`w-full bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none [&::-webkit-outer-spin-button]:hidden [&::-webkit-inner-spin-button]:hidden ${orderType === 'MARKET' ? 'opacity-50 cursor-not-allowed' : ''}`}
                />
              </div>
            </div>

            {/* Shares Input */}
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1.5">Shares</label>
              <input
                type="number"
                step="1"
                min="1"
                required
                value={shares}
                onChange={(e) => setShares(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none [&::-webkit-outer-spin-button]:hidden [&::-webkit-inner-spin-button]:hidden"
              />
              {user && (
                <p className="text-xs text-slate-500 mt-1">
                  Estimated cost: ${(
                    Number(shares) *
                    (orderType === 'MARKET'
                      ? (outcome === 'YES' ? ammPrices?.price_yes || 0.5 : ammPrices?.price_no || 0.5)
                      : Number(price))
                  ).toFixed(2)}
                </p>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loadingOrder || market.is_resolved}
              className={`w-full py-3 rounded-lg font-medium text-white transition-all cursor-pointer ${market.is_resolved
                  ? 'bg-slate-700 cursor-not-allowed text-slate-400'
                  : outcome === 'YES'
                    ? 'bg-emerald-500 hover:bg-emerald-600 shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed'
                    : 'bg-rose-500 hover:bg-rose-600 shadow-lg shadow-rose-500/20 disabled:opacity-50 disabled:cursor-not-allowed'
                }`}
            >
              {loadingOrder ? 'Processing...' : `Submit ${outcome} Order`}
            </button>

            {/* Status Messages */}
            {orderSuccess && (
              <div className="mt-3 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-sm flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                {lastOrderResult?.message || 'Order placed successfully!'}
              </div>
            )}
            
            {orderError && (
              <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{orderError}</span>
              </div>
            )}


          </form>
        </div>
      </div>

      {/* Orderbook Section */}
      <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-6">
        <h3 className="text-lg font-medium text-slate-300 mb-6 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-blue-400" />
          Order Book
        </h3>
        <p className="text-xs text-slate-400 mb-4">Shows all orders: open limit orders and executed market orders.</p>
        <div className="grid grid-cols-2 gap-8">
          <div>
            <h4 className="text-sm font-semibold text-emerald-400 mb-4 border-b border-emerald-500/20 pb-2">YES Orders</h4>
            <div className="space-y-2">
              <div className="flex justify-between text-[10px] uppercase tracking-wider text-slate-500 font-bold px-2">
                <span>Price</span>
                <span>Quantity</span>
              </div>
              {orderbook.yes_orders && orderbook.yes_orders.length > 0 ? (
                orderbook.yes_orders.map((order, i) => (
                  <div key={i} className="flex justify-between text-sm py-1.5 px-2 bg-emerald-500/5 border border-emerald-500/10 rounded-md">
                    <span className="text-emerald-400 font-mono">${order.price.toFixed(2)}</span>
                    <span className="text-slate-300 font-mono">{order.shares.toFixed(0)}</span>
                  </div>
                ))
              ) : (
                <div className="text-xs text-slate-500 italic p-2">No open YES orders</div>
              )}
            </div>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-rose-400 mb-4 border-b border-rose-500/20 pb-2">NO Orders</h4>
            <div className="space-y-2">
              <div className="flex justify-between text-[10px] uppercase tracking-wider text-slate-500 font-bold px-2">
                <span>Price</span>
                <span>Quantity</span>
              </div>
              {orderbook.no_orders && orderbook.no_orders.length > 0 ? (
                orderbook.no_orders.map((order, i) => (
                  <div key={i} className="flex justify-between text-sm py-1.5 px-2 bg-rose-500/5 border border-rose-500/10 rounded-md">
                    <span className="text-rose-400 font-mono">${order.price.toFixed(2)}</span>
                    <span className="text-slate-300 font-mono">{order.shares.toFixed(0)}</span>
                  </div>
                ))
              ) : (
                <div className="text-xs text-slate-500 italic p-2">No open NO orders</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
