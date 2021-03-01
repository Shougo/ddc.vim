lint:
	deno fmt --check
	deno lint --unstable

test:
	deno test

.PHONY: lint test
