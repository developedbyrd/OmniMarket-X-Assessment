import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, TrendingUp, TrendingDown, DollarSign, Activity, Clock } from 'lucide-react';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { useMarketData } from '../hooks/useMarketData';
import { useUserProfile } from '../hooks/useUserProfile';
import { usePlaceOrder } from '../hooks/usePlaceOrder';
import { useWebSocket } from '../hooks/useWebSocket';
import { orderService } from '../api';
import type { Trade } from '../api';

export function MarketView() {
  const { id } = useParams();
  const marketId = Number(id);

  // Fetch initial data
  const { market, trades, ammPrices, orderbook, loading, error, refetch } = useMarketData(marketId);
  const { user, refetch: refetchUser } = useUserProfile();

  // Local state for real-time updates
  const [liveAmmPriceYes, setLiveAmmPriceYes] = useState(0.5);
  const [liveAmmPriceNo, setLiveAmmPriceNo] = useState(0.5);
  const [liveTrades, setLiveTrades] = useState<Trade[]>([]);

  // Form state
  const [outcome, setOutcome] = useState<'YES' | 'NO'>('YES');
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('LIMIT');
  const [price, setPrice] = useState('0.50');
  const [shares, setShares] = useState('10');

  // Order placement
  const { placeOrder, loading: orderLoading, error: orderError } = usePlaceOrder(async () => {
    // On success, refetch data
    await Promise.all([refetch(), refetchUser()]);
    // Reset form
    setShares('10');
    if (orderType === 'LIMIT') {
      setPrice('0.50');
    }
  });

  // WebSocket connection
  const { isConnected } = useWebSocket(
    `${import.meta.env.VITE_WS_URL || 'ws://localhost:8080'}/ws?market_id=${marketId}`,
    {
      onMessage: (msg) => {
        if (msg.type === 'AMM_PRICE_UPDATE') {
          setLiveAmmPriceYes(msg.data.price_yes);
          setLiveAmmPriceNo(msg.data.price_no);

          // Add pseudo-trade for chart
          const newTrade: Trade = {
            id: Date.now(),
            market_id: marketId,
            price: msg.data.price_yes * 100,
            shares: 0,
            executed_at: new Date().toISOString(),
            taker_order_id: 0,
          };
          setLiveTrades(prev => [...prev, newTrade]);
        }
        if (msg.type === 'TRADE_EXECUTED') {
          refetch();
          refetchUser();
        }
      },
    }
  );

  // Update live prices when initial data loads
  useEffect(() => {
    if (ammPrices) {
      setLiveAmmPriceYes(ammPrices.price_yes);
      setLiveAmmPriceNo(ammPrices.price_no);
    }
  }, [ammPrices]);

  // Update live trades when initial data loads
  useEffect(() => {
    if (trades) {
      setLiveTrades(trades);
    }
  }, [trades]);

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();

    const orderData = {
      user_id: user?.id || 1,
      market_id: marketId,
      outcome,
      order_type: orderType,
      price: orderType === 'MARKET' 
        ? (outcome === 'YES' ? liveAmmPriceYes * 100 : liveAmmPriceNo * 100) 
        : Number(price) * 100,
      shares: Number(shares),
    };

    await placeOrder(orderData);
  };

  const estimatedCost = orderService.calculateEstimatedCost(
    Number(shares),
    orderType === 'MARKET' 
      ? (outcome === 'YES' ? liveAmmPriceYes * 100 : liveAmmPriceNo * 100)
      : Number(price) * 100,
    orderType
  );

  if (loading) {
    return (
      <div className=\"flex justify-center items-center h-64\">
        <div className=\"animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500\"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className=\"flex flex-col justify-center items-center h-64 space-y-4\">
        <div className=\"text-red-400 text-lg\">Error: {error}</div>
        <Link to=\"/\" className=\"text-blue-400 hover:text-blue-300 underline\">
          Back to Markets
        </Link>
      </div>
    );
  }

  if (!market) {
    return (
      <div className=\"flex flex-col justify-center items-center h-64 space-y-4\">
        <div className=\"text-slate-400 text-lg\">Market not found</div>
        <Link to=\"/\" className=\"text-blue-400 hover:text-blue-300 underline\">
          Back to Markets
        </Link>
      </div>
    );
  }

  const chartData = liveTrades.map(t => ({
    time: new Date(t.executed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    yes: Number(t.price) / 100,
    no: 1 - (Number(t.price) / 100)
  }));

  return (
    <div className=\"max-w-3xl mx-auto space-y-8\">
      <div>
        <Link to=\"/\" className=\"inline-flex items-center gap-2 text-sm text-slate-400 hover:text-blue-400 transition-colors mb-6\">
          <ArrowLeft className=\"w-4 h-4\" />
          Back to Markets
        </Link>
        <div className=\"space-y-4\">
          <div className=\"flex items-center justify-between\">
            <div className=\"flex items-center gap-3\">
              <span className=\"px-3 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20\">
                {market.category ? market.category.name : \"Uncategorized\"}
              </span>
              {market.is_resolved && (
                <span className=\"px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20\">
                  Resolved
                </span>
              )}
              {isConnected && (
                <span className=\"px-3 py-1 rounded-full text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20 flex items-center gap-1\">
                  <div className=\"w-2 h-2 rounded-full bg-green-500 animate-pulse\"></div>
                  Live
                </span>
              )}
            </div>
            {user && (
              <div className=\"flex items-center gap-2 px-4 py-2 bg-slate-800/60 rounded-xl border border-slate-700\">
                <DollarSign className=\"w-4 h-4 text-emerald-400\" />
                <span className=\"text-slate-400 text-xs font-medium uppercase tracking-wider\">Wallet:</span>
                <span className=\"text-white font-bold\">${Number(user.balance).toLocaleString()}</span>
              </div>
            )}
          </div>
          <h1 className=\"text-3xl font-bold text-white\">{market.question}</h1>
        </div>
      </div>

      {/* Price Chart */}
      <div className=\"bg-slate-800/40 border border-slate-700/50 rounded-2xl p-6\">
        <h3 className=\"text-lg font-medium text-slate-300 mb-6 flex items-center gap-2\">
          <Clock className=\"w-5 h-5 text-indigo-400\" />
          Price History
        </h3>
        <div className=\"h-[300px] w-full\">
          {chartData.length > 0 ? (
            <ResponsiveContainer width=\"100%\" height=\"100%\">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id=\"colorYes\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\">
                    <stop offset=\"5%\" stopColor=\"#10b981\" stopOpacity={0.2} />
                    <stop offset=\"95%\" stopColor=\"#10b981\" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id=\"colorNo\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\">
                    <stop offset=\"5%\" stopColor=\"#f43f5e\" stopOpacity={0.2} />
                    <stop offset=\"95%\" stopColor=\"#f43f5e\" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray=\"3 3\" stroke=\"#334155\" vertical={false} />
                <XAxis
                  dataKey=\"time\"
                  stroke=\"#64748b\"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={40}
                />
                <YAxis
                  stroke=\"#64748b\"
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
                  type=\"monotone\"
                  dataKey=\"yes\"
                  name=\"YES\"
                  stroke=\"#10b981\"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill=\"url(#colorYes)\"
                  animationDuration={500}
                />
                <Area
                  type=\"monotone\"
                  dataKey=\"no\"
                  name=\"NO\"
                  stroke=\"#f43f5e\"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill=\"url(#colorNo)\"
                  animationDuration={500}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className=\"flex items-center justify-center h-full text-slate-500\">
              No trade history available
            </div>
          )}
        </div>
      </div>

      <div className=\"grid grid-cols-1 md:grid-cols-2 gap-6\">
        {/* Probability Card */}
        <div className=\"bg-slate-800/40 border border-slate-700/50 rounded-2xl p-6 relative overflow-hidden\">
          <div className=\"absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-indigo-500\"></div>
          <h3 className=\"text-lg font-medium text-slate-300 mb-6 flex items-center gap-2\">
            <Activity className=\"w-5 h-5 text-blue-400\" />
            Live AMM Probability
          </h3>

          <div className=\"space-y-6\">
            <div>
              <div className=\"flex justify-between mb-2\">
                <span className=\"text-emerald-400 font-medium flex items-center gap-1\">
                  <TrendingUp className=\"w-4 h-4\" /> YES
                </span>
                <span className=\"text-emerald-400 font-bold\">{(liveAmmPriceYes * 100).toFixed(1)}%</span>
              </div>
              <div className=\"h-3 w-full bg-slate-700 rounded-full overflow-hidden\">
                <div
                  className=\"h-full bg-emerald-500 transition-all duration-500\"
                  style={{ width: `${liveAmmPriceYes * 100}%` }}
                ></div>
              </div>
            </div>

            <div>
              <div className=\"flex justify-between mb-2\">
                <span className=\"text-rose-400 font-medium flex items-center gap-1\">
                  <TrendingDown className=\"w-4 h-4\" /> NO
                </span>
                <span className=\"text-rose-400 font-bold\">{(liveAmmPriceNo * 100).toFixed(1)}%</span>
              </div>
              <div className=\"h-3 w-full bg-slate-700 rounded-full overflow-hidden\">
                <div
                  className=\"h-full bg-rose-500 transition-all duration-500\"
                  style={{ width: `${liveAmmPriceNo * 100}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>

        {/* Trade Form */}
        <div className=\"bg-slate-800/80 border border-slate-700 rounded-2xl p-6\">
          <h3 className=\"text-lg font-medium text-slate-100 mb-6 flex items-center gap-2\">
            <DollarSign className=\"w-5 h-5 text-emerald-400\" />
            Place Order
          </h3>

          <form onSubmit={handleSubmitOrder} className=\"space-y-5\">
            <div className=\"flex p-1 bg-slate-900 rounded-lg\">
              <button
                type=\"button\"
                onClick={() => setOutcome('YES')}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${outcome === 'YES'
                    ? 'bg-emerald-500/20 text-emerald-400 shadow-sm border border-emerald-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                  }`}
              >
                Buy YES
              </button>
              <button
                type=\"button\"
                onClick={() => setOutcome('NO')}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${outcome === 'NO'
                    ? 'bg-rose-500/20 text-rose-400 shadow-sm border border-rose-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                  }`}
              >
                Buy NO
              </button>
            </div>

            <div className=\"flex p-1 bg-slate-900/50 border border-slate-700/50 rounded-lg\">
              <button
                type=\"button\"
                onClick={() => setOrderType('MARKET')}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${orderType === 'MARKET'
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    : 'text-slate-500 hover:text-slate-300'
                  }`}
              >
                Market
              </button>
              <button
                type=\"button\"
                onClick={() => setOrderType('LIMIT')}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${orderType === 'LIMIT'
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    : 'text-slate-500 hover:text-slate-300'
                  }`}
              >
                Limit
              </button>
            </div>

            <div>
              <label className=\"block text-sm font-medium text-slate-400 mb-1.5\">
                {orderType === 'MARKET' ? 'Estimated Price' : 'Limit Price (0.01 - 0.99)'}
              </label>
              <div className=\"relative\">
                <span className=\"absolute left-3 top-1/2 -translate-y-1/2 text-slate-500\">$</span>
                <input
                  type=\"number\"
                  step=\"0.01\"
                  min=\"0.01\"
                  max=\"0.99\"
                  required
                  disabled={orderType === 'MARKET'}
                  value={orderType === 'MARKET' ? (outcome === 'YES' ? liveAmmPriceYes : liveAmmPriceNo).toFixed(2) : price}
                  onChange={(e) => setPrice(e.target.value)}
                  className={`w-full bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none ${orderType === 'MARKET' ? 'opacity-50 cursor-not-allowed' : ''}`}
                />
              </div>
            </div>

            <div>
              <label className=\"block text-sm font-medium text-slate-400 mb-1.5\">Shares</label>
              <input
                type=\"number\"
                step=\"1\"
                min=\"1\"
                required
                value={shares}
                onChange={(e) => setShares(e.target.value)}
                className=\"w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none\"
              />
            </div>

            <div className=\"p-3 bg-slate-900/50 border border-slate-700/50 rounded-lg\">
              <div className=\"flex justify-between text-sm\">
                <span className=\"text-slate-400\">Estimated Cost:</span>
                <span className=\"text-white font-semibold\">${estimatedCost.toFixed(2)}</span>
              </div>
            </div>

            <button
              type=\"submit\"
              disabled={orderLoading || market.is_resolved}
              className={`w-full py-3 rounded-lg font-medium text-white transition-all ${market.is_resolved
                  ? 'bg-slate-700 cursor-not-allowed text-slate-400'
                  : outcome === 'YES'
                    ? 'bg-emerald-500 hover:bg-emerald-600 shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed'
                    : 'bg-rose-500 hover:bg-rose-600 shadow-lg shadow-rose-500/20 disabled:opacity-50 disabled:cursor-not-allowed'
                }`}
            >
              {orderLoading ? 'Processing...' : `Submit ${outcome} Order`}
            </button>

            {orderError && (
              <div className=\"p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm\">
                {orderError}
              </div>
            )}
          </form>
        </div>
      </div>

      {/* Orderbook Section */}
      <div className=\"bg-slate-800/40 border border-slate-700/50 rounded-2xl p-6\">
        <h3 className=\"text-lg font-medium text-slate-300 mb-6 flex items-center gap-2\">
          <TrendingUp className=\"w-5 h-5 text-blue-400\" />
          Order Book
        </h3>
        <div className=\"grid grid-cols-2 gap-8\">
          <div>
            <h4 className=\"text-sm font-semibold text-emerald-400 mb-4 border-b border-emerald-500/20 pb-2\">YES Orders</h4>
            <div className=\"space-y-2\">
              <div className=\"flex justify-between text-[10px] uppercase tracking-wider text-slate-500 font-bold px-2\">
                <span>Price</span>
                <span>Quantity</span>
              </div>
              {orderbook.yes_orders.length > 0 ? orderbook.yes_orders.map((order, i) => (
                <div key={i} className=\"flex justify-between text-sm py-1.5 px-2 bg-emerald-500/5 border border-emerald-500/10 rounded-md\">
                  <span className=\"text-emerald-400 font-mono\">${order.price.toFixed(2)}</span>
                  <span className=\"text-slate-300 font-mono\">{order.shares.toFixed(0)}</span>
                </div>
              )) : <div className=\"text-xs text-slate-500 italic p-2\">No open YES orders</div>}
            </div>
          </div>
          <div>
            <h4 className=\"text-sm font-semibold text-rose-400 mb-4 border-b border-rose-500/20 pb-2\">NO Orders</h4>
            <div className=\"space-y-2\">
              <div className=\"flex justify-between text-[10px] uppercase tracking-wider text-slate-500 font-bold px-2\">
                <span>Price</span>
                <span>Quantity</span>
              </div>
              {orderbook.no_orders.length > 0 ? orderbook.no_orders.map((order, i) => (
                <div key={i} className=\"flex justify-between text-sm py-1.5 px-2 bg-rose-500/5 border border-rose-500/10 rounded-md\">
                  <span className=\"text-rose-400 font-mono\">${order.price.toFixed(2)}</span>
                  <span className=\"text-slate-300 font-mono\">{order.shares.toFixed(0)}</span>
                </div>
              )) : <div className=\"text-xs text-slate-500 italic p-2\">No open NO orders</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
