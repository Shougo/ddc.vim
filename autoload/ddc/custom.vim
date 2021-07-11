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
  let dict = s:normalize_key_or_dict({}, a:key_or_dict, get(a:000, 0, ''))
  call s:patch_global(dict)
endfunction

function! ddc#custom#patch_filetype(ft, key_or_dict, ...) abort
  let dict = s:normalize_key_or_dict({}, a:key_or_dict, get(a:000, 0, ''))
  call s:patch_filetype(a:ft, dict)
endfunction

function! ddc#custom#patch_local(bufnr, key_or_dict, ...) abort
  let dict = s:normalize_key_or_dict({}, a:key_or_dict, get(a:000, 0, ''))
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

function! s:normalize_key_or_dict(base, key_or_dict, value) abort
  if type(a:key_or_dict) == v:t_dict
    call extend(a:base, a:key_or_dict)
  else
    let a:base[a:key_or_dict] = a:value
  endif
  return a:base
endfunction
