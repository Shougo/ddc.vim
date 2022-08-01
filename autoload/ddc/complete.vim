function! ddc#complete#_complete() abort
  if ddc#complete#_cannot_complete()
    return
  endif

  if g:ddc#_complete_pos >= 0
    if ddc#_completion_menu() ==# 'native' && g:ddc#_overwrite_completeopt
          \ && g:ddc#_event !=# 'Manual'
      call s:overwrite_completeopt()
    endif

    " Check displaywidth
    " Note: If the input text is longer than 'textwidth', the completed text
    " will be the next line.  It breaks auto completion behavior.
    if &l:formatoptions =~# '[tca]' && &l:textwidth > 0
      let input = getline('.')[: g:ddc#_complete_pos]
      let displaywidth = max(map(copy(g:ddc#_items),
            \ { _, val -> strdisplaywidth(input . val.word) })) + 1
      let col = mode() ==# 'c' ? getcmdpos() : virtcol('.')
      if displaywidth >= &l:textwidth || col >= displaywidth
        return
      endif
    endif
  else
    " Clear current popup
    let g:ddc#_complete_pos = 0
    let g:ddc#_items = []
  endif

  let menu = ddc#_completion_menu()
  if menu ==# 'native'
    " Note: It may be called in map-<expr>
    silent! call complete(g:ddc#_complete_pos + 1, g:ddc#_items)
  elseif empty(g:ddc#_items)
    call ddc#complete#_clear()
  elseif menu ==# 'pum.vim'
    call pum#open(g:ddc#_complete_pos + 1, g:ddc#_items)
  endif
endfunction
function! s:overwrite_completeopt() abort
  if !exists('g:ddc#_save_completeopt')
    let g:ddc#_save_completeopt = &completeopt
  endif

  " Auto completion conflicts with 'completeopt'.
  set completeopt-=longest
  set completeopt+=menuone
  set completeopt-=menu

  if &completeopt !~# 'noinsert\|noselect'
    set completeopt-=noinsert
    set completeopt+=noselect
  endif
endfunction

function! ddc#complete#_cannot_complete() abort
  let info = ddc#complete_info()
  let noinsert = &completeopt =~# 'noinsert'
  let info_check = ddc#map#pum_visible() &&
        \ ((info.mode !=# '' && info.mode !=# 'eval')
        \ || (noinsert && info.selected > 0)
        \ || (!noinsert && info.selected >= 0))
  let menu = ddc#_completion_menu()
  return (menu ==# 'native' && mode() !=# 'i')
        \ || menu ==# 'none'
        \ || g:ddc#_changedtick != b:changedtick
        \ || info_check || !exists('g:ddc#_complete_pos')
endfunction

function! ddc#complete#_inline(highlight) abort
  if exists('*nvim_buf_set_extmark')
    if exists('s:ddc_namespace')
      call nvim_buf_clear_namespace(0, s:ddc_namespace, 0, -1)
    else
      let s:ddc_namespace = nvim_create_namespace('ddc')
    endif
  endif

  if empty(g:ddc#_items) || mode() !=# 'i'
        \ || ddc#_completion_menu() ==# 'none'
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
  let completed_item = ddc#_completion_menu() ==# 'pum.vim' ?
        \ g:pum#completed_item : v:completed_item

  if ddc#_completion_menu() !=# 'pum.vim'
    let g:ddc#_skip_complete = v:true
    " Reset skip completion
    autocmd ddc InsertLeave,InsertCharPre * ++once
          \ let g:ddc#_skip_complete = v:false
  endif

  if !ddc#_denops_running() || empty(completed_item)
        \ || !has_key(completed_item, 'user_data')
        \ || type(completed_item.user_data) != v:t_dict
    return
  endif

  " Search selected item from previous items
  let items = filter(copy(g:ddc#_items), { _, val
        \ -> val.word ==# completed_item.word
        \ && val.abbr ==# completed_item.abbr
        \ && val.info ==# completed_item.info
        \ && val.kind ==# completed_item.kind
        \ && val.menu ==# completed_item.menu
        \ && has_key(val, 'user_data')
        \ && val.user_data ==# completed_item.user_data
        \ })
  if empty(items)
    return
  endif

  call denops#request('ddc', 'onCompleteDone',
        \ [items[0].__sourceName, completed_item.user_data])
endfunction

function! ddc#complete#_clear() abort
  if ddc#_completion_menu() ==# 'native' && mode() ==# 'i'
    call complete(1, [])
  endif

  if exists('*pum#close')
    call pum#close()
  endif

  call ddc#complete#_clear_inline()
endfunction
function! ddc#complete#_clear_inline() abort
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
