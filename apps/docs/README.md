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

The docs launcher starts one local Docusaurus server per locale on loopback
ports 3002–3004. From the monorepo root, the normal `npm run dev` command also
starts these servers and Vite exposes them through the same subpaths used in
production:

- `http://localhost:3001/docs/`
- `http://localhost:3001/docs/bg/`
- `http://localhost:3001/docs/ro/`

Replace `localhost` with the development machine's LAN address to test from
another device, for example `http://192.168.0.35:3001/docs/`.

## Build

```bash
npm run typecheck
npm run build
npm run verify:deployment
```

The first command checks the TypeScript configuration. The second validates
internal links and generates the static site in `build`. Run the third command
from a full monorepo checkout to verify the frontend proxy, generated subpath
routes, and Content Security Policy integration.

The build uses Docusaurus's supported `--no-minify` mode because the default minifier is not reliable in the current toolchain. This trades a larger static bundle for deterministic local and CI builds.

## Vercel Deployment

Create a separate Vercel project for this repository and set its **Root Directory** to `apps/docs`. The checked-in `vercel.json` supplies the framework, build command, and output directory.

The standalone project remains the deployment origin, while the frontend
project exposes the public documentation at:

<https://qr-digital-menu-ivory.vercel.app/docs/>

From the monorepo root, the equivalent commands are:

```bash
npm run docs:dev
npm run docs:build
```
