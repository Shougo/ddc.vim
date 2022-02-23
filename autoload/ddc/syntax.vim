function! ddc#syntax#in(checks) abort
  let groups_names = ddc#syntax#get()
  for check in type(a:checks) == v:t_list ? a:checks : [a:checks]
    if index(groups_names, check) >= 0
      return v:true
    endif
  endfor
  return v:false
endfunction

function! ddc#syntax#get() abort
  let curpos = getcurpos()[1:2]
  return &l:syntax !=# '' ? s:get_syn_names([curpos[0], curpos[1] - 1]) :
        \ has('nvim') ? s:get_treesitter_nodes([curpos[0] - 1,
        \   col('$') == col('.') ? curpos[1] - 2 : curpos[1] - 1]) :
        \ []
endfunction

function! s:get_syn_names(curpos) abort
  if col('$') >= 200
    return []
  endif

  let names = []
  try
    " Note: synstack() seems broken in concealed text.
    for id in synstack(a:curpos[0], a:curpos[1])
      let name = synIDattr(id, 'name')
      call add(names, name)
      if synIDattr(synIDtrans(id), 'name') !=# name
        call add(names, synIDattr(synIDtrans(id), 'name'))
      endif
    endfor
  catch
    " Ignore error
  endtry
  return names
endfunction

function! s:get_treesitter_nodes(curpos) abort
  try
    return luaeval(
          \ 'require("ddc.syntax").get_treesitter_syntax_groups(_A)', a:curpos)
  catch
    " Ignore error
    return []
  endtry
endfunction
