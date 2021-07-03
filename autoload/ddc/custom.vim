"=============================================================================
" FILE: custom.vim
" AUTHOR: Shougo Matsushita <Shougo.Matsu at gmail.com>
" License: MIT license
"=============================================================================

function! ddc#custom#_get() abort
  if !exists('s:custom')
    call ddc#custom#_init()
  endif

  return s:custom
endfunction

function! ddc#custom#_init() abort
  let s:custom = {}
  let s:custom.source = {}
  let s:custom.source._ = {}
  let s:custom.option = {}
endfunction

function! ddc#custom#source(source_name, name_or_dict, ...) abort
  let custom = ddc#custom#_get().source

  for key in ddc#util#split(a:source_name)
    if !has_key(custom, key)
      let custom[key] = {}
    endif

    call s:set_custom(custom[key], a:name_or_dict, get(a:000, 0, ''))
  endfor
endfunction

function! ddc#custom#global(name_or_dict, ...) abort
  let custom = ddc#custom#_get().option
  call s:set_custom(custom, a:name_or_dict, get(a:000, 0, ''))
endfunction

function! s:set_custom(dest, name_or_dict, value) abort
  if type(a:name_or_dict) == v:t_dict
    call extend(a:dest, a:name_or_dict)
  else
    let a:dest[a:name_or_dict] = a:value
  endif
endfunction
