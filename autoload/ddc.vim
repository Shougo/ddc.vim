"=============================================================================
" FILE: ddc.vim
" AUTHOR: Shougo Matsushita <Shougo.Matsu at gmail.com>
" License: MIT license
"=============================================================================

let s:completion_timer = -1
let s:root_dir = fnamemodify(expand('<sfile>'), ':h:h')

function! ddc#enable() abort
  if exists('g:ddc#_initialized')
    return
  endif

  if !has('patch-8.2.0662') && !has('nvim-0.5')
    call ddc#util#print_error(
          \ 'ddc requires Vim 8.2.0662+ or neovim 0.5.0+.')
    return
  endif

  " Note: ddc.vim must be registered manually.

  if exists('g:loaded_denops')
    " Note: denops load may be started
    silent! call ddc#_register()
  endif

  augroup ddc
    autocmd!
    autocmd User DenopsReady call ddc#_register()
  augroup END
endfunction
function! ddc#disable() abort
  augroup ddc
    autocmd!
  augroup END
endfunction
function! ddc#_register() abort
  call denops#plugin#register('ddc',
        \ denops#util#join_path(s:root_dir, 'denops', 'ddc', 'app.ts'))
endfunction

function! ddc#complete() abort
  if exists('g:ddc#_save_completeopt')
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
function! ddc#_complete() abort
  let info = complete_info()
  let noinsert = &completeopt =~# 'noinsert'
  if mode() !=# 'i'
        \ || (info.mode !=# '' && info.mode !=# 'eval')
        \ || (noinsert && info.selected > 0)
        \ || (!noinsert && info.selected >= 0)
        \ || !exists('g:ddc#_complete_pos')
    return
  endif

  if g:ddc#_complete_pos >= 0
    if g:ddc#_event !=# 'Manual'
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
    endif
  else
    " Clear current popup
    let g:ddc#_complete_pos = 0
    let g:ddc#_candidates = []
  endif

  " Note: It may be called in map-<expr>
  silent! call complete(g:ddc#_complete_pos + 1, g:ddc#_candidates)
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

function! ddc#_inline() abort
  if !exists('*nvim_buf_set_extmark')
    return
  endif

  if !exists('s:ddc_namespace')
    let s:ddc_namespace = nvim_create_namespace('ddc')
  endif

  call nvim_buf_clear_namespace(0, s:ddc_namespace, 0, -1)
  if !empty(g:ddc#_candidates)
    call nvim_buf_set_extmark(
          \ 0, s:ddc_namespace, line('.') - 1, 0,
          \ { 'virt_text': [[g:ddc#_candidates[0].abbr, 'PmenuSel']] })
  endif
endfunction

function! ddc#register_source(dict) abort
  if !exists('g:ddc#_initialized')
    execute printf('autocmd User DDCReady call ' .
          \ 'denops#notify("ddc", "registerSource", [%s])',
          \ a:dict)
  else
    call denops#notify('ddc', 'registerSource', [a:dict])
  endif
endfunction
function! ddc#register_filter(dict) abort
  if !exists('g:ddc#_initialized')
    execute printf('autocmd User DDCReady call ' .
          \ 'denops#notify("ddc", "registerFilter", [%s])',
          \ a:dict)
  else
    call denops#notify('ddc', 'registerFilter', [a:dict])
  endif
endfunction

function! ddc#refresh_candidates() abort
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
