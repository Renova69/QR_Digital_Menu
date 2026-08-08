import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';

export default function Home(): JSX.Element {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title={`Welcome to ${siteConfig.title}`}
      description="Documentation for Renova">
      <main style={{display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '50vh'}}>
        <h1>Welcome to Renova Docs</h1>
        <p>Find all the guides and tutorials you need.</p>
        <Link
          className="button button--secondary button--lg"
          to="/docs/getting-started">
          Go to Guides 🚀
        </Link>
      </main>
    </Layout>
  );
}
