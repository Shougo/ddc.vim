function! ddc#util#print_error(string, ...) abort
  let name = a:0 ? a:1 : 'ddc'
  echohl Error
  echomsg printf('[%s] %s', name,
        \ type(a:string) ==# v:t_string ? a:string : string(a:string))
  echohl None
endfunction

function! ddc#util#get_text(mode) abort
  return a:mode ==# 'c' ? getcmdline() :
        \ a:mode ==# 't' && !has('nvim') ? term_getline('', '.')
        \ : getline('.')
endfunction
function! ddc#util#get_input(event) abort
  let mode = a:event ==# 'InsertEnter' ? 'i' : mode()
  let is_insert = (mode ==# 'i') || (mode ==# 't')
  let text = ddc#util#get_text(mode)
  let col = mode() ==# 't' && !has('nvim') ?
        \ term_getcursor(bufnr('%'))[1] :
        \ mode() ==# 'c' ? getcmdpos() : col('.')
  let pos = mode ==# 'c' ? col - 1 :
        \ is_insert ? col - 1 : col
  let input = pos >= len(text) ?
        \     text :
        \     matchstr(text,
        \         '^.*\%' . (is_insert ? col : col - 1)
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

function! ddc#util#benchmark(...) abort
  let msg = get(a:000, 0, '')
  if msg !=# ''
    let msg .= ' '
  endif
  let diff = reltimefloat(reltime(g:ddc#_started))
  call ddc#util#print_error(printf('%s%s: Took %f seconds.',
        \ msg, expand('<sfile>'), diff))
endfunction
