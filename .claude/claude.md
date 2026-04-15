# Claude Code Guidelines for Token Efficiency & Indexing

## 🎯 Token Optimization Strategy

### 1. Smart File Reading
- **Use `limit` parameter**: When reading large files, specify `limit` in Read tool to fetch only needed sections
- **Use `offset` parameter**: Jump to relevant line ranges with offset instead of reading entire files
- **Read once, use many times**: Cache important file structure information mentally before making changes
- **Prefer Grep over Read**: For searching specific patterns or symbols, use Grep with content mode

### 2. Efficient Code Exploration
- **Use Glob first**: Before reading files, use `glob` to find relevant files by pattern
- **Use Grep for searches**: 
  - For searching code patterns: `grep --pattern` with type/glob filters
  - Use `head_limit` to limit results to top N matches
  - Use `output_mode: "files_with_matches"` for file paths only (lighter weight)
  - Use `output_mode: "count"` to find file with most matches before deep dive

### 3. Minimize Tool Call Waste
- **Batch independent operations**: Make multiple independent tool calls in one message block
- **Chain sequential operations**: Use && in bash for dependent commands instead of multiple tool calls
- **Avoid re-reading**: Don't verify changes by re-reading files you just edited (tool errors would have caught issues)

## 📊 Project Structure Quick Reference

### Key Directories
- `/src` - Main source code
- `/public` - Static assets
- `/components` - React components
- `/pages` - Page components

### Recent Work Context
- Last commit focused on backtest chart entry/exit arrows
- Paper trading signal handling recently updated
- Fed liquidity data integration in progress

## ⚡ Quick Wins for Token Reduction

1. **Ask before exploring**: If unclear what to modify, ask for specifics rather than wide exploration
2. **Read git history for context**: Use `git log --oneline -n 10` or `git show COMMIT` instead of asking
3. **Check tests first**: Tests often document expected behavior and edge cases
4. **Use grep with context flags**: `-C 2` shows context without full file read

## 🔍 Indexing Best Practices

### When Indexing Code
- Use separate `index.ts` or `index.js` files for exports
- Keep barrel exports minimal - only export what's needed
- Document public APIs with clear names

### Searching the Project
```bash
# Find component definitions
grep -r "export.*Component\|function.*Component" --include="*.ts" --include="*.tsx"

# Find by pattern with limited results
grep --pattern="interface.*Config" --head_limit=10
```

## 🚀 Work Approach

### For Bugfixes
1. Search for related test files first
2. Grep for error patterns/keywords mentioned in bug report
3. Minimal file reads - only affected code sections
4. Run tests to validate

### For Features
1. Check if similar feature exists (grep for patterns)
2. Find relevant component/module with glob
3. Read one file at a time, understand before modifying
4. Test incrementally

### For Refactoring
1. Search for all usages first (grep)
2. Verify impact scope with test coverage
3. Change implementation, not just cosmetics
4. Keep diff focused

## 🛡️ Token Budget Awareness
- **Context limit**: ~200k tokens
- **Action items**: Mark completed tasks immediately (prevent redundant work)
- **Large operations**: Break into focused chunks with clear goals
- **Memory system**: Use for cross-session insights, not current-task state

## 📝 Communication Style
- Be concise in responses - no trailing summaries
- Use file_path:line_number format for references
- Provide specific grep/glob patterns when suggesting searches
- Explain why a tool choice was made when it's non-obvious

---

**Last Updated**: 2026-04-14
**Model**: Claude Haiku 4.5
**Focus**: Token efficiency, smart indexing, focused exploration