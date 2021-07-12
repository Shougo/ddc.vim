"=============================================================================
" FILE: custom.vim
" AUTHOR: Shougo Matsushita <Shougo.Matsu at gmail.com>
" License: MIT license
"=============================================================================

function! s:patch_global(dict) abort
  if !exists('g:ddc#_initialized')
    execute printf('autocmd User DDCReady call ' .
          \ 'denops#request_async("ddc", "patchGlobal", [%s], '.
          \ '{-> v:null}, {-> v:null})', a:dict
          \ )
  else
    call denops#request_async(
          \ 'ddc', 'patchGlobal', [a:dict], {-> v:null}, {-> v:null})
  endif
endfunction

function! s:patch_filetype(ft, dict) abort
  if !exists('g:ddc#_initialized')
    execute printf('autocmd User DDCReady call ' .
          \ 'denops#request_async("ddc", "patchFiletype", ["%s", %s], '.
          \ '{-> v:null}, {-> v:null})', a:ft, a:dict
          \ )
  else
    call denops#request_async(
          \ 'ddc', 'patchFiletype', [a:ft, a:dict], {-> v:null}, {-> v:null})
  endif
endfunction

function! s:patch_buffer(bufnr, dict) abort
  if !exists('g:ddc#_initialized')
    execute printf('autocmd User DDCReady call ' .
          \ 'denops#request_async("ddc", "patchBuffer", [%s, %s], '.
          \ '{-> v:null}, {-> v:null})', a:bufnr, a:dict
          \ )
  else
    call denops#request_async(
          \ 'ddc', 'patchBuffer', [a:bufnr, a:dict], {-> v:null}, {-> v:null})
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

function! ddc#custom#patch_local(bufnr, key_or_dict, ...) abort
  let dict = s:normalize_key_or_dict(a:key_or_dict, get(a:000, 0, ''))
  let bufnr = bufnr('%')
  call s:patch_buffer(bufnr, dict)
endfunction

" This should be called manually, so wait until DDCReady by the user himself.
function! ddc#custom#get_global() abort
  return denops#request('ddc', 'getGlobal', [])
endfunction

function! ddc#custom#get_filetype() abort
  return denops#request('ddc', 'getFiletype', [])
endfunction

function! ddc#custom#get_buffer() abort
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
