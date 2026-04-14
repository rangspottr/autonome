# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ceo-readiness.spec.js >> Auth — Login page >> shows error when login fails
- Location: e2e/ceo-readiness.spec.js:37:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('[class*="errorBanner"]')
Expected: visible
Timeout: 8000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 8000ms
  - waiting for locator('[class*="errorBanner"]')
    - waiting for" http://localhost:5173/login" navigation to finish...
    - navigated to "http://localhost:5173/login"

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - generic [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e6]: A
      - generic [ref=e7]: Autonome
    - generic [ref=e8]:
      - generic [ref=e9]: Your AI-powered business operator
      - generic [ref=e10]: Autonomously manage finance, sales, operations, and growth — so you can focus on what matters.
      - generic [ref=e11]:
        - generic [ref=e12]: Automated agent decisions
        - generic [ref=e14]: Real-time business intelligence
        - generic [ref=e16]: Integrated finance & CRM
  - generic [ref=e19]:
    - heading "Welcome back" [level=1] [ref=e20]
    - paragraph [ref=e21]: Sign in to your Autonome account
    - generic [ref=e22]:
      - generic [ref=e23]:
        - generic [ref=e24]: Email
        - textbox "Email" [ref=e25]:
          - /placeholder: you@company.com
      - generic [ref=e26]:
        - generic [ref=e27]:
          - generic [ref=e28]: Password
          - link "Forgot password?" [ref=e29] [cursor=pointer]:
            - /url: /forgot-password
        - textbox "Password" [ref=e30]
      - button "Sign In" [ref=e31] [cursor=pointer]
    - generic [ref=e32]:
      - text: Don't have an account?
      - link "Sign up" [ref=e33] [cursor=pointer]:
        - /url: /signup
```

# Test source

```ts
  1   | /**
  2   |  * CEO Readiness E2E Tests — Autonome
  3   |  *
  4   |  * Coverage:
  5   |  *  - Login / signup page rendering and flow
  6   |  *  - Authenticated dashboard (Command Center)
  7   |  *  - Outputs page (Morning Briefing, Weekly Report, Collections)
  8   |  *  - Boardroom (AI chat interface)
  9   |  *  - Collections operator view
  10  |  *  - Inbox / Leads operator view
  11  |  *  - Approvals view
  12  |  *  - Alerts view
  13  |  *  - Audit Log view
  14  |  *  - AI status banner
  15  |  *
  16  |  * All API calls are mocked with route interception so:
  17  |  *  - No real server required
  18  |  *  - Tests are deterministic and fast
  19  |  *  - Demo workspace data is always present
  20  |  */
  21  | import { test, expect } from '@playwright/test';
  22  | import { setupApiMocks, injectAuthSession, SEED, DEMO_USER, DEMO_WORKSPACE } from './helpers.js';
  23  | 
  24  | // ── Auth Tests ────────────────────────────────────────────────────────────────
  25  | 
  26  | test.describe('Auth — Login page', () => {
  27  |   test('renders login page with correct fields and branding', async ({ page }) => {
  28  |     await page.goto('/login');
  29  |     await expect(page.locator('h1')).toContainText('Welcome back');
  30  |     await expect(page.locator('#email')).toBeVisible();
  31  |     await expect(page.locator('#password')).toBeVisible();
  32  |     await expect(page.locator('button[type="submit"]')).toContainText('Sign In');
  33  |     // No errors shown on initial render
  34  |     await expect(page.locator('[class*="errorBanner"]')).toHaveCount(0);
  35  |   });
  36  | 
  37  |   test('shows error when login fails', async ({ page }) => {
  38  |     await page.route('**/api/auth/login', (route) =>
  39  |       route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ message: 'Invalid credentials' }) })
  40  |     );
  41  |     await page.goto('/login');
  42  |     await page.fill('#email', 'wrong@test.com');
  43  |     await page.fill('#password', 'badpass');
  44  |     await page.click('button[type="submit"]');
  45  |     // Wait up to 8s for the error banner to appear
