import type { ViolationNode, Violation, PageRecord, ScanRecord } from '../../lib/types';

// ---------------------------------------------------------------------------
// Violation definitions (axe-core rule pool)
// ---------------------------------------------------------------------------

type ViolDef = Omit<Violation, 'nodes'>;

const POOL: Record<string, ViolDef> = {
  'color-contrast': {
    id: 'color-contrast',
    impact: 'serious',
    help: 'Elements must meet minimum color contrast ratio thresholds',
    description: 'Ensures the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds.',
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/color-contrast',
    wcagTags: ['wcag2aa', 'wcag143'],
  },
  'image-alt': {
    id: 'image-alt',
    impact: 'critical',
    help: 'Images must have alternate text',
    description: 'Ensures img elements have alternate text or a role of none or presentation.',
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/image-alt',
    wcagTags: ['wcag2a', 'wcag111'],
  },
  'label': {
    id: 'label',
    impact: 'critical',
    help: 'Form elements must have labels',
    description: 'Ensures every form element has a label.',
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/label',
    wcagTags: ['wcag2a', 'wcag131', 'wcag412'],
  },
  'aria-required-attr': {
    id: 'aria-required-attr',
    impact: 'critical',
    help: 'Required ARIA attributes must be provided',
    description: 'Ensures elements with ARIA roles have all required ARIA attributes.',
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/aria-required-attr',
    wcagTags: ['wcag2a', 'wcag412'],
  },
  'link-name': {
    id: 'link-name',
    impact: 'serious',
    help: 'Links must have discernible text',
    description: 'Ensures links have discernible text.',
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/link-name',
    wcagTags: ['wcag2a', 'wcag244', 'wcag412'],
  },
  'button-name': {
    id: 'button-name',
    impact: 'critical',
    help: 'Buttons must have discernible text',
    description: 'Ensures buttons have discernible text.',
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/button-name',
    wcagTags: ['wcag2a', 'wcag412'],
  },
  'heading-order': {
    id: 'heading-order',
    impact: 'moderate',
    help: 'Heading levels should only increase by one',
    description: 'Ensures the order of headings is semantically correct.',
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/heading-order',
    wcagTags: ['best-practice'],
  },
  'region': {
    id: 'region',
    impact: 'moderate',
    help: 'All page content should be contained by landmarks',
    description: 'Ensures all page content is contained by landmarks.',
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/region',
    wcagTags: ['best-practice'],
  },
  'bypass': {
    id: 'bypass',
    impact: 'serious',
    help: 'Page must contain a skip mechanism',
    description: 'Ensures each page has at least one mechanism for a user to bypass navigation and jump straight to the content.',
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/bypass',
    wcagTags: ['wcag2a', 'wcag241'],
  },
  'frame-title': {
    id: 'frame-title',
    impact: 'serious',
    help: 'Frames must have title attribute',
    description: 'Ensures frame and iframe elements have an accessible name.',
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/frame-title',
    wcagTags: ['wcag2a', 'wcag241'],
  },
  'select-name': {
    id: 'select-name',
    impact: 'critical',
    help: 'Select element must have an accessible name',
    description: 'Ensures select element has an accessible name.',
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/select-name',
    wcagTags: ['wcag2a', 'wcag131', 'wcag412'],
  },
  'duplicate-id': {
    id: 'duplicate-id',
    impact: 'serious',
    help: 'id attribute value must be unique',
    description: 'Ensures every id attribute value is unique.',
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/duplicate-id',
    wcagTags: ['wcag2a', 'wcag411'],
  },
  'aria-hidden-focus': {
    id: 'aria-hidden-focus',
    impact: 'serious',
    help: 'ARIA hidden element must not contain focusable elements',
    description: 'Ensures that aria-hidden elements do not contain focusable elements.',
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/aria-hidden-focus',
    wcagTags: ['wcag2a', 'wcag412'],
  },
  'td-headers-attr': {
    id: 'td-headers-attr',
    impact: 'serious',
    help: 'All cells in a table using the headers attribute must refer to cells in that same table',
    description: 'Ensures that each cell in a table element that uses the headers attribute only refers to other cells of that same table.',
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/td-headers-attr',
    wcagTags: ['wcag2a', 'wcag131'],
  },
  'meta-viewport': {
    id: 'meta-viewport',
    impact: 'critical',
    help: 'Zooming and scaling must not be disabled',
    description: 'Ensures meta[name="viewport"] does not disable text scaling and zooming.',
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/meta-viewport',
    wcagTags: ['wcag2aa', 'wcag144'],
  },
};

