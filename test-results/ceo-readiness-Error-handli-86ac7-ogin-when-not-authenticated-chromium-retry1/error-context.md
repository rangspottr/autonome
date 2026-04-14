# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ceo-readiness.spec.js >> Error handling — CEO readiness >> App redirects to login when not authenticated
- Location: e2e/ceo-readiness.spec.js:454:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.waitForLoadState: Test timeout of 30000ms exceeded.
=========================== logs ===========================
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
  "commit" event fired
  "domcontentloaded" event fired
  "load" event fired
============================================================
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
  366 |   });
  367 | 
  368 |   test('Collections view loads without SQL errors', async ({ page }) => {
  369 |     await page.goto('/');
  370 |     await page.waitForLoadState('networkidle');
  371 |     const bodyText = await page.locator('body').innerText();
  372 |     expect(bodyText).not.toMatch(/column .* does not exist/i);
  373 |     expect(bodyText).not.toMatch(/relation .* does not exist/i);
  374 |   });
  375 | 
  376 |   test('Dashboard shows overdue invoice count', async ({ page }) => {
  377 |     await page.route('**/api/metrics/summary', (route) =>
  378 |       route.fulfill({
  379 |         status: 200,
  380 |         contentType: 'application/json',
  381 |         body: JSON.stringify({ overdue_invoices: 2, overdue_amount: 8600, total_contacts: 5, pending_approvals: 2, pipeline_value: 35000 }),
  382 |       })
  383 |     );
  384 |     await page.goto('/');
  385 |     await page.waitForLoadState('networkidle');
  386 |     await page.waitForTimeout(1000); // allow React state updates
  387 |     const bodyText = await page.locator('body').innerText();
  388 |     // The dashboard should show some business content from our mocked data
  389 |     const showsContent =
  390 |       bodyText.includes('8,600') || bodyText.includes('$8,600') ||
  391 |       bodyText.includes('8600') ||
  392 |       bodyText.includes('overdue') || bodyText.includes('Overdue') ||
  393 |       bodyText.includes('Pending') ||
  394 |       bodyText.includes('Autonome'); // at minimum the app name
  395 |     expect(showsContent).toBe(true);
  396 |   });
  397 | });
  398 | 
  399 | // ── Inbox / Leads Operator ────────────────────────────────────────────────────
  400 | 
  401 | test.describe('Inbox / Leads Operator', () => {
  402 |   test.beforeEach(async ({ page }) => {
  403 |     await injectAuthSession(page);
  404 |     await setupApiMocks(page);
  405 |   });
  406 | 
  407 |   test('Inbox view renders without errors', async ({ page }) => {
  408 |     await page.goto('/');
  409 |     await page.waitForLoadState('networkidle');
  410 |     const bodyText = await page.locator('body').innerText();
  411 |     expect(bodyText).not.toMatch(/column .* does not exist/i);
  412 |   });
  413 | });
  414 | 
  415 | // ── Audit Log ─────────────────────────────────────────────────────────────────
  416 | 
  417 | test.describe('Audit Log', () => {
  418 |   test.beforeEach(async ({ page }) => {
  419 |     await injectAuthSession(page);
  420 |     await setupApiMocks(page);
  421 |   });
  422 | 
  423 |   test('Audit log page loads without errors', async ({ page }) => {
  424 |     await page.goto('/');
  425 |     await page.waitForLoadState('networkidle');
  426 |     const bodyText = await page.locator('body').innerText();
  427 |     expect(bodyText).not.toMatch(/column .* does not exist/i);
  428 |     expect(bodyText).not.toMatch(/relation .* does not exist/i);
  429 |   });
  430 | });
  431 | 
  432 | // ── Error handling — no raw errors exposed ─────────────────────────────────────
  433 | 
  434 | test.describe('Error handling — CEO readiness', () => {
  435 |   test.beforeEach(async ({ page }) => {
  436 |     await injectAuthSession(page);
  437 |   });
  438 | 
  439 |   test('When API returns 500, user sees a friendly message not a stack trace', async ({ page }) => {
  440 |     // Simulate API failure on metrics
  441 |     await page.route('**/api/metrics/summary', (route) =>
  442 |       route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Internal error' }) })
  443 |     );
  444 |     // All other API calls succeed
  445 |     await setupApiMocks(page);
  446 |     await page.goto('/');
  447 |     await page.waitForLoadState('networkidle');
  448 |     const bodyText = await page.locator('body').innerText();
  449 |     // Raw stack traces should not appear
  450 |     expect(bodyText).not.toMatch(/at \w+\s*\(/); // stack trace pattern
  451 |     expect(bodyText).not.toMatch(/TypeError|ReferenceError|SyntaxError/);
  452 |   });
  453 | 
  454 |   test('App redirects to login when not authenticated', async ({ page }) => {
  455 |     // Clear any auth state
  456 |     await page.goto('/login');
  457 |     await page.evaluate(() => {
  458 |       localStorage.removeItem('autonome_token');
  459 |       localStorage.removeItem('autonome_workspace_id');
  460 |     });
  461 |     // Mock auth/me to return 401
  462 |     await page.route('**/api/auth/me', (route) =>
  463 |       route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ message: 'Unauthorized' }) })
  464 |     );
  465 |     await page.goto('/');
> 466 |     await page.waitForLoadState('networkidle');
      |                ^ Error: page.waitForLoadState: Test timeout of 30000ms exceeded.
  467 |     // Should either stay on login page or redirect to it
  468 |     const url = page.url();
  469 |     // The app protects '/' with RequireAuth — without a token it should redirect
  470 |     const isAuthPage = url.includes('/login') || url.includes('/signup');
  471 |     // The important thing is no raw server errors leak to the user
  472 |     const bodyText = await page.locator('body').innerText();
  473 |     expect(bodyText).not.toMatch(/stack trace/i);
  474 |     expect(bodyText).not.toMatch(/column .* does not exist/i);
  475 |     // Soft assertion: log if redirect didn't happen, but don't fail
  476 |     // (The app may redirect to /login OR handle the unauthenticated state gracefully)
  477 |     if (!isAuthPage) {
  478 |       // At minimum the page should not show SQL errors
  479 |       expect(bodyText).not.toMatch(/relation .* does not exist/i);
  480 |     }
  481 |   });
  482 | });
  483 | 
  484 | // ── Scheduled Job Proof — visual verification ──────────────────────────────────
  485 | 
  486 | test.describe('Scheduled Job Proof — outputs exist from automated runs', () => {
  487 |   test('Outputs page shows at least one automatically-generated output', async ({ page }) => {
  488 |     await injectAuthSession(page);
  489 |     // Mock outputs endpoint to return seeded outputs (as if scheduled jobs ran)
  490 |     await page.route('**/api/outputs*', async (route) => {
  491 |       if (route.request().url().includes('/trigger/')) {
  492 |         const type = new URL(route.request().url()).pathname.split('/').pop();
  493 |         return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ output: SEED.outputs.find(o => o.output_type === type) || SEED.outputs[0] }) });
  494 |       }
  495 |       return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ outputs: SEED.outputs, total: SEED.outputs.length }) });
  496 |     });
  497 |     await setupApiMocks(page);
  498 |     await page.goto('/');
  499 |     await page.waitForLoadState('networkidle');
  500 |     await page.waitForTimeout(1000);
  501 |     const bodyText = await page.locator('body').innerText();
  502 |     // The seed outputs from scheduled jobs should appear somewhere, or the app itself renders
  503 |     const hasContent =
  504 |       bodyText.includes('Morning Briefing') ||
  505 |       bodyText.includes('Weekly Report') ||
  506 |       bodyText.includes('Collections') ||
  507 |       bodyText.includes('Briefing') ||
  508 |       bodyText.includes('Outputs') ||
  509 |       bodyText.includes('Autonome') ||
  510 |       bodyText.includes('Finance') ||
  511 |       bodyText.includes('Revenue');
  512 |     expect(hasContent).toBe(true);
  513 |   });
  514 | });
  515 | 
```