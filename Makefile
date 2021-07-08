TS=$(shell find denops -name "*.ts")

lint:
	vint --version
	vint plugin
	vint autoload
	deno fmt --check denops
	deno test --unstable --no-run -A ${TS}
	deno lint --unstable denops

test:
	deno test --unstable -A ${TS}

format:
	deno fmt denops

.PHONY: lint test format
