# A11y Crawler

An automated accessibility auditing tool that discovers all pages and interactive elements in websites or web applications, runs [axe-core](https://github.com/dequelabs/axe-core) WCAG 2.1 AA checks on every discoverable page and interactive state, and presents results in a browser-based dashboard.

## Why This Exists

Modern web applications built with frameworks like React can have dozens or hundreds of pages, with multiple DOM states on a single page — modals, dropdowns, tabs, accordions, and other interactive elements that each produce unique accessibility surfaces.

During accessibility audits, a human tester must manually navigate to every page, click every interactive element, and run the axe browser extension on each state. This is slow, error-prone, and results in missed pages, especially on large applications with deep navigation structures.

**a11y-crawler automates this process:**

1. Discovers all pages by following every `<a>` link within the application scope
2. Finds all interactive elements on each page (buttons, tabs, dropdowns, modals, selects, etc.)
3. Clicks each interactive element and scans the resulting DOM state with axe-core
4. Generates a report with violations grouped by route pattern, cross-page violation patterns, and high-risk element detection
5. Opens a real browser window so you can log in manually, then signals the crawler to continue

This does not replace manual accessibility testing, such as screen reader behavior, keyboard navigation flow, and contextual judgment require human evaluation. This tool handles the automated scanning portion at scale, helps auditors discover pages they might miss, and lets them focus manual testing effort on the highest-risk areas.

## ⚠️ Safety Warning

**The crawler clicks every interactive element it finds**, including buttons labelled "Delete", "Remove", "Pay", "Purchase", and other destructive actions.

Before running:
- Use a **test or staging environment**, never production
- Use a **dedicated test account** with non-critical data
- Keep the browser window visible so you can intervene if needed
- Review the **Buttons to avoid** list in the UI before starting

## Features

- **Discover all pages and DOM states then run Axe-Core automatically on each link and DOM state**
- **Link discovery** follows all `<a href>` links within a configurable scope
- **Interactive element scanning** clicks buttons, tabs, dropdowns, checkboxes, radio buttons, selects, and elements with ARIA roles or event handlers
- **Authenticated crawling** opens a real browser window, pauses for manual login, then resumes when you signal it with `touch .login-complete`
- **WCAG 2.1 AA scanning** runs axe-core with `wcag2a`, `wcag2aa`, and `wcag21aa` tags on every state
- **High-risk element detection** flags pages with tables, forms, iframes, videos, and ARIA dialogs
- **Cross-page violation aggregation** identifies violations that repeat across multiple pages (likely shared components)
- **Structural DOM hashing** to identify identical page templates (e.g., dynamically generated course pages), bypassing redundant axe scans while still extracting unique outbound links to ensure complete site coverage.
- **Route pattern grouping** deduplicates results from pages using the same template (e.g., `/course/:id/dashboard`)
- **Visual feedback** highlights interactive elements before clicking (red border) so you can watch what the crawler is doing
- **Destructive URL blocking** configurable blocklist for logout, delete, and other dangerous URL patterns

## Prerequisites

- macOS 12 or later
- [Node.js](https://nodejs.org/) 18 or later

### Installing Node.js on Mac

**Option A — Direct download (recommended for beginners):**

1. Go to [nodejs.org](https://nodejs.org/)
2. Download the macOS installer (LTS version)
3. Run the `.pkg` file and follow the installer

**Option B — Homebrew:**

```bash
# Install Homebrew if you don't have it
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Node.js
brew install node
```

Verify the installation:

```bash
node --version   # should print v18 or higher
npm --version
```

---

## Installation

```bash
# 1. Clone the repository
git clone <repository-url>
cd a11y-crawler

# 2. Install dependencies
npm install

# 3. Install the Chromium browser used by the crawler
npx playwright install chromium
```

## Running the App

```bash
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

The app runs entirely on your machine. Scan results are saved as JSON files in the `reports/` folder inside the project.

> To stop the server, press `Ctrl + C` in the terminal.

---

## How to Use

### 1. Crawl & Scan

- Enter the URL of the site you want to scan
- If the site requires login, check **This site requires login** and enter the login page URL
- Optionally open **Advanced options** to adjust interaction depth, time limit, and buttons to avoid
- Click **Start Scan**

### 2. Login flow (if required)

When the scan starts, a Chromium browser window will open automatically. If the site requires login:

1. Log in manually in the browser window
2. Click **I've logged in** in the app when ready

The crawler will then begin scanning automatically.

### 3. During the scan

- Watch live log output in the app
- Use **Pause** to temporarily stop the crawler between pages
- Use **Stop** to end the scan early
- Results are saved automatically when the scan finishes

### 4. Viewing results

Click **View Results** after a scan completes, or open the **History** tab at any time to browse past scans.

Each result shows:
- Total violations by severity (critical, serious, moderate, minor)
- WCAG conformance levels affected
- Per-page breakdown with the specific elements and selectors that failed
- Fix guidance from axe-core for each violation

---

## What It Scans

1. **Every page** reachable by following `<a>` links within the site's URL scope
2. **Every interactive state** — clicks buttons, tabs, dropdowns, modals, and other elements to expose DOM states that only appear after interaction
3. **The login page itself** — scanned before you log in, so pre-auth pages are also covered

---

## Limitations

- Automated testing catches approximately 30% of WCAG issues. Keyboard navigation flow, screen reader announcements, and color-only information require manual testing with assistive technology.
- The crawler cannot access pages behind different user roles. Run separate scans with different accounts (e.g., student vs. instructor) to cover role-specific pages.
- Some states are only reachable through specific action sequences (e.g., fill out a form, then submit). The crawler clicks elements individually from the initial page state.

---

## Tech Stack

- [Next.js](https://nextjs.org/) — frontend dashboard
- [Playwright](https://playwright.dev/) — browser automation
- [@axe-core/playwright](https://www.npmjs.com/package/@axe-core/playwright) — WCAG accessibility scanning
- [Tailwind CSS](https://tailwindcss.com/) — styling
- TypeScript

---

## License

MIT
