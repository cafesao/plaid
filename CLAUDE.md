@AGENTS.md

# Claude Code

Everything about the project (setup, commands, how to prove a change, architecture, conventions, traps) is in
`AGENTS.md`, imported above. Keep it there so every agent reads the same thing; this file only holds what is specific
to Claude Code.

- `.claude/` is git-ignored on purpose: local settings, skills and hooks stay out of the repository.
- Designs and plans written with the superpowers skills go to `docs/superpowers/specs/` and `docs/superpowers/plans/`.
