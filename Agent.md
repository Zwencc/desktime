# Agent Project Notes

## Workflow Preferences

- Do not run Git-related checks or operations by default, including `git diff`, `git status`, commits, pushes, pulls, or branch operations.
- Only perform Git actions when the user explicitly asks for them.
- After code changes, run static validation only, such as type checks, linting, formatting checks, or production builds when appropriate.
- Do not perform dynamic/runtime verification by default. Mention the command or steps for the user to verify manually at the end.
