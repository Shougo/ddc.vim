"=============================================================================
" FILE: popup.vim
" AUTHOR: Shougo Matsushita <Shougo.Matsu at gmail.com>
" License: MIT license
"=============================================================================

let s:ddc_namespace = nvim_create_namespace('ddc')

function! ddc#popup#open(startcol, candidates) abort
  let width = max(map(copy(a:candidates),
        \             { _, val -> strwidth(val.word) }))
  let height = len(a:candidates)
  if &pumheight > 0
    let height = min([height, &pumheight])
  endif
  let height = max([height, 1])
  echomsg len(a:candidates)
  echomsg height

  if has('nvim')
    if !exists('s:popup_buf')
      let s:popup_buf = nvim_create_buf(v:false, v:true)
    endif
    call nvim_buf_set_lines(s:popup_buf, 0, -1, v:true,
          \ map(copy(a:candidates), { _, val -> val.word }))
    let pos = [line('.'), a:startcol - 1]
    if exists('s:popup_pos') && pos == s:popup_pos
      " Resize window
      call nvim_win_set_width(s:popup_id, width)
      call nvim_win_set_height(s:popup_id, height)
    else
      if exists('s:popup_id')
        call ddc#popup#close(s:popup_id)
      endif

      " Create new window
      let opts = {
            \ 'relative': 'editor',
            \ 'width': width,
            \ 'height': height,
            \ 'col': pos[1],
            \ 'row': pos[0],
            \ 'anchor': 'NW',
            \ 'style': 'minimal',
            \ }
      let id = nvim_open_win(s:popup_buf, v:false, opts)

      let s:popup_pos = pos
      let s:popup_id = id
      let s:popup_cursor = 0
      let s:popup_height = height
      let s:popup_width = width
    endif
  else
    let s:popup_id = popup_create(a:candidates, {
          \ 'pos': 'topleft',
          \ 'line': 'cursor+1',
          \ 'col': a:startcol,
          \ 'maxwidth': width,
          \ 'maxheight': height,
          \ })
  endif

  return s:popup_id
endfunction

function! ddc#popup#close(id) abort
  if a:id <= 0
    return
  endif

  if has('nvim')
    call nvim_win_close(a:id, v:true)
  else
    call popup_close(a:id)
  endif

  let s:popup_id = -1
endfunction

function! ddc#popup#select_next() abort
  " Clear current highlight
  if has('nvim')
    call nvim_buf_clear_namespace(s:popup_buf, s:ddc_namespace, 0, -1)
  else
  endif

  let s:popup_cursor += 1
  if s:popup_cursor > s:popup_height
    " Reset
    let s:popup_cursor = 0
    return ''
  endif

  if has('nvim')
    call nvim_buf_add_highlight(
          \ s:popup_buf,
          \ s:ddc_namespace,
          \ 'PmenuSel',
          \ s:popup_cursor - 1,
          \ 0, -1
          \ )
  else
  endif

  return ''
endfunction
