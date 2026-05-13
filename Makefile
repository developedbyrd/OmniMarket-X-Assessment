.PHONY: help up down build logs seed test-engine test-engine-race benchmark-engine test-api test-frontend test-all psql restart-api restart-engine restart-frontend clean install-frontend install-api prepare-engine-test-db

COMPOSE ?= docker-compose
COMPOSE_PROJECT_NAME ?= omx13-master
ENGINE_TEST_NETWORK ?= $(COMPOSE_PROJECT_NAME)_default
ENGINE_TEST_DB_NAME ?= omnimarket_test
ENGINE_TEST_DATABASE_URL ?= postgresql://postgres:123456789@db:5432/$(ENGINE_TEST_DB_NAME)?sslmode=disable
ENGINE_TEST_API_DATABASE_URL ?= postgresql+asyncpg://postgres:123456789@db:5432/$(ENGINE_TEST_DB_NAME)

# Default target
help:
	@echo "OmniMarket Control Tower (Makefile)"
	@echo "==================================="
	@echo "Available commands:"
	@echo "  make up               - Start all services (detached)"
	@echo "  make down             - Stop all services"
	@echo "  make build            - Rebuild and start all services"
	@echo "  make logs             - Tail logs for all services"
	@echo "  make seed             - Run the database seeder (populates categories & markets)"
	@echo "  make psql             - Open a PostgreSQL shell in the database container"
	@echo "  make test-engine      - Run Go engine tests against isolated test DB"
	@echo "  make test-engine-race - Run Go engine tests with race detector against isolated test DB"
	@echo "  make benchmark-engine - Run Go engine benchmarks against isolated test DB"
	@echo "  make test-api         - Run FastAPI backend test suite via Docker"
	@echo "  make test-frontend    - Run React Vite test suite locally"
	@echo "  make test-all         - Run all tests (Engine, API, Frontend)"
	@echo "  make restart-api      - Restart the FastAPI backend"
	@echo "  make restart-engine   - Restart the Go trading engine"
	@echo "  make restart-frontend - Restart the React frontend"
	@echo "  make clean            - Stop all services AND remove database volumes (WIPES DATA)"
	@echo "  make install-frontend lib=<name> - Install a npm package in frontend"
	@echo "  make install-api lib=<name>      - Install a python package in api"

up:
	$(COMPOSE) up -d

down:
	$(COMPOSE) down

build:
	$(COMPOSE) up -d --build

logs:
	$(COMPOSE) logs -f

seed:
	docker exec omnimarket_api python seed_db.py

prepare-engine-test-db:
	docker exec omnimarket_db psql -U postgres -d postgres -c "DROP DATABASE IF EXISTS $(ENGINE_TEST_DB_NAME);"
	docker exec omnimarket_db psql -U postgres -d postgres -c "CREATE DATABASE $(ENGINE_TEST_DB_NAME);"
	docker exec -e DATABASE_URL=$(ENGINE_TEST_API_DATABASE_URL) omnimarket_api python init_db.py

test-engine: prepare-engine-test-db
	docker run --rm -v "$(CURDIR)/backend/engine:/app" -w /app --network $(ENGINE_TEST_NETWORK) -e DATABASE_URL=$(ENGINE_TEST_DATABASE_URL) golang:1.26-alpine go test ./... -v -count=1

test-engine-race: prepare-engine-test-db
	docker run --rm -v "$(CURDIR)/backend/engine:/app" -w /app --network $(ENGINE_TEST_NETWORK) -e DATABASE_URL=$(ENGINE_TEST_DATABASE_URL) golang:1.26 go test ./... -v -race -count=1

benchmark-engine: prepare-engine-test-db
	docker run --rm -v "$(CURDIR)/backend/engine:/app" -w /app --network $(ENGINE_TEST_NETWORK) -e DATABASE_URL=$(ENGINE_TEST_DATABASE_URL) golang:1.26-alpine go test ./... -bench=. -run=^# -count=1

test-api:
	docker exec omnimarket_api pytest

test-frontend:
	npm run test --prefix frontend

test-all: test-engine test-api test-frontend

psql:
	docker exec -it omnimarket_db psql -U postgres -d omnimarketdb

restart-api:
	$(COMPOSE) restart api

restart-engine:
	$(COMPOSE) restart engine

restart-frontend:
	$(COMPOSE) restart frontend

clean:
	$(COMPOSE) down -v

install-frontend:
	docker exec omnimarket_frontend npm install $(lib)

install-api:
	docker exec omnimarket_api pip install $(lib)
	docker exec omnimarket_api pip freeze > requirements.txt
