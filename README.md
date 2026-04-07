# a11y-crawler

An automated accessibility auditing tool that discovers all pages and interactive elements in websites or web applications, then runs [axe-core](https://github.com/dequelabs/axe-core) WCAG 2.1 AA checks on every discoverable states and pages. 

## Why This Exists

Modern web applications built with frameworks like React can have dozens or hundreds of pages, with multiple DOM states on a single page — modals, dropdowns, tabs, accordions, and other interactive elements that each produce unique accessibility surfaces.

During accessibility audits, a human tester must manually navigate to every page, click every interactive element, and run the axe browser extension on each state. This is slow, error-prone, and results in missed pages, especially on large applications with deep navigation structures.

**a11y-crawler automates this process:**

1. Discovers all pages by following every `<a>` link within the application scope
2. Finds all interactive elements on each page (buttons, tabs, dropdowns, modals, selects, etc.)
3. Clicks each interactive element and scans the resulting DOM state with axe-core
4. Generates a report with violations grouped by route pattern, cross-page violation patterns, and high-risk element detection
5. Pauses at login pages so you can manually enter credentials, then continues automatically

This does not replace manual accessibility testing, such as screen reader behavior, keyboard navigation flow, and contextual judgment require human evaluation. This tool handles the automated scanning portion at scale, helps auditors discover pages they might miss, and lets them focus manual testing effort on the highest-risk areas.

## ⚠️ Safety Warning

**The crawler clicks every interactive element it finds.** This includes buttons like "Delete", "Remove", "Grant Access", "Revoke Access", "Submit", "Make Payment", and any other destructive or state-changing actions.

**Before running this tool:**

- Use a **test or staging environment**, never production
- Use a **dedicated test account** with non-critical data
- Review the `BLOCKED_PATTERNS` configuration and add any URL patterns that should never be visited (e.g., `/delete`, `/remove`, `/payment`)
- Be prepared to monitor the browser window — the crawler runs in a visible browser so you can intervene if needed

## Features

- **Authenticated crawling** pauses at login pages for manual credential entry, then auto-resumes when login completes
- **Session loss recovery** detects if the session expires mid-crawl and pauses for re-login
- **Link discovery** follows all `<a href>` links within a configurable scope
- **Interactive element scanning** clicks buttons, tabs, dropdowns, checkboxes, radio buttons, selects, and elements with ARIA roles or event handlers
- **WCAG 2.1 AA scanning** runs axe-core with `wcag2a`, `wcag2aa`, and `wcag21aa` tags on every state
- **High-risk element detection** flags pages with tables, forms, iframes, videos, and ARIA dialogs
- **Cross-page violation aggregation** identifies violations that repeat across multiple pages (likely shared components)
- **Route pattern grouping** deduplicates results from pages using the same template (e.g., `/course/:id/dashboard`)
- **Visual feedback** highlights interactive elements before clicking (red border) so you can watch what the crawler is doing
- **Destructive URL blocking** configurable blocklist for logout, delete, and other dangerous URL patterns
- **JSON report output** full structured report saved to `reports/` directory

## Prerequisites

- [Node.js](https://nodejs.org/) 18 or higher

## Setup

```bash
# Clone the repository
git clone <repository-url>
cd a11y-crawler

# Install dependencies
npm install

# Install browser (first run only)
npx playwright install chromium
```

On Linux, if Chromium fails to launch with missing library errors:

```bash
# Debian/Ubuntu
sudo npx playwright install-deps

# Arch Linux
sudo pacman -S nss atk at-spi2-core cups libdrm libxkbcommon mesa libxdamage
```

## Configuration

Edit the config section at the top of `tests/example.spec.ts`:

```typescript
const START_URL = 'https://your-app.example.com';   // starting URL
const SCOPE = 'https://your-app.example.com/';       // only crawl URLs under this path
const MAX_PAGES = Infinity;                           // set a number to limit pages crawled
const SLOW_MO = 100;                                  // ms pause between actions (increase to watch more carefully)
```

Add any dangerous URL patterns to the blocklist:

```typescript
const BLOCKED_PATTERNS = [
  '/logout',
  '/delete',
  '/remove',
  '/signout',
  '/sign-out',
  '/log-out',
  // add patterns specific to your application:
  // '/payment',
  // '/revoke',
  // '/grant',
];
```

## Usage

```bash
# Run the crawler (visible browser)
npx playwright test --project=chromium --headed

# The browser will open and navigate to START_URL
# If redirected to a login page, enter your credentials in the browser
# The crawler will automatically continue once login is detected
```

### Windows

Not implemented yet

### Linux / macOS


# run the command above directly

## Output

### Terminal

Real-time progress including pages scanned, violations found, interactive elements clicked, and links discovered.

### JSON Report

A full structured report is saved to `reports/report-<timestamp>.json` containing:

- Every page URL visited
- Every interactive state scanned
- All axe-core violations with WCAG criteria, severity, and instance count
- High-risk element counts per page

### Console Summary

After the crawl completes:

- **Repeat violations** — violations appearing on multiple pages (likely shared component issues — fix once, fix everywhere)
- **High-risk elements** — pages containing tables, forms, iframes, and other complex components
- **Results by route pattern** — deduplicated results grouped by URL template

## Limitations

- **Automated testing catches approximately 30% of WCAG issues.** This tool cannot detect keyboard trap behavior, screen reader announcement errors, color-only information, or contextual heading structure problems. Manual testing with assistive technology is still required.
- **Interactive state discovery is not exhaustive.** Some states are only reachable through specific sequences of actions (e.g., filling out a form then clicking submit). The crawler clicks elements individually from the initial page state.
- **The crawler cannot access pages behind different user roles.** Run separate crawls with different accounts (e.g., student vs. instructor) to cover role-specific pages.
- **Dynamic selectors may cause duplicate or missed element clicks.** Applications that generate random class names or IDs on each render may produce inconsistent results between runs.

## Tech Stack

- [Playwright](https://playwright.dev/) — browser automation
- [@axe-core/playwright](https://www.npmjs.com/package/@axe-core/playwright) — WCAG accessibility scanning
- TypeScript

## License

MIT