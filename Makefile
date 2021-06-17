lint:
	deno fmt --check denops
	deno lint --unstable denops

test:
	deno test

.PHONY: lint test
