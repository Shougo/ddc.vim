"=============================================================================
" FILE: ddc.vim
" AUTHOR: Shougo Matsushita <Shougo.Matsu at gmail.com>
" License: MIT license
"=============================================================================

let s:root_dir = fnamemodify(expand('<sfile>'), ':h:h')

function! ddc#enable() abort
  if v:version < 802 && !has('nvim-0.5')
    call ddc#util#print_error(
          \ 'ddc requires Vim 8.2+ or neovim 0.5.0+.')
    return
  endif

  " Note: ddc.vim must be registered manually.
  augroup ddc
    autocmd!
    autocmd User DenopsReady call denops#plugin#register('ddc',
          \ denops#util#join_path(s:root_dir, 'denops', 'ddc', 'app.ts'))
  augroup END
endfunction

function! ddc#complete() abort
  inoremap <silent> <Plug>_ <C-r>=ddc#_complete()<CR>

  set completeopt-=longest
  set completeopt+=menuone
  set completeopt-=menu
  set completeopt+=noselect

  call feedkeys("\<Plug>_", 'i')
endfunction

function! ddc#_complete() abort
  call complete(g:ddc#_complete_pos + 1, g:ddc#_candidates)
  return ''
endfunction

function! ddc#register_source(dict) abort
  if !exists('g:ddc#_initialized')
    execute printf('autocmd User DDCReady call ' .
          \ 'denops#request_async("ddc", "registerSource", [%s], '.
          \ '{-> v:null}, {-> v:null})', a:dict
          \ )
  else
    call denops#request_async(
    \ 'ddc', 'registerSource', [a:dict], {-> v:null}, {-> v:null})
  endif
endfunction
function! ddc#register_filter(dict) abort
  if !exists('g:ddc#_initialized')
    execute printf('autocmd User DDCReady call ' .
          \ 'denops#request("ddc", "registerFilter", [%s])', a:dict)
  else
    call denops#request('ddc', 'registerFilter', [a:dict])
  endif
endfunction

function! ddc#get_input(event) abort
  let mode = mode()
  if a:event ==# 'InsertEnter'
    let mode = 'i'
  endif
  let input = (mode ==# 'i' ? (col('.')-1) : col('.')) >= len(getline('.')) ?
        \      getline('.') :
        \      matchstr(getline('.'),
        \         '^.*\%' . (mode ==# 'i' ? col('.') : col('.') - 1)
        \         . 'c' . (mode ==# 'i' ? '' : '.'))

  return input
endfunction
