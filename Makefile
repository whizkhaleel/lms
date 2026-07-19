# -------------------------------------------------------------
#  LMS - Makefile
#  Usage: make <command>
# -------------------------------------------------------------

.PHONY: help up down stop restart build rebuild pull config status fresh clean \
        logs logs-backend logs-frontend logs-db logs-worker logs-nginx logs-redis logs-minio \
        migrate seed migrate-reset shell-backend shell-db shell-redis \
        test test-unit test-integration test-coverage lint lint-frontend build-frontend \
        install-backend install-frontend ps prod-up prod-down prod-build

COMPOSE := docker compose

# Default
help:
	@echo ""
	@echo "  LMS Platform - Available Commands"
	@echo "  ---------------------------------"
	@echo "  make up                 Start all containers (Dev)"
	@echo "  make down               Stop and remove containers (Dev)"
	@echo "  make stop               Stop containers without removing them"
	@echo "  make restart            Restart all containers"
	@echo "  make build              Rebuild images and start containers (Dev)"
	@echo "  make rebuild            Rebuild images without cache and start containers (Dev)"
	@echo "  make prod-up            Start all containers in Production"
	@echo "  make prod-down          Stop and remove containers in Production"
	@echo "  make prod-build         Rebuild images and start containers in Production"
	@echo "  make pull               Pull service images"
	@echo "  make config             Validate and render Compose config"
	@echo "  make status             Show container status"
	@echo "  make fresh              Wipe volumes and restart clean"
	@echo "  make clean              Stop containers and remove volumes"
	@echo ""
	@echo "  make logs               Tail all logs"
	@echo "  make logs-backend       Tail backend logs"
	@echo "  make logs-frontend      Tail frontend logs"
	@echo "  make logs-db            Tail postgres logs"
	@echo "  make logs-worker        Tail worker logs"
	@echo "  make logs-nginx         Tail nginx logs"
	@echo "  make logs-redis         Tail redis logs"
	@echo "  make logs-minio         Tail minio logs"
	@echo ""
	@echo "  make migrate            Run pending migrations"
	@echo "  make seed               Run pending migrations, then seed files"
	@echo "  make migrate-reset      Wipe DB schema, rerun migrations, then seeds"
	@echo ""
	@echo "  make shell-backend      Open shell inside backend container"
	@echo "  make shell-db           Open psql inside postgres container"
	@echo "  make shell-redis        Open redis-cli inside redis container"
	@echo ""
	@echo "  make test               Run backend test script"
	@echo "  make test-unit          Run backend unit tests"
	@echo "  make test-integration   Run backend integration tests"
	@echo "  make test-coverage      Run backend coverage report"
	@echo "  make lint               Run frontend lint"
	@echo "  make build-frontend     Build frontend app"
	@echo ""

# Docker (Development)
up:
	$(COMPOSE) up -d

down:
	$(COMPOSE) down

stop:
	$(COMPOSE) stop

restart:
	$(COMPOSE) restart

build:
	$(COMPOSE) up -d --build

# Docker (Production)
prod-up:
	$(COMPOSE) -f docker-compose.yml -f docker-compose.prod.yml up -d

prod-down:
	$(COMPOSE) -f docker-compose.yml -f docker-compose.prod.yml down

prod-build:
	$(COMPOSE) -f docker-compose.yml -f docker-compose.prod.yml up -d --build

rebuild:
	$(COMPOSE) build --no-cache
	$(COMPOSE) up -d

pull:
	$(COMPOSE) pull

config:
	$(COMPOSE) config

status ps:
	$(COMPOSE) ps

fresh:
	@echo "Wiping all volumes and restarting..."
	$(COMPOSE) down -v
	$(COMPOSE) up -d --build
	@echo "Fresh start complete."

clean:
	@echo "Stopping containers and removing volumes..."
	$(COMPOSE) down -v

# Logs
logs:
	$(COMPOSE) logs -f

logs-backend:
	$(COMPOSE) logs -f backend

logs-frontend:
	$(COMPOSE) logs -f frontend

logs-db:
	$(COMPOSE) logs -f postgres

logs-worker:
	$(COMPOSE) logs -f worker

logs-nginx:
	$(COMPOSE) logs -f nginx

logs-redis:
	$(COMPOSE) logs -f redis

logs-minio:
	$(COMPOSE) logs -f minio

# Database
migrate:
	@echo "Running migrations..."
	$(COMPOSE) exec backend node /app/database/migrate.js
	@echo "Migrations complete."

seed:
	@echo "Running migrations and seeds..."
	$(COMPOSE) exec backend node /app/database/migrate.js --seed
	@echo "Seeds complete."

seed-demo:
	@echo "Seeding demo data..."
	$(COMPOSE) exec -T postgres psql -U lms_user -d lms < database/seeds/002_demo_data.sql
	@echo "Demo data seeded."

migrate-reset:
	@echo "Resetting database..."
	$(COMPOSE) exec backend node /app/database/migrate.js --reset --seed
	@echo "Reset complete."

# Shells
shell-backend:
	$(COMPOSE) exec backend sh

shell-db:
	$(COMPOSE) exec postgres sh -lc 'psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"'

shell-redis:
	$(COMPOSE) exec redis sh -lc 'redis-cli -a "$$REDIS_PASSWORD"'

# Tests and app commands
test:
	$(COMPOSE) exec backend npm test

test-unit:
	$(COMPOSE) exec backend npm run test:unit

test-integration:
	$(COMPOSE) exec backend npm run test:integration

test-coverage:
	$(COMPOSE) exec backend npm run test:coverage

lint lint-frontend:
	$(COMPOSE) exec frontend npm run lint

build-frontend:
	$(COMPOSE) exec frontend npm run build

install-backend:
	$(COMPOSE) exec backend npm install

install-frontend:
	$(COMPOSE) exec frontend npm install
