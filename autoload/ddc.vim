"=============================================================================
" FILE: ddc.vim
" AUTHOR: Shougo Matsushita <Shougo.Matsu at gmail.com>
" License: MIT license
"=============================================================================

let s:completion_timer = -1
let s:root_dir = fnamemodify(expand('<sfile>'), ':h:h')

function! ddc#enable() abort
  if v:version < 802 && !has('nvim-0.5')
    call ddc#util#print_error(
          \ 'ddc requires Vim 8.2+ or neovim 0.5.0+.')
    return
  endif

  " Note: ddc.vim must be registered manually.
  augroup ddc
    autocmd!
    autocmd User DenopsReady call denops#plugin#register('ddc',
          \ denops#util#join_path(s:root_dir, 'denops', 'ddc', 'app.ts'))
  augroup END
endfunction
function! ddc#disable() abort
  augroup ddc
    autocmd!
  augroup END
endfunction

function! ddc#complete() abort
  call ddc#_clear()

  set completeopt-=longest
  set completeopt+=menuone
  set completeopt-=menu
  set completeopt+=noselect

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
    call complete(g:ddc#_complete_pos + 1, g:ddc#_candidates)
  else
    " Clear current popup
    call complete(1, [])
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

function! ddc#_inline() abort
  if !exists('*nvim_buf_set_virtual_text')
    return
  endif

  if !exists('s:ddc_namespace')
    let s:ddc_namespace = nvim_create_namespace('ddc')
  endif

  call nvim_buf_clear_namespace(bufnr('%'), s:ddc_namespace, 0, -1)
  if !empty(g:ddc#_candidates)
    call nvim_buf_set_virtual_text(
          \ bufnr('%'), s:ddc_namespace, line('.') - 1,
          \ [[g:ddc#_candidates[0].abbr, 'PmenuSel']], {})
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

function! ddc#auto_complete() abort
  call denops#notify('ddc', 'onEvent', ['Auto'])
endfunction

function! ddc#get_input(event) abort
  let mode = mode()
  if a:event ==# 'InsertEnter'
    let mode = 'i'
  endif
  let text = getline('.')
  let input = (mode ==# 'i' ? (col('.')-1) : col('.')) >= len(text) ?
        \      text :
        \      matchstr(text,
        \         '^.*\%' . (mode ==# 'i' ? col('.') : col('.') - 1)
        \         . 'c' . (mode ==# 'i' ? '' : '.'))

  return input
endfunction

function! ddc#insert_candidate(number) abort
  let word = get(g:ddc#_candidates, a:number, {'word': ''}).word
  if word ==# ''
    return ''
  endif

  " Get cursor word.
  let complete_str = ddc#get_input('')[g:ddc#_complete_pos :]
  return (pumvisible() ? "\<C-e>" : '')
        \ . repeat("\<BS>", strchars(complete_str)) . word
endfunction

function! ddc#complete_common_string() abort
  if empty(g:ddc#_candidates) || g:ddc#_complete_pos < 0
    return ''
  endif

  let complete_str = ddc#get_input('')[g:ddc#_complete_pos :]
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
