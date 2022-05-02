function! ddc#custom#patch_global(key_or_dict, ...) abort
  let dict = s:normalize_key_or_dict(a:key_or_dict, get(a:000, 0, ''))
  call s:notify('patchGlobal', [dict])
endfunction
function! ddc#custom#patch_filetype(ft, key_or_dict, ...) abort
  let filetypes = s:normalize_string_or_list(a:ft)
  let dict = s:normalize_key_or_dict(a:key_or_dict, get(a:000, 0, ''))
  for filetype in filetypes
    call s:notify('patchFiletype', [dict, filetype])
  endfor
endfunction
function! ddc#custom#patch_buffer(key_or_dict, ...) abort
  let dict = s:normalize_key_or_dict(a:key_or_dict, get(a:000, 0, ''))
  let n = bufnr('%')
  call s:notify('patchBuffer', [dict, n])
endfunction

function! ddc#custom#set_global(dict) abort
  call s:notify('setGlobal', [a:dict])
endfunction
function! ddc#custom#set_filetype(ft, dict) abort
  let filetypes = s:normalize_string_or_list(a:ft)
  for filetype in filetypes
    call s:notify('setFiletype', [a:dict, filetype])
  endfor
endfunction
function! ddc#custom#set_context(ft, func) abort
  let filetypes = s:normalize_string_or_list(a:ft)
  let id = denops#callback#register(a:func)
  for filetype in filetypes
    call s:notify('setContext', [filetype, id])
  endfor
endfunction
function! ddc#custom#set_buffer(dict) abort
  let n = bufnr('%')
  call s:notify('setBuffer', [a:dict, n])
endfunction

function! ddc#custom#alias(type, alias, base) abort
  if ddc#_denops_running()
    call denops#notify('ddc', 'alias', [a:type, a:alias, a:base])
  else
    execute printf('autocmd User DDCReady call ' .
          \ 'denops#notify("ddc", "alias", ["%s", "%s", "%s"])',
          \ a:type, a:alias, a:base)
  endif
endfunction

" This should be called manually, so wait until DDCReady by the user himself.
function! ddc#custom#get_global() abort
  return ddc#_denops_running() ? denops#request('ddc', 'getGlobal', []) : {}
endfunction
function! ddc#custom#get_filetype() abort
  return ddc#_denops_running() ? denops#request('ddc', 'getFiletype', []) : {}
endfunction
function! ddc#custom#get_context() abort
  return ddc#_denops_running() ? denops#request('ddc', 'getContext', []) : {}
endfunction
function! ddc#custom#get_buffer() abort
  return ddc#_denops_running() ?
        \ get(denops#request('ddc', 'getBuffer', []), bufnr('%'), {}) : {}
endfunction
function! ddc#custom#get_current() abort
  return ddc#_denops_running() ? denops#request('ddc', 'getCurrent', []) : {}
endfunction

function! s:notify(method, args) abort
  " Save notify args
  if !exists('g:ddc#_customs')
    let g:ddc#_customs = []
  endif

  call add(g:ddc#_customs, { 'method': a:method, 'args': a:args })

  return ddc#_notify(a:method, a:args)
endfunction

function! s:normalize_key_or_dict(key_or_dict, value) abort
  if type(a:key_or_dict) == v:t_dict
    return a:key_or_dict
  elseif type(a:key_or_dict) == v:t_string
    let base = {}
    let base[a:key_or_dict] = a:value
    return base
  endif
  return {}
endfunction

function! s:normalize_string_or_list(string_or_list) abort
  if type(a:string_or_list) == v:t_list
    return a:string_or_list
  elseif type(a:string_or_list) == v:t_string
    return [a:string_or_list]
  endif
  return []
endfunction
