function ddc#util#print_error(string, name = 'ddc') abort
  echohl Error
  for line in
        \ (a:string->type() ==# v:t_string ? a:string : a:string->string())
        \ ->split("\n")->filter({ _, val -> val != ''})
    echomsg printf('[%s] %s', a:name, line)
  endfor
  echohl None
endfunction

function ddc#util#get_text(mode) abort
  return a:mode ==# 'c' ? getcmdline() :
        \ a:mode ==# 't' && !has('nvim') ? term_getline('', '.')
        \ : getline('.')
endfunction
function ddc#util#get_input(event) abort
  const mode = a:event ==# 'InsertEnter' ? 'i' : mode()
  const is_insert = (mode ==# 'i') || (mode ==# 't')
  const text = mode->ddc#util#get_text()
  const col = mode() ==# 't' && !has('nvim') ?
        \ term_getcursor('%'->bufnr())[1] :
        \ mode() ==# 'c' ? getcmdpos() : col('.')
  const pos = mode ==# 'c' ? col - 1 :
        \ is_insert ? col - 1 : col
  const input = pos >= text->len() ?
        \     text :
        \     text->matchstr(
        \         '^.*\%' .. (is_insert || col <= 0 ? col : col - 1)
        \         .. 'c' .. (is_insert ? '' : '.'))

  return input
endfunction
function ddc#util#get_next_input(event) abort
  const text = mode()->ddc#util#get_text()
  return text[a:event->ddc#util#get_input()->len() :]
endfunction

function ddc#util#benchmark(msg = '') abort
  let msg = a:msg
  if msg !=# ''
    let msg ..= ' '
  endif
  const diff = g:ddc#_started->reltime()->reltimefloat()
  call ddc#util#print_error(printf('%s%s: Took %f seconds.',
        \ msg, '<sfile>'->expand(), diff))
endfunction

function ddc#util#check_skip_complete() abort
  if g:ddc#_skip_next_complete > 0
    let g:ddc#_skip_next_complete -= 1
    return v:true
  endif

  return v:false
endfunction
