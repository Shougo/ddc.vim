function! ddc#syntax#in(checks) abort
  const groups_names = ddc#syntax#get()
  for check in a:checks->type() == v:t_list ? a:checks : [a:checks]
    if groups_names->index(check) >= 0
      return v:true
    endif
  endfor
  return v:false
endfunction

function! ddc#syntax#get() abort
  const curpos = getcurpos()[1:2]
  return &l:syntax !=# '' ? s:get_syn_names([curpos[0], curpos[1] - 1]) :
        \ has('nvim') ? v:lua.vim.treesitter.get_captures_at_cursor(0) :  []
endfunction

function! ddc#syntax#lang() abort
  const curpos = getcurpos()[1:2]

  try
    " NOTE: vim.treesitter.get_parser() may fail
    return &l:filetype ==# '' || !has('nvim') ? '' :
          \ luaeval('vim.treesitter.get_parser():language_for_range('
          \ .. '{_A[1] - 1, _A[2] - 1, _A[1] - 1, _A[2] - 1}):lang()', curpos)
  catch
    " Ignore error
  endtry

  return ''
endfunction

function! s:get_syn_names(curpos) abort
  if '$'->col() >= 200
    return []
  endif

  let names = []
  try
    " NOTE: synstack() seems broken in concealed text.
    for id in synstack(a:curpos[0], a:curpos[1])
      let name = id->synIDattr('name')
      call add(names, name)
      let trans_name = id->synIDtrans()->synIDattr('name')
      if trans_name !=# name
        call add(names, trans_name)
      endif
    endfor
  catch
    " Ignore error
  endtry

  return names
endfunction
