"=============================================================================
" FILE: custom.vim
" AUTHOR: Shougo Matsushita <Shougo.Matsu at gmail.com>
" License: MIT license
"=============================================================================

function! s:patch_global(dict) abort
  if ddc#_denops_running()
    call denops#notify('ddc', 'patchGlobal', [a:dict])
  else
    execute printf('autocmd User DDCReady call ' .
          \ 'denops#notify("ddc", "patchGlobal", [%s])',
          \ a:dict)
  endif
endfunction

function! s:patch_filetype(ft, dict) abort
  if ddc#_denops_running()
    call denops#notify('ddc', 'patchFiletype', [a:ft, a:dict])
  else
    execute printf('autocmd User DDCReady call ' .
          \ 'denops#notify("ddc", "patchFiletype", ["%s", %s])',
          \ a:ft, a:dict)
  endif
endfunction

function! s:patch_buffer(bufnr, dict) abort
  if ddc#_denops_running()
    call denops#notify('ddc', 'patchBuffer', [a:bufnr, a:dict])
  else
    execute printf('autocmd User DDCReady call ' .
          \ 'denops#notify("ddc", "patchBuffer", [%s, %s])',
          \ a:bufnr, a:dict)
  endif
endfunction

function! ddc#custom#patch_global(key_or_dict, ...) abort
  let dict = s:normalize_key_or_dict(a:key_or_dict, get(a:000, 0, ''))
  call s:patch_global(dict)
endfunction

function! ddc#custom#patch_filetype(ft, key_or_dict, ...) abort
  let filetypes = s:normalize_string_or_list(a:ft)
  let dict = s:normalize_key_or_dict(a:key_or_dict, get(a:000, 0, ''))
  for filetype in filetypes
    call s:patch_filetype(filetype, dict)
  endfor
endfunction

function! ddc#custom#patch_buffer(key_or_dict, ...) abort
  let dict = s:normalize_key_or_dict(a:key_or_dict, get(a:000, 0, ''))
  let n = bufnr('%')
  call s:patch_buffer(n, dict)
endfunction

" This should be called manually, so wait until DDCReady by the user himself.
function! ddc#custom#get_global() abort
  if !ddc#_denops_running()
    return {}
  endif

  return denops#request('ddc', 'getGlobal', [])
endfunction

function! ddc#custom#get_filetype() abort
  if !ddc#_denops_running()
    return {}
  endif

  return denops#request('ddc', 'getFiletype', [])
endfunction

function! ddc#custom#get_buffer() abort
  if !ddc#_denops_running()
    return {}
  endif

  return denops#request('ddc', 'getBuffer', [])
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
