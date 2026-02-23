.PHONY: npm-dev download-kanji up down prod-up prod-down prod-build prod-logs reset-db

# Development commands
# In this repo we use webpack-dev-server (web) + tsx watch (api).
# This target is meant to be run after dev changes to ensure the dev setup is OK.
npm-dev:
	npm run dev

# Download kanji SVG files from KanjiVG based on kanji in the database
download-kanji:
	cd apps/api && npm run download-kanji-svg

# Docker development commands
up:
	docker-compose up -d || docker compose up -d

down:
	docker-compose down || docker compose down

# Production commands
prod-build:
	docker-compose -f docker-compose.prod.yml build || docker compose -f docker-compose.prod.yml build

prod-up:
	docker-compose -f docker-compose.prod.yml up -d || docker compose -f docker-compose.prod.yml up -d

prod-down:
	docker-compose -f docker-compose.prod.yml down || docker compose -f docker-compose.prod.yml down

prod-logs:
	docker-compose -f docker-compose.prod.yml logs -f || docker compose -f docker-compose.prod.yml logs -f

prod-restart:
	docker-compose -f docker-compose.prod.yml restart || docker compose -f docker-compose.prod.yml restart

# Full production setup (build and start)
prod: prod-build prod-up
	@echo "Production services started. Check logs with: make prod-logs"

# Reset database (delete all data)
reset-db:
	@echo "Resetting database..."
	@echo "Stopping and removing container..."
	@docker stop kotoba 2>/dev/null || true
	@docker rm kotoba 2>/dev/null || true
	@echo "Deleting database files from local filesystem (backup)..."
	@rm -f data/kotoba.sqlite data/kotoba.sqlite-wal data/kotoba.sqlite-shm 2>/dev/null || true
	@rm -rf data/avatars/* 2>/dev/null || true
	@echo "Removing Docker volume kotoba_kotoba_data (contains the actual database)..."
	@docker volume rm kotoba_kotoba_data 2>/dev/null && echo "✓ Volume kotoba_kotoba_data removed successfully." || echo "✗ Volume kotoba_kotoba_data not found or already removed."
	@echo "Restarting container (will create new empty volume)..."
	@docker-compose up -d kotoba 2>/dev/null || docker compose up -d kotoba 2>/dev/null || echo "Please restart manually with: make up"
	@echo ""
	@echo "✓ Database reset complete!"
	@echo "  The database will be recreated automatically on next API start."
	@echo "  A new root account (username: root, password: root) will be created."


