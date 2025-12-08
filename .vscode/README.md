# VS Code Workspace Setup

This workspace is configured to automatically start your development environment when you open the project.

## Automatic Startup (Recommended)

### Option 1: Using Workspace File (Best Experience)

1. **Open the workspace file** instead of the folder:
   ```bash
   code roundtable.code-workspace
   ```

2. **VS Code will automatically**:
   - Start Claude Code with `--dangerously-skip-permissions`
   - Start the development server (`pnpm dev`)
   - Open terminals in split view on the right side

3. **First time setup**: When you first open the workspace, VS Code may ask if you trust the tasks. Click "Allow" to enable auto-run.

### Option 2: Using Folder with Tasks

1. **Open the folder normally**:
   ```bash
   code .
   ```

2. **Allow tasks to run**: When prompted, allow the tasks to run on folder open

3. **Tasks will start automatically**:
   - Claude Code terminal (skip permissions)
   - Development server terminal

## Manual Startup

### Using the Startup Script

Run the included startup script:

```bash
./.vscode/startup.sh
```

This will start both Claude Code and the dev server in the background.

### Using VS Code Tasks

Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux) and run:

- `Tasks: Run Task` → `Start Claude (Skip Permissions)`
- `Tasks: Run Task` → `Start Development Server`

## Terminal Layout

The workspace is configured to:
- Open terminals in the editor area (not bottom panel)
- Display tabs on the right side
- Keep terminals grouped by task (`claude` and `dev` groups)

## Settings Overview

### Workspace Settings (`settings.json`)
- Editor: 2-space tabs, no auto-detection
- TypeScript: Use workspace version, type-only imports
- ESLint: Auto-fix on save, format on save disabled
- Terminal: Editor location, tabs on right

### Tasks (`tasks.json`)
1. **Start Claude (Skip Permissions)**
   - Command: `claude --dangerously-skip-permissions`
   - Auto-runs on folder open
   - Dedicated panel in `claude` group

2. **Start Development Server**
   - Command: `pnpm dev`
   - Auto-runs on folder open
   - Dedicated panel in `dev` group

## Troubleshooting

### Tasks Don't Auto-Run

1. Check if VS Code trusts the workspace:
   - `Cmd+Shift+P` → `Workspaces: Manage Workspace Trust`
   - Enable trust for this workspace

2. Enable auto-run in settings:
   - `Cmd+,` → Search "task auto detect"
   - Set `task.autoDetect` to `on`

3. Check task configuration:
   - `Cmd+Shift+P` → `Tasks: Configure Task`
   - Verify tasks have `"runOptions": { "runOn": "folderOpen" }`

### Claude Command Not Found

Ensure Claude Code CLI is installed and in your PATH:

```bash
which claude
```

If not found, install Claude Code CLI first.

### Development Server Port Conflicts

If port 3000 is already in use:
1. Kill existing processes: `lsof -ti:3000 | xargs kill -9`
2. Or configure a different port in your environment

## Customization

### Change Terminal Layout

Edit `.vscode/settings.json`:

```json
{
  "terminal.integrated.defaultLocation": "editor",  // or "view" for bottom panel
  "terminal.integrated.tabs.location": "right"      // or "left"
}
```

### Disable Auto-Run

Remove or comment out the `runOptions` from tasks in `.vscode/tasks.json`:

```json
// "runOptions": {
//   "runOn": "folderOpen"
// }
```

### Add More Auto-Start Tasks

Edit `.vscode/tasks.json` and add new tasks with `runOptions.runOn: "folderOpen"`

## Quick Reference

| Action | Command |
|--------|---------|
| Open workspace | `code roundtable.code-workspace` |
| Open folder | `code .` |
| Run tasks manually | `Cmd+Shift+P` → `Tasks: Run Task` |
| View task output | `Cmd+Shift+U` → Select task from dropdown |
| Stop task | `Cmd+Shift+P` → `Tasks: Terminate Task` |
| Configure tasks | `Cmd+Shift+P` → `Tasks: Configure Task` |
| Open settings | `Cmd+,` |
| Command palette | `Cmd+Shift+P` |