> 46  |     await expect(page.locator('[class*="errorBanner"]')).toBeVisible({ timeout: 8000 });
      |                                                          ^ Error: expect(locator).toBeVisible() failed
  47  |     await expect(page.locator('[class*="errorBanner"]')).toContainText('Invalid credentials');
  48  |   });
  49  | 
  50  |   test('navigates to dashboard after successful login', async ({ page }) => {
  51  |     await page.route('**/api/auth/login', (route) =>
  52  |       route.fulfill({
  53  |         status: 200,
  54  |         contentType: 'application/json',
  55  |         body: JSON.stringify({
  56  |           token: 'test-token',
  57  |           refreshToken: 'refresh-token',
  58  |           user: DEMO_USER,
  59  |           workspace: DEMO_WORKSPACE,
  60  |         }),
  61  |       })
  62  |     );
  63  |     await setupApiMocks(page);
  64  |     await page.goto('/login');
  65  |     await page.fill('#email', 'demo@acmecorp.com');
  66  |     await page.fill('#password', 'password123');
  67  |     await page.click('button[type="submit"]');
  68  |     // Should redirect away from login page
  69  |     await expect(page).not.toHaveURL(/\/login/);
  70  |   });
  71  | 
  72  |   test('has link to signup page', async ({ page }) => {
  73  |     await page.goto('/login');
  74  |     const signupLink = page.locator('a[href="/signup"]');
  75  |     await expect(signupLink).toBeVisible();
  76  |   });
  77  | 
  78  |   test('has forgot-password link', async ({ page }) => {
  79  |     await page.goto('/login');
  80  |     const forgotLink = page.locator('a[href="/forgot-password"]');
  81  |     await expect(forgotLink).toBeVisible();
  82  |   });
  83  | });
  84  | 
  85  | test.describe('Auth — Signup page', () => {
  86  |   test('renders signup page with correct form fields', async ({ page }) => {
  87  |     await page.goto('/signup');
  88  |     await expect(page.locator('h1')).toBeVisible();
  89  |     // Signup form should have email and name fields
  90  |     await expect(page.locator('input[type="email"]')).toBeVisible();
  91  |     // Use first() since there are two password inputs
  92  |     await expect(page.locator('input[type="password"]').first()).toBeVisible();
  93  |   });
  94  | 
  95  |   test('has link back to login', async ({ page }) => {
  96  |     await page.goto('/signup');
  97  |     const loginLink = page.locator('a[href="/login"]');
  98  |     await expect(loginLink).toBeVisible();
  99  |   });
  100 | });
  101 | 
  102 | // ── Dashboard / Command Center ────────────────────────────────────────────────
  103 | 
  104 | test.describe('Command Center — Dashboard', () => {
  105 |   test.beforeEach(async ({ page }) => {
  106 |     await injectAuthSession(page);
  107 |     await setupApiMocks(page);
  108 |     await page.goto('/');
  109 |   });
  110 | 
  111 |   test('renders without errors — no SQL error messages exposed', async ({ page }) => {
  112 |     // Wait for the page to load
  113 |     await page.waitForLoadState('networkidle');
  114 |     const bodyText = await page.locator('body').innerText();
  115 |     // CEO readiness: no raw SQL errors should leak to the UI
  116 |     expect(bodyText).not.toMatch(/column .* does not exist/i);
  117 |     expect(bodyText).not.toMatch(/relation .* does not exist/i);
  118 |     expect(bodyText).not.toMatch(/syntax error at or near/i);
  119 |     expect(bodyText).not.toMatch(/PostgreSQL.*ERROR/i);
  120 |   });
  121 | 
  122 |   test('shows AI status banner with operational status', async ({ page }) => {
  123 |     await page.waitForLoadState('networkidle');
  124 |     // AI status should be visible somewhere on the page
  125 |     const aiStatusEl = page.locator('[class*="aiStatus"], [class*="banner"], [class*="StatusBanner"]').first();
  126 |     if (await aiStatusEl.count() > 0) {
  127 |       await expect(aiStatusEl).toBeVisible();
  128 |     }
  129 |   });
  130 | 
  131 |   test('dashboard is not empty — shows metrics or activity', async ({ page }) => {
  132 |     await page.waitForLoadState('networkidle');
  133 |     await page.waitForTimeout(1000); // give React time to render data
  134 |     const bodyText = await page.locator('body').innerText();
  135 |     // Some meaningful business data should be visible
  136 |     const hasMeaningfulContent =
  137 |       bodyText.includes('Overdue') || bodyText.includes('overdue') ||
  138 |       bodyText.includes('Revenue') || bodyText.includes('revenue') ||
  139 |       bodyText.includes('Pipeline') || bodyText.includes('pipeline') ||
  140 |       bodyText.includes('Agent') || bodyText.includes('agent') ||
  141 |       bodyText.includes('Approval') || bodyText.includes('approval') ||
  142 |       bodyText.includes('Acme Corp') ||
  143 |       bodyText.includes('Finance') ||
  144 |       bodyText.includes('Autonome') ||
  145 |       bodyText.includes('Tasks') || bodyText.includes('tasks');
  146 |     expect(hasMeaningfulContent).toBe(true);
```