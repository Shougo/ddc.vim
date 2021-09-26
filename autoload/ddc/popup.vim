"=============================================================================
" FILE: popup.vim
" AUTHOR: Shougo Matsushita <Shougo.Matsu at gmail.com>
" License: MIT license
"=============================================================================

function! ddc#popup#open(startcol, candidates) abort
  let width = max(map(copy(a:candidates),
        \             { _, val -> strwidth(val.word) }))
  let height = min(len(a:candidates) + [&pumheight])

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
      let id = nvim_open_win(s:popup_buf, 0, opts)

      let s:popup_pos = pos
      let s:popup_id = id
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
