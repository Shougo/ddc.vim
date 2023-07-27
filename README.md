# ddc.vim

> Dark deno-powered completion framework for neovim/Vim

If you don't want to configure plugins, you don't have to use the plugin. It
does not work with zero configuration. You can use other plugins.

[![Doc](https://img.shields.io/badge/doc-%3Ah%20ddc-orange.svg)](doc/ddc.txt)

Please read [help](doc/ddc.txt) for details.

Ddc is the abbreviation of "dark deno-powered completion". It provides an
extensible and asynchronous completion framework for neovim/Vim.

NOTE: I have created
[Japanese article](https://zenn.dev/shougo/articles/ddc-vim-beta) for ddc.vim.
After that I have created the next article
[Japanese article](https://zenn.dev/shougo/articles/ddc-vim-pum-vim) for both
ddc.vim and pum.vim recently. You can read them by translation service.

The development is supported by
[github sponsors](https://github.com/sponsors/Shougo/). Thank you!

<!-- vim-markdown-toc GFM -->

- [Introduction](#introduction)
- [Screenshots](#screenshots)
- [Install](#install)

<!-- vim-markdown-toc -->

## Introduction

I have chosen denops.vim framework to create new plugin. Because denops.vim is
better than neovim Python interface.

- Easy to setup
- Minimal dependency
- Stability
- neovim/Vim compatibility
- Speed
- Library
- Easy to hack

## Screenshots

Please see: https://github.com/Shougo/ddc.vim/issues/32

![nvim-lsp](https://user-images.githubusercontent.com/41495/129931010-258d3917-7379-4b40-b3cc-2313c9fbe600.png)

![command line completion](https://user-images.githubusercontent.com/41495/135711007-8c24c606-2c5d-41f5-a445-dce0127aa97a.png)

## Install

**NOTE:** Ddc.vim requires Neovim (0.8.0+ and of course, **latest** is
recommended) or Vim 9.0+. See [requirements](#requirements) if you aren't sure
whether you have this.

### Requirements

Ddc.vim requires both Deno and denops.vim.

- <https://deno.land/>
- <https://github.com/vim-denops/denops.vim>

**NOTE:** Ddc.vim does not include any UIs, sources and filters. You must
install them which you want manually. You can search ddc plugins(sources and
filters) from [here](https://github.com/topics/ddc-vim).

### For vim-plug

```vim
call plug#begin()

Plug 'Shougo/ddc.vim'
Plug 'vim-denops/denops.vim'

" Install your UIs
"Plug 'Shougo/ddc-ui-native'

" Install your sources
"Plug 'Shougo/ddc-source-around'

" Install your filters
"Plug 'Shougo/ddc-matcher_head'
"Plug 'Shougo/ddc-sorter_rank'

call plug#end()
```

### For dein.vim

```vim
call dein#begin()

call dein#add('Shougo/ddc.vim')
call dein#add('vim-denops/denops.vim')

" Install your UIs
"call dein#add('Shougo/ddc-ui-native')

" Install your sources
"call dein#add('Shougo/ddc-source-around')

" Install your filters
"call dein#add('Shougo/ddc-matcher_head')
"call dein#add('Shougo/ddc-sorter_rank')

call dein#end()
```
