package matching

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"time"

	"omnimarket-engine/internal/amm"
	"omnimarket-engine/internal/db"
	"omnimarket-engine/internal/models"
	"omnimarket-engine/internal/ws"
)

type MatchingEngine struct {
	Hub *ws.Hub
}

type OrderResult struct {
	OrderID         int     `json:"order_id"`
	Status          string  `json:"status"`
	OrderType       string  `json:"order_type"`
	Outcome         string  `json:"outcome"`
	RequestedShares float64 `json:"requested_shares"`
	FilledShares    float64 `json:"filled_shares"`
	RemainingShares float64 `json:"remaining_shares"`
	Route           string  `json:"route"`
	Message         string  `json:"message"`
}

func NewMatchingEngine(hub *ws.Hub) *MatchingEngine {
	return &MatchingEngine{Hub: hub}
}

func (me *MatchingEngine) ProcessOrder(ctx context.Context, order models.Order) error {
	_, err := me.ProcessOrderDetailed(ctx, order)
	return err
}

// ProcessOrderDetailed is the core matching loop and returns a user-facing execution summary.
func (me *MatchingEngine) ProcessOrderDetailed(ctx context.Context, order models.Order) (OrderResult, error) {
	startTime := time.Now()
	result := OrderResult{
		OrderType:       order.OrderType,
		Outcome:         order.Outcome,
		RequestedShares: order.Shares,
	}
	tx, err := db.Pool.Begin(ctx)
	if err != nil {
		return result, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// Determine opposite outcome (implicitly used in logic)
	// if order.Outcome == "NO" { ... }

	remainingShares := order.Shares

	// 1. CLOB Matching
	// Find crossing limit orders (Price-Time Priority)
	// For a YES buyer at price P, they match with a NO seller at price 1-P or better.
	// Since order prices in OmniMarket are typically 0-1 (or 0-100), we assume they are 0-100 probabilities.
	// Wait, the schema has `price` Numeric. Assume 0-100.
	// So YES price P corresponds to NO price 100 - P.
	
	// Query opposite side orders
	// For YES, we want NO orders where `price <= 100 - order.Price`.
	// For NO, we want YES orders where `price <= 100 - order.Price`.
	var oppositeOrdersQuery string
	if order.Outcome == "YES" {
		oppositeOrdersQuery = `
			SELECT id, user_id, price, shares, filled_shares 
			FROM orders 
			WHERE market_id = $1 AND outcome = 'NO' AND status = 'OPEN' AND price >= (100 - $2)
			ORDER BY price DESC, created_at ASC 
			FOR UPDATE
		`
	} else {
		oppositeOrdersQuery = `
			SELECT id, user_id, price, shares, filled_shares 
			FROM orders 
			WHERE market_id = $1 AND outcome = 'YES' AND status = 'OPEN' AND price >= (100 - $2)
			ORDER BY price DESC, created_at ASC 
			FOR UPDATE
		`
	}

	rows, err := tx.Query(ctx, oppositeOrdersQuery, order.MarketID, order.Price)
	if err != nil {
		return result, fmt.Errorf("failed to fetch opposite orders: %w", err)
	}

	type makerOrder struct {
		id           int
		userID       int
		price        float64
		shares       float64
		filledShares float64
	}
	var makers []makerOrder

	for rows.Next() {
		var m makerOrder
		if err := rows.Scan(&m.id, &m.userID, &m.price, &m.shares, &m.filledShares); err != nil {
			rows.Close()
			return result, err
		}
		makers = append(makers, m)
	}
	rows.Close()

	var tradeIDs []int
	var totalClobCost float64
	var clobFilledShares float64
	var ammFilledShares float64
	for _, m := range makers {
		if remainingShares <= 0 {
			break
		}

		availableShares := m.shares - m.filledShares
		tradeShares := math.Min(remainingShares, availableShares)

		// Execute trade
		remainingShares -= tradeShares
		m.filledShares += tradeShares
		clobFilledShares += tradeShares
		
		// Calculate cost for this CLOB trade
		takerPrice := 100 - m.price
		tradeCost := (takerPrice / 100.0) * tradeShares
		totalClobCost += tradeCost

		// Update maker order
		makerStatus := "OPEN"
		if m.filledShares >= m.shares {
			makerStatus = "FILLED"
		}
		_, err := tx.Exec(ctx, "UPDATE orders SET filled_shares = $1, status = $2 WHERE id = $3", m.filledShares, makerStatus, m.id)
		if err != nil {
			return result, err
		}

		// Insert trade
		// Note: taker order ID isn't known yet, we will update it later or insert taker order first.
		// For MVP, we can insert it with a NULL taker_order_id and update it later.
		var tradeID int
		err = tx.QueryRow(ctx, 
			"INSERT INTO trades (market_id, maker_order_id, price, shares) VALUES ($1, $2, $3, $4) RETURNING id",
			order.MarketID, m.id, takerPrice, tradeShares).Scan(&tradeID)
		if err != nil {
			return result, err
		}
		tradeIDs = append(tradeIDs, tradeID)
	}

	// 2. Insert/Update the current order
	// For LIMIT orders, we need to check if user has sufficient balance to place the order
	if order.OrderType == "LIMIT" && remainingShares > 0 {
		// Calculate required balance for limit order
		// For YES at price P, cost is P * shares
		// For NO at price P, cost is P * shares
		requiredBalance := (order.Price / 100.0) * remainingShares
		
		var balance float64
		err = tx.QueryRow(ctx, "SELECT balance FROM users WHERE id = $1 FOR UPDATE", order.UserID).Scan(&balance)
		if err != nil {
			return result, fmt.Errorf("failed to fetch user balance: %w", err)
		}
		
		if balance < requiredBalance {
			return result, fmt.Errorf("insufficient balance for limit order: required %f, balance %f", requiredBalance, balance)
		}
		
		// Reserve balance for limit order
		_, err = tx.Exec(ctx, "UPDATE users SET balance = balance - $1 WHERE id = $2", requiredBalance, order.UserID)
		if err != nil {
			return result, fmt.Errorf("failed to reserve balance: %w", err)
		}
	}
	
	status := "OPEN"
	if remainingShares == 0 {
		status = "FILLED"
	}

	var insertedOrderID int
	err = tx.QueryRow(ctx, `
		INSERT INTO orders (user_id, market_id, outcome, order_type, price, shares, filled_shares, status) 
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id
	`, order.UserID, order.MarketID, order.Outcome, order.OrderType, order.Price, order.Shares, order.Shares-remainingShares, status).Scan(&insertedOrderID)
	if err != nil {
		return result, fmt.Errorf("failed to insert order: %w", err)
	}
	result.OrderID = insertedOrderID

	for _, tID := range tradeIDs {
		_, err = tx.Exec(ctx, "UPDATE trades SET taker_order_id = $1 WHERE id = $2", insertedOrderID, tID)
		if err != nil {
			return result, err
		}
	}

	if len(tradeIDs) > 0 {
		tradedShares := order.Shares - remainingShares
		
		// Deduct balance for CLOB trades (for MARKET orders)
		if order.OrderType == "MARKET" && totalClobCost > 0 {
			var balance float64
			err = tx.QueryRow(ctx, "SELECT balance FROM users WHERE id = $1 FOR UPDATE", order.UserID).Scan(&balance)
			if err != nil {
				return result, fmt.Errorf("failed to fetch user balance for CLOB: %w", err)
			}
			
			if balance < totalClobCost {
				return result, fmt.Errorf("insufficient balance for CLOB trades: cost %f, balance %f", totalClobCost, balance)
			}
			
			_, err = tx.Exec(ctx, "UPDATE users SET balance = balance - $1 WHERE id = $2", totalClobCost, order.UserID)
			if err != nil {
				return result, fmt.Errorf("failed to deduct balance for CLOB: %w", err)
			}
		}
		
		clobLog := map[string]interface{}{
			"event":              "trade",
			"user_id":            order.UserID,
			"market_id":          order.MarketID,
			"quantity":           tradedShares,
			"engine":             "CLOB",
			"matched":            true,
			"match_count":        len(tradeIDs),
			"remaining_quantity": remainingShares,
			"route":              "CLOB",
			"fallback":           false,
			"db_time":            time.Since(startTime).Milliseconds(),
			"total_time":         time.Since(startTime).Milliseconds(),
		}
		clobJSON, _ := json.Marshal(clobLog)
		log.Println(string(clobJSON))
	}

	// Wait, if it's a MARKET order or allows AMM fallback, we route the remaining to AMM.
	if remainingShares > 0 && order.OrderType == "MARKET" {
		ammTradeShares := remainingShares
		// Fetch AMM State with row-level locking
		var qYes, qNo float64
		err = tx.QueryRow(ctx, "SELECT q_yes, q_no FROM amm_state WHERE market_id = $1 FOR UPDATE", order.MarketID).Scan(&qYes, &qNo)
		if err != nil {
			return result, fmt.Errorf("failed to fetch amm state: %w", err)
		}

		// We need the market's B parameter
		var bParameter float64
		err = tx.QueryRow(ctx, "SELECT b_parameter FROM markets WHERE id = $1", order.MarketID).Scan(&bParameter)
		if err != nil {
			return result, fmt.Errorf("failed to fetch market: %w", err)
		}

		isYes := order.Outcome == "YES"
		cost := amm.CalculateCostForShares(qYes, qNo, bParameter, ammTradeShares, isYes)

		// Determine if user balance covers the cost
		var balance float64
		err = tx.QueryRow(ctx, "SELECT balance FROM users WHERE id = $1 FOR UPDATE", order.UserID).Scan(&balance)
		if err != nil {
			return result, fmt.Errorf("failed to fetch user balance: %w", err)
		}

		if balance < cost {
			return result, fmt.Errorf("insufficient balance: cost %f, balance %f", cost, balance)
		}

		// Deduct balance
		_, err = tx.Exec(ctx, "UPDATE users SET balance = balance - $1 WHERE id = $2", cost, order.UserID)
		if err != nil {
			return result, fmt.Errorf("failed to deduct balance: %w", err)
		}

		// Update AMM State
		if isYes {
			qYes += ammTradeShares
		} else {
			qNo += ammTradeShares
		}
		_, err = tx.Exec(ctx, "UPDATE amm_state SET q_yes = $1, q_no = $2 WHERE market_id = $3", qYes, qNo, order.MarketID)
		if err != nil {
			return result, fmt.Errorf("failed to update amm state: %w", err)
		}

		// Mark order as filled
		_, err = tx.Exec(ctx, "UPDATE orders SET filled_shares = shares, status = 'FILLED' WHERE id = $1", insertedOrderID)
		if err != nil {
			return result, err
		}

		// Insert AMM Trade (maker_order_id = null)
		avgPrice := (cost / ammTradeShares) * 100.0
		_, err = tx.Exec(ctx, 
			"INSERT INTO trades (market_id, taker_order_id, price, shares) VALUES ($1, $2, $3, $4)",
			order.MarketID, insertedOrderID, avgPrice, ammTradeShares)
		if err != nil {
			return result, err
		}
		ammFilledShares = ammTradeShares
		remainingShares = 0
		
		// Broadcast new AMM price
		newPriceYes := amm.CalculatePrice(qYes, qNo, bParameter, true)

		var priceBefore float64
		var priceAfter float64
		if isYes {
			priceBefore = amm.CalculatePrice(qYes-ammTradeShares, qNo, bParameter, true)
			priceAfter = newPriceYes
		} else {
			priceBefore = amm.CalculatePrice(qYes, qNo-ammTradeShares, bParameter, false)
			priceAfter = amm.CalculatePrice(qYes, qNo, bParameter, false)
		}

		lmsrLog := map[string]interface{}{
			"event":        "trade",
			"user_id":      order.UserID,
			"market_id":    order.MarketID,
			"quantity":     ammTradeShares,
			"engine":       "LMSR",
			"price_before": priceBefore,
			"price_after":  priceAfter,
			"route":        "LMSR",
			"fallback":     true,
			"db_time":      time.Since(startTime).Milliseconds(),
			"total_time":   time.Since(startTime).Milliseconds(),
		}
		lmsrJSON, _ := json.Marshal(lmsrLog)
		log.Println(string(lmsrJSON))

		me.Hub.Broadcast <- ws.Message{
			MarketID: order.MarketID,
			Type:     "AMM_PRICE_UPDATE",
			Data:     map[string]float64{"price_yes": newPriceYes, "price_no": 1 - newPriceYes},
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return result, fmt.Errorf("failed to commit tx: %w", err)
	}

	// Broadcast orderbook update or trade execution
	me.Hub.Broadcast <- ws.Message{
		MarketID: order.MarketID,
		Type:     "TRADE_EXECUTED",
		Data:     order, // Send basic order details
	}

	result.FilledShares = clobFilledShares + ammFilledShares
	result.RemainingShares = remainingShares
	result.Status = status
	if result.RemainingShares == 0 {
		result.Status = "FILLED"
	}

	switch {
	case clobFilledShares > 0 && ammFilledShares > 0:
		result.Route = "CLOB+AMM"
	case ammFilledShares > 0:
		result.Route = "AMM"
	case clobFilledShares > 0 && result.RemainingShares > 0:
		result.Route = "PARTIAL_BOOK"
	case clobFilledShares > 0:
		result.Route = "CLOB"
	default:
		result.Route = "BOOK"
	}

	switch {
	case order.OrderType == "MARKET" && result.Route == "AMM":
		result.Message = "Market order filled immediately through AMM liquidity."
	case order.OrderType == "MARKET" && result.Route == "CLOB+AMM":
		result.Message = "Market order filled immediately using order book and AMM liquidity."
	case order.OrderType == "MARKET":
		result.Message = "Market order filled immediately from the order book."
	case result.Status == "OPEN" && clobFilledShares > 0:
		result.Message = "Limit order partially filled. Remaining shares were added to the order book."
	case result.Status == "OPEN":
		result.Message = "Limit order added to the order book."
	default:
		result.Message = "Limit order filled immediately."
	}

	return result, nil
}
