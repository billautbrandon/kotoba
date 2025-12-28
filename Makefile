.PHONY: npm-dev download-kanji

# In this repo we use webpack-dev-server (web) + tsx watch (api).
# This target is meant to be run after dev changes to ensure the dev setup is OK.
npm-dev:
	npm run dev

# Download kanji SVG files from KanjiVG based on kanji in the database
download-kanji:
	cd apps/api && npm run download-kanji-svg


