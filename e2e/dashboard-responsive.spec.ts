import { expect, test } from "@playwright/test";

const viewports = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
];

const dashboards = [
  { route: "/admin/dashboard", heading: "Good morning, Admin!" },
  { route: "/agent/dashboard", heading: "Good morning, Maria!" },
  { route: "/processor/dashboard", heading: "Dashboard" },
] as const;

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

for (const redirect of ["/admin", "/agent", "/processor"]) {
  test(`${redirect} redirects to its canonical dashboard route`, async ({
    page,
  }) => {
    await page.goto(redirect);
    await expect(page).toHaveURL(new RegExp(`${redirect}/dashboard$`));
  });
}
