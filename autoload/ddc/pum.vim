"=============================================================================
" FILE: pum.vim
" AUTHOR: Shougo Matsushita <Shougo.Matsu at gmail.com>
" License: MIT license
"=============================================================================

let s:ddc_namespace = nvim_create_namespace('ddc')
let s:pum = {
      \ 'buf': -1,
      \ 'candidates': [],
      \ 'cursor': -1,
      \ 'height': -1,
      \ 'id': -1,
      \ 'len': 0,
      \ 'orig_input': '',
      \ 'pos': [],
      \ 'startcol': -1,
      \ 'width': -1,
      \}
let g:pum#skip_next_complete = v:false

function! ddc#pum#open(startcol, candidates) abort
  if v:version < 820 && !has('nvim-0.6')
    call s:print_error(
          \ 'ddc requires Vim 8.2+ or neovim 0.6.0+.')
    return -1
  endif

  let width = max(map(copy(a:candidates),
        \             { _, val -> strwidth(get(val, 'abbr', val.word)) }))
  let height = len(a:candidates)
  if &pumheight > 0
    let height = min([height, &pumheight])
  endif
  let height = max([height, 1])

  if has('nvim')
    if s:pum.buf < 0
      let s:pum.buf = nvim_create_buf(v:false, v:true)
    endif
    call nvim_buf_set_lines(s:pum.buf, 0, -1, v:true,
          \ map(copy(a:candidates),
          \     { _, val -> get(val, 'abbr', val.word) }))
    let pos = [line('.'), a:startcol - 1]
    if pos == s:pum.pos && s:pum.id > 0
      " Resize window
      call nvim_win_set_width(s:pum.id, width)
      call nvim_win_set_height(s:pum.id, height)
    else
      if s:pum.id > 0
        call ddc#pum#close(s:pum.id)
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
      let id = nvim_open_win(s:pum.buf, v:false, opts)

      let s:pum.id = id
      let s:pum.pos = pos
    endif
  else
    let s:pum.id = popup_create(a:candidates, {
          \ 'pos': 'topleft',
          \ 'line': 'cursor+1',
          \ 'col': a:startcol,
          \ 'maxwidth': width,
          \ 'maxheight': height,
          \ })
  endif

  let s:pum.cursor = 0
  let s:pum.height = height
  let s:pum.width = width
  let s:pum.len = len(a:candidates)
  let s:pum.candidates = copy(a:candidates)
  let s:pum.startcol = a:startcol
  let s:pum.orig_input = getline('.')[a:startcol - 1 : col('.')]
  echomsg s:pum

  return s:pum.id
endfunction

function! ddc#pum#close(id) abort
  if a:id <= 0
    return
  endif

  if has('nvim')
    call nvim_win_close(a:id, v:true)
  else
    call popup_close(a:id)
  endif

  let s:pum.id = -1
endfunction

function! ddc#pum#select_relative(delta) abort
  " Clear current highlight
  if has('nvim')
    call nvim_buf_clear_namespace(s:pum.buf, s:ddc_namespace, 0, -1)
  else
  endif

  let s:pum.cursor += a:delta
  if s:pum.cursor > s:pum.len || s:pum.cursor == 0
    " Reset
    let s:pum.cursor = 0
    return ''
  elseif s:pum.cursor < 0
    " Reset
    let s:pum.cursor = s:pum.len
  endif

  if has('nvim')
    call nvim_buf_add_highlight(
          \ s:pum.buf,
          \ s:ddc_namespace,
          \ 'PmenuSel',
          \ s:pum.cursor - 1,
          \ 0, -1
          \ )
  else
  endif

  return ''
endfunction

function! ddc#pum#insert_relative(delta) abort
  if s:pum.cursor >= 0
    let prev_word = s:pum.candidates[s:pum.cursor - 1].word
  else
    let prev_word = s:pum.orig_input
  endif

  call ddc#pum#select_relative(a:delta)
  if s:pum.cursor <= 0 || s:pum.id <= 0
    return
  endif

  let candidate = s:pum.candidates[s:pum.cursor - 1]
  let prev_input = getline('.')[: s:pum.startcol - 2]
  let next_input = getline('.')[s:pum.startcol - 1:][len(prev_word):]

  " Note: ":undojoin" is needed to prevent undo breakage
  undojoin | call setline('.', prev_input . candidate.word .next_input)
  call cursor(0, s:pum.startcol + len(candidate.word))

  " Note: The text changes fires TextChanged events.  It must be ignored.
  let g:pum#skip_next_complete = v:true
endfunction

function! s:print_error(string) abort
  let name = 'popup'
  echohl Error
  echomsg printf('[%s] %s', name,
        \ type(a:string) ==# v:t_string ? a:string : string(a:string))
  echohl None
endfunction
