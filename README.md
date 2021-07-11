# ddc.vim

Note: It is alpha version!!  You should not use it.

> Dark deno powered completion framework for neovim/Vim8

[![Doc](https://img.shields.io/badge/doc-%3Ah%20ddc-orange.svg)](doc/ddc.txt)

Please read [help](doc/ddc.txt) for details.

DDC is the abbreviation of "dark deno powered completion". It provides an
extensible and asynchronous completion framework for neovim/Vim8.

ddc will display completions via `complete()` by default.

<!-- vim-markdown-toc GFM -->

- [Introduction](#introduction)
- [Install](#install)
  - [Requirements](#requirements)
- [Configuration](#configuration)
- [Screenshots](#screenshots)

<!-- vim-markdown-toc -->

## Introduction

I have chosen denops.vim framework to create new auto completion plugin.
Because denops.vim is better than neovim Python interface.

* Easy to setup

* Minimal dependency

* Stability

* neovim/Vim8 compatibility

* Speed

* Library

* Easy to hack


## Install

**Note:** ddc requires Neovim (0.5.0+ and of course, **latest** is recommended)
or Vim8.2. See [requirements](#requirements) if you aren't sure whether you have
this.

For vim-plug

```viml
call plug#begin()

Plug 'Shougo/ddc.vim'
Plug 'vim-denops/denops.vim'

call plug#end()
```

For dein.vim

```viml
call dein#begin()

call dein#add('Shougo/ddc.vim')
call dein#add('vim-denops/denops.vim')

call dein#end()
```

### Requirements

ddc requires both Deno and denops.vim.

- <https://deno.land/>
- <https://github.com/vim-denops/denops.vim>

## Configuration

```vim
" Use around source.
call ddc#custom#patch_global('sources', ['around'])
" Enable default matcher.
call ddc#custom#patch_global('defaultMatchers', ['matcher_head'])
" Change source options
call ddc#custom#patch_global('sourceOptions', {
      \ 'around': {'matchers': ['matcher_head'], 'mark': 'A'}
      \ })

" Use ddc.
call ddc#enable()
```

See `:help ddc-options` for a complete list of options.

## Screenshots

## Plans

* [x] Custom ddc options support
* [x] Custom source options support
* [x] Implement source orders
* [ ] Implement sorter_rank
* [ ] Use ReadableStream
* [ ] LSP support
