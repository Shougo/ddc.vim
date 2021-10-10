"=============================================================================
" FILE: util.vim
" AUTHOR: Shougo Matsushita <Shougo.Matsu at gmail.com>
" License: MIT license
"=============================================================================

function! ddc#util#print_error(string, ...) abort
  let name = a:0 ? a:1 : 'ddc'
  echohl Error
  echomsg printf('[%s] %s', name,
        \ type(a:string) ==# v:t_string ? a:string : string(a:string))
  echohl None
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

function! ddc#util#get_text(mode) abort
  return a:mode ==# 'c' ? getcmdline() :
        \ a:mode ==# 't' && !has('nvim') ? term_getline('', '.')
        \ : getline('.')
endfunction
function! ddc#util#get_input(event) abort
  let mode = a:event ==# 'InsertEnter' ? 'i' : mode()
  if &filetype ==# 'deol' && mode ==# 't'
    return deol#get_input()
  endif

  let is_insert = (mode ==# 'i') || (mode ==# 't')
  let text = ddc#util#get_text(mode)
  let pos = mode ==# 'c' ? getcmdpos() - 1 :
        \ is_insert ? col('.') - 1 : col('.')
  let input = pos >= len(text) ?
        \     text :
        \     matchstr(text,
        \         '^.*\%' . (is_insert ? col('.') : col('.') - 1)
        \         . 'c' . (is_insert ? '' : '.'))

  return input
endfunction
function! ddc#util#get_next_input(event) abort
  let text = ddc#util#get_text(mode())
  return text[len(ddc#util#get_input(a:event)) :]
endfunction

function! ddc#util#indent_current_line() abort
  call feedkeys("\<C-f>", 'n')
endfunction
