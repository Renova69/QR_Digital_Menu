import { themes as prismThemes } from "prism-react-renderer";
import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";

// ─────────────────────────────────────────────────────────────────────────────
// TODO [EDIT BEFORE LIVE]: Replace the values marked below with your own info.
// ─────────────────────────────────────────────────────────────────────────────

const config: Config = {
  title: "Renova Docs",
  tagline: "Everything you need to know about the Renova platform.",
  favicon: "img/favicon.ico",

  future: {
    v4: true,
  },

  // [EDIT BEFORE LIVE] Set to your custom docs domain, e.g. https://docs.yourdomain.com
  // or your GitHub Pages URL, e.g. https://YOUR_GITHUB_USERNAME.github.io
  url: "https://renova69.github.io",

  // [EDIT BEFORE LIVE] If deploying to GitHub Pages under a repo name (not a user/org root),
  // set this to '/<repo-name>/', e.g. '/QR_Digital_Menu-main/'
  // If using a custom domain (docs.yourdomain.com), set to '/'
  baseUrl: "/QR_Digital_Menu-main/",

  // [EDIT BEFORE LIVE] Your GitHub username / org name
  organizationName: "renova69",

  // [EDIT BEFORE LIVE] Your repository name
  projectName: "QR_Digital_Menu-main",

  // GitHub Pages uses the gh-pages branch by default
  deploymentBranch: "gh-pages",
  trailingSlash: false,

  onBrokenLinks: "warn",
  onBrokenMarkdownLinks: "warn",

  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  presets: [
    [
      "classic",
      {
        docs: {
          sidebarPath: "./sidebars.ts",
          routeBasePath: "/", // Docs at root path, no /docs/ prefix
          // [EDIT BEFORE LIVE] Replace with your own GitHub repo URL
          editUrl: "https://github.com/renova69/QR_Digital_Menu-main/tree/main/apps/docs/",
        },
        blog: false, // Blog disabled — docs-only site
        theme: {
          customCss: "./src/css/custom.css",
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    colorMode: {
      defaultMode: "light",
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: "Renova Docs",
      logo: {
        alt: "Renova Logo",
        src: "img/logo.svg",
      },
      items: [
        {
          type: "docSidebar",
          sidebarId: "guidesSidebar",
          position: "left",
          label: "Guides",
        },
        {
          type: "docSidebar",
          sidebarId: "adminSidebar",
          position: "left",
          label: "Admin",
        },
        // [EDIT BEFORE LIVE] Replace href with your actual app URL
        {
          href: "https://qr-digital-menu-ivory.vercel.app/",
          label: "Back to App",
          position: "right",
        },
        {
          href: "https://github.com/renova69/QR_Digital_Menu-main",
          label: "GitHub",
          position: "right",
        },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Guides",
          items: [
            { label: "Getting Started", to: "/getting-started" },
            { label: "Digital Menu", to: "/guides/menu" },
            { label: "QR Codes", to: "/guides/qr-codes" },
          ],
        },
        {
          title: "Restaurant Management",
          items: [
            { label: "POS System", to: "/guides/pos" },
            { label: "Bookings", to: "/guides/bookings" },
            { label: "Staff & Roles", to: "/guides/staff" },
          ],
        },
        {
          title: "Legal",
          items: [
            // [EDIT BEFORE LIVE] Replace with your actual domain
            { label: "Terms of Service", href: "https://qr-digital-menu-ivory.vercel.app/terms" },
            { label: "Privacy Policy", href: "https://qr-digital-menu-ivory.vercel.app/privacy" },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Renova. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
