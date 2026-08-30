import { themes as prismThemes } from "prism-react-renderer";
import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";

const config: Config = {
  title: "Renova Docs",
  tagline: "Everything you need to know about the Renova platform.",
  favicon: "img/favicon.ico",

  future: {
    v4: true,
  },

  url: "https://qr-digital-menu-ivory.vercel.app",
  baseUrl: "/docs/",
  organizationName: "renova69",
  projectName: "QR_Digital_Menu",
  trailingSlash: false,

  onBrokenLinks: "throw",

  markdown: {
    hooks: {
      onBrokenMarkdownLinks: "throw",
    },
  },

  i18n: {
    defaultLocale: "en",
    locales: ["en", "bg", "ro"],
    localeConfigs: {
      en: { label: "English" },
      bg: { label: "Български" },
      ro: { label: "Română" },
    },
  },

  presets: [
    [
      "classic",
      {
        docs: {
          routeBasePath: "/",
          sidebarPath: "./sidebars.ts",
        },
        blog: false, // Blog disabled — docs-only site
        theme: {
          customCss: "./src/css/custom.css",
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: "img/renova-logo.png",
    colorMode: {
      defaultMode: "light",
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: "Renova Docs",
      logo: {
        alt: "Renova Logo",
        src: "img/renova-logo.png",
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
        {
          type: "docSidebar",
          sidebarId: "apiSidebar",
          position: "left",
          label: "API",
        },
        {
          href: "https://qr-digital-menu-ivory.vercel.app/",
          label: "Back to App",
          position: "right",
        },
        {
          type: "localeDropdown",
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
            { label: "Digital Menu", to: "/guides/menu/overview" },
            { label: "QR Codes", to: "/guides/qr-codes/generating" },
          ],
        },
        {
          title: "Restaurant Management",
          items: [
            { label: "POS System", to: "/admin/pos/overview" },
            { label: "Bookings", to: "/guides/bookings/setup" },
            { label: "Staff & Roles", to: "/admin/staff/roles" },
          ],
        },
        {
          title: "Legal",
          items: [
            {
              label: "Terms of Service",
              href: "https://qr-digital-menu-ivory.vercel.app/terms",
            },
            {
              label: "Privacy Policy",
              href: "https://qr-digital-menu-ivory.vercel.app/privacy",
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Renova. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.vsLight,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
