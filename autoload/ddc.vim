function ddc#enable(opts = {}) abort
  call ddc#denops#_init(a:opts)
endfunction

function ddc#enable_cmdline_completion() abort
  call ddc#enable()

  augroup ddc-cmdline
    autocmd!
    autocmd CmdlineLeave * call ddc#hide('CmdlineLeave')
    autocmd CmdlineEnter * call ddc#on_event('CmdlineEnter')
    autocmd CmdlineChanged *
          \ : if getcmdtype() !=# '=' && getcmdtype() !=# '@'
          \ |   call ddc#on_event('CmdlineChanged')
          \ | endif
    autocmd ModeChanged c:n call s:disable_cmdline_completion()
  augroup END

  let b:ddc_cmdline_completion = v:true
endfunction
function s:disable_cmdline_completion() abort
  augroup ddc-cmdline
    autocmd!
  augroup END

  unlet! b:ddc_cmdline_completion

  if '#User#DDCCmdlineLeave'->exists()
    doautocmd <nomodeline> User DDCCmdlineLeave
  endif
endfunction

function ddc#enable_terminal_completion() abort
  call ddc#enable()

  augroup ddc-terminal
    autocmd!
    autocmd TextChangedT * call ddc#on_event('TextChangedT')
  augroup END
endfunction

function ddc#disable() abort
  augroup ddc
    autocmd!
  augroup END
  call s:disable_cmdline_completion()
endfunction

function ddc#on_complete_done(completed_item) abort
  if a:completed_item->empty()
        \ || !a:completed_item->has_key('user_data')
        \ || a:completed_item.user_data->type() != v:t_dict
    return
  endif

  call ddc#denops#_request('onCompleteDone', [a:completed_item])
endfunction

function ddc#syntax_in(groups) abort
  return ddc#syntax#in(a:groups)
endfunction

function ddc#callback(id, payload = v:null) abort
  call ddc#denops#_notify('onCallback', [a:id, a:payload])
endfunction

function ddc#update_items(name, items) abort
  call ddc#denops#_notify('updateItems', [a:name, a:items])
endfunction

function ddc#set_static_import_path() abort
  " Clear current import path.
  call writefile([
        \   '// NOTE: It is dummy module.',
        \   'export const mods = {};',
        \ ], ddc#denops#_mods())

  call ddc#denops#_notify('setStaticImportPath', [])
endfunction

function ddc#on_event(event) abort
  " NOTE: If denops isn't running, stop
  if !ddc#denops#_running()
    return
  endif

  call ddc#denops#_notify('onEvent', [a:event])
endfunction

function ddc#hide(event = "Manual") abort
  call ddc#denops#_notify('hide', [a:event])
endfunction

function ddc#visible() abort
  return ddc#denops#_request('visible', [], v:false)
endfunction

function ddc#get_previewer(item, context={}) abort
  return ddc#denops#_request(
        \   'getPreviewer', [a:item, a:context],
        \   #{
        \     kind: 'empty',
        \   },
        \ )
endfunction

function ddc#register(type, path) abort
  call ddc#denops#_notify('register', [a:type, a:path])
endfunction

function ddc#complete_info() abort
  return '*pum#complete_info'->exists() ?
        \ pum#complete_info() : complete_info()
endfunction

function ddc#skip_next_complete() abort
  if 'g:ddc#_skip_next_complete'->exists()
    let g:ddc#_skip_next_complete += 1
  endif
endfunction
