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
npm run build
```

This command type-checks and generates static content in `build`.

## Vercel Deployment

Create a separate Vercel project for this repository and set its **Root Directory** to `apps/docs`. The checked-in `vercel.json` supplies the framework, build command, and output directory.

Production URL: <https://qr-digital-menu-docs.vercel.app>

From the monorepo root, the equivalent commands are:

```bash
npm run docs:dev
npm run docs:build
```
