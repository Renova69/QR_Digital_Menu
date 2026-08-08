import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

const sidebars: SidebarsConfig = {
  guidesSidebar: [
    {
      type: "doc",
      id: "getting-started",
      label: "🚀 Getting Started",
    },
    {
      type: "category",
      label: "Digital Menu",
      collapsed: false,
      items: [
        "guides/menu/overview",
        "guides/menu/adding-items",
        "guides/menu/categories",
        "guides/menu/images",
        "guides/menu/allergens",
      ],
    },
    {
      type: "category",
      label: "QR Codes",
      items: [
        "guides/qr-codes/generating",
        "guides/qr-codes/printing",
        "guides/qr-codes/customizing",
      ],
    },
    {
      type: "category",
      label: "Online Ordering",
      items: [
        "guides/ordering/how-it-works",
        "guides/ordering/checkout",
        "guides/ordering/payments",
      ],
    },
    {
      type: "category",
      label: "Bookings & Reservations",
      items: [
        "guides/bookings/setup",
        "guides/bookings/managing",
      ],
    },
    {
      type: "category",
      label: "Customer Feedback",
      items: [
        "guides/feedback/collecting",
      ],
    },
  ],

  adminSidebar: [
    {
      type: "category",
      label: "Restaurant Dashboard",
      collapsed: false,
      items: [
        "admin/dashboard/overview",
        "admin/dashboard/settings",
      ],
    },
    {
      type: "category",
      label: "POS System",
      items: [
        "admin/pos/overview",
        "admin/pos/taking-orders",
        "admin/pos/kitchen-view",
      ],
    },
    {
      type: "category",
      label: "Staff & Roles",
      items: [
        "admin/staff/roles",
        "admin/staff/inviting",
      ],
    },
    {
      type: "category",
      label: "Billing & Subscription",
      items: [
        "admin/billing/plans",
        "admin/billing/invoices",
      ],
    },
  ],
};

export default sidebars;
