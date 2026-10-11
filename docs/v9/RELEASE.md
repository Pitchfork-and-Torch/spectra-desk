# Release checklist

- doctor exits 0
- server tests green
- version 9.0.0 in root, server, client, desktop, and both version.ts files
- Spectra-Desk-Setup-9.0.0.exe and Spectra-Desk-Portable-9.0.0-win64.zip
- SHA256SUMS.txt matches the bits
- signExecutable is false. Say unsigned.
- secret scan clean
- GitHub asset URLs return 200 before any site CTA changes
- catalog count in the README matches toolkitStats()
