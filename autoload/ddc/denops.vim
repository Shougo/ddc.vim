function ddc#denops#_init(opts = {}) abort
  if 'ddc'->denops#plugin#is_loaded()
    return
  endif

  if !has('patch-9.1.0448') && !has('nvim-0.10')
    call ddc#util#print_error(
          \ 'ddc requires Vim 9.1.0448+ or neovim 0.10.0+.')
    return
  endif

  augroup ddc
    autocmd!
    autocmd InsertLeave * ++nested call ddc#hide('InsertLeave')
  augroup END

  let context_filetype = a:opts->get('context_filetype', 'none')
  if context_filetype ==# 'context_filetype'
    " Force context_filetype call
    silent! call context_filetype#get_filetype()
  endif

  let g:ddc#_started = reltime()
  let g:ddc#_context_filetype = context_filetype
  let g:ddc#_skip_next_complete = 0

  " NOTE: ddc.vim must be registered manually.

  " NOTE: denops load may be started
  if 'g:loaded_denops'->exists()
    if denops#server#status() ==# 'running'
      call s:register()
      return
    endif

    try
      if '<amatch>'->expand() ==# 'DenopsReady'
        call s:register()
        return
      endif
    catch /^Vim\%((\a\+)\)\=:E497:/
      " NOTE: E497 is occured when it is not in autocmd.
    endtry
  endif

  autocmd ddc User DenopsReady ++nested call s:register()
endfunction

function ddc#denops#_running() abort
  return 'g:loaded_denops'->exists()
        \ && denops#server#status() ==# 'running'
        \ && denops#plugin#is_loaded('ddc')
endfunction

function ddc#denops#_notify(method, args) abort
  if ddc#denops#_running()
    call denops#notify('ddc', a:method, a:args)
  else
    execute printf('autocmd User DenopsPluginPost:ddc call '
          \ .. 'denops#notify("ddc", "%s", %s)', a:method, a:args->string())
  endif
endfunction

function ddc#denops#_request(method, args, default=v:null) abort
  return ddc#denops#_running() ?
        \ denops#request('ddc', a:method, a:args) : a:default
endfunction

const s:root_dir = '<sfile>'->expand()->fnamemodify(':h:h:h')
const s:sep = has('win32') ? '\' : '/'
function ddc#denops#_mods() abort
  return [s:root_dir, 'denops', 'ddc', '_mods.js']->join(s:sep)
endfunction
function s:register() abort
  call denops#plugin#load(
        \ 'ddc',
        \ [s:root_dir, 'denops', 'ddc', 'app.ts']->join(s:sep))

  autocmd ddc User DenopsClosed ++nested call s:stopped()
endfunction

function s:stopped() abort
  unlet! g:ddc#_initialized

  " Restore custom config
  if 'g:ddc#_customs'->exists()
    for custom in g:ddc#_customs
      call ddc#denops#_notify(custom.method, custom.args)
    endfor
  endif
endfunction
