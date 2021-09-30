let s:suite = themis#suite('pum')
let s:assert = themis#helper('assert')

function! s:suite.before_each() abort
endfunction

function! s:suite.after_each() abort
  call pum#close()
endfunction

function! s:suite.open() abort
  call pum#open(1, [{'word': 'foo'}, {'word': 'bar'}])
endfunction

function! s:suite.select_relative() abort
  call pum#open(1, [{'word': 'foo'}, {'word': 'bar'}])

  call pum#select_relative(1)
  call pum#select_relative(1)

  call s:assert.equals(pum#_get().cursor, 2)

  call pum#select_relative(-1)
  call pum#select_relative(-1)

  call s:assert.equals(pum#_get().cursor, 0)
endfunction

function! s:suite.insert_relative() abort
  call pum#open(1, [{'word': 'foo'}, {'word': 'bar'}])

  call pum#select_relative(1)
  call pum#select_relative(1)

  call s:assert.equals(pum#_get().cursor, 2)

  call pum#select_relative(-1)
  call pum#select_relative(-1)

  call s:assert.equals(pum#_get().cursor, 0)
endfunction
