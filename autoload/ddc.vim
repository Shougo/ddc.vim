"=============================================================================
" FILE: ddc.vim
" AUTHOR: Shougo Matsushita <Shougo.Matsu at gmail.com>
" License: MIT license
"=============================================================================

let s:root_dir = fnamemodify(expand('<sfile>'), ':h:h')

function! ddc#enable() abort
  " Dummy call
  silent! call denops#plugin#is_loaded('ddc')
  if !exists('*denops#plugin#is_loaded')
    call ddc#util#print_error('denops.vim is not released or too old.')
    return
  endif

  if denops#plugin#is_loaded('ddc')
    return
  endif

  if !has('patch-8.2.0662') && !has('nvim-0.5')
    call ddc#util#print_error(
          \ 'ddc requires Vim 8.2.0662+ or neovim 0.5.0+.')
    return
  endif

  augroup ddc
    autocmd!
    autocmd CompleteDone * call ddc#_on_complete_done()
    autocmd User PumCompleteDone call ddc#_on_complete_done()
    autocmd InsertLeave * call ddc#_clear()
  augroup END

  " Force context_filetype call
  silent! call context_filetype#get_filetype()

  let s:started = reltime()

  " Note: ddc.vim must be registered manually.
  if exists('g:loaded_denops') && denops#server#status() ==# 'running'
    silent! call ddc#_register()
  else
    autocmd ddc User DenopsReady silent! call ddc#_register()
  endif
endfunction
function! ddc#enable_cmdline_completion() abort
  augroup ddc-cmdline
    autocmd!
    autocmd CmdlineLeave * call ddc#_clear()
    autocmd CmdlineEnter   * call ddc#_on_event('CmdlineEnter')
    autocmd CmdlineChanged * call ddc#_on_event('CmdlineChanged')
  augroup END
  if exists('##ModeChanged')
    autocmd ddc-cmdline ModeChanged c:n
          \ call ddc#disable_cmdline_completion()
  else
    autocmd ddc-cmdline CmdlineLeave *
          \ if get(v:event, 'cmdlevel', 1) == 1 |
          \   call ddc#disable_cmdline_completion() |
          \ endif
  endif
endfunction
function! ddc#disable_cmdline_completion() abort
  augroup ddc-cmdline
    autocmd!
  augroup END

  if exists('#User#DDCCmdlineLeave')
    doautocmd <nomodeline> User DDCCmdlineLeave
  endif
endfunction
function! ddc#disable() abort
  augroup ddc
    autocmd!
  augroup END
  call ddc#disable_cmdline_completion()
endfunction
function! ddc#_register() abort
  call denops#plugin#register('ddc',
        \ denops#util#join_path(s:root_dir, 'denops', 'ddc', 'app.ts'),
        \ { 'mode': 'skip' })
endfunction

function! ddc#_denops_running() abort
  return exists('g:loaded_denops')
        \ && denops#server#status() ==# 'running'
        \ && denops#plugin#is_loaded('ddc')
endfunction

function! ddc#_on_event(event) abort
  if !ddc#_denops_running()
    return
  endif

  call denops#notify('ddc', 'onEvent', [a:event])
endfunction

function! ddc#complete() abort
  try
    return ddc#map#complete()
  catch
    call ddc#util#print_error(v:throwpoint)
    call ddc#util#print_error(v:exception)
  endtry
