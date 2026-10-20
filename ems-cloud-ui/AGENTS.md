# figma-make-app

最新纠正优先：场站页面布局、信息密度、字段、按钮和交互按 QUDEOX 已核验实屏复刻，Tabler/shadcn 仅用于控件皮肤。mock 落新库并由 API 读取；保留权限及 main 原流图/3D 图。按根目录 OpenSpec 场站重做计划逐项验收。不参考 Figma。下方旧视觉约定不得用于重新设计布局。

本分支以根 AGENTS.md 的 2026-10-18 用户最新指令为准：业务参考 QUDEOX 网站和核实清单，视觉以 Tabler（preview.tabler.io）和 shadcn blocks（ui.shadcn.com/blocks）为基础，不再照搬 QUDEOX UI，也不读取或参考 Figma。下方 Figma 规则保留为历史说明，不适用于本分支后续页面改造。

## Figma Design Source

Follow the repository root `AGENTS.md` design rules. Before every page styling/layout change, inspect the relevant current design in [Enerlution 全平台基础版 V1](https://www.figma.com/design/Y0KMYFvalDXgSPnVZ5zG39/?node-id=4-3). When duplicate designs exist, prefer the version whose title contains “克制风格”. Record the chosen node IDs and verify the rendered implementation against those designs.

React + Vite + Tailwind CSS project running inside Figma Make.

## Development Server

A Vite development server is **already running** on `$PORT` (default 8443). You don't need to start it manually.

- Preview URL: The user can access the running app through the preview panel
- Hot reload: Changes to source files are reflected immediately

## Project Structure

This is the canonical project structure. Start with task-relevant files below. Only follow imports or inspect other files when required, when a documented path is missing, or when the repository contradicts this guide.

- `src/main.tsx` - React entrypoint; imports `src/index.css` and mounts `src/App.tsx` into the `#root` element
- `src/App.tsx` - Primary application component and the usual starting point for UI work
- `src/index.css` - Global CSS entrypoint and Tailwind CSS v4 import
- `index.html` - Vite HTML shell containing the `#root` element and loading `src/main.tsx`
- `package.json` - Project dependencies and the Vite build, development, preview, and formatting scripts
- `vite.config.ts` - Vite configuration with React, Tailwind CSS v4, and Figma Make plugins plus the `@` alias for `src`
- `.mise.toml` - Toolchain versions for Node.js and pnpm

## Dependencies

- Runtime: React 19 and React DOM 19
- Styling: Tailwind CSS v4 with the `@tailwindcss/vite` plugin
- Build tooling: Vite 8, TypeScript 5.7, and `@vitejs/plugin-react`
- Formatting: oxfmt

## Styling

This project uses **Tailwind CSS v4** through the `@tailwindcss/vite` plugin configured in `vite.config.ts`. `src/index.css` imports Tailwind with `@import 'tailwindcss';`. Use Tailwind utility classes directly in JSX and put global CSS or Tailwind v4 theme customization in `src/index.css`. This scaffold does not need a Tailwind config file or PostCSS config.

`src/main.tsx` imports `src/index.css`, so global font wiring belongs in `src/index.css`. Keep CSS `@import` statements first, then add any `@font-face` rules and font-family defaults there.
