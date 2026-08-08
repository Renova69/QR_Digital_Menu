# Renova Documentation

The public product documentation for Renova, built with Docusaurus and deployed as a separate Vercel project from `apps/docs`.

## Installation

```bash
npm install
```

## Local Development

```bash
npm run start
```

The development server runs at `http://localhost:3002`.

## Build

```bash
npm run typecheck
npm run build
```

The first command checks the TypeScript configuration. The second validates internal links and generates the static site in `build`.

The build uses Docusaurus's supported `--no-minify` mode because the default minifier is not reliable in the current toolchain. This trades a larger static bundle for deterministic local and CI builds.

## Vercel Deployment

Create a separate Vercel project for this repository and set its **Root Directory** to `apps/docs`. The checked-in `vercel.json` supplies the framework, build command, and output directory.

Production URL: <https://qr-digital-menu-docs.vercel.app>

From the monorepo root, the equivalent commands are:

```bash
npm run docs:dev
npm run docs:build
```
