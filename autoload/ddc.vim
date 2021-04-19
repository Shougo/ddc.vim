"=============================================================================
" FILE: ddc.vim
" AUTHOR: Shougo Matsushita <Shougo.Matsu at gmail.com>
" License: MIT license
"=============================================================================

let s:script = fnamemodify(expand('<sfile>'), ':h:h')

function! ddc#enable() abort
  call denops#plugin#register('ddc',
        \ denops#util#join_path(s:script, 'denops', 'ddc', 'mod.ts'))
endfunction

function! ddc#complete() abort
  inoremap <silent> <Plug>_ <C-r>=ddc#_complete()<CR>

  set completeopt-=longest
  set completeopt+=menuone
  set completeopt-=menu
  set completeopt+=noinsert

  call feedkeys("\<Plug>_", 'i')
endfunction

function! ddc#_complete() abort
  call complete(match(getline('.'), '\h\w\+$') + 1, g:ddc#_candidates)
  return ''
endfunction
