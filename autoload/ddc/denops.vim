const s:root_dir = '<sfile>'->expand()->fnamemodify(':h:h:h')
const s:sep = has('win32') ? '\' : '/'
function ddc#denops#_register() abort
  if !'g:ddc#_mods'->exists()
    const g:ddc#_mods = [s:root_dir, 'denops', 'ddc', '_mods.js']->join(s:sep)
  endif

  call ddc#denops#_load(
        \ 'ddc',
        \ [s:root_dir, 'denops', 'ddc', 'app.ts']->join(s:sep))

  autocmd ddc User DenopsClosed call s:stopped()
endfunction
function ddc#denops#_load(name, path) abort
  try
    call denops#plugin#load(a:name, a:path)
  catch /^Vim\%((\a\+)\)\=:E117:/
    " Fallback to `register` for backward compatibility
    call denops#plugin#register(a:name, a:path, #{ mode: 'skip' })
  endtry
endfunction

function s:stopped() abort
  unlet! g:ddc#_initialized

  " Restore custom config
  if 'g:ddc#_customs'->exists()
    for custom in g:ddc#_customs
      call ddc#_notify(custom.method, custom.args)
    endfor
  endif
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
