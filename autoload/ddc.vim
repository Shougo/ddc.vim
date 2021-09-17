"=============================================================================
" FILE: ddc.vim
" AUTHOR: Shougo Matsushita <Shougo.Matsu at gmail.com>
" License: MIT license
"=============================================================================

let s:completion_timer = -1
let s:root_dir = fnamemodify(expand('<sfile>'), ':h:h')

function! ddc#enable() abort
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
    autocmd CompleteDone * call ddc#_substitute_suffix()
  augroup END

  " Force context_filetype call
  silent! call context_filetype#get_filetype()

  " Note: ddc.vim must be registered manually.
  if exists('g:loaded_denops') && denops#server#status() ==# 'running'
    silent! call ddc#_register()
  else
    autocmd ddc User DenopsReady silent! call ddc#_register()
  endif
endfunction
function! ddc#disable() abort
  augroup ddc
    autocmd!
  augroup END
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
  if exists('g:ddc#_save_completeopt') && g:ddc#_overwrite_completeopt
    " Restore completeopt
    let &completeopt = g:ddc#_save_completeopt
    unlet g:ddc#_save_completeopt
  endif

  call ddc#_clear()

  " Debounce for Vim8
  if has('nvim')
    call ddc#_complete()
  else
    call timer_stop(s:completion_timer)
    let s:completion_timer = timer_start(10, { -> ddc#_complete() })
  endif
endfunction
function! ddc#_cannot_complete() abort
  let info = complete_info()
  let noinsert = &completeopt =~# 'noinsert'
  return mode() !=# 'i'
        \ || (info.mode !=# '' && info.mode !=# 'eval')
        \ || (noinsert && info.selected > 0)
        \ || (!noinsert && info.selected >= 0)
        \ || !exists('g:ddc#_complete_pos')
endfunction
function! ddc#_complete() abort
  if ddc#_cannot_complete()
    return
  endif

  if g:ddc#_complete_pos >= 0
    if g:ddc#_event !=# 'Manual' && g:ddc#_overwrite_completeopt
      call s:overwrite_completeopt()
    endif
  else
    " Clear current popup
    let g:ddc#_complete_pos = 0
    let g:ddc#_candidates = []
  endif

  " Note: It may be called in map-<expr>
  silent! call complete(g:ddc#_complete_pos + 1, g:ddc#_candidates)
endfunction
function! s:overwrite_completeopt() abort
  if !exists('g:ddc#_save_completeopt')
    let g:ddc#_save_completeopt = &completeopt
  endif

  " Auto completion conflicts with 'completeopt'.
  set completeopt-=longest
  set completeopt+=menuone
  set completeopt-=menu

  if &completeopt !~# 'noinsert\|noselect' || g:ddc#_event =~# 'Refresh$'
    " Note: If it is async, noselect is needed to prevent without
    " confirmation problem
    set completeopt-=noinsert
    set completeopt+=noselect
  endif
endfunction

function! ddc#_clear() abort
  if !exists('*nvim_buf_set_virtual_text')
    return
  endif

  if !exists('s:ddc_namespace')
    let s:ddc_namespace = nvim_create_namespace('ddc')
  endif

  call nvim_buf_clear_namespace(bufnr('%'), s:ddc_namespace, 0, -1)
endfunction

function! ddc#_inline(highlight) abort
  if !exists('*nvim_buf_set_extmark')
    return
  endif

  if !exists('s:ddc_namespace')
    let s:ddc_namespace = nvim_create_namespace('ddc')
  endif

  call nvim_buf_clear_namespace(0, s:ddc_namespace, 0, -1)
  if empty(g:ddc#_candidates)
    return
  endif

  let complete_str = ddc#util#get_input('')[g:ddc#_complete_pos:]
  let word = g:ddc#_candidates[0].word

  if stridx(word, complete_str) == 0
    " Head matched: Follow cursor text
    call nvim_buf_set_extmark(
          \ 0, s:ddc_namespace, line('.') - 1, col('.') - 1, {
          \ 'virt_text': [[word[len(complete_str):], a:highlight]],
          \ 'virt_text_pos': 'overlay',
          \ 'hl_mode': 'combine',
          \ 'priority': 0,
          \ })
  else
    " Others: After cursor text
    call nvim_buf_set_extmark(
          \ 0, s:ddc_namespace, line('.') - 1, 0, {
          \ 'virt_text': [[word, a:highlight]],
          \ 'hl_mode': 'combine',
          \ 'priority': 0,
          \ })
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

function! ddc#refresh_candidates() abort
  if !ddc#_denops_running()
    return
  endif

  call denops#notify('ddc', 'onEvent',
        \ [g:ddc#_event =~# '^Manual' ? 'ManualRefresh' : 'AutoRefresh'])
endfunction

function! ddc#manual_complete(...) abort
  return printf("\<Cmd>call denops#notify('ddc', 'manualComplete', %s)\<CR>",
        \ string([get(a:000, 0, [])]))
endfunction

function! ddc#insert_candidate(number) abort
  let word = get(g:ddc#_candidates, a:number, {'word': ''}).word
  if word ==# ''
    return ''
  endif

  " Get cursor word.
  let complete_str = ddc#util#get_input('')[g:ddc#_complete_pos :]
  return (pumvisible() ? "\<C-e>" : '')
        \ . repeat("\<BS>", strchars(complete_str)) . word
endfunction

function! ddc#complete_common_string() abort
  if empty(g:ddc#_candidates) || g:ddc#_complete_pos < 0
    return ''
  endif

  let complete_str = ddc#util#get_input('')[g:ddc#_complete_pos :]
  let common_str = g:ddc#_candidates[0].word
  for candidate in g:ddc#_candidates[1:]
    while stridx(tolower(candidate.word), tolower(common_str)) != 0
      let common_str = common_str[: -2]
    endwhile
  endfor

  if common_str ==# '' || complete_str ==? common_str
    return ''
  endif

  return (pumvisible() ? "\<C-e>" : '')
        \ . repeat("\<BS>", strchars(complete_str)) . common_str
endfunction

function! ddc#can_complete() abort
  return !empty(get(g:, 'ddc#_candidates', []))
        \ && get(g:, 'ddc#_complete_pos', -1) >= 0
        \ && !ddc#_cannot_complete()
endfunction

function! ddc#_substitute_suffix() abort
  if !has_key(v:completed_item, 'user_data')
    return
  endif

  let user_data = v:completed_item.user_data
  let user_dict = type(user_data) ==# v:t_string && user_data !=# '' ?
        \ json_decode(user_data) : user_data
  if empty(user_dict)
        \ || !has_key(a:user_dict, 'old_suffix')
        \ || !has_key(a:user_dict, 'new_suffix')
    return
  endif

  let old_suffix = user_dict.old_suffix
  let new_suffix = user_dict.new_suffix

  let next_text = ddc#util#get_next_input('CompleteDone')
  if stridx(next_text, old_suffix) != 0
    return
  endif

  let next_text = new_suffix . next_text[len(old_suffix):]
  call setline('.', ddc#util#get_input('CompleteDone') . next_text)
endfunction
