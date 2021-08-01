"=============================================================================
" FILE: ddc.vim
" AUTHOR:  Shougo Matsushita <Shougo.Matsu at gmail.com>
" License: MIT license
"=============================================================================

if exists('g:loaded_ddc')
  finish
endif
let g:loaded_ddc = 1

call ddc#register_filter({
      \ 'name': 'matcher_head',
      \ 'path': fnamemodify(expand('<sfile>'), ':h:h')
      \         . '/denops/ddc/filters/matcher_head.ts',
      \ })
call ddc#register_filter({
      \ 'name': 'sorter_rank',
      \ 'path': fnamemodify(expand('<sfile>'), ':h:h')
      \         . '/denops/ddc/filters/sorter_rank.ts',
      \ })
