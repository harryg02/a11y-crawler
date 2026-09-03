# Page Discovery: a11y-crawler vs Axcess

A plain-English comparison of how the two crawlers find pages to test.

This covers **discovery only** — how each tool decides which pages exist and
which ones to scan. It does not compare what happens once a page is open
(Axcess runs far more tests per page; see the note at the end).

- **a11y-crawler** — <https://github.com/harryg02/a11y-crawler> (TypeScript)
- **Axcess** — <https://github.com/rayraycodes/Axcess> (Python)

---

## Words used in this document

**Crawler** — a program that starts at one web address and follows links to
find the rest of the site by itself.

**Seed URL** — the address you type in to start. Everything else is found by
following links from there.

**Scope** — the rule for what counts as "inside the site we're testing."
Without it, one link to Twitter and the crawler wanders off forever.

**Queue** — the crawler's to-do list of pages it has found but not visited yet.

**Normalize** — cleaning up a web address so that two versions of the same page
look identical. `HTTPS://Example.com/Page` and `https://example.com/Page` are
the same page written two ways.

**Dedupe** — noticing "I've already done this one" and skipping it.

**DOM** — the page's live content as the browser is holding it in memory right
now. It is not the same as the HTML file the server sent: JavaScript can add,
remove, and change things after the page loads. When you click a button and a
menu appears, the DOM changed.

**Hash** — a short fingerprint number calculated from a piece of text. The same
text always gives the same number; different text gives a different number.
Useful for asking "is this exactly what I saw before?" without storing the
whole page.

**iframe** — a page embedded inside another page, like a video player or a
discussion board dropped into a course page. It is often served by a completely
different company.

**SPA (single-page application)** — a website that is really one HTML file.
When you click "Settings," the address bar changes but the browser never loads
a new page; JavaScript swaps the content out instead.

**axe** — the accessibility testing library both tools use. You point it at a
loaded page and it reports problems.

---

## Part 1 — What both crawlers already do the same way

These are not differences. Both tools do all of this.

1. **Start from one address you give it.**

2. **Work out what's in scope from that address.** Both use the folder path.
   If you seed `university.edu/library/`, both will crawl
   `university.edu/library/books` but not `university.edu/athletics`.

3. **Load the page in a real Chrome browser.** Both do this by default, which
   matters because many sites build their content with JavaScript. Reading the
   raw HTML file would show an empty shell.

4. **Read every link on the page** — every `<a href="...">`.

5. **Throw away links that are out of scope**, plus obvious non-pages like
   `mailto:` addresses.

6. **Clean up each link so duplicates collapse.** The details differ (see Part
   4), but both do it.

7. **Keep a to-do list** and pull the next address off it.

8. **Never visit the same page twice.**

9. **Stop at a limit** so a huge site doesn't run forever.

10. **Run axe on each page** and record what it finds.

11. **Save progress to a SQLite database as it goes**, so a crash, a closed
    laptop, or a lost connection doesn't throw away the whole run. Both can
    resume.

So the basic loop is genuinely the same in both tools.

---

## Part 2 — What a11y-crawler does that Axcess does not

### 2.1 It clicks things, and tests what appears

**The idea:** most of a modern web page isn't visible when the page loads. Menus
are closed. Dialogs haven't opened. Tabs haven't been switched. Accessibility
problems hide in those states.

**Example.** A registration form has a button labelled "Add another guest."
Click it and three new fields appear — and one of them has no label, which is a
real accessibility failure.

- **a11y-crawler** clicks the button, notices the page content changed, and runs
  axe again on the new state. It finds the unlabelled field.
- **Axcess** never clicks anything. It tests the form as it looked on load, so
  those three fields do not exist as far as it is concerned. The problem is
  invisible to it.

This is the single biggest difference between the two tools. Axcess has no
equivalent at all — there is not one click anywhere in its crawling code.

**It is not reckless about it.** The clicking has guards:

- It won't click anything whose text contains a blocked word, so it never hits
  "Sign out" or "Delete."
- If a page has a calendar with 365 day cells, it clicks a few and recognises
  the rest are the same kind of control, instead of clicking all 365.
