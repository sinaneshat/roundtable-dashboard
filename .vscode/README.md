# VS Code Workspace Setup

This workspace is configured to automatically start your development environment when you open the project.

## Automatic Startup (Recommended)

### Option 1: Using Workspace File (Best Experience)

1. **Open the workspace file** instead of the folder:
   ```bash
   code roundtable.code-workspace
   ```

2. **VS Code will automatically**:
   - **Install dependencies** (`pnpm install`)
   - **Fetch latest changes** from all remote branches
   - **Merge `origin/preview`** into your current branch (auto-merge, no conflicts)
   - Start Claude Code with `--dangerously-skip-permissions`
   - Start the development server (`pnpm dev`)
   - Open terminals in split view on the right side

3. **First time setup**: When you first open the workspace, VS Code may ask if you trust the tasks. Click "Allow" to enable auto-run.

4. **Git Sync Behavior**:
   - If merge conflicts occur, you'll see a warning message
   - You can resolve conflicts manually and continue
   - The startup script (`.vscode/startup.sh`) has interactive prompts for uncommitted changes

### Option 2: Using Folder with Tasks

1. **Open the folder normally**:
   ```bash
   code .
   ```

2. **Allow tasks to run**: When prompted, allow the tasks to run on folder open

3. **Tasks will start automatically**:
   - Install dependencies (`pnpm install`)
   - Git sync (fetch and merge from `origin/preview`)
   - Claude Code terminal (skip permissions)
   - Development server terminal

## Manual Startup

### Using the Startup Script

Run the included startup script:

```bash
./.vscode/startup.sh
```

This will:
1. Install dependencies (`pnpm install`)
2. Fetch all remote branches
3. Attempt to merge `origin/preview` (with interactive prompts for uncommitted changes)
4. Start Claude Code with skip permissions
5. Start the development server

The script has safety features:
- Prompts before stashing uncommitted changes
- Handles merge conflicts gracefully
- Shows recent commits after sync

### Using VS Code Tasks

Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux) and run:

- `Tasks: Run Task` → `Install Dependencies`
- `Tasks: Run Task` → `Git Sync: Fetch and Merge Preview`
- `Tasks: Run Task` → `Start Claude (Skip Permissions)`
- `Tasks: Run Task` → `Start Development Server`
- `Tasks: Run Task` → `Manual: Git Status` (check status and recent commits)
- `Tasks: Run Task` → `Manual: Stop All Services` (kill port 3000)

## Terminal Layout

The workspace is configured to:
- Open terminals in the editor area (not bottom panel)
- Display tabs on the right side
- Keep terminals grouped by task (`setup`, `git`, `claude`, and `dev` groups)

## Settings Overview

### Workspace Settings (`settings.json`)
- Editor: 2-space tabs, no auto-detection
- TypeScript: Use workspace version, type-only imports
- ESLint: Auto-fix on save, format on save disabled
- Terminal: Editor location, tabs on right

### Tasks (`tasks.json`)
1. **Install Dependencies**
   - Command: `pnpm install`
   - Auto-runs on folder open (runs FIRST, before all other tasks)
   - Shared panel in `setup` group
   - Ensures dependencies are up-to-date

2. **Git Sync: Fetch and Merge Preview**
   - Command: `git fetch --all && git merge origin/preview --no-edit`
   - Auto-runs on folder open (after dependency install)
   - Shared panel in `git` group
   - Handles merge conflicts gracefully
   - Depends on Install Dependencies task

3. **Start Claude (Skip Permissions)**
   - Command: `claude --dangerously-skip-permissions`
   - Auto-runs on folder open (after git sync)
   - Dedicated panel in `claude` group
   - Depends on Git Sync task

4. **Start Development Server**
   - Command: `pnpm dev`
   - Auto-runs on folder open (after git sync)
   - Dedicated panel in `dev` group
   - Depends on Git Sync task

5. **Manual: Git Status**
   - Command: `git status && git log -3 --oneline`
   - Manual execution only
   - Shows current status and recent commits

6. **Manual: Stop All Services**
   - Command: `lsof -ti:3000 | xargs kill -9`
   - Manual execution only
   - Kills all services on port 3000

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
3. Or use the manual task: `Tasks: Run Task` → `Manual: Stop All Services`

### Git Sync Issues

**Merge Conflicts**:
If the auto-merge from `origin/preview` fails:
1. The task will show a warning message
2. Resolve conflicts manually: `git status` to see conflicting files
3. After resolving: `git add .` then `git merge --continue`
4. Or abort the merge: `git merge --abort`

**Uncommitted Changes**:
- VS Code tasks will attempt to merge even with uncommitted changes (may fail)
- Use `.vscode/startup.sh` instead - it prompts to stash changes first
- Or manually stash: `git stash push -m "work in progress"`

**No Preview Branch**:
If `origin/preview` doesn't exist, the task will show a warning but continue starting Claude and dev server.

**Skip Git Sync**:
To disable auto-sync temporarily:
1. `Cmd+Shift+P` → `Tasks: Configure Task`
2. Remove `"runOptions": { "runOn": "folderOpen" }` from "Git Sync" task
3. Or close the terminal panel showing the git sync warning

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
