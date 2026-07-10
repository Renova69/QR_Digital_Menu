# Graphify Wiki

This directory used to contain generated community wiki pages. The installed
Graphify CLI no longer exposes a wiki generation command, so those pages were
stale and should not be treated as source of truth.

Use these generated artifacts instead:

- [Graph Report](../GRAPH_REPORT.md) - current freshness, counts, and community navigation.
- [Graph JSON](../graph.json) - machine-readable graph data.
- [Interactive Graph](../index.html) - browser visualization when generated locally.

Maintenance:

- Run `graphify update .` after code changes.
- Treat `GRAPH_REPORT.md` as the source of truth for freshness and graph counts.