- If a click navigates away from the page, it adds that destination to the
  to-do list and goes back, rather than losing its place.
- If a click changes nothing on the page, it notices and moves on.
- Buttons in the header, nav, or footer are treated as site-wide, so the same
  "Menu" button isn't re-clicked on every single page.

### 2.2 It skips pages that are copies of a page it already tested

**The idea, in two parts.**

First, a **route pattern**: the shape of an address with the changing parts
replaced. These three addresses:

```
university.edu/course/12345
university.edu/course/67890
university.edu/course/99999
```

all have the shape `university.edu/course/:id`. The crawler swaps out long
numbers and ID codes to get that shape.

Second, a **fingerprint** of the page's content (a hash of the DOM).

**Put them together:** if a page has the same shape *and* the same fingerprint
as one already scanned, it must be the same template with the same content
structure — so skip it.

**Example.** A university site has 500 course pages, all built from one
template. `course/12345` is scanned. Then `course/67890` comes up: same shape,
same fingerprint.

- **a11y-crawler** skips it, and the other 498. It scans **1** page.
- **Axcess** scans all **500**, finding the same handful of template problems
  500 times over.

Worth knowing: Axcess *does* calculate a fingerprint of each page and save it
to the database. It just never uses it to decide anything.

### 2.3 It understands single-page apps

**The idea:** the `#` in a web address means two completely different things
depending on what comes after it.

```
help.edu/guide.html#printing      →  jump to the "Printing" heading.
                                     Same page. Not worth crawling.

admin.edu/app.html#/users         →  a different screen of an SPA.
                                     A real page. Worth crawling.
```

a11y-crawler tells these apart with one rule: if the character right after the
`#` is a `/`, it's a real screen. Otherwise it's a jump-to-heading link.

Axcess deletes everything from the `#` onward, every time, without checking.

**Example.** An admin dashboard has 30 screens at `#/users`, `#/billing`,
`#/reports`, and so on.

- **a11y-crawler** finds and tests all 30.
- **Axcess** deletes the `#/...` from all 30, so they all become the same
  address. It tests **1** page and reports the site as fully scanned.

This one is arguably a bug in Axcess rather than a design choice, and it makes
it unable to test an entire category of website.

### 2.4 It can follow an embedded tool into its own site

**The idea:** university course pages often embed third-party tools in an
iframe — a discussion board, a quiz tool, a video platform — served from a
totally different company's web address.

**Example.** A course page at `university.edu/course/12345` embeds a discussion
tool served from `yellowdig.app`.

- **a11y-crawler** notices the embedded tool and adds its address to the list of
  places that count as in-scope. It can then explore inside the tool — clicking
  its buttons where it sits, without navigating the browser away from the course
  page.
- **Axcess** fixes its scope when the scan starts. `yellowdig.app` isn't
  `university.edu`, so the tool is out of scope and is never looked at — even
  though a student using that course page is using that tool.

### 2.5 Watch mode

You can watch the browser work, and take over. If you navigate somewhere
yourself mid-scan, the crawler notices and starts crawling from where you went.
Useful for reaching a page that's hard to get to by following links.

Axcess has no equivalent.

---

## Part 3 — What Axcess does that a11y-crawler does not

### 3.1 It obeys robots.txt

**The idea:** most websites have a file at `example.com/robots.txt` listing
which pages automated tools are asked not to visit.

Axcess reads it and honours it. a11y-crawler doesn't look for it at all.

**Why it matters:** it's the standard courtesy for scanning a site. It also
keeps a crawler out of areas that are deliberately off-limits — search result
pages that generate infinitely, print views, admin endpoints. If you ever scan a
site you don't own, this stops being optional.

### 3.2 It's polite and parallel at the same time

Axcess runs **4 pages at once**, but deliberately limits itself to about **2
requests per second** and no more than 2 at a time to any one host.

a11y-crawler does one page at a time, as fast as it can, with no throttle.

**Example.** On a slow university server, Axcess is finishing four pages while
a11y-crawler waits on one — and it is still putting less burst load on the
server, because it paces itself.

### 3.3 It can skip the browser when it doesn't need one

