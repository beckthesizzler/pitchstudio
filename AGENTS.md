# PitchStudio

**Read [PS-NOTES.md](PS-NOTES.md) first.** It holds the decisions, rules, current state and past mistakes. Code now goes through GitHub only; Figma Make is retired and must not be published from.

React + Vite + Tailwind CSS project running inside Figma Make.

## Development Server

A Vite development server is always running on `$PORT` (default 8443). Source changes
are reflected through hot reload.

## Key Files

- `src/main.tsx` - Browser entry point
- `vite.figma.config.ts` - Figma Make wrapper configuration
- `.mise.toml` - Toolchain versions

## Project Guidelines

Read and always follow the instructions in the [project guidelines](guidelines/Guidelines.md) unless the user requests otherwise.
