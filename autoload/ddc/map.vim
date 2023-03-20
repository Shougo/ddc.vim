function! ddc#map#complete(ui) abort
  if !ddc#_denops_running()
    return
  endif

  call denops#notify('ddc', 'show', [a:ui])
  return ''
endfunction

function! ddc#map#manual_complete(options = {}) abort
  if !ddc#_denops_running()
    call ddc#enable()
    call denops#plugin#wait('ddc')
  endif

  call denops#notify('ddc', 'manualComplete', [a:options])
  return ''
endfunction

function! ddc#map#can_complete() abort
  return !(g:->get('ddc#_items', [])->empty())
        \ && g:->get('ddc#_complete_pos', -1) >= 0
endfunction

function! ddc#map#extend(confirm_key) abort
  if !('g:ddc#_sources'->exists())
    return ''
  endif
  return a:confirm_key .. ddc#map#manual_complete(g:ddc#_sources)
endfunction

function! ddc#map#complete_common_string() abort
  if g:ddc#_items->empty() || g:ddc#_complete_pos < 0
    return ''
  endif

  " Get cursor word.
  const input = ddc#util#get_input('')
  const complete_str = input[g:ddc#_complete_pos : s:col() - 1]

  let common_str = g:ddc#_items[0].word
  for item in g:ddc#_items[1:]
    while item.word->tolower()->stridx(common_str->tolower()) != 0
      let common_str = common_str[: -2]
    endwhile
  endfor

  if common_str ==# '' || complete_str ==? common_str
    return ''
  endif

  let chars = ''
  " Note: Change backspace option to work <BS> correctly
  if mode() ==# 'i'
    let chars .= "\<Cmd>set backspace=start\<CR>"
  endif
  let chars .= "\<BS>"->repeat(complete_str->strchars())
  let chars .= common_str
  if mode() ==# 'i'
    let chars .= printf("\<Cmd>set backspace=%s\<CR>", &backspace)
  endif
  return chars
endfunction

function! ddc#map#insert_item(number, cancel_key) abort
  const word = g:ddc#_items->get(a:number, #{ word: '' }).word
  if word ==# ''
    return ''
  endif

  call ddc#hide('CompleteDone')
  call ddc#complete#_on_complete_done(g:ddc#_items[a:number])

  " Get cursor word.
  const input = ddc#util#get_input('')
  const complete_str = input[g:ddc#_complete_pos : s:col() - 1]

  let chars = ''
  " Note: Change backspace option to work <BS> correctly
  if mode() ==# 'i'
    let chars .= "\<Cmd>set backspace=start\<CR>"
  endif
  let chars .= "\<BS>"->repeat(complete_str->strchars())
  let chars .= word
  if mode() ==# 'i'
    let chars .= printf("\<Cmd>set backspace=%s\<CR>", &backspace)
  endif
  let chars .= a:cancel_key
  return chars
endfunction

function! s:col() abort
  const col = mode() ==# 't' && !has('nvim') ?
        \ term_getcursor(bufnr('%'))[1] :
        \ mode() ==# 'c' ? getcmdpos() :
        \ mode() ==# 't' ? '.'->col() : '.'->col()
  return col
endfunction
