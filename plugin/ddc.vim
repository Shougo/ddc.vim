"=============================================================================
" FILE: ddc.vim
" AUTHOR:  Shougo Matsushita <Shougo.Matsu at gmail.com>
" License: MIT license
"=============================================================================

if exists('g:loaded_ddc')
  finish
endif
let g:loaded_ddc = 1

call ddc#register_source({
      \ 'name': 'around',
      \ 'path': fnamemodify(expand('<sfile>'), ':h:h')
      \         . '/denops/ddc/sources/around.ts',
      \ })
