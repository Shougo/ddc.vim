lint:
	deno fmt --check denops/ddc/*/*.ts
	deno lint --unstable denops/ddc/*/*.ts

test:
	deno test

.PHONY: lint test
