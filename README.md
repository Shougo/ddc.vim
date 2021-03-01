# ddc.vim

> Dark deno powered completion framework for neovim/Vim8

[![Doc](https://img.shields.io/badge/doc-%3Ah%20ddc-orange.svg)](doc/ddc.txt)

Please read [help](doc/ddc.txt) for details.

DDC is the abbreviation of "dark deno powered completion". It provides an
extensible and asynchronous completion framework for neovim/Vim8.

ddc will display completions via `complete()` by default.

<!-- vim-markdown-toc GFM -->

- [Install](#install)
  - [Requirements](#requirements)
- [Configuration](#configuration)
- [Screenshots](#screenshots)

<!-- vim-markdown-toc -->

## Install

**Note:** ddc requires Neovim (0.4.0+ and of course, **latest** is recommended)
or Vim8.2. See [requirements](#requirements) if you aren't sure whether you have
this.

For vim-plug

```viml
call plug#begin()

Plug 'Shougo/ddc.vim'

call plug#end()

call ddc#enable()
```

For dein.vim

```viml
call dein#begin()

call dein#add('Shougo/deoplete.nvim')

call dein#end()

call ddc#enable()
```

### Requirements

deoplete requires both Deno and denops.vim.

- <https://deno.land/>
- <https://github.com/vim-denops/denops.vim>

## Configuration

```vim
" Use ddc.
call ddc#enable()
```

See `:help ddc-options` for a complete list of options.

## Screenshots
