-- https://github.com/hrsh7th/vim-gindent/blob/ca389426eb111507e56c792894cf3299b6439ced/lua/gindent/syntax.lua
local M =  {}

function M.get_treesitter_syntax_groups(cursor)
  local bufnr = vim.api.nvim_get_current_buf()
  local highlighter = vim.treesitter.highlighter.active[bufnr]
  if not highlighter then
    return {}
  end

  local contains = function(node, cursor)
    local row_s, col_s, row_e, col_e = node:range()
    local contains = true
    contains = contains and (row_s < cursor[1] or (row_s == cursor[1] and col_s <= cursor[2]))
    contains = contains and (cursor[1] < row_e or (row_e == cursor[1] and cursor[2] < col_e))
    return contains
  end

  local names = {}
  highlighter.tree:for_each_tree(function(tstree, ltree)
    if not tstree then
      return
    end

    local root = tstree:root()
    if contains(root, cursor) then
      local query = highlighter:get_query(ltree:lang()):query()
      for id, node in query:iter_captures(root, bufnr, cursor[1], cursor[1] + 1) do
        if contains(node, cursor) then
          local name = vim.treesitter.highlighter.hl_map[query.captures[id]]
          if name then
            table.insert(names, name)
          end
        end
      end
    end
  end)
  return names
end

return M
