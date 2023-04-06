# ddc.vim

> Dark deno-powered completion framework for neovim/Vim8

If you don't want to configure plugins, you don't have to use the plugin. It
does not work with zero configuration. You can use other plugins.

[![Doc](https://img.shields.io/badge/doc-%3Ah%20ddc-orange.svg)](doc/ddc.txt)

Please read [help](doc/ddc.txt) for details.

Ddc is the abbreviation of "dark deno-powered completion". It provides an
extensible and asynchronous completion framework for neovim/Vim8.

Note: I have created
[Japanese article](https://zenn.dev/shougo/articles/ddc-vim-beta) for ddc.vim.
After that I have created the next article
[Japanese article](https://zenn.dev/shougo/articles/ddc-vim-pum-vim) for both
ddc.vim and pum.vim recently. You can read them by translation service.

The development is supported by
[github sponsors](https://github.com/sponsors/Shougo/). Thank you!

<!-- vim-markdown-toc GFM -->

- [Introduction](#introduction)
- [Install](#install)
  - [Requirements](#requirements)
- [Configuration](#configuration)
- [Screenshots](#screenshots)

<!-- vim-markdown-toc -->

## Introduction

I have chosen denops.vim framework to create new plugin. Because denops.vim is
better than neovim Python interface.

- Easy to setup
- Minimal dependency
- Stability
- neovim/Vim8 compatibility
- Speed
- Library
- Easy to hack

## Install

**Note:** Ddc.vim requires Neovim (0.8.0+ and of course, **latest** is
recommended) or Vim 8.2.0662. See [requirements](#requirements) if you aren't
sure whether you have this.

For vim-plug

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

For dein.vim

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

**Note:** Ddc.vim does not include any UIs, sources and filters. You must
install them which you want manually. You can search ddc plugins(sources and
filters) from [here](https://github.com/topics/ddc-vim).

### Requirements

Ddc.vim requires both Deno and denops.vim.

- <https://deno.land/>
- <https://github.com/vim-denops/denops.vim>

## Configuration

```vim
" Customize global settings

" You must set the default ui.
" Note: native ui
" https://github.com/Shougo/ddc-ui-native
call ddc#custom#patch_global('ui', 'native')

" Use around source.
" https://github.com/Shougo/ddc-source-around
call ddc#custom#patch_global('sources', ['around'])

" Use matcher_head and sorter_rank.
" https://github.com/Shougo/ddc-matcher_head
" https://github.com/Shougo/ddc-sorter_rank
call ddc#custom#patch_global('sourceOptions', #{
      \ _: #{
      \   matchers: ['matcher_head'],
      \   sorters: ['sorter_rank']},
      \ })

" Change source options
call ddc#custom#patch_global('sourceOptions', #{
      \   around: #{ mark: 'A' },
      \ })
call ddc#custom#patch_global('sourceParams', #{
      \   around: #{ maxSize: 500 },
      \ })

" Customize settings on a filetype
call ddc#custom#patch_filetype(['c', 'cpp'], 'sources',
      \ ['around', 'clangd'])
call ddc#custom#patch_filetype(['c', 'cpp'], 'sourceOptions', #{
      \   clangd: #{ mark: 'C' },
      \ })
call ddc#custom#patch_filetype('markdown', 'sourceParams', #{
      \   around: #{ maxSize: 100 },
      \ })

" Mappings

" <TAB>: completion.
inoremap <silent><expr> <TAB>
\ pumvisible() ? '<C-n>' :
\ (col('.') <= 1 <Bar><Bar> getline('.')[col('.') - 2] =~# '\s') ?
\ '<TAB>' : ddc#map#manual_complete()

" <S-TAB>: completion back.
inoremap <expr><S-TAB>  pumvisible() ? '<C-p>' : '<C-h>'

" Use ddc.
call ddc#enable()
```

See `:help ddc-options` for a complete list of options.

## Screenshots

Please see: https://github.com/Shougo/ddc.vim/issues/32

![nvim-lsp](https://user-images.githubusercontent.com/41495/129931010-258d3917-7379-4b40-b3cc-2313c9fbe600.png)

![command line completion](https://user-images.githubusercontent.com/41495/135711007-8c24c606-2c5d-41f5-a445-dce0127aa97a.png)

## Plans
