.PHONY: npm-dev download-kanji up down prod-up prod-down prod-build prod-logs

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
	docker-compose up -d

down:
	docker-compose down

# Production commands
prod-build:
	docker-compose -f docker-compose.prod.yml build

prod-up:
	docker-compose -f docker-compose.prod.yml up -d

prod-down:
	docker-compose -f docker-compose.prod.yml down

prod-logs:
	docker-compose -f docker-compose.prod.yml logs -f

prod-restart:
	docker-compose -f docker-compose.prod.yml restart

# Full production setup (build and start)
prod: prod-build prod-up
	@echo "Production services started. Check logs with: make prod-logs"


