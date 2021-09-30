PATH := ./vim-themis/bin:$(PATH)
export THEMIS_VIM  := nvim
export THEMIS_ARGS := -e -s --headless
export THEMIS_HOME := ./vim-themis

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

test: vim-themis
	deno test --unstable -A ${TSTEST}
	themis --version
	themis test/

format:
	deno fmt denops README.md .github

vim-themis:
	git clone https://github.com/thinca/vim-themis vim-themis

.PHONY: lint lint/vim lint/deno test format
