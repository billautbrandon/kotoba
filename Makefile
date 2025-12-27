.PHONY: npm-dev

# In this repo we use webpack-dev-server (web) + tsx watch (api).
# This target is meant to be run after dev changes to ensure the dev setup is OK.
npm-dev:
	npm run dev


