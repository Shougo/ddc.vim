# ddc.vim

> Dark deno-powered completion framework for Vim/Neovim

If you don't want to configure plugins, you don't have to use the plugin. It
does not work with zero configuration. You can use other plugins.

[![Doc](https://img.shields.io/badge/doc-%3Ah%20ddc-orange.svg)](doc/ddc.txt)

Please read [help](doc/ddc.txt) for details.

Ddc is the abbreviation of "dark deno-powered completion". It provides an
extensible and asynchronous completion framework for Vim/Neovim.

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
better than Neovim Python interface.

- Easy to setup
- Minimal dependency
- Stability
- Vim/Neovim compatibility
- Speed
- Library
- Easy to hack

## Screenshots

Please see: https://github.com/Shougo/ddc.vim/issues/32

![nvim-lsp](https://user-images.githubusercontent.com/41495/129931010-258d3917-7379-4b40-b3cc-2313c9fbe600.png)

![command line
completion](https://user-images.githubusercontent.com/41495/135711007-8c24c606-2c5d-41f5-a445-dce0127aa97a.png)

## Install

**NOTE:** It requires Vim 9.1.0448+ or Neovim 0.10.0+. See
[requirements](#requirements) if you aren't sure whether you have this.

### Requirements

Please install both Deno 2.3.0+ and "denops.vim" v8.0+.

- <https://deno.land/>
- <https://github.com/vim-denops/denops.vim>

**NOTE:** Ddc.vim does not include any UIs, sources and filters. You must
install them which you want manually. You can search ddc plugins(sources and
filters) from [here](https://github.com/topics/ddc-vim).
