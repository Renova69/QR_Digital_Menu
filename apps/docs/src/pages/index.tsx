import React from "react";
import Layout from "@theme/Layout";
import Link from "@docusaurus/Link";
import Translate, { translate } from "@docusaurus/Translate";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import useBaseUrl from "@docusaurus/useBaseUrl";

export default function Home(): JSX.Element {
  const { siteConfig } = useDocusaurusContext();
  const logoUrl = useBaseUrl("/img/renova-logo.png");

  return (
    <Layout
      title={siteConfig.title}
      description={translate({
        id: "homepage.description",
        message: "Practical guides for setting up and operating Renova.",
      })}
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
            <Translate id="homepage.hero.description">
              Set up your menu, QR codes, ordering, bookings, staff access, and
              restaurant operations.
            </Translate>
          </p>
          <Link
            className="button button--primary button--lg"
            to="/getting-started"
          >
            <Translate id="homepage.cta">Get started</Translate>
          </Link>
        </section>
      </main>
    </Layout>
  );
}
