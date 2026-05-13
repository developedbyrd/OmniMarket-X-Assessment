# OmniMarket Setup Guide

## Prerequisites

Before starting, ensure you have the following installed:

- **Docker** (version 20.10 or higher)
- **Docker Compose** (version 2.0 or higher)
- **Make** (optional but recommended)

### Verify Prerequisites

```bash
docker --version
docker-compose --version
make --version  # Optional
```

## Quick Start (5 Minutes)

### 1. Clone and Navigate

```bash
cd OMX13-master
```

### 2. Build and Start All Services

```bash
make build
```

Or without Make:

```bash
docker-compose up -d --build
```

### 3. Wait for Services to Start

The services will start in the following order:
1. PostgreSQL Database (with health checks)
2. FastAPI Backend (waits for DB)
3. Go Trading Engine (waits for DB)
4. React Frontend

Wait approximately 30-60 seconds for all services to be healthy.

### 4. Seed the Database

```bash
make seed
```

Or without Make:

```bash
docker exec omnimarket_api python seed_db.py
```

### 5. Access the Application

- **Frontend**: http://localhost:5173
- **FastAPI Docs**: http://localhost:8000/docs
- **FastAPI Admin**: http://localhost:8000/admin
- **Go Engine WebSocket**: ws://localhost:8080/ws?market_id=<id>

## Detailed Setup Steps

### Environment Configuration

The project uses the following default credentials (defined in docker-compose.yml):

```
POSTGRES_USER: postgres
POSTGRES_PASSWORD: 123456789
POSTGRES_DB: omnimarketdb
```

For production, copy `.env.example` to `.env` and update with secure credentials:

```bash
cp .env.example .env
# Edit .env with your secure credentials
```

### Database Initialization

The database schema is automatically created by FastAPI on startup via the `@app.on_event("startup")` handler in `main.py`.

The seeder (`seed_db.py`) populates:
- Default user (trader1) with $10,000 balance
- 5 categories (US Elections, Crypto, Indian Stock Market, AI & Tech, Cricket)
- 25 prediction markets
- Initial AMM liquidity state for each market
- Mock historical trades for charting

### Service Architecture

```
┌─────────────────┐
│   Frontend      │  Port 5173 (React + Vite)
│   (React)       │
└────────┬────────┘
         │
         ├──────────────────┐
         │                  │
┌────────▼────────┐  ┌──────▼──────────┐
│   FastAPI       │  │  Go Engine      │
│   (Python)      │  │  (Trading)      │
│   Port 8000     │  │  Port 8080      │
└────────┬────────┘  └──────┬──────────┘
         │                  │
         └──────────┬───────┘
                    │
         ┌──────────▼──────────┐
         │   PostgreSQL        │
         │   Port 5432         │
         └─────────────────────┘
```

## Testing

### Run All Tests

```bash
make test-all
```

### Test Individual Components

#### Go Trading Engine Tests

```bash
make test-engine
```

This runs the test suite inside a Docker container connected to the database network.

#### Go Engine with Race Detector (Concurrency Tests)

```bash
make test-engine-race
```

This runs aggressive concurrency tests with 5,000 parallel goroutines to verify database locking.

#### FastAPI Backend Tests

```bash
make test-api
```

#### Frontend Tests

```bash
make test-frontend
```

### Benchmark Tests

```bash
make benchmark-engine
```

## Common Issues and Solutions

### Issue 1: Services Won't Start

**Symptom**: Containers exit immediately or show connection errors

**Solution**:
```bash
# Check logs
make logs

# Or for specific service
docker logs omnimarket_db
docker logs omnimarket_api
docker logs omnimarket_engine
```

### Issue 2: Database Connection Refused

**Symptom**: `connection refused` or `could not connect to server`

**Solution**:
```bash
# Ensure database is healthy
docker ps

# Wait for health check to pass (look for "healthy" status)
# Restart services if needed
make down
make build
```

### Issue 3: Port Already in Use

**Symptom**: `port is already allocated`

**Solution**:
```bash
# Check what's using the port
# Windows:
netstat -ano | findstr :5432
netstat -ano | findstr :8000
netstat -ano | findstr :8080
netstat -ano | findstr :5173

# Stop the conflicting service or change ports in docker-compose.yml
```

### Issue 4: Tests Fail with "Network Not Found"

**Symptom**: `network omx13-master_default not found`

