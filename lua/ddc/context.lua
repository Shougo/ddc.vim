-- https://github.com/hrsh7th/nvim-cmp/blob/ad3c1adbc365a3b70d8b6e1e90946d98eeacf20f/lua/cmp/config/context.lua
local context = {}

---Get cursor treesitter nodes
---@param
---@return treesitter node table
context.treesitter_nodes = function()
  local highlighter = require('vim.treesitter.highlighter')
  local ts_utils = require('nvim-treesitter.ts_utils')
  local buf = vim.api.nvim_get_current_buf()

  local row, col = unpack(vim.api.nvim_win_get_cursor(0))
  row = row - 1
  if vim.api.nvim_get_mode().mode == 'i' then
    col = col - 1
  end

  local self = highlighter.active[buf]
  if not self then
    return false
  end

  local node_types = {}

  self.tree:for_each_tree(function(tstree, tree)
    if not tstree then
      return
    end

    local root = tstree:root()
    local root_start_row, _, root_end_row, _ = root:range()
    if root_start_row > row or root_end_row < row then
      return
    end

    local query = self:get_query(tree:lang())
    if not query:query() then
      return
    end

    local iter = query:query():iter_captures(root, self.bufnr, row, row + 1)
    for _, node, _ in iter do
      if ts_utils.is_in_node_range(node, row, col) then
        table.insert(node_types, node:type())
      end
    end
  end, true)

  return node_types
end

return context
