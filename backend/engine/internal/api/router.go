package api

import (
	"context"
	"net/http"
	"omnimarket-engine/internal/matching"
	"omnimarket-engine/internal/db"
	"omnimarket-engine/internal/models"
	"omnimarket-engine/internal/ws"

	"github.com/gin-gonic/gin"
)

type Router struct {
	Engine *matching.MatchingEngine
	Hub    *ws.Hub
}

func NewRouter(engine *matching.MatchingEngine, hub *ws.Hub) *Router {
	return &Router{Engine: engine, Hub: hub}
}

func CORSMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	}
}

func (r *Router) SetupRoutes() *gin.Engine {
	app := gin.Default()
	app.Use(CORSMiddleware())

	app.POST("/api/orders", r.PlaceOrder)
	serveWebSocket := func(c *gin.Context) {
		ws.ServeWs(r.Hub, c.Writer, c.Request)
	}
	app.GET("/ws", serveWebSocket)
	app.GET("/api/ws", serveWebSocket)

	return app
}

type PlaceOrderRequest struct {
	UserID    int     `json:"user_id" binding:"required"`
	MarketID  int     `json:"market_id" binding:"required"`
	Outcome   string  `json:"outcome" binding:"required"`
	OrderType string  `json:"order_type" binding:"required"`
	Price     float64 `json:"price" binding:"required"`
	Shares    float64 `json:"shares" binding:"required"`
}

func (r *Router) PlaceOrder(c *gin.Context) {
	var req PlaceOrderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validate input
	if req.UserID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user_id"})
		return
	}
	if req.MarketID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid market_id"})
		return
	}
	var existingMarketID int
	if err := db.Pool.QueryRow(context.Background(), "SELECT id FROM markets WHERE id = $1", req.MarketID).Scan(&existingMarketID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "market not found"})
		return
	}
	if req.Outcome != "YES" && req.Outcome != "NO" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "outcome must be YES or NO"})
		return
	}
	if req.OrderType != "MARKET" && req.OrderType != "LIMIT" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "order_type must be MARKET or LIMIT"})
		return
	}
	if req.Price < 0 || req.Price > 100 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "price must be between 0 and 100"})
		return
	}
	if req.Shares <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "shares must be greater than 0"})
		return
	}

	order := models.Order{
		UserID:    req.UserID,
		MarketID:  req.MarketID,
		Outcome:   req.Outcome,
		OrderType: req.OrderType,
		Price:     req.Price,
		Shares:    req.Shares,
	}

	result, err := r.Engine.ProcessOrderDetailed(context.Background(), order)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
}
