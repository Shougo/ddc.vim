TS=$(shell find denops -name "*.ts")
TSTEST=$(shell grep -rl "Deno.test" denops)

lint:
	deno check ${TS}
	deno fmt --check denops
	deno test --no-run -A ${TS}
	deno lint denops

test:
	deno test -A ${TSTEST}

format:
	deno fmt denops README.md .github

.PHONY: lint test format
