import React from "react";
import Layout from "@theme/Layout";
import Link from "@docusaurus/Link";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import useBaseUrl from "@docusaurus/useBaseUrl";

export default function Home(): JSX.Element {
  const { siteConfig } = useDocusaurusContext();
  const logoUrl = useBaseUrl("/img/renova-logo.png");

  return (
    <Layout
      title={siteConfig.title}
      description="Practical guides for setting up and operating Renova."
    >
      <main className="container margin-vert--xl">
        <section
          style={{
            maxWidth: 760,
            margin: "0 auto",
            padding: "4rem 1.5rem",
            textAlign: "center",
          }}
        >
          <img
            src={logoUrl}
            alt="Renova"
            width="112"
            height="112"
            style={{ marginBottom: "1.5rem" }}
          />
          <h1>{siteConfig.title}</h1>
          <p style={{ fontSize: "1.25rem", marginBottom: "2rem" }}>
            Set up your menu, QR codes, ordering, bookings, staff access, and
            restaurant operations.
          </p>
          <Link
            className="button button--primary button--lg"
            to="/docs/getting-started"
          >
            Get started
          </Link>
        </section>
      </main>
    </Layout>
  );
}
