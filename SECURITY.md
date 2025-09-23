# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability within this project, please report it privately to the repository owner, Remo Prinz, at [remo@jassguru.ch](mailto:remo@jassguru.ch). Please do not disclose it publicly until it has been addressed.

## General Security Guidelines

- **Secrets Management**: Do not commit secrets (API keys, private keys, service account files) to the repository. All sensitive information must be managed via environment variables.
- **API Key Restrictions**: Firebase Web API keys must be restricted to exact referrer domains (e.g., `https://jassguru.ch/*`, `https://localhost:3000/*`).
- **Service Account Keys**: Service account keys are for server-side use only (e.g., Firebase Cloud Functions) and must never enter the repository.
- **Dependency Security**: Regularly update dependencies to mitigate known vulnerabilities. Automated tools like Dependabot are used for this purpose.
- **Code Scanning**: Automated code scanning (e.g., GitHub CodeQL) is used to identify potential security flaws and ensure code quality.

## Recent Security Measures Implemented

- Removed historical secrets from Git history and strengthened `.gitignore` patterns to prevent future leaks.
- Rotated compromised service account keys and restricted Firebase Web API keys to authorized domains.
- Scripts now explicitly require environment variables for API keys and do not hardcode secrets.
- Implemented a CI check to prevent accidental pushes of duplicate files (e.g., `file 2.tsx`), which could indicate mismanaged backups or sensitive data copies.
