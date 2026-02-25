SHELL := /usr/bin/env bash

NPM_REGISTRY ?= https://registry.npmjs.org/
NPM_USER ?= spark-aiur

.PHONY: help check-publish-env npm-whoami publish publish-dry-run

help:
	@echo "Targets:"
	@echo "  make npm-whoami       Verify npm auth from .env token and username"
	@echo "  make publish-dry-run  Validate package publish without publishing"
	@echo "  make publish          Publish package to npmjs.com"

check-publish-env:
	@test -f .env || (echo "Missing .env file" && exit 1)
	@grep -qE '^NPM_TOKEN=' .env || (echo ".env must define NPM_TOKEN" && exit 1)

npm-whoami: check-publish-env
	@set -a; source .env; set +a; \
	test -n "$$NPM_TOKEN" || (echo "NPM_TOKEN is empty" && exit 1); \
	tmp_npmrc="$$(mktemp)"; \
	trap 'rm -f "$$tmp_npmrc"' EXIT; \
	printf "//registry.npmjs.org/:_authToken=%s\n" "$$NPM_TOKEN" > "$$tmp_npmrc"; \
	actual_user="$$(NPM_CONFIG_USERCONFIG="$$tmp_npmrc" npm whoami --registry="$(NPM_REGISTRY)")"; \
	if [[ "$$actual_user" != "$(NPM_USER)" ]]; then \
	  echo "Authenticated as '$$actual_user' but expected '$(NPM_USER)'"; \
	  exit 1; \
	fi; \
	echo "Authenticated npm user: $$actual_user"

publish-dry-run: npm-whoami
	@set -a; source .env; set +a; \
	tmp_npmrc="$$(mktemp)"; \
	trap 'rm -f "$$tmp_npmrc"' EXIT; \
	printf "//registry.npmjs.org/:_authToken=%s\n" "$$NPM_TOKEN" > "$$tmp_npmrc"; \
	NPM_CONFIG_USERCONFIG="$$tmp_npmrc" npm publish --workspace sparkify-playground-stoplight --access public --provenance=false --dry-run && \
	NPM_CONFIG_USERCONFIG="$$tmp_npmrc" npm publish --workspace sparkify-template-astro --access public --provenance=false --dry-run && \
	NPM_CONFIG_USERCONFIG="$$tmp_npmrc" npm publish --workspace sparkify-core --access public --provenance=false --dry-run && \
	NPM_CONFIG_USERCONFIG="$$tmp_npmrc" npm publish --workspace sparkify --access public --provenance=false --dry-run

publish: npm-whoami
	@set -a; source .env; set +a; \
	tmp_npmrc="$$(mktemp)"; \
	trap 'rm -f "$$tmp_npmrc"' EXIT; \
	printf "//registry.npmjs.org/:_authToken=%s\n" "$$NPM_TOKEN" > "$$tmp_npmrc"; \
	NPM_CONFIG_USERCONFIG="$$tmp_npmrc" npm publish --workspace sparkify-playground-stoplight --access public --provenance=false && \
	NPM_CONFIG_USERCONFIG="$$tmp_npmrc" npm publish --workspace sparkify-template-astro --access public --provenance=false && \
	NPM_CONFIG_USERCONFIG="$$tmp_npmrc" npm publish --workspace sparkify-core --access public --provenance=false && \
	NPM_CONFIG_USERCONFIG="$$tmp_npmrc" npm publish --workspace sparkify --access public --provenance=false
