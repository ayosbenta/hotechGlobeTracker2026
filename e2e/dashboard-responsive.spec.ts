import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

const viewports = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
];

const dashboards = [
  { route: "/admin/dashboard", heading: "Good morning, Admin!", role: "Admin" },
  { route: "/agent/dashboard", heading: "Good morning, Maria!", role: "Agent" },
  { route: "/processor/dashboard", heading: "Dashboard", role: "Processor" },
] as const;

/**
 * These regressions exercise the frozen dashboard visual baseline, which
 * MVP-1's route guards now gate behind GET /api/auth/me. There is no live
 * BFF/Apps Script backing `npm run dev` in this test harness, so /api/auth/me
 * is stubbed here to simulate an authenticated session for the given role.
 * This never touches, weakens, or bypasses the real auth code: it only
 * fakes the one network response the guard reads, exactly as the unit
 * tests do with a mocked fetch.
 */
async function mockAuthenticatedSession(
  page: Page,
  role: string,
): Promise<void> {
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        requestId: "e2e-request",
        data: {
          user: { fullName: "", role },
          session: {
            idleExpiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
            absoluteExpiresAt: new Date(
              Date.now() + 8 * 60 * 60 * 1000,
            ).toISOString(),
          },
          redirectTo: `/${role.toLowerCase()}/dashboard`,
        },
      }),
    }),
  );
}

/**
 * MVP-3 wires the frozen dashboard to live /api/applications (and, for
 * Admin, /api/plans + /api/users for quick-stat counts) data. There is no
 * live BFF/Apps Script backing this harness, so those routes are stubbed
 * with a small fixed dataset -- this never touches, weakens, or bypasses
 * the real fetch/aggregation code, it only fakes the network responses the
 * page reads, exactly as mockAuthenticatedSession does for /api/auth/me.
 */
async function mockDashboardData(page: Page): Promise<void> {
  await page.route("**/api/applications", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        requestId: "e2e-request",
        data: {
          applications: [
            {
              applicationId: "a1",
              customerFullName: "Maria Santos",
              completeAddress: "123 Rizal St",
              cityMunicipality: "Quezon City",
              province: "Metro Manila",
              agentId: "agent-1",
              processorId: "proc-1",
              currentStatus: "Installed",
              planNameSnapshot: "GFiber Unli 1499",
              submittedAt: "2025-04-22T00:00:00.000Z",
              version: 3,
            },
            {
              applicationId: "a2",
              customerFullName: "Ramon Villanueva",
              completeAddress: "45 Bonifacio Ave",
              cityMunicipality: "Makati City",
              province: "Metro Manila",
              agentId: "agent-1",
              processorId: "proc-1",
              currentStatus: "Ongoing",
              planNameSnapshot: "GFiber Unli 1699",
              submittedAt: "2025-04-21T00:00:00.000Z",
              version: 2,
            },
          ],
          nextCursor: null,
        },
        meta: { timestamp: new Date().toISOString(), nextCursor: null },
      }),
    }),
  );
  await page.route("**/api/plans", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        requestId: "e2e-request",
        data: { plans: [], nextCursor: null },
        meta: { timestamp: new Date().toISOString(), nextCursor: null },
      }),
    }),
  );
  await page.route("**/api/users", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        requestId: "e2e-request",
        data: { users: [], nextCursor: null },
        meta: { timestamp: new Date().toISOString(), nextCursor: null },
      }),
    }),
  );
}

for (const dashboard of dashboards) {
  for (const viewport of viewports) {
    test(`${dashboard.route} has no horizontal overflow at ${viewport.width}px`, async ({
      page,
    }) => {
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") pageErrors.push(message.text());
      });

      await mockAuthenticatedSession(page, dashboard.role);
      await mockDashboardData(page);
      await page.setViewportSize(viewport);
      await page.goto(dashboard.route);

      await expect(
        page.getByRole("heading", { name: dashboard.heading, exact: true }),
      ).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        )
        .toBe(true);
      expect(pageErrors).toEqual([]);
    });
  }
}

for (const redirect of ["/admin", "/agent", "/processor"] as const) {
  const role =
    redirect === "/admin"
      ? "Admin"
      : redirect === "/agent"
        ? "Agent"
        : "Processor";

  test(`${redirect} redirects to its canonical dashboard route`, async ({
    page,
  }) => {
    await mockAuthenticatedSession(page, role);
    await mockDashboardData(page);
    await page.goto(redirect);
    await expect(page).toHaveURL(new RegExp(`${redirect}/dashboard$`));
  });
}

test("an unauthenticated visitor to a protected dashboard route is redirected to /login", async ({
  page,
}) => {
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({
        ok: false,
        requestId: "e2e-request",
        error: { code: "AUTH_REQUIRED", message: "Sign in is required." },
      }),
    }),
  );
  await page.goto("/admin/dashboard");
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByText("Sign in with your Google account to continue."),
  ).toBeVisible();
});
