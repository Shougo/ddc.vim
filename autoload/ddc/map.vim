function ddc#map#complete(ui) abort
  if !ddc#_denops_running()
    return
  endif

  call denops#notify('ddc', 'show', [a:ui])
  return ''
endfunction

function ddc#map#manual_complete(options = {}) abort
  if !ddc#_denops_running()
    call ddc#enable()
    call denops#plugin#wait('ddc')
  endif

  call denops#notify('ddc', 'manualComplete', [a:options])
  return ''
endfunction

function ddc#map#can_complete() abort
  return !(g:->get('ddc#_items', [])->empty())
        \ && g:->get('ddc#_complete_pos', -1) >= 0
endfunction

function ddc#map#extend(confirm_key) abort
  if !('g:ddc#_sources'->exists())
    return ''
  endif
  return a:confirm_key .. ddc#map#manual_complete(g:ddc#_sources)
endfunction

function ddc#map#complete_common_string() abort
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
  " NOTE: Change backspace option to work <BS> correctly
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

function ddc#map#insert_item(number) abort
  const word = g:ddc#_items->get(a:number, #{ word: '' }).word
  if word ==# ''
    return ''
  endif

  call ddc#hide('CompleteDone')

  " Get cursor word.
  const input = ddc#util#get_input('')
  const complete_str = input[g:ddc#_complete_pos : s:col() - 1]
  let v:completed_item = g:ddc#_items[a:number]

  " Skip next complete after insertion
  let g:ddc#_skip_next_complete = v:true

  const mode = mode()

  " Avoid the menu redisplay
  if mode() ==# 'c'
    if '#User#PumCompleteDonePre'->exists()
      doautocmd <nomodeline> User PumCompleteDonePre
    endif
    const cmdline = getcmdline()
    const prev_input = g:ddc#_complete_pos == 0
          \ ? ''
          \ : cmdline[: g:ddc#_complete_pos - 1]
    const next_input = cmdline[s:col() - 1 :]
    call setcmdline(prev_input . word . next_input,
          \ g:ddc#_complete_pos + 1 + word->len())
    call ddc#complete#_on_complete_done(v:completed_item)
    return ''
  endif

  " Call CompleteDone later.
  if mode ==# 'i'
    autocmd ddc TextChangedI * ++once
          \ : doautocmd <nomodeline> CompleteDone
          \ | if '#User#PumCompleteDonePre'->exists()
          \ |   doautocmd <nomodeline> User PumCompleteDonePre
          \ | endif
  elseif mode ==# 'c'
    autocmd ddc CmdlineChanged * ++once
          \ : if '#User#PumCompleteDonePre'->exists()
          \ |   doautocmd <nomodeline> User PumCompleteDonePre
          \ | endif
  endif

  let chars = ''
  " NOTE: Change backspace option to work <BS> correctly
  if mode ==# 'i'
    let chars .= "\<Cmd>set backspace=start\<CR>"
  endif
  let chars .= "\<BS>"->repeat(complete_str->strchars())
  let chars .= word
  if mode ==# 'i'
    let chars .= printf("\<Cmd>set backspace=%s\<CR>", &backspace)
  endif
  " NOTE: Fire Source.onCompleteDone after insert the item.
  let chars .=
        \ "\<Cmd>call ddc#complete#_on_complete_done(v:completed_item)\<CR>"
  return chars
endfunction

function s:col() abort
  const col = mode() ==# 't' && !has('nvim') ?
        \ term_getcursor(bufnr('%'))[1] :
        \ mode() ==# 'c' ? getcmdpos() :
        \ mode() ==# 't' ? '.'->col() : '.'->col()
  return col
endfunction
