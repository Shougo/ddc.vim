"=============================================================================
" FILE: util.vim
" AUTHOR: Shougo Matsushita <Shougo.Matsu at gmail.com>
" License: MIT license
"=============================================================================

function! ddc#util#print_error(string, ...) abort
  let name = a:0 ? a:1 : 'ddc'
  echohl Error | echomsg printf('[%s] %s', name,
        \ ddc#util#string(a:string)) | echohl None
endfunction
function! ddc#util#print_warning(string) abort
  echohl WarningMsg | echomsg '[ddc] '
        \ . ddc#util#string(a:string) | echohl None
endfunction
function! ddc#util#print_debug(string) abort
  echomsg '[ddc] ' . ddc#util#string(a:string)
endfunction

function! ddc#util#convert2list(expr) abort
  return type(a:expr) ==# v:t_list ? a:expr : [a:expr]
endfunction
function! ddc#util#string(expr) abort
  return type(a:expr) ==# v:t_string ? a:expr : string(a:expr)
endfunction

function! ddc#util#split(string) abort
  return split(a:string, '\s*,\s*')
endfunction
