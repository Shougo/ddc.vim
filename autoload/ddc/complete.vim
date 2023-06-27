function ddc#complete#_on_complete_done(completed_item) abort
  if !ddc#_denops_running() || a:completed_item->empty()
        \ || !(a:completed_item->has_key('user_data'))
        \ || a:completed_item.user_data->type() != v:t_dict
    return
  endif

  " Search selected item from previous items
  let items = g:ddc#_items->copy()->filter({ _, val ->
        \   val.word ==# a:completed_item.word
        \   && val.abbr ==# a:completed_item.abbr
        \   && val.kind ==# a:completed_item.kind
        \   && val.menu ==# a:completed_item.menu
        \ })
  if items->empty()
    return
  endif

  call denops#request('ddc', 'onCompleteDone',
        \ [items[0].__sourceName, a:completed_item.user_data])
endfunction

function ddc#complete#_skip(pos, items) abort
  if a:pos < 0 || g:ddc#_changedtick != b:changedtick
    return v:true
  endif

  " NOTE: If the input text is longer than 'textwidth', the completed text
  " will be the next line.  It breaks auto completion behavior.
  if &l:formatoptions =~# '[tca]' && &l:textwidth > 0
    const input = getline('.')[: a:pos]
    const displaywidth = max(a:items->copy()
          \ ->map({ _, val -> strdisplaywidth(input .. val.word) })) + 1
    const col = mode() ==# 'c' ? getcmdpos() : virtcol('.')
    if displaywidth >= &l:textwidth || col >= displaywidth
      return v:true
    endif
  endif

  return v:false
endfunction
