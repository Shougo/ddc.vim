TS=$(shell find denops -name "*.ts")
TSTEST=$(shell grep -rl "Deno.test" denops)

lint: lint/vim lint/deno

lint/vim:
	vint --version
	vint autoload

lint/deno:
	deno fmt --check denops
	deno test --unstable --no-run -A ${TS}
	deno lint --unstable denops

test:
	deno test --unstable -A ${TSTEST}

format:
	deno fmt denops README.md

.PHONY: lint test format
