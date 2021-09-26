"=============================================================================
" FILE: map.vim
" AUTHOR: Shougo Matsushita <Shougo.Matsu at gmail.com>
" License: MIT license
"=============================================================================

function! ddc#map#complete() abort
  if exists('g:ddc#_save_completeopt') && g:ddc#_overwrite_completeopt
    " Restore completeopt
    let &completeopt = g:ddc#_save_completeopt
    unlet g:ddc#_save_completeopt
  endif

  call ddc#_clear_inline()

  " Debounce for Vim8
  if has('nvim')
    call ddc#_complete()
  else
    call timer_stop(s:completion_timer)
    let s:completion_timer = timer_start(10, { -> ddc#_complete() })
  endif
endfunction

function! ddc#map#manual_complete(...) abort
  return printf("\<Cmd>call denops#notify('ddc', 'manualComplete', %s)\<CR>",
        \ string([get(a:000, 0, [])]))
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

  return (pumvisible() ? "\<C-e>" : '')
        \ . repeat("\<BS>", strchars(complete_str)) . common_str
endfunction

function! ddc#map#insert_candidate(number) abort
  let word = get(g:ddc#_candidates, a:number, {'word': ''}).word
  if word ==# ''
    return ''
  endif

  " Get cursor word.
  let complete_str = ddc#util#get_input('')[g:ddc#_complete_pos :]
  return (pumvisible() ? "\<C-e>" : '')
        \ . repeat("\<BS>", strchars(complete_str)) . word
endfunction
