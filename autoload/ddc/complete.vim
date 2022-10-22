function! ddc#complete#_check_complete_info() abort
  let pum_visible = exists('*pum#visible') ? pum#visible() : v:false
  let info = ddc#complete_info()
  let noinsert = &completeopt =~# 'noinsert'
  return pum_visible &&
        \ ((info.mode !=# '' && info.mode !=# 'eval')
        \ || (noinsert && info.selected > 0)
        \ || (!noinsert && info.selected >= 0))
endfunction
function! ddc#complete#_skip(pos, items) abort
  if a:pos < 0 || g:ddc#_changedtick != b:changedtick
        \ || ddc#complete#_check_complete_info()
    return v:true
  endif

  " Note: If the input text is longer than 'textwidth', the completed text
  " will be the next line.  It breaks auto completion behavior.
  if &l:formatoptions =~# '[tca]' && &l:textwidth > 0
    let input = getline('.')[: a:pos]
    let displaywidth = max(map(copy(a:items),
          \ { _, val -> strdisplaywidth(input . val.word) })) + 1
    let col = mode() ==# 'c' ? getcmdpos() : virtcol('.')
    if displaywidth >= &l:textwidth || col >= displaywidth
      return v:true
    endif
  endif

  return v:false
endfunction

function! ddc#complete#_show_inline(highlight) abort
  if exists('*nvim_buf_set_extmark')
    if exists('s:ddc_namespace')
      call nvim_buf_clear_namespace(0, s:ddc_namespace, 0, -1)
    else
      let s:ddc_namespace = nvim_create_namespace('ddc')
    endif
  endif

  if empty(g:ddc#_items) || mode() !=# 'i'
    return
  endif

  let complete_str = ddc#util#get_input('')[g:ddc#_complete_pos :]
  let word = g:ddc#_items[0].word

  if stridx(word, complete_str) == 0 && col('.') == col('$')
    " Head matched: Follow cursor text
    let word = word[len(complete_str):]

    if word ==# ''
      return
    endif

    if exists('*nvim_buf_set_extmark')
      let col = col('.') - 1
      let options = {
            \ 'virt_text': [[word, a:highlight]],
            \ 'virt_text_pos': 'overlay',
            \ 'hl_mode': 'combine',
            \ 'priority': 0,
            \ 'right_gravity': v:false,
            \ }
    else
      let col = col('.')
    endif
  else
    if exists('*nvim_buf_set_extmark')
      let col = 0
      let options = {
          \ 'virt_text': [[word, a:highlight]],
          \ 'hl_mode': 'combine',
          \ 'priority': 0,
          \ }
    else
      let col = col('$') + 1
    endif
  endif

  if exists('*nvim_buf_set_extmark')
    " Others: After cursor text
    call nvim_buf_set_extmark(
          \ 0, s:ddc_namespace, line('.') - 1, col, options)
    let g:ddc#_inline_popup_id = 1
  else
    let winopts = {
          \ 'pos': 'topleft',
          \ 'line': line('.'),
          \ 'col': col,
          \ 'highlight': a:highlight,
          \ }

    " Use popup instead
    if g:ddc#_inline_popup_id > 0
      call popup_move(g:ddc#_inline_popup_id, winopts)
      call popup_settext(g:ddc#_inline_popup_id, [word])
    else
      let g:ddc#_inline_popup_id = popup_create([word], winopts)
    endif
  endif
endfunction

function! ddc#complete#_on_complete_done() abort
  if !ddc#_denops_running() || empty(v:completed_item)
        \ || !has_key(v:completed_item, 'user_data')
        \ || type(v:completed_item.user_data) != v:t_dict
    return
  endif

  " Search selected item from previous items
  let items = filter(copy(g:ddc#_items), { _, val
        \ -> val.word ==# v:completed_item.word
        \ && val.abbr ==# v:completed_item.abbr
        \ && val.info ==# v:completed_item.info
        \ && val.kind ==# v:completed_item.kind
        \ && val.menu ==# v:completed_item.menu
        \ && has_key(val, 'user_data')
        \ && val.user_data ==# v:completed_item.user_data
        \ })
  if empty(items)
    return
  endif

  call denops#request('ddc', 'onCompleteDone',
        \ [items[0].__sourceName, v:completed_item.user_data])
endfunction

function! ddc#complete#_hide_inline() abort
  if exists('*nvim_buf_set_virtual_text')
    if !exists('s:ddc_namespace')
      let s:ddc_namespace = nvim_create_namespace('ddc')
    endif

    call nvim_buf_clear_namespace(bufnr('%'), s:ddc_namespace, 0, -1)
  elseif get(g:, 'ddc#_inline_popup_id', -1) > 0
    call popup_close(g:ddc#_inline_popup_id)
  endif

  let g:ddc#_inline_popup_id = -1
endfunction