// ---------------------------------------------------------------------------
// Representative nodes per violation type
// ---------------------------------------------------------------------------

const NODES: Record<string, ViolationNode[]> = {
  'color-contrast': [
    {
      html: '<p class="meta-text" style="color: #999;">Last updated 3 days ago</p>',
      selector: '.content-meta .meta-text',
      failureSummary: 'Fix any of the following:\n  Element has insufficient color contrast of 2.84 (foreground color: #999999, background color: #ffffff, font size: 12.0pt, font weight: normal). Expected contrast ratio of 4.5:1',
    },
    {
      html: '<span class="hint-text">Optional field</span>',
      selector: 'form .hint-text',
      failureSummary: 'Fix any of the following:\n  Element has insufficient color contrast of 3.12 (foreground color: #aaaaaa, background color: #ffffff, font size: 11.0pt, font weight: normal). Expected contrast ratio of 4.5:1',
    },
  ],
  'image-alt': [
    {
      html: '<img src="/assets/hero-banner.jpg" class="hero-image">',
      selector: '.hero-section > img.hero-image',
      failureSummary: "Fix any of the following:\n  Element does not have an alt attribute\n  aria-label attribute does not exist or is empty\n  aria-labelledby attribute does not exist, references elements that do not exist or references elements that are empty\n  Element has no title attribute\n  Element's default semantics were not overridden with role=\"none\"",
    },
  ],
  'label': [
    {
      html: '<input type="email" id="email" placeholder="Enter email">',
      selector: '#email',
      failureSummary: 'Fix any of the following:\n  Form element does not have an implicit (wrapped) label\n  Form element does not have an explicit label\n  aria-label attribute does not exist or is empty\n  aria-labelledby attribute does not exist, references elements that do not exist or references elements that are empty\n  Element has no title attribute or the title attribute is empty',
    },
    {
      html: '<input type="password" class="password-field" placeholder="Password">',
      selector: '.login-form .password-field',
      failureSummary: 'Fix any of the following:\n  Form element does not have an implicit (wrapped) label\n  Form element does not have an explicit label\n  aria-label attribute does not exist or is empty',
    },
  ],
  'aria-required-attr': [
    {
      html: '<div role="checkbox" class="custom-checkbox" tabindex="0"></div>',
      selector: '.settings-panel .custom-checkbox',
      failureSummary: 'Fix the following:\n  Required ARIA attribute not present: aria-checked',
    },
    {
      html: '<div role="combobox" class="search-dropdown" tabindex="0"></div>',
      selector: '.toolbar .search-dropdown',
      failureSummary: 'Fix the following:\n  Required ARIA attribute not present: aria-expanded',
    },
  ],
  'link-name': [
    {
      html: '<a href="/course/123"><img src="/icons/arrow.svg"></a>',
      selector: '.course-list > li:nth-child(3) > a',
      failureSummary: 'Fix any of the following:\n  Element is in tab order and does not have accessible text\n  aria-label attribute does not exist or is empty\n  aria-labelledby attribute does not exist, references elements that do not exist or references elements that are empty\n  Element has no title attribute',
    },
  ],
  'button-name': [
    {
      html: '<button class="icon-btn"><svg aria-hidden="true">...</svg></button>',
      selector: '.toolbar .icon-btn:nth-child(2)',
      failureSummary: 'Fix any of the following:\n  Element does not have inner text that is visible to screen readers\n  aria-label attribute does not exist or is empty\n  aria-labelledby attribute does not exist, references elements that do not exist or references elements that are empty\n  Element has no title attribute or the title attribute is empty',
    },
    {
      html: '<button class="close-modal"></button>',
      selector: '.modal-overlay .close-modal',
      failureSummary: 'Fix any of the following:\n  Element does not have inner text that is visible to screen readers\n  aria-label attribute does not exist or is empty',
    },
  ],
  'heading-order': [
    {
      html: '<h4 class="section-title">Course Overview</h4>',
      selector: '.main-content > section > h4.section-title',
      failureSummary: 'Fix any of the following:\n  Heading order invalid: this heading (h4) skipped past the h3 level',
    },
  ],
  'region': [
    {
      html: '<div class="announcement-banner">System maintenance scheduled for Sunday 2am.</div>',
      selector: '.announcement-banner',
      failureSummary: 'Fix any of the following:\n  Some page content is not contained by landmarks',
    },
  ],
  'bypass': [
    {
      html: '<body>',
      selector: 'html > body',
      failureSummary: 'Fix any of the following:\n  No skip link found\n  No landmark region found on the page\n  Page does not have a header\n  No heading tags present',
    },
  ],
  'frame-title': [
    {
      html: '<iframe src="/content/embed/456" class="content-frame"></iframe>',
      selector: '.content-player .content-frame',
      failureSummary: "Fix any of the following:\n  Element has no title attribute\n  aria-label attribute does not exist or is empty\n  aria-labelledby attribute does not exist, references elements that do not exist or references elements that are empty\n  Element's default semantics were not overridden with role=\"none\"",
    },
    {
      html: '<iframe src="https://www.youtube.com/embed/abc123"></iframe>',
      selector: '.video-container > iframe',
      failureSummary: 'Fix any of the following:\n  Element has no title attribute\n  aria-label attribute does not exist or is empty',
    },
  ],
  'select-name': [
    {
      html: '<select id="sort-by" class="sort-dropdown"><option>Newest</option><option>Oldest</option></select>',
      selector: '.filter-toolbar #sort-by',
      failureSummary: 'Fix any of the following:\n  Form element does not have an implicit (wrapped) label\n  Form element does not have an explicit label\n  aria-label attribute does not exist or is empty\n  aria-labelledby attribute does not exist, references elements that do not exist or references elements that are empty\n  Element has no title attribute or the title attribute is empty',
    },
  ],
  'duplicate-id': [
    {
      html: '<input type="text" id="search" class="search-input">',
      selector: '#search',
      failureSummary: 'Fix any of the following:\n  Document has multiple elements with the same id attribute: search',
    },
    {
      html: '<div id="main-nav" class="nav-container">...</div>',
      selector: '#main-nav',
      failureSummary: 'Fix any of the following:\n  Document has multiple elements with the same id attribute: main-nav',
    },
  ],
  'aria-hidden-focus': [
    {
      html: '<div aria-hidden="true" class="decorative-panel"><button class="panel-toggle">Toggle</button></div>',
      selector: '.sidebar .decorative-panel',
      failureSummary: 'Fix any of the following:\n  Focusable content should be disabled or removed from the DOM when the element is hidden',
    },
  ],
  'td-headers-attr': [
    {
      html: '<td headers="col1 col3" class="data-cell">84%</td>',
      selector: '.results-table tbody tr:nth-child(2) td:nth-child(3)',
      failureSummary: 'Fix the following:\n  The headers attribute is not exclusively referring to cells in the same table',
    },
  ],
  'meta-viewport': [
    {
      html: '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">',
      selector: 'html > head > meta[name="viewport"]',
      failureSummary: 'Fix any of the following:\n  user-scalable=no on meta tag disables zooming on mobile devices\n  maximum-scale on meta tag disables zooming on mobile devices',
    },
  ],
};

