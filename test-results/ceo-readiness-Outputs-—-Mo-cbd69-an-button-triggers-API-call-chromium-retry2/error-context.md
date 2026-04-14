# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ceo-readiness.spec.js >> Outputs — Morning Briefing, Weekly Report, Collections >> Generate Collections Scan button triggers API call
- Location: e2e/ceo-readiness.spec.js:229:3

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - complementary "Navigation" [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e6]: A
      - generic [ref=e7]:
        - generic [ref=e8]: Autonome
        - generic [ref=e9]: Acme Corp
    - navigation [ref=e10]:
      - generic [ref=e11]:
        - generic [ref=e12]: HOME
        - button "CMD Command Center" [ref=e13] [cursor=pointer]:
          - generic [ref=e14]: CMD
          - generic [ref=e15]: Command Center
        - button "BRF Briefing" [ref=e16] [cursor=pointer]:
          - generic [ref=e17]: BRF
          - generic [ref=e18]: Briefing
        - button "OUT Outputs" [ref=e19] [cursor=pointer]:
          - generic [ref=e20]: OUT
          - generic [ref=e21]: Outputs
      - generic [ref=e22]:
        - generic [ref=e23]: AI TEAM
        - button "AGT Agents" [ref=e24] [cursor=pointer]:
          - generic [ref=e25]: AGT
          - generic [ref=e26]: Agents
        - button "BRD Boardroom" [ref=e27] [cursor=pointer]:
          - generic [ref=e28]: BRD
          - generic [ref=e29]: Boardroom
        - button "APR Approvals 2" [ref=e30] [cursor=pointer]:
          - generic [ref=e31]: APR
          - generic [ref=e32]: Approvals
          - generic [ref=e33]: "2"
        - button "ALT Alerts 2" [ref=e34] [cursor=pointer]:
          - generic [ref=e35]: ALT
          - generic [ref=e36]: Alerts
          - generic [ref=e37]: "2"
      - generic [ref=e38]:
        - generic [ref=e39]: OPERATORS
        - button "INB Inbox / Leads" [ref=e40] [cursor=pointer]:
          - generic [ref=e41]: INB
          - generic [ref=e42]: Inbox / Leads
        - button "COL Collections" [active] [ref=e43] [cursor=pointer]:
          - generic [ref=e44]: COL
          - generic [ref=e45]: Collections
      - generic [ref=e46]:
        - generic [ref=e47]: BUSINESS
        - button "REV Revenue" [ref=e48] [cursor=pointer]:
          - generic [ref=e49]: REV
          - generic [ref=e50]: Revenue
        - button "FIN Finance" [ref=e51] [cursor=pointer]:
          - generic [ref=e52]: FIN
          - generic [ref=e53]: Finance
        - button "OPS Operations" [ref=e54] [cursor=pointer]:
          - generic [ref=e55]: OPS
          - generic [ref=e56]: Operations
        - button "SUP Support" [ref=e57] [cursor=pointer]:
          - generic [ref=e58]: SUP
          - generic [ref=e59]: Support
        - button "GRW Growth" [ref=e60] [cursor=pointer]:
          - generic [ref=e61]: GRW
          - generic [ref=e62]: Growth
        - button "INV Inventory" [ref=e63] [cursor=pointer]:
          - generic [ref=e64]: INV
          - generic [ref=e65]: Inventory
      - generic [ref=e66]:
        - generic [ref=e67]: INTELLIGENCE
        - button "ROI ROI" [ref=e68] [cursor=pointer]:
          - generic [ref=e69]: ROI
          - generic [ref=e70]: ROI
        - button "PRC Process" [ref=e71] [cursor=pointer]:
          - generic [ref=e72]: PRC
          - generic [ref=e73]: Process
        - button "KNW Knowledge" [ref=e74] [cursor=pointer]:
          - generic [ref=e75]: KNW
          - generic [ref=e76]: Knowledge
        - button "LOG Audit Log" [ref=e77] [cursor=pointer]:
          - generic [ref=e78]: LOG
          - generic [ref=e79]: Audit Log
      - generic [ref=e80]:
        - generic [ref=e81]: SETUP
        - button "CON Connections" [ref=e82] [cursor=pointer]:
          - generic [ref=e83]: CON
          - generic [ref=e84]: Connections
        - button "SET Settings" [ref=e85] [cursor=pointer]:
          - generic [ref=e86]: SET
          - generic [ref=e87]: Settings
        - button "AUT Autonomy Rules" [ref=e88] [cursor=pointer]:
          - generic [ref=e89]: AUT
          - generic [ref=e90]: Autonomy Rules
        - button "WSP Workspace" [ref=e91] [cursor=pointer]:
          - generic [ref=e92]: WSP
          - generic [ref=e93]: Workspace
    - generic [ref=e94]:
      - generic [ref=e95]: Health Score
      - generic [ref=e99]: "78"
    - generic [ref=e100]:
      - strong [ref=e101]: Dev Mode
      - generic [ref=e102]: SMTP not configured
    - button "Collapse sidebar" [ref=e103] [cursor=pointer]: ◀
  - generic [ref=e104]:
    - banner [ref=e105]:
      - heading "Collections" [level=1] [ref=e107]
      - generic [ref=e108]:
        - generic [ref=e109]: Acme Corp · professional_services
        - generic "Operating in data-driven mode — connect an AI provider in Settings" [ref=e110]:
          - generic [ref=e111]: ●
          - text: Business Data
        - button "Notifications" [ref=e113] [cursor=pointer]:
          - generic [ref=e114]: ●
        - generic "demo@acmecorp.com" [ref=e115]: D
        - button "Sign out" [ref=e116] [cursor=pointer]
    - main [ref=e117]:
      - generic [ref=e118]:
        - generic [ref=e120]: ◉
        - generic [ref=e121]:
          - generic [ref=e122]: Operating in Data-Driven Mode
          - generic [ref=e123]: Your agents are monitoring your business data. Connect an AI provider in Settings to unlock full specialist intelligence.
      - generic [ref=e124]:
        - generic [ref=e125]:
          - generic [ref=e126]:
            - heading "Collections Operator" [level=2] [ref=e127]
            - paragraph [ref=e128]: Monitoring overdue invoices, sending reminders, and escalating aging accounts.
          - button "Run Collections Scan" [ref=e130] [cursor=pointer]
        - generic [ref=e134]: Monitoring
        - generic [ref=e135]:
          - generic [ref=e136]:
            - generic [ref=e137]: $0
            - generic [ref=e138]: Total Overdue
          - generic [ref=e139]:
            - generic [ref=e140]: "0"
            - generic [ref=e141]: Overdue Invoices
          - generic [ref=e142]:
            - generic [ref=e143]: "0"
            - generic [ref=e144]: Escalated
          - generic [ref=e145]:
            - generic [ref=e146]: "0"
            - generic [ref=e147]: Reminders (7d)
        - generic [ref=e149]: ✅ No overdue invoices. All accounts are current.
  - button "Open command interface" [ref=e150] [cursor=pointer]:
    - generic [ref=e151]: CMD
    - generic [ref=e152]: "2"
  - dialog "Command interface" [ref=e153]:
    - generic [ref=e154]:
      - generic [ref=e155]: Command
      - generic [ref=e156]:
        - generic [ref=e157]: Acme Corp
        - generic [ref=e158]: 2 pending
      - button "Close command interface" [ref=e159] [cursor=pointer]: ✕
    - tablist [ref=e160]:
      - tab "Quick Question" [selected] [ref=e161] [cursor=pointer]
      - tab "Agent Direct" [ref=e162] [cursor=pointer]
      - tab "Boardroom" [ref=e163] [cursor=pointer]
      - tab "Recent" [ref=e164] [cursor=pointer]
    - generic [ref=e166]:
      - generic [ref=e167]:
        - textbox "Ask anything about your business..." [ref=e168]
        - button "Send" [disabled] [ref=e169]: Ask
      - generic [ref=e170]:
        - generic [ref=e171]: Or talk directly to an agent
        - generic [ref=e172]:
          - button "FIN Finance" [ref=e173] [cursor=pointer]:
            - generic [ref=e174]: FIN
            - generic [ref=e175]: Finance
          - button "REV Revenue" [ref=e176] [cursor=pointer]:
            - generic [ref=e177]: REV
            - generic [ref=e178]: Revenue
          - button "OPS Operations" [ref=e179] [cursor=pointer]:
            - generic [ref=e180]: OPS
            - generic [ref=e181]: Operations
          - button "GRO Growth" [ref=e182] [cursor=pointer]:
            - generic [ref=e183]: GRO
            - generic [ref=e184]: Growth
          - button "SUP Support" [ref=e185] [cursor=pointer]:
            - generic [ref=e186]: SUP
            - generic [ref=e187]: Support
