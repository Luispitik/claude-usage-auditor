# Branch protection checklist (main)

Apply these settings in GitHub repository settings:

- Protect branch: `main`
- Require pull request before merging
- Require status checks to pass before merging:
  - `test (18)`
  - `test (20)`
  - `test (22)`
  - `test-windows`
  - `gitleaks`
- Require branches to be up to date before merging
- Include administrators (recommended)