**Solution**:
```bash
# Ensure services are running
make up

# Check network name
docker network ls

# The network name is based on the directory name
# If your directory is named differently, update Makefile
```

### Issue 5: Frontend Can't Connect to Backend

**Symptom**: CORS errors or connection refused in browser console

**Solution**:
- Ensure all services are running: `docker ps`
- Check backend is accessible: `curl http://localhost:8000/markets`
- Check engine is accessible: `curl http://localhost:8080/api/orders` (should return 404, not connection error)

## Database Management

### Access PostgreSQL Shell

```bash
make psql
```

Or without Make:

```bash
docker exec -it omnimarket_db psql -U postgres -d omnimarketdb
```

### Useful SQL Commands

```sql
-- List all tables
\dt

-- Check markets
SELECT id, question FROM markets LIMIT 5;

-- Check users
SELECT id, username, balance FROM users;

-- Check AMM state
SELECT market_id, q_yes, q_no FROM amm_state;

-- Check recent trades
SELECT * FROM trades ORDER BY executed_at DESC LIMIT 10;

-- Exit
\q
```

### Reset Database (CAUTION: Deletes All Data)

```bash
make clean
make build
make seed
```

## Development Workflow

### Making Code Changes

#### Backend API (Python)

Changes are hot-reloaded automatically due to volume mounting:

```bash
# Edit files in backend/api/
# Changes reflect immediately
```

#### Trading Engine (Go)

Requires rebuild:

```bash
# Edit files in backend/engine/
make restart-engine
```

Or full rebuild:

```bash
docker-compose up -d --build engine
```

#### Frontend (React)

Changes are hot-reloaded automatically:

```bash
# Edit files in frontend/src/
# Browser auto-refreshes
```

### Adding Dependencies

#### Python Dependencies

```bash
make install-api lib=package-name
```

Or manually:

```bash
docker exec omnimarket_api pip install package-name
docker exec omnimarket_api pip freeze > requirements.txt
```

#### Go Dependencies

```bash
# Edit backend/engine/go.mod
# Then rebuild
make restart-engine
```

#### Frontend Dependencies

```bash
make install-frontend lib=package-name
```

Or manually:

```bash
docker exec omnimarket_frontend npm install package-name
```

## Monitoring and Logs

### View All Logs

```bash
make logs
```

### View Specific Service Logs

```bash
docker logs -f omnimarket_api
docker logs -f omnimarket_engine
docker logs -f omnimarket_frontend
docker logs -f omnimarket_db
```

### Structured Logging

The application uses JSON structured logging:

- **FastAPI**: Logs all HTTP requests with latency tracking
- **Go Engine**: Logs all trades with execution details (CLOB vs LMSR)

## Production Considerations

### Security Checklist

- [ ] Change default database password
- [ ] Use environment variables for all secrets
- [ ] Enable HTTPS/TLS
- [ ] Implement authentication/authorization
- [ ] Add rate limiting
- [ ] Configure CORS properly (restrict origins)
- [ ] Enable database SSL mode
- [ ] Use secrets management (AWS Secrets Manager, etc.)

### Performance Optimization

- [ ] Adjust PostgreSQL connection pool settings
- [ ] Enable database query caching
- [ ] Add Redis for session management
- [ ] Implement CDN for frontend assets
- [ ] Add load balancer for horizontal scaling

### Monitoring

- [ ] Set up application monitoring (Prometheus, Grafana)
- [ ] Configure error tracking (Sentry)
- [ ] Enable database monitoring
- [ ] Set up alerting for critical errors

## Troubleshooting Commands

```bash
# Check service status
docker ps

# Check service health
docker inspect omnimarket_db | grep -A 10 Health

# Restart specific service
make restart-api
make restart-engine
make restart-frontend

# View resource usage
docker stats

# Clean up everything and start fresh
make clean
make build
make seed
```

## Support

For issues or questions:
1. Check logs: `make logs`
2. Review this setup guide
3. Check the main README.md
4. Verify all prerequisites are installed
5. Ensure ports are not in use by other applications

## Next Steps

After successful setup:
1. Explore the frontend at http://localhost:5173
2. Review API documentation at http://localhost:8000/docs
3. Test placing orders through the UI
4. Monitor WebSocket updates in browser DevTools
5. Experiment with the admin panel at http://localhost:8000/admin