endfunction
function! ddc#_cannot_complete() abort
  let info = ddc#complete_info()
  let noinsert = &completeopt =~# 'noinsert'
  let info_check = pumvisible() &&
        \ ((info.mode !=# '' && info.mode !=# 'eval')
        \ || (noinsert && info.selected > 0)
        \ || (!noinsert && info.selected >= 0))
  let menu = ddc#_completion_menu()
  return (menu ==# 'native' && mode() !=# 'i')
        \ || menu ==# 'none'
        \ || g:ddc#_changedtick != b:changedtick
        \ || info_check || !exists('g:ddc#_complete_pos')
endfunction

function! ddc#_complete() abort
  if ddc#_cannot_complete()
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
      let displaywidth = max(map(copy(g:ddc#_candidates),
            \ { _, val -> strdisplaywidth(input . val.word) })) + 1
      if displaywidth >= &l:textwidth || virtcol('.') >= displaywidth
        return
      endif
    endif
  else
    " Clear current popup
    let g:ddc#_complete_pos = 0
    let g:ddc#_candidates = []
  endif

  let menu = ddc#_completion_menu()
  if menu ==# 'native'
    " Note: It may be called in map-<expr>
    silent! call complete(g:ddc#_complete_pos + 1, g:ddc#_candidates)
  elseif empty(g:ddc#_candidates)
    call ddc#_clear()
  elseif menu ==# 'pum.vim'
    call pum#open(g:ddc#_complete_pos + 1, g:ddc#_candidates)
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
function! ddc#_completion_menu() abort
  return get(g:, 'ddc#_completion_menu', 'native')
endfunction

function! ddc#_clear() abort
  if ddc#_completion_menu() ==# 'native'
    if mode() ==# 'i'
      call complete(1, [])
    endif
  elseif ddc#_completion_menu() ==# 'pum.vim'
    call pum#close()
  endif

  call ddc#_clear_inline()
endfunction
function! ddc#_clear_inline() abort
  if exists('*nvim_buf_set_virtual_text')
    if !exists('s:ddc_namespace')
      let s:ddc_namespace = nvim_create_namespace('ddc')
    endif

    call nvim_buf_clear_namespace(bufnr('%'), s:ddc_namespace, 0, -1)
  elseif g:ddc#_inline_popup_id > 0
    call popup_close(g:ddc#_inline_popup_id)
  endif

  let g:ddc#_inline_popup_id = -1
endfunction

function! ddc#_inline(highlight) abort
  if exists('*nvim_buf_set_extmark')
    if exists('s:ddc_namespace')
      call nvim_buf_clear_namespace(0, s:ddc_namespace, 0, -1)
    else
      let s:ddc_namespace = nvim_create_namespace('ddc')
    endif
  endif

  if empty(g:ddc#_candidates) || mode() !=# 'i'
        \ || ddc#_completion_menu() ==# 'none'
    return
  endif

  let complete_str = ddc#util#get_input('')[g:ddc#_complete_pos :]
  let word = g:ddc#_candidates[0].word

  " Note: nvim_buf_set_extmark() should not use when LSP is enabled?
  " https://github.com/hrsh7th/nvim-cmp/issues/404
  "let check_diagnostic = v:false
  "silent! let check_diagnostic = !empty(v:lua.vim.lsp.diagnostic.get_all()[0])

  if stridx(word, complete_str) == 0 && col('.') == col('$')
    let word = word[len(complete_str):]

    if word ==# ''
      return
    endif

    if exists('*nvim_buf_set_extmark')
      " Head matched: Follow cursor text
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

function! ddc#register(dict) abort
  if ddc#_denops_running()
    call denops#notify('ddc', 'register', [a:dict])
  else
    execute printf('autocmd User DDCReady call ' .
          \ 'denops#notify("ddc", "register", [%s])', a:dict)
  endif
endfunction
function! ddc#register_source(dict) abort
  let a:dict.kind = 'source'
  return ddc#register(a:dict)
endfunction
function! ddc#register_filter(dict) abort
  let a:dict.kind = 'filter'
  return ddc#register(a:dict)
endfunction

function! ddc#callback(id, ...) abort
  if !ddc#_denops_running()
    return
  endif

  let payload = get(a:000, 0, v:null)
  call denops#notify('ddc', 'onCallback', [a:id, payload])
endfunction

function! ddc#manual_complete(...) abort
  return call('ddc#map#manual_complete', a:000)
endfunction
function! ddc#insert_candidate(number) abort
  return ddc#map#insert_candidate(a:number)
endfunction
function! ddc#complete_common_string() abort
  return ddc#map#complete_common_string()
endfunction
function! ddc#can_complete() abort
  return ddc#map#can_complete()
endfunction

function! ddc#complete_info() abort
  return ddc#_completion_menu() ==# 'pum.vim' ?
        \ pum#complete_info() : complete_info()
endfunction

function! ddc#_on_complete_done() abort
  let completed_item = ddc#_completion_menu() ==# 'pum.vim' ?
        \ g:pum#completed_item : v:completed_item

  if !ddc#_denops_running() || empty(completed_item)
        \ || !has_key(completed_item, 'user_data')
    return
  endif

  if ddc#_completion_menu() !=# 'pum.vim'
    let g:ddc#_skip_complete = v:true
    " Reset skip completion
    autocmd ddc InsertLeave,InsertCharPre * ++once
          \ let g:ddc#_skip_complete = v:false
  endif

  if type(completed_item.user_data) != v:t_dict
    return
  endif

  " Search selected candidate from previous candidates
  let candidates = filter(copy(g:ddc#_candidates), { _, val
        \ -> val.word ==# completed_item.word
        \ && val.abbr ==# completed_item.abbr
        \ && val.info ==# completed_item.info
        \ && val.kind ==# completed_item.kind
        \ && val.menu ==# completed_item.menu
        \ && has_key(val, 'user_data')
        \ && val.user_data ==# completed_item.user_data
        \ })
  if empty(candidates)
    return
  endif

  call denops#request('ddc', 'onCompleteDone',
        \ [candidates[0].__sourceName, completed_item.user_data])
endfunction

function! ddc#_benchmark(...) abort
  let msg = get(a:000, 0, '')
  if msg !=# ''
    let msg .= ' '
  endif
  let diff = reltimefloat(reltime(s:started))
  call ddc#util#print_error(printf('%s%s: Took %f seconds.',
        \ msg, expand('<sfile>'), diff))
endfunction
