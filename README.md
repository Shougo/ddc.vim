# ddc.vim

Note: It is alpha version!!  You can test it.

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
" Customize global settings
" Use around source.
" https://github.com/Shougo/ddc-around
call ddc#custom#patch_global('sources', ['around'])

" Use matcher_head and sorter_rank.
" https://github.com/Shougo/ddc-matcher_head
" https://github.com/Shougo/ddc-sorter_rank
call ddc#custom#patch_global('sourceOptions', {
      \ '_': {
      \   'matchers': ['matcher_head'],
      \   'sorters': ['sorter_rank']},
      \ })

" Change source options
call ddc#custom#patch_global('sourceOptions', {
      \ 'around': {'mark': 'A'},
      \ })
call ddc#custom#patch_global('sourceParams', {
      \ 'around': {'maxSize': 500},
      \ })

" Customize settings on a filetype
call ddc#custom#patch_filetype(['c', 'cpp'], 'sources', ['around', 'clangd'])
call ddc#custom#patch_filetype(['c', 'cpp'], 'sourceOptions', {
      \ 'clangd': {'mark': 'C'},
      \ })
call ddc#custom#patch_filetype('markdown', 'sourceParams', {
      \ 'around': {'maxSize': 100},
      \ })

" Mappings

" <TAB>: completion.
inoremap <silent><expr> <TAB>
\ pumvisible() ? "\<C-n>" :
\ (col('.') <= 1 <Bar><Bar> getline('.')[col('.') - 2] =~# '\s') ?
\ "\<TAB>" : ddc#manual_complete()

" <S-TAB>: completion back.
inoremap <expr><S-TAB>  pumvisible() ? "\<C-p>" : "\<C-h>"

" Use ddc.
call ddc#enable()
```

See `:help ddc-options` for a complete list of options.


## Screenshots


## Plans

* [x] Custom ddc options support
* [x] Custom source options support
* [x] Implement source orders
* [x] Implement sorter_rank
* [x] virtual text completion mode
* [x] Split sources and filters
* [x] Implement LSP source
* [x] Manual completion support
* [ ] iskeyword support
* [ ] Implement converter_remove_overlap
