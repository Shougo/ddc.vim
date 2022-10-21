function! ddc#ui#native#_show(overwrite, pos, items) abort
  if has('nvim')
    call s:complete(a:overwrite, a:pos, a:items)
  else
    " Debounce for Vim8
    if exists('s:completion_timer')
      call timer_stop(s:completion_timer)
    endif
    let s:completion_timer = timer_start(10,
          \ { -> s:complete(a:overwrite, a:pos, a:items) }
          \ )
  endif
endfunction

function! ddc#ui#native#_hide() abort
  if mode() ==# 'i'
    call complete(1, [])
  endif

  call s:restore_completeopt()
endfunction

function! ddc#ui#native#_on_complete_done() abort
  let g:ddc#ui#native#_skip_complete = v:true
  " Reset skip completion
  autocmd ddc InsertLeave,InsertCharPre * ++once
        \ let g:ddc#ui#native#_skip_complete = v:false
endfunction

function! s:complete(overwrite, pos, items) abort
  if mode() !=# 'i'
    return
  endif

  if a:overwrite
    call s:overwrite_completeopt()
  endif

  " Note: It may be called in map-<expr>
  silent! call complete(a:pos + 1, a:items)
endfunction

function! s:overwrite_completeopt() abort
  if !exists('s:save_completeopt')
    let s:save_completeopt = &completeopt
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

function! s:restore_completeopt() abort
  if exists('s:save_completeopt')
    " Restore completeopt
    let &completeopt = s:save_completeopt
    unlet s:save_completeopt
  endif
endfunction
