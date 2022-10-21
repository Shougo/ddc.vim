function! ddc#ui#native#_complete(overwrite, pos, items) abort
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

function! ddc#ui#native#_restore_completeopt() abort
  if exists('s:save_completeopt')
    " Restore completeopt
    let &completeopt = s:save_completeopt
    unlet s:save_completeopt
  endif
endfunction