```

# Test source

```ts
  141 |       bodyText.includes('Approval') || bodyText.includes('approval') ||
  142 |       bodyText.includes('Acme Corp') ||
  143 |       bodyText.includes('Finance') ||
  144 |       bodyText.includes('Autonome') ||
  145 |       bodyText.includes('Tasks') || bodyText.includes('tasks');
  146 |     expect(hasMeaningfulContent).toBe(true);
  147 |   });
  148 | });
  149 | 
  150 | // ── Outputs Page ──────────────────────────────────────────────────────────────
  151 | 
  152 | test.describe('Outputs — Morning Briefing, Weekly Report, Collections', () => {
  153 |   test.beforeEach(async ({ page }) => {
  154 |     await injectAuthSession(page);
  155 |     await setupApiMocks(page);
  156 |   });
  157 | 
  158 |   test('Outputs page loads without errors and is not empty', async ({ page }) => {
  159 |     await page.goto('/');
  160 |     await page.waitForLoadState('networkidle');
  161 |     // Navigate to Outputs
  162 |     const outputsLink = page.locator('text=Outputs, text=outputs').first();
  163 |     if (await outputsLink.count() > 0) {
  164 |       await outputsLink.click();
  165 |     } else {
  166 |       // Try direct navigation
  167 |       await page.goto('/?view=outputs');
  168 |     }
  169 |     await page.waitForLoadState('networkidle');
  170 |     const bodyText = await page.locator('body').innerText();
  171 |     // Should not show SQL errors
  172 |     expect(bodyText).not.toMatch(/column .* does not exist/i);
  173 |     expect(bodyText).not.toMatch(/does not exist/i);
  174 |   });
  175 | 
  176 |   test('Morning Briefing output contains expected business data', async ({ page }) => {
  177 |     // Mock the outputs endpoint to return the morning briefing
  178 |     await page.route('**/api/outputs*', async (route) => {
  179 |       const url = new URL(route.request().url());
  180 |       if (url.pathname.match(/\/api\/outputs\/\w+$/)) {
  181 |         return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ output: SEED.outputs[0] }) });
  182 |       }
  183 |       return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ outputs: SEED.outputs, total: SEED.outputs.length }) });
  184 |     });
  185 |     await page.goto('/');
  186 |     // The briefing content should reference actual business entities
  187 |     await page.waitForLoadState('domcontentloaded');
  188 |     // Morning briefing data is seeded so the page should have real content
  189 |     const bodyText = await page.locator('body').innerText();
  190 |     // At minimum the app should not throw JS errors
  191 |     const errors = await page.evaluate(() => window.__e2eErrors || []);
  192 |     expect(errors).toHaveLength(0);
  193 |   });
  194 | 
  195 |   test('Generate Morning Briefing button triggers API call', async ({ page }) => {
  196 |     let triggerCalled = false;
  197 |     await page.route('**/api/outputs/trigger/morning_briefing', (route) => {
  198 |       triggerCalled = true;
  199 |       return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ output: SEED.outputs[0] }) });
  200 |     });
  201 |     await page.goto('/');
  202 |     await page.waitForLoadState('networkidle');
  203 |     // Look for the generate briefing button in the outputs area
  204 |     const triggerBtn = page.locator('button:has-text("Morning Briefing"), button:has-text("Generate")').first();
  205 |     if (await triggerBtn.count() > 0) {
  206 |       await triggerBtn.click();
  207 |       // Give time for the API call
  208 |       await page.waitForTimeout(500);
  209 |       expect(triggerCalled).toBe(true);
  210 |     }
  211 |   });
  212 | 
  213 |   test('Generate Weekly Report button triggers API call', async ({ page }) => {
  214 |     let triggerCalled = false;
  215 |     await page.route('**/api/outputs/trigger/weekly_report', (route) => {
  216 |       triggerCalled = true;
  217 |       return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ output: SEED.outputs[1] }) });
  218 |     });
  219 |     await page.goto('/');
  220 |     await page.waitForLoadState('networkidle');
  221 |     const triggerBtn = page.locator('button:has-text("Weekly Report")').first();
  222 |     if (await triggerBtn.count() > 0) {
  223 |       await triggerBtn.click();
  224 |       await page.waitForTimeout(500);
  225 |       expect(triggerCalled).toBe(true);
  226 |     }
  227 |   });
  228 | 
  229 |   test('Generate Collections Scan button triggers API call', async ({ page }) => {
  230 |     let triggerCalled = false;
  231 |     await page.route('**/api/outputs/trigger/collections_summary', (route) => {
  232 |       triggerCalled = true;
  233 |       return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ output: SEED.outputs[2] }) });
  234 |     });
  235 |     await page.goto('/');
  236 |     await page.waitForLoadState('networkidle');
  237 |     const triggerBtn = page.locator('button:has-text("Collections")').first();
  238 |     if (await triggerBtn.count() > 0) {
  239 |       await triggerBtn.click();
  240 |       await page.waitForTimeout(500);
> 241 |       expect(triggerCalled).toBe(true);
      |                             ^ Error: expect(received).toBe(expected) // Object.is equality
  242 |     }
  243 |   });
  244 | });
  245 | 
  246 | // ── Boardroom (AI Chat) ───────────────────────────────────────────────────────
  247 | 
  248 | test.describe('Boardroom — AI Chat Interface', () => {
  249 |   test.beforeEach(async ({ page }) => {
  250 |     await injectAuthSession(page);
  251 |     await setupApiMocks(page);
  252 |   });
  253 | 
  254 |   test('Boardroom loads without errors', async ({ page }) => {
  255 |     await page.goto('/');
  256 |     await page.waitForLoadState('networkidle');
  257 |     const bodyText = await page.locator('body').innerText();
  258 |     // No raw error messages
  259 |     expect(bodyText).not.toMatch(/column .* does not exist/i);
  260 |     expect(bodyText).not.toMatch(/Internal Server Error/i);
  261 |   });
  262 | 
  263 |   test('Boardroom AI query returns a response', async ({ page }) => {
  264 |     let aiQueryCalled = false;
  265 |     await page.route('**/api/ai/query', (route) => {
  266 |       aiQueryCalled = true;
  267 |       return route.fulfill({
  268 |         status: 200,
  269 |         contentType: 'application/json',
  270 |         body: JSON.stringify({ response: 'There are 2 overdue invoices totalling $8,600. Finance agent has queued reminders.', sessionId: 'session-1' }),
  271 |       });
  272 |     });
  273 |     await page.goto('/');
  274 |     await page.waitForLoadState('networkidle');
  275 |     // Look for an AI query input or boardroom chat input
  276 |     const aiInput = page.locator('input[placeholder*="Ask"], textarea[placeholder*="Ask"], input[placeholder*="Message"]').first();
  277 |     if (await aiInput.count() > 0) {
  278 |       await aiInput.fill('What are the overdue invoices?');
  279 |       await aiInput.press('Enter');
  280 |       await page.waitForTimeout(500);
  281 |       expect(aiQueryCalled).toBe(true);
  282 |     }
  283 |   });
  284 | 
  285 |   test('Boardroom chat shows AI response not fallback error', async ({ page }) => {
  286 |     await page.route('**/api/ai/query', (route) =>
  287 |       route.fulfill({
  288 |         status: 200,
  289 |         contentType: 'application/json',
  290 |         body: JSON.stringify({ response: 'Current overdue amount: $8,600 across 2 accounts.', sessionId: 'session-1' }),
  291 |       })
  292 |     );
  293 |     await page.route('**/api/boardroom/chat', (route) =>
  294 |       route.fulfill({
  295 |         status: 200,
  296 |         contentType: 'application/json',
  297 |         body: JSON.stringify({ response: 'Current overdue amount: $8,600 across 2 accounts.', sessionId: 'session-1' }),
  298 |       })
  299 |     );
  300 |     await page.goto('/');
  301 |     await page.waitForLoadState('networkidle');
  302 |     const bodyText = await page.locator('body').innerText();
  303 |     // Should not show AI provider failure to user
  304 |     expect(bodyText).not.toMatch(/AI provider.*failed/i);
  305 |     expect(bodyText).not.toMatch(/incorrect api key/i);
  306 |     expect(bodyText).not.toMatch(/quota exceeded/i);
  307 |   });
  308 | });
  309 | 
  310 | // ── Approvals ─────────────────────────────────────────────────────────────────
  311 | 
  312 | test.describe('Approvals View', () => {
  313 |   test.beforeEach(async ({ page }) => {
  314 |     await injectAuthSession(page);
  315 |     await setupApiMocks(page);
  316 |   });
  317 | 
  318 |   test('Approvals page loads and is not empty', async ({ page }) => {
  319 |     await page.goto('/');
  320 |     await page.waitForLoadState('networkidle');
  321 |     const bodyText = await page.locator('body').innerText();
  322 |     expect(bodyText).not.toMatch(/column .* does not exist/i);
  323 |   });
  324 | 
  325 |   test('Pending approval items show approve and reject actions', async ({ page }) => {
  326 |     let approveCalled = false;
  327 |     await page.route('**/api/agent-actions/*/approve', (route) => {
  328 |       approveCalled = true;
  329 |       return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
  330 |     });
  331 |     await page.goto('/');
  332 |     await page.waitForLoadState('networkidle');
  333 |     // If approval buttons exist, they should be clickable
  334 |     const approveBtn = page.locator('button:has-text("Approve")').first();
  335 |     if (await approveBtn.count() > 0) {
  336 |       // Verify button is visible and enabled
  337 |       await expect(approveBtn).toBeVisible();
  338 |     }
  339 |   });
  340 | });
  341 | 
```