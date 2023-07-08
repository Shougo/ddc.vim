TS=$(shell find denops -name "*.ts")
TSTEST=$(shell grep -rl "Deno.test" denops)

lint:
	deno check ${TS}
	deno fmt --check denops
	deno test --unstable --no-run -A ${TS}
	deno lint --unstable denops

test:
	deno test --unstable -A ${TSTEST}

format:
	deno fmt denops README.md .github

.PHONY: lint test format
