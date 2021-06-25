lint:
	vint --version
	vint plugin
	vint autoload
	deno fmt --check denops
	deno lint --unstable denops

test:
	deno test --unstable --no-run denops/**/*.ts

.PHONY: lint test
