"=============================================================================
" FILE: ddc.vim
" AUTHOR: Shougo Matsushita <Shougo.Matsu at gmail.com>
" License: MIT license
"=============================================================================

let s:completion_timer = -1
let s:root_dir = fnamemodify(expand('<sfile>'), ':h:h')

function! ddc#enable() abort
  " Dummy call
  silent! call denops#plugin#is_loaded('ddc')
  if !exists('*denops#plugin#is_loaded')
    call ddc#util#print_error('ddc requires denops.vim.')
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
    autocmd InsertLeave * call ddc#_clear()
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
  return ddc#map#complete()
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
    if ddc#_is_native_menu() && g:ddc#_overwrite_completeopt
          \ && g:ddc#_event !=# 'Manual'
      call s:overwrite_completeopt()
    endif
  else
    " Clear current popup
    let g:ddc#_complete_pos = 0
    let g:ddc#_candidates = []
  endif

  if ddc#_is_native_menu()
    " Note: It may be called in map-<expr>
    silent! call complete(g:ddc#_complete_pos + 1, g:ddc#_candidates)
  elseif empty(g:ddc#_candidates)
    call ddc#_clear()
  else
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

  if &completeopt !~# 'noinsert\|noselect' || g:ddc#_event =~# 'Refresh$'
    " Note: If it is async, noselect is needed to prevent without
    " confirmation problem
    set completeopt-=noinsert
    set completeopt+=noselect
  endif
endfunction
function! ddc#_is_native_menu() abort
  return !exists('g:ddc#_is_native_menu') || g:ddc#_is_native_menu
endfunction

function! ddc#_clear() abort
  if !ddc#_is_native_menu()
    call pum#close()
  endif

  call ddc#_clear_inline()
endfunction
function! ddc#_clear_inline() abort
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

function! ddc#_on_complete_done() abort
  if !ddc#_denops_running()
        \ || empty(v:completed_item)
        \ || type(v:completed_item.user_data) != v:t_dict
    return
  endif

  " Search selected candidate from previous candidates
  let candidates = filter(copy(g:ddc#_candidates), { _, val
        \ -> val.word ==# v:completed_item.word
        \ && val.abbr ==# v:completed_item.abbr
        \ && val.info ==# v:completed_item.info
        \ && val.kind ==# v:completed_item.kind
        \ && val.menu ==# v:completed_item.menu
        \ && has_key(val, 'user_data')
        \ && val.user_data ==# v:completed_item.user_data
        \ })
  if empty(candidates)
    return
  endif

  call denops#request('ddc', 'onCompleteDone',
        \ [candidates[0].__sourceName, v:completed_item.user_data])
endfunction
