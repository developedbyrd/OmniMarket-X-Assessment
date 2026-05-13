// User Types
export interface User {
  id: number;
  username: string;
  balance: number;
}

export interface UserCreate {
  username: string;
}

// Category Types
export interface Category {
  id: number;
  name: string;
  description?: string;
}

// Market Types
export interface Market {
  id: number;
  question: string;
  expiry: string;
  category_id: number;
  category?: Category;
  is_resolved: boolean;
  resolved_outcome?: string;
  b_parameter: number;
  created_at: string;
}

export interface MarketCreate {
  question: string;
  expiry: string;
  category_id: number;
  b_parameter?: number;
}

// Trade Types
export interface Trade {
  id: number;
  market_id: number;
  maker_order_id?: number;
  taker_order_id: number;
  price: number;
  shares: number;
  executed_at: string;
}

// Order Types
export interface Order {
  id: number;
  user_id: number;
  market_id: number;
  outcome: 'YES' | 'NO';
  order_type: 'MARKET' | 'LIMIT';
  price: number;
  shares: number;
  filled_shares: number;
  status: 'OPEN' | 'FILLED' | 'CANCELLED';
  created_at: string;
}

export interface OrderCreate {
  user_id: number;
  market_id: number;
  outcome: 'YES' | 'NO';
  order_type: 'MARKET' | 'LIMIT';
  price: number;
  shares: number;
}

export interface OrderResult {
  order_id: number;
  status: 'OPEN' | 'FILLED' | 'CANCELLED';
  order_type: 'MARKET' | 'LIMIT';
  outcome: 'YES' | 'NO';
  requested_shares: number;
  filled_shares: number;
  remaining_shares: number;
  route: 'BOOK' | 'CLOB' | 'AMM' | 'CLOB+AMM' | 'PARTIAL_BOOK';
  message: string;
}

// Orderbook Types
export interface OrderbookLevel {
  price: number;
  shares: number;
  executed?: boolean;
}

export interface Orderbook {
  yes_orders: OrderbookLevel[];
  no_orders: OrderbookLevel[];
}

// AMM Types
export interface AmmPrice {
  price_yes: number;
  price_no: number;
}

// WebSocket Message Types
export interface WebSocketMessage {
  market_id: number;
  type: 'AMM_PRICE_UPDATE' | 'TRADE_EXECUTED' | 'ORDERBOOK_UPDATE';
  data: unknown;
}

export interface AmmPriceUpdate {
  price_yes?: number;
  price_no?: number;
}

// API Response Types
export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface ApiError {
  error: string;
  detail?: string;
  status?: number;
}

export interface ApiErrorData {
  error?: string;
  detail?: string;
  message?: string;
}
