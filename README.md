# SecurePass

A private, client-side password generator. Your master password + a domain name produces a unique, strong password — deterministically. Nothing is stored on any server. Nothing leaves your device.

## How it works

1. Enter your **master password**
2. Enter a **domain name** (e.g. `gmail-personal`, `github-work`)
3. Choose a **password length**
4. Click **Generate**

The same inputs always produce the same password, so you never need to store passwords anywhere. Just remember your master password and the names you used.

SecurePass uses **PBKDF2 with 100,000 iterations** via the Web Crypto API — the same cryptographic primitive used by 1Password and Bitwarden for key derivation.

## Features

- Deterministic password generation — nothing to sync, nothing to back up
- PIN and biometric app protection
- Domain history with smart categorization
- Integrated breach checking
- PWA support — install to your home screen
- Works offline — no network required
- Zero data collection — no servers, no tracking, no cookies

## Project structure

```
index.html    — Semantic HTML
styles.css    — Design system (warm monochrome, Geist Sans, Phosphor Icons)
app.js        — All application logic
sw.js         — Service worker for offline support
```

## Development

No build tools required. Open `index.html` in any modern browser.

## License

MIT