// ---------------------------------------------------------------------------
// Builder helpers
// ---------------------------------------------------------------------------

function buildViolation(id: string): Violation {
  const def = POOL[id];
  if (!def) throw new Error(`Unknown violation id: ${id}`);
  return { ...def, nodes: NODES[id] ?? [] };
}

function buildPage(id: string, url: string, violIds: string[]): PageRecord {
  const violations = violIds.map(buildViolation);
  return {
    id,
    url,
    violations,
    highRiskElements: {
      tables:  violIds.includes('td-headers-attr') ? 2 : 0,
      forms:   violIds.some(v => ['label', 'select-name', 'aria-required-attr'].includes(v)) ? 1 : 0,
      iframes: violIds.includes('frame-title') ? 2 : 0,
      images:  violIds.includes('image-alt') ? 3 : Math.min(violIds.length, 2),
      videos:  0,
      dialogs: violIds.includes('aria-hidden-focus') ? 1 : 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Scan 1 — H5P Learning Platform (62 pages)
// ---------------------------------------------------------------------------

const s1: [string, string[]][] = [
  ['https://umitstest.h5p.com/content', ['color-contrast', 'region']],
  ['https://umitstest.h5p.com/content/1', ['frame-title', 'image-alt']],
  ['https://umitstest.h5p.com/content/2', ['frame-title']],
  ['https://umitstest.h5p.com/content/3', []],
  ['https://umitstest.h5p.com/content/4', ['color-contrast']],
  ['https://umitstest.h5p.com/content/5', ['frame-title', 'aria-required-attr']],
  ['https://umitstest.h5p.com/content/6', []],
  ['https://umitstest.h5p.com/content/7', ['image-alt']],
  ['https://umitstest.h5p.com/content/8', []],
  ['https://umitstest.h5p.com/content/9', ['frame-title', 'color-contrast']],
  ['https://umitstest.h5p.com/content/10', []],
  ['https://umitstest.h5p.com/content/11', ['button-name']],
  ['https://umitstest.h5p.com/content/12', ['frame-title']],
  ['https://umitstest.h5p.com/content/13', []],
  ['https://umitstest.h5p.com/content/14', ['color-contrast', 'image-alt']],
  ['https://umitstest.h5p.com/content/15', ['frame-title', 'aria-required-attr']],
  ['https://umitstest.h5p.com/content/16', []],
  ['https://umitstest.h5p.com/content/17', ['heading-order']],
  ['https://umitstest.h5p.com/content/18', ['frame-title']],
  ['https://umitstest.h5p.com/content/19', []],
  ['https://umitstest.h5p.com/content/20', ['color-contrast']],
  ['https://umitstest.h5p.com/content/21', ['frame-title', 'button-name']],
  ['https://umitstest.h5p.com/content/22', []],
  ['https://umitstest.h5p.com/content/23', ['image-alt', 'aria-required-attr']],
  ['https://umitstest.h5p.com/content/24', ['frame-title']],
  ['https://umitstest.h5p.com/content/25', []],
  ['https://umitstest.h5p.com/content/26', ['color-contrast', 'heading-order']],
  ['https://umitstest.h5p.com/content/27', []],
  ['https://umitstest.h5p.com/content/28', ['frame-title', 'aria-required-attr']],
  ['https://umitstest.h5p.com/content/29', []],
  ['https://umitstest.h5p.com/content/30', ['button-name']],
  ['https://umitstest.h5p.com/content/31', ['frame-title']],
  ['https://umitstest.h5p.com/content/32', []],
  ['https://umitstest.h5p.com/content/33', ['color-contrast', 'image-alt']],
  ['https://umitstest.h5p.com/content/34', []],
  ['https://umitstest.h5p.com/content/35', ['frame-title', 'aria-required-attr']],
  ['https://umitstest.h5p.com/content/36', ['heading-order']],
  ['https://umitstest.h5p.com/content/37', []],
  ['https://umitstest.h5p.com/content/38', ['frame-title']],
  ['https://umitstest.h5p.com/content/39', []],
  ['https://umitstest.h5p.com/content/40', ['color-contrast', 'button-name']],
  ['https://umitstest.h5p.com/content?page=2', ['region']],
  ['https://umitstest.h5p.com/content?sort=date', ['color-contrast']],
  ['https://umitstest.h5p.com/content?sort=alpha', []],
  ['https://umitstest.h5p.com/content/1 → <button> "Show Hints"', ['aria-hidden-focus']],
  ['https://umitstest.h5p.com/content/5 → <button> "Show Answer"', []],
  ['https://umitstest.h5p.com/content/12 → <button> "Try Again"', []],
  ['https://umitstest.h5p.com/content/23 → <details> "See More"', ['color-contrast']],
  ['https://umitstest.h5p.com/content/28 → <button> "Submit"', ['button-name']],
  ['https://umitstest.h5p.com/content/35 → <select> "Rating"', ['select-name']],
  ['https://umitstest.h5p.com/content/40 → <button> "Expand All"', []],
  ['https://umitstest.h5p.com/dashboard', ['bypass', 'color-contrast']],
  ['https://umitstest.h5p.com/user/profile', ['label', 'color-contrast']],
  ['https://umitstest.h5p.com/user/settings', ['label', 'select-name']],
  ['https://umitstest.h5p.com/user/notifications', []],
  ['https://umitstest.h5p.com/help', ['heading-order']],
  ['https://umitstest.h5p.com/help/faq', []],
  ['https://umitstest.h5p.com/search', ['label', 'button-name']],
  ['https://umitstest.h5p.com/admin', ['color-contrast', 'duplicate-id']],
  ['https://umitstest.h5p.com/admin/users', ['label']],
  ['https://umitstest.h5p.com/admin/content', ['color-contrast']],
  ['https://umitstest.h5p.com/admin/reports', ['td-headers-attr', 'heading-order']],
];

// ---------------------------------------------------------------------------
// Scan 2 — Springfield City Government (51 pages)
// ---------------------------------------------------------------------------

const s2: [string, string[]][] = [
  ['https://springfield.gov', ['bypass', 'color-contrast', 'heading-order']],
  ['https://springfield.gov/about', ['heading-order']],
  ['https://springfield.gov/about/mayor', ['color-contrast']],
  ['https://springfield.gov/about/council', ['color-contrast', 'heading-order']],
  ['https://springfield.gov/about/departments', []],
  ['https://springfield.gov/services', ['bypass']],
  ['https://springfield.gov/services/permits', ['label', 'color-contrast']],
  ['https://springfield.gov/services/permits/apply', ['label', 'select-name', 'aria-required-attr']],
  ['https://springfield.gov/services/permits/status', ['color-contrast']],
  ['https://springfield.gov/services/utilities', ['heading-order']],
  ['https://springfield.gov/services/utilities/water', ['link-name', 'image-alt']],
  ['https://springfield.gov/services/utilities/power', ['color-contrast']],
  ['https://springfield.gov/services/utilities/waste', []],
  ['https://springfield.gov/services/transportation', ['color-contrast']],
  ['https://springfield.gov/services/transportation/bus', ['image-alt']],
  ['https://springfield.gov/services/transportation/parking', ['label', 'select-name']],
  ['https://springfield.gov/news', ['region']],
  ['https://springfield.gov/news/1', ['heading-order', 'color-contrast']],
  ['https://springfield.gov/news/2', ['color-contrast']],
  ['https://springfield.gov/news/3', []],
  ['https://springfield.gov/news/4', ['heading-order']],
  ['https://springfield.gov/news/5', ['color-contrast']],
  ['https://springfield.gov/news/6', []],
  ['https://springfield.gov/events', ['color-contrast']],
  ['https://springfield.gov/events/calendar', ['label', 'color-contrast']],
  ['https://springfield.gov/contact', ['label', 'aria-required-attr']],
  ['https://springfield.gov/contact/feedback', ['label', 'select-name']],
  ['https://springfield.gov/documents', ['link-name']],
  ['https://springfield.gov/documents/reports', ['heading-order']],
  ['https://springfield.gov/documents/forms', ['color-contrast']],
  ['https://springfield.gov/faq', ['heading-order', 'color-contrast']],
  ['https://springfield.gov/accessibility', []],
  ['https://springfield.gov/privacy', []],
  ['https://springfield.gov/sitemap', ['color-contrast']],
  ['https://springfield.gov/search', ['label']],
  ['https://springfield.gov/services/permits → <button> "Check Availability"', ['aria-required-attr']],
  ['https://springfield.gov/services/permits/apply → <select> "Permit Type"', ['select-name']],
  ['https://springfield.gov/events/calendar → <button> "Filter Events"', []],
  ['https://springfield.gov/contact → <button> "Submit"', []],
  ['https://springfield.gov/news → <button> "Load More"', ['button-name']],
  ['https://springfield.gov/faq → <details> "How do I..."', []],
  ['https://springfield.gov/services/transportation/bus → <button> "Plan Journey"', ['label']],
  ['https://springfield.gov/admin', ['label', 'button-name', 'duplicate-id']],
  ['https://springfield.gov/admin/pages', ['color-contrast']],
  ['https://springfield.gov/admin/users', ['label']],
  ['https://springfield.gov/admin/media', ['image-alt']],
  ['https://springfield.gov/admin/settings', ['select-name', 'heading-order']],
  ['https://springfield.gov/resident-portal', ['meta-viewport', 'color-contrast']],
  ['https://springfield.gov/resident-portal/account', ['label', 'aria-required-attr']],
  ['https://springfield.gov/resident-portal/payments', ['label', 'select-name', 'button-name']],
  ['https://springfield.gov/resident-portal/history', ['td-headers-attr']],
];

// ---------------------------------------------------------------------------
// Scan 3 — Meridian HR Portal (48 pages)
// ---------------------------------------------------------------------------

const s3: [string, string[]][] = [
  ['https://hr.meridian-corp.com', ['label', 'color-contrast', 'duplicate-id']],
  ['https://hr.meridian-corp.com/dashboard', ['color-contrast', 'region']],
  ['https://hr.meridian-corp.com/employees', ['label', 'select-name']],
  ['https://hr.meridian-corp.com/employees/new', ['label', 'aria-required-attr', 'select-name']],
  ['https://hr.meridian-corp.com/employees/1001', ['color-contrast']],
  ['https://hr.meridian-corp.com/employees/1002', ['color-contrast']],
  ['https://hr.meridian-corp.com/employees/1003', []],
  ['https://hr.meridian-corp.com/employees/1004', ['heading-order']],
  ['https://hr.meridian-corp.com/employees/1005', []],
  ['https://hr.meridian-corp.com/payroll', ['label', 'button-name', 'select-name']],
  ['https://hr.meridian-corp.com/payroll/run', ['label', 'aria-required-attr']],
  ['https://hr.meridian-corp.com/payroll/history', ['td-headers-attr', 'color-contrast']],
  ['https://hr.meridian-corp.com/payroll/reports', ['heading-order', 'link-name']],
  ['https://hr.meridian-corp.com/benefits', ['color-contrast']],
  ['https://hr.meridian-corp.com/benefits/enroll', ['label', 'select-name', 'aria-required-attr']],
  ['https://hr.meridian-corp.com/benefits/dental', ['color-contrast']],
  ['https://hr.meridian-corp.com/benefits/medical', ['color-contrast', 'image-alt']],
  ['https://hr.meridian-corp.com/benefits/vision', []],
  ['https://hr.meridian-corp.com/benefits/401k', ['label']],
  ['https://hr.meridian-corp.com/time-off', ['color-contrast']],
  ['https://hr.meridian-corp.com/time-off/request', ['label', 'select-name']],
  ['https://hr.meridian-corp.com/time-off/calendar', ['button-name']],
  ['https://hr.meridian-corp.com/time-off/balance', []],
  ['https://hr.meridian-corp.com/performance', ['color-contrast', 'heading-order']],
  ['https://hr.meridian-corp.com/performance/review', ['label', 'aria-required-attr', 'select-name']],
  ['https://hr.meridian-corp.com/performance/goals', ['color-contrast']],
  ['https://hr.meridian-corp.com/performance/feedback', ['label']],
  ['https://hr.meridian-corp.com/recruiting', ['duplicate-id', 'color-contrast']],
  ['https://hr.meridian-corp.com/recruiting/jobs', ['link-name', 'image-alt']],
  ['https://hr.meridian-corp.com/recruiting/applicants', ['select-name', 'label']],
  ['https://hr.meridian-corp.com/reports', ['td-headers-attr', 'heading-order']],
  ['https://hr.meridian-corp.com/reports/headcount', ['color-contrast']],
  ['https://hr.meridian-corp.com/reports/turnover', []],
  ['https://hr.meridian-corp.com/reports/compensation', ['color-contrast', 'label']],
  ['https://hr.meridian-corp.com/admin', ['label', 'button-name', 'select-name', 'duplicate-id']],
  ['https://hr.meridian-corp.com/admin/roles', ['label']],
  ['https://hr.meridian-corp.com/admin/integrations', ['select-name']],
  ['https://hr.meridian-corp.com/profile', ['label', 'color-contrast']],
  ['https://hr.meridian-corp.com/profile/settings', ['select-name', 'label']],
  ['https://hr.meridian-corp.com/payroll → <button> "Run Payroll"', ['button-name']],
  ['https://hr.meridian-corp.com/employees → <select> "Department"', ['select-name']],
  ['https://hr.meridian-corp.com/benefits/enroll → <button> "Confirm Selection"', []],
  ['https://hr.meridian-corp.com/time-off/request → <select> "Leave Type"', ['select-name']],
  ['https://hr.meridian-corp.com/performance/review → <button> "Save Draft"', ['button-name']],
  ['https://hr.meridian-corp.com/recruiting/applicants → <button> "Filter"', []],
  ['https://hr.meridian-corp.com/admin → <button> "Export"', ['button-name']],
  ['https://hr.meridian-corp.com/help', ['color-contrast', 'heading-order']],
  ['https://hr.meridian-corp.com/help/guide', []],
];

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const mockScans: ScanRecord[] = [
  {
    id: 'scan-1',
    url: 'https://umitstest.h5p.com/content',
    scope: 'https://umitstest.h5p.com/content',
    date: '2026-04-25T14:32:00Z',
    durationSeconds: 847,
    pages: s1.map(([url, ids], i) => buildPage(`s1-p${i}`, url, ids)),
  },
  {
    id: 'scan-2',
    url: 'https://springfield.gov',
    scope: 'https://springfield.gov',
    date: '2026-04-20T09:15:00Z',
    durationSeconds: 512,
    pages: s2.map(([url, ids], i) => buildPage(`s2-p${i}`, url, ids)),
  },
  {
    id: 'scan-3',
    url: 'https://hr.meridian-corp.com',
    scope: 'https://hr.meridian-corp.com',
    date: '2026-04-15T11:47:00Z',
    durationSeconds: 673,
    pages: s3.map(([url, ids], i) => buildPage(`s3-p${i}`, url, ids)),
  },
];
