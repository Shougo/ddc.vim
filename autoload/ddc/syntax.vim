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

function! s:get_syn_names(curpos) abort
  if col('$') >= 200
    return []
  endif

  let names = []
  try
    " Note: synstack() seems broken in concealed text.
    for id in synstack(a:curpos[0], a:curpos[1])
      const name = id->synIDattr('name')
      call add(names, name)
      if synIDattr(synIDtrans(id), 'name') !=# name
        call add(names, id->synIDtrans()->synIDattr('name'))
      endif
    endfor
  catch
    " Ignore error
  endtry
  return names
endfunction
