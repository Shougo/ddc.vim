"=============================================================================
" FILE: popup.vim
" AUTHOR: Shougo Matsushita <Shougo.Matsu at gmail.com>
" License: MIT license
"=============================================================================

let s:ddc_namespace = nvim_create_namespace('ddc')
let s:popup = {
      \ 'buf': -1,
      \ 'id': -1,
      \ 'cursor': -1,
      \ 'pos': [],
      \ 'height': -1,
      \ 'width': -1,
      \ 'len': 0,
      \}

function! ddc#popup#open(startcol, candidates) abort
  let width = max(map(copy(a:candidates),
        \             { _, val -> strwidth(val.word) }))
  let height = len(a:candidates)
  if &pumheight > 0
    let height = min([height, &pumheight])
  endif
  let height = max([height, 1])

  if has('nvim')
    if s:popup.buf < 0
      let s:popup.buf = nvim_create_buf(v:false, v:true)
    endif
    call nvim_buf_set_lines(s:popup.buf, 0, -1, v:true,
          \ map(copy(a:candidates), { _, val -> val.word }))
    let pos = [line('.'), a:startcol - 1]
    if pos == s:popup.pos && s:popup.id > 0
      " Resize window
      call nvim_win_set_width(s:popup.id, width)
      call nvim_win_set_height(s:popup.id, height)
    else
      if s:popup.id > 0
        call ddc#popup#close(s:popup.id)
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
            \ 'noautocmd': v:true,
            \ }
      let id = nvim_open_win(s:popup.buf, v:false, opts)

      let s:popup.id = id
      let s:popup.pos = pos
    endif
  else
    let s:popup.id = popup_create(a:candidates, {
          \ 'pos': 'topleft',
          \ 'line': 'cursor+1',
          \ 'col': a:startcol,
          \ 'maxwidth': width,
          \ 'maxheight': height,
          \ })
  endif

  let s:popup.cursor = 0
  let s:popup.height = height
  let s:popup.width = width
  let s:popup.len = len(a:candidates)

  return s:popup.id
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

  let s:popup.id = -1
endfunction

function! ddc#popup#select_relative(delta) abort
  " Clear current highlight
  if has('nvim')
    call nvim_buf_clear_namespace(s:popup.buf, s:ddc_namespace, 0, -1)
  else
  endif

  let s:popup.cursor += a:delta
  if s:popup.cursor > s:popup.len || s:popup.cursor == 0
    " Reset
    let s:popup.cursor = 0
    return ''
  elseif s:popup.cursor < 0
    " Reset
    let s:popup.cursor = s:popup.len
  endif

  if has('nvim')
    call nvim_buf_add_highlight(
          \ s:popup.buf,
          \ s:ddc_namespace,
          \ 'PmenuSel',
          \ s:popup.cursor - 1,
          \ 0, -1
          \ )
  else
  endif

  return ''
endfunction
