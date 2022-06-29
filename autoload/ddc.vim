function! ddc#enable() abort
  " Dummy call
  silent! call denops#plugin#is_loaded('ddc')
  if !exists('*denops#plugin#is_loaded')
    call ddc#util#print_error('denops.vim is not released or too old.')
    return
  endif

  if denops#plugin#is_loaded('ddc')
    return
  endif

  if !has('patch-8.2.0662') && !has('nvim-0.6')
    call ddc#util#print_error(
          \ 'ddc requires Vim 8.2.0662+ or neovim 0.6.0+.')
    return
  endif

  augroup ddc
    autocmd!
    autocmd CompleteDone * call ddc#complete#_on_complete_done()
    autocmd User PumCompleteDone call ddc#complete#_on_complete_done()
    autocmd InsertLeave * call ddc#complete#_clear()
  augroup END

  " Force context_filetype call
  silent! call context_filetype#get_filetype()

  let g:ddc#_started = reltime()

  " Note: ddc.vim must be registered manually.
  if exists('g:loaded_denops') && denops#server#status() ==# 'running'
    silent! call ddc#_register()
  else
    autocmd ddc User DenopsReady silent! call ddc#_register()
  endif
endfunction
function! ddc#enable_cmdline_completion() abort
  call ddc#enable()

  augroup ddc-cmdline
    autocmd!
    autocmd CmdlineLeave <buffer> call ddc#complete#_clear()
    autocmd CmdlineEnter <buffer> call ddc#_on_event('CmdlineEnter')
    autocmd CmdlineChanged <buffer>
          \ if getcmdtype() !=# '=' && getcmdtype() !=# '@' |
          \ call ddc#_on_event('CmdlineChanged') | endif
  augroup END
  if exists('##ModeChanged')
    autocmd ddc-cmdline ModeChanged *:n
          \ call ddc#disable_cmdline_completion()
  else
    autocmd ddc-cmdline CmdlineLeave <buffer>
          \ if get(v:event, 'cmdlevel', 1) == 1 |
          \   call ddc#disable_cmdline_completion() |
          \ endif
  endif

  " Note: command line window must be disabled
  let s:save_cedit = &cedit
  let b:ddc_cmdline_completion = v:true
  set cedit=
endfunction
function! ddc#disable_cmdline_completion() abort
  augroup ddc-cmdline
    autocmd!
  augroup END

  if exists('s:save_cedit')
    let &cedit = s:save_cedit
  endif

  unlet! b:ddc_cmdline_completion

  if exists('#User#DDCCmdlineLeave')
    doautocmd <nomodeline> User DDCCmdlineLeave
  endif
endfunction
function! ddc#disable() abort
  augroup ddc
    autocmd!
  augroup END
  call ddc#disable_cmdline_completion()
endfunction

let s:root_dir = fnamemodify(expand('<sfile>'), ':h:h')
function! ddc#_register() abort
  call denops#plugin#register('ddc',
        \ denops#util#join_path(s:root_dir, 'denops', 'ddc', 'app.ts'),
        \ { 'mode': 'skip' })

  autocmd ddc User DenopsStopped call s:stopped()
endfunction

function! s:stopped() abort
  unlet! g:ddc#_initialized

  " Restore custom config
  if exists('g:ddc#_customs')
    for custom in g:ddc#_customs
      call ddc#_notify(custom.method, custom.args)
    endfor

    let g:ddc#_customs = []
  endif
endfunction

function! ddc#_denops_running() abort
  return exists('g:loaded_denops')
        \ && denops#server#status() ==# 'running'
        \ && denops#plugin#is_loaded('ddc')
endfunction

function! ddc#_on_event(event) abort
  " Note: If denops isn't running, stop
  if !ddc#_denops_running()
    return
  endif

  " Check the completion state
  let info = ddc#complete_info()
  let noinsert = &completeopt =~# 'noinsert'
  let info_check = ddc#map#pum_visible() &&
        \ ((info.mode !=# '' && info.mode !=# 'eval')
        \ || (noinsert && info.selected > 0)
        \ || (!noinsert && info.selected >= 0))
  if info_check
    return
  endif

  call denops#notify('ddc', 'onEvent', [a:event])
endfunction

function! ddc#complete() abort
  try
    return ddc#map#complete()
  catch
    call ddc#util#print_error(v:throwpoint)
    call ddc#util#print_error(v:exception)
  endtry
endfunction

function! ddc#syntax_in(groups) abort
  return ddc#syntax#in(a:groups)
endfunction

function! ddc#_completion_menu() abort
  return get(g:, 'ddc#_completion_menu', 'native')
endfunction


function! ddc#register(dict) abort
  if ddc#_denops_running()
    call denops#notify('ddc', 'register', [a:dict])
  else
    execute printf('autocmd User DDCReady call ' .
          \ 'denops#notify("ddc", "register", [%s])', a:dict)
  endif
endfunction

function! ddc#_notify(method, args) abort
  if ddc#_denops_running()
    call denops#notify('ddc', a:method, a:args)
  else
    execute printf('autocmd User DDCReady call ' .
          \ 'denops#notify("ddc", "%s", %s)',
          \ a:method, string(a:args))
  endif
endfunction

function! ddc#callback(id, ...) abort
  if !ddc#_denops_running()
    return
  endif

  let payload = get(a:000, 0, v:null)
  call denops#notify('ddc', 'onCallback', [a:id, payload])
endfunction

function! ddc#manual_complete(...) abort
  return call('ddc#map#manual_complete', a:000)
endfunction
function! ddc#insert_item(number) abort
  return ddc#map#insert_item(a:number)
endfunction
function! ddc#complete_common_string() abort
  return ddc#map#complete_common_string()
endfunction
function! ddc#can_complete() abort
  return ddc#map#can_complete()
endfunction

function! ddc#complete_info() abort
  return ddc#_completion_menu() ==# 'pum.vim' ?
        \ pum#complete_info() : complete_info()
endfunction