Axcess fetches the raw HTML with a plain, fast request first. It only opens the
browser if the page actually needs it — because the HTML came back looking like
an empty JavaScript shell, or because the server returned a "checking your
browser" bot challenge.

By default it opens the browser anyway. But it has a `--static-only` mode that
produces a fast inventory of a site's pages without ever launching Chrome.

a11y-crawler always opens a browser, so this fast mode isn't possible.

### 3.4 It compares a scan against the last one

Axcess can find the previous completed scan of the same site and tell you what's
**new**, what's been **fixed**, and what's **still there**.

It's careful about matching, too: if you scanned a local site on port 3000 last
week and port 5173 today, it still recognises it as the same site rather than
reporting every issue as brand new.

a11y-crawler has no scan-to-scan comparison.

### 3.5 Its to-do list survives a crash mid-page

Both tools save progress. The mechanisms differ.

Axcess marks a page as "being worked on, expires in 2 minutes." If the program
dies, that page automatically returns to the to-do list when the time is up.
This matters because 4 workers are running at once and any one of them can die
independently.

a11y-crawler records a page as "visiting" and re-tries it when you resume. For
one worker, the practical result is much the same.

### 3.6 It has a depth limit

Axcess stops following links once it's 10 clicks away from the starting page.

a11y-crawler has no depth limit — only a page count cap and a 30-minute time
budget.

Neither is clearly right. A depth limit prevents the crawler disappearing into
the far corners of a big site; no depth limit means nothing deep gets missed.

### 3.7 A note on sitemaps

Axcess contains code for reading `sitemap.xml` — the file where a site lists all
its pages. **It is written but not connected to anything.** Nothing in the
crawler ever calls it.

Neither tool actually uses sitemaps today. Worth knowing, since it looks like a
feature at first glance.

---

## Part 4 — One difference where neither tool is wrong

### Query strings

**The idea:** a query string is the part of an address after the `?`.

```
shop.edu/search?q=laptops
shop.edu/search?q=chairs
```

- **a11y-crawler** ignores everything after the `?`. Both of those are "the
  search page," and only the first gets scanned.
- **Axcess** keeps the query string (tidied up and sorted). Those are two
  different pages and both get scanned.

**Which is better depends on the site.** On a shop with filters, Axcess is more
thorough — you might genuinely have accessibility problems that only appear on
certain result pages. But on a site with a date picker, Axcess could keep
finding `?date=2026-01-01`, `?date=2026-01-02` forever, while a11y-crawler
sails past.

Whichever direction the two projects merge, this should be a deliberate decision
with a switch, not something inherited by accident.

---

## Summary table

| Behaviour | a11y-crawler | Axcess |
|---|---|---|
| Follow links from a seed URL | yes | yes |
| Scope by folder path | yes | yes |
| Render pages in a real browser | yes | yes |
| Save progress, resume after a crash | yes | yes |
| **Click things and test what appears** | **yes** | no |
| **Skip duplicate template pages** | **yes** | no |
| **Understand SPA `#/` routes** | **yes** | no |
| **Follow embedded tools into their own site** | **yes** | no |
| **Watch mode / manual navigation** | **yes** | no |
| **Obey robots.txt** | no | **yes** |
| **Rate limiting and parallel workers** | no | **yes** |
| **Skip the browser when possible** | no | **yes** |
| **Compare against the previous scan** | no | **yes** |
| **Depth limit** | no | **yes** |
| Query strings | ignored | kept |
| Sitemaps | no | written, not wired up |

---

## One thing this document does not cover

Discovery is only half of a crawler. Once a page is open, the two tools do very
different amounts of work.

- **a11y-crawler** runs axe.
- **Axcess** runs axe, plus Siteimprove Alfa as a second opinion, plus separate
  checks for keyboard traps, focus order, colour and zoom behaviour, and reading
  order — plus it pulls out every image, reads any text inside it, and describes
  it with a local AI model.

So a11y-crawler finds **more states of each page**, and Axcess runs **more tests
on each state**. Those are complementary strengths, not competing ones — which
is the strongest argument for combining the two tools rather than picking one.
