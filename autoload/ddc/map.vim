function! ddc#map#manual_complete(...) abort
  if !ddc#_denops_running()
    call ddc#enable()
    call denops#plugin#wait('ddc')
  endif

  let arg = get(a:000, 0, [])
  return printf("\<Cmd>call denops#notify('ddc', 'manualComplete', %s)\<CR>",
        \ string([type(arg) == v:t_list ? arg : [arg]]))
endfunction

function! ddc#map#pum_visible() abort
  let pum_visible = exists('*pum#visible') ? pum#visible() : v:false
  return pum_visible || pumvisible()
endfunction
function! ddc#map#inline_visible() abort
  return get(g:, 'ddc#_inline_popup_id', -1) > 0
endfunction

function! ddc#map#can_complete() abort
  return !empty(get(g:, 'ddc#_items', []))
        \ && get(g:, 'ddc#_complete_pos', -1) >= 0
        \ && !ddc#complete#_cannot_complete()
endfunction

function! ddc#map#extend(confirm_key) abort
  if !exists('g:ddc#_sources')
    return ''
  endif
  return a:confirm_key . ddc#map#manual_complete(g:ddc#_sources)
endfunction

function! ddc#map#complete_common_string(cancel_key) abort
  if empty(g:ddc#_items) || g:ddc#_complete_pos < 0
    return ''
  endif

  let complete_str = ddc#util#get_input('')[g:ddc#_complete_pos :]
  let common_str = g:ddc#_items[0].word
  for item in g:ddc#_items[1:]
    while stridx(tolower(item.word), tolower(common_str)) != 0
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
  let chars .= a:cancel_key
  let chars .= repeat("\<BS>", strchars(complete_str))
  let chars .= common_str
  if mode() ==# 'i'
    let chars .= printf("\<Cmd>set backspace=%s\<CR>", &backspace)
  endif
  return chars
endfunction

function! ddc#map#insert_item(number) abort
  let word = get(g:ddc#_items, a:number, {'word': ''}).word
  if word ==# ''
    return ''
  endif

  call ddc#complete#_hide_inline()

  " Get cursor word.
  let complete_str = ddc#util#get_input('')[g:ddc#_complete_pos :]

  let chars = ''
  " Note: Change backspace option to work <BS> correctly
  if mode() ==# 'i'
    let chars .= "\<Cmd>set backspace=start\<CR>"
  endif
  let chars .= ddc#map#cancel()
  let chars .= repeat("\<BS>", strchars(complete_str))
  let chars .= word
  if mode() ==# 'i'
    let chars .= printf("\<Cmd>set backspace=%s\<CR>", &backspace)
  endif
  return chars
endfunction
