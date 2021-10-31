"=============================================================================
" FILE: map.vim
" AUTHOR: Shougo Matsushita <Shougo.Matsu at gmail.com>
" License: MIT license
"=============================================================================
let s:completion_timer = -1

function! ddc#map#complete() abort
  if exists('g:ddc#_save_completeopt') && g:ddc#_overwrite_completeopt
    " Restore completeopt
    let &completeopt = g:ddc#_save_completeopt
    unlet g:ddc#_save_completeopt
  endif

  call ddc#_clear_inline()

  if has('nvim') || ddc#_completion_menu() ==# 'pum.vim'
    call ddc#_complete()
  else
    " Debounce for Vim8
    call timer_stop(s:completion_timer)
    let s:completion_timer = timer_start(10, { -> ddc#_complete() })
  endif
endfunction

function! ddc#map#manual_complete(...) abort
  if !ddc#_denops_running()
    call ddc#enable()
    call denops#plugin#wait('ddc')
  endif

  let arg = get(a:000, 0, [])
  return printf("\<Cmd>call denops#notify('ddc', 'manualComplete', %s)\<CR>",
        \ string([type(arg) == v:t_list ? arg : [arg]]))
endfunction

function! ddc#map#pumvisible() abort
  return ddc#_completion_menu() ==# 'pum.vim' ?
        \ pum#visible() : pumvisible()
endfunction

function! ddc#map#confirm() abort
  return !ddc#map#pumvisible() ? '' :
        \ ddc#_completion_menu() ==# 'pum.vim' ?
        \ "\<Cmd>call pum#map#confirm()\<CR>" : "\<C-y>"
endfunction

function! ddc#map#cancel() abort
  return !ddc#map#pumvisible() ? '' :
        \ ddc#_completion_menu() ==# 'pum.vim' ?
        \ "\<Cmd>call pum#map#cancel()\<CR>" : "\<C-e>"
endfunction

function! ddc#map#can_complete() abort
  return !empty(get(g:, 'ddc#_candidates', []))
        \ && get(g:, 'ddc#_complete_pos', -1) >= 0
        \ && !ddc#_cannot_complete()
endfunction

function! ddc#map#extend() abort
  if !exists('g:ddc#_sources')
    return ''
  endif
  return ddc#map#confirm() . ddc#map#manual_complete(g:ddc#_sources)
endfunction

function! ddc#map#complete_common_string() abort
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

  let chars = ''
  " Note: Change backspace option to work <BS> correctly
  let chars .= "\<Cmd>set backspace=\<CR>"
  let chars .= ddc#map#cancel()
  let chars .= repeat("\<BS>", strchars(complete_str))
  let chars .= common_str
  let chars .= printf("\<Cmd>set backspace=%s\<CR>", &backspace)
  return chars
endfunction

function! ddc#map#insert_candidate(number) abort
  let word = get(g:ddc#_candidates, a:number, {'word': ''}).word
  if word ==# ''
    return ''
  endif

  call ddc#_clear_inline()

  " Get cursor word.
  let complete_str = ddc#util#get_input('')[g:ddc#_complete_pos :]

  let chars = ''
  " Note: Change backspace option to work <BS> correctly
  let chars .= "\<Cmd>set backspace=start\<CR>"
  let chars .= ddc#map#cancel()
  let chars .= repeat("\<BS>", strchars(complete_str))
  let chars .= word
  let chars .= printf("\<Cmd>set backspace=%s\<CR>", &backspace)
  return chars
endfunction
