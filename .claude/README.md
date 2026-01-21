# Claude Code Hooks Configuration

This directory contains Claude Code hooks that automate code quality and provide notifications during development.

## 🔧 Configured Hooks

### 1. Automatic ESLint Formatting (`lint-on-change.sh`)

**Triggers**: After `Write`, `Edit`, or `MultiEdit` tool use on TypeScript/JavaScript files

**Features**:
- Automatically runs `pnpm lint:fix` on modified files
- Runs TypeScript type checking for `.ts`/`.tsx` files
- Blocks execution if ESLint errors or TypeScript errors are found
- Skips non-lintable files and directories (node_modules, .next, etc.)

**Supported Extensions**: `.ts`, `.tsx`, `.js`, `.jsx`

**Blocked Patterns**:
- `/node_modules/`, `/dist/`, `/build/`
- `/.claude/`, `/migrations/`
- `.d.ts`, `cloudflare-env.d.ts`

### 2. Task Completion Notifications (`notify-completion.sh`)

**Triggers**:
- After `Task` tool use (subagent completion)
- On `Stop` event (main Claude completion)
- On `SubagentStop` event

**Features**:
- Cross-platform notification sound (macOS Ping, Linux system sounds, Windows beep)
- Desktop notifications (macOS osascript, Linux notify-send, Windows toast)
- Visual feedback in Claude Code transcript

**Notification Types**:
- 🎯 **Subagent Task Complete**: When a specialized agent finishes
- 🤖 **Agent Task Complete**: When any agent completes
- 🤖 **Claude Task Complete**: When main Claude finishes

## 🎵 Sound Configuration

### macOS
Uses built-in `/System/Library/Sounds/Ping.aiff`

### Linux
Tries multiple options:
1. `paplay` with ALSA sounds
2. `aplay` with ALSA sounds
3. `speaker-test` fallback

### Windows
Uses PowerShell `[console]::beep(800,300)`

### Fallback
Prints bell character `\a` if system-specific methods fail

## 📱 Desktop Notifications

### macOS
```bash
osascript -e 'display notification "message" with title "title"'
```

### Linux
```bash
notify-send "title" "message"
```

### Windows
PowerShell toast notifications via Windows Runtime APIs

## 🚀 Usage

The hooks are automatically active when you use Claude Code in this project. You'll see:

1. **Real-time linting**: Files are automatically formatted when you modify them
2. **Type checking**: TypeScript errors are caught immediately
3. **Audio notifications**: Hear when agents complete tasks
4. **Visual notifications**: Desktop notifications for task completion

## 🛠️ Customization

### Modify Notification Sound

Edit `.claude/hooks/notify-completion.sh` and update the sound file paths:

```bash
# macOS - change to your preferred sound
afplay "/System/Library/Sounds/YourSound.aiff" 2>/dev/null

# Linux - add your preferred sound file
paplay "/path/to/your/sound.wav" 2>/dev/null
```

### Adjust ESLint Behavior

Edit `.claude/hooks/lint-on-change.sh` to:
- Change timeout values
- Modify file patterns to lint
- Adjust skip patterns
- Change ESLint command options

### Hook Timing

Edit `.claude/settings.json` to modify:
- Hook timeouts
- Tool matchers
- Hook triggers

## 🔍 Debugging

Run Claude Code with debug mode to see hook execution:

```bash
claude --debug
```

View hook execution in transcript mode (Ctrl-R) to see:
- Which hooks are running
- Success/failure status
- Output messages

## 📁 File Structure

```
.claude/
├── settings.json              # Hook configuration
├── hooks/
│   ├── notify-completion.sh   # Notification bash script
│   └── lint-on-change.sh     # ESLint automation bash script
└── README.md                 # This documentation
```

## ⚡ Performance Notes

- Hooks run in parallel when multiple match
- 60-second timeout for linting operations
- 10-second timeout for notifications
- Automatic deduplication of identical commands

## 🔒 Security

- Scripts only execute on file modifications in your project
- No network access required for core functionality
- Desktop notifications require appropriate system permissions
- All scripts are locally contained and version controlled