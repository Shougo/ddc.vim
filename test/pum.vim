let s:suite = themis#suite('pum')
let s:assert = themis#helper('assert')

function! s:suite.before_each() abort
  let g:temp = tempname()
endfunction

function! s:suite.after_each() abort
  call delete(g:temp)
endfunction

function! s:suite.open() abort
  call ddc#pum#open(1, [{'word': 'foo'}, {'word': 'bar'}])
endfunction
