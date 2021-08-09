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

function! ddc#util#string(expr) abort
  return type(a:expr) ==# v:t_string ? a:expr : string(a:expr)
endfunction

function! ddc#util#get_syn_names() abort
  if col('$') >= 200
    return []
  endif

  let names = []
  try
    " Note: synstack() seems broken in concealed text.
    for id in synstack(line('.'), (mode() ==# 'i' ? col('.')-1 : col('.')))
      let name = synIDattr(id, 'name')
      call add(names, name)
      if synIDattr(synIDtrans(id), 'name') !=# name
        call add(names, synIDattr(synIDtrans(id), 'name'))
      endif
    endfor
  catch
    " Ignore error
  endtry
  return names
endfunction
