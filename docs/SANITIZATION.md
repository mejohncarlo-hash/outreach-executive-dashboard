# Portfolio sanitization

This repository is a fresh, curated source snapshot. No original Git history is imported. The source project was not a Git repository at the time this copy was prepared.

Included code has been adapted as follows:

- Replaced all fallback client, website, placement, and activity records with fictional examples, synthetic metrics, and reserved `example.com` domains.
- Replaced named internal roles with Administrator, Coordinator, and Executive labels in code, UI, and tests.
- Removed real email addresses, Notion page and data-source identifiers, workspace links, and Cloudflare database identifiers.
- Replaced deployment configuration with a separately named example and an invalid placeholder database binding.
- Excluded local databases, build output, logs, caches, screenshots, spreadsheets, transfer notes, credentials, environment files, and original project history.
- Retained public provider API endpoints and the employer-authorized live-tool link for project context.

The integration code preserves the original approach for review. A deployment needs new configuration and an independent security review. Example role emails in the Worker are placeholders, not credentials. No actual account passwords or session secrets are provided.

`npm run check:sanitization` checks common secret formats, non-example email addresses, embedded workspace URLs, and disallowed artifact files. It is a focused guardrail, not proof that every possible sensitive string or security issue has been identified.
