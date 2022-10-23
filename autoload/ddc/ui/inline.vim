function! ddc#ui#inline#visible() abort
  return get(s:, 'inline_popup_id', -1) > 0
endfunction

function! ddc#ui#inline#_show(pos, items, highlight) abort
  if exists('*nvim_buf_set_extmark')
    if exists('s:ddc_namespace')
      call nvim_buf_clear_namespace(0, s:ddc_namespace, 0, -1)
    else
      let s:ddc_namespace = nvim_create_namespace('ddc')
    endif
  endif

  if empty(a:items) || mode() !=# 'i'
    return
  endif

  let complete_str = ddc#util#get_input('')[a:pos :]
  let word = a:items[0].word

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
    let s:inline_popup_id = 1
  else
    let winopts = {
          \ 'pos': 'topleft',
          \ 'line': line('.'),
          \ 'col': col,
          \ 'highlight': a:highlight,
          \ }

    " Use popup instead
    if s:inline_popup_id > 0
      call popup_move(s:inline_popup_id, winopts)
      call popup_settext(s:inline_popup_id, [word])
    else
      let s:inline_popup_id = popup_create([word], winopts)
    endif
  endif
endfunction

function! ddc#ui#inline#_hide() abort
  if !exists('s:inline_popup_id')
    return
  endif

  if exists('*nvim_buf_set_virtual_text')
    if !exists('s:ddc_namespace')
      let s:ddc_namespace = nvim_create_namespace('ddc')
    endif

    call nvim_buf_clear_namespace(bufnr('%'), s:ddc_namespace, 0, -1)
  elseif get(s:, 'inline_popup_id', -1) > 0
    call popup_close(s:inline_popup_id)
  endif

  let s:inline_popup_id = -1
endfunction
