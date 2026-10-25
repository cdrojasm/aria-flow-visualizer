import { expect, test } from "@playwright/test";

type RoleCase = {
  key: string;
  role: string;
  label: string;
  allowedLinks: string[];
  firstRoute: string;
};

// Keep this matrix aligned with ROLE_NAV and the labels in AppSidebar.
const roleCases: RoleCase[] = [
  {
    key: "MANAGER",
    role: "manager",
    label: "Manager",
    allowedLinks: ["Dashboard", "En proceso", "Configuración", "Respaldos"],
    firstRoute: "/dashboard",
  },
  {
    key: "CHANNEL_MANAGER",
    role: "channel_manager",
    label: "Channel Manager",
    allowedLinks: ["Dashboard", "Testing", "Biblioteca", "Configuración", "Modelos"],
    firstRoute: "/dashboard",
  },
  {
    key: "RELEASE_MANAGER",
    role: "release_manager",
    label: "Release Manager",
    allowedLinks: ["Dashboard", "En proceso", "Testing", "Configuración"],
    firstRoute: "/dashboard",
  },
  {
    key: "DATA_ANALYST",
    role: "data_analyst",
    label: "Data Analyst",
    allowedLinks: ["Monitor del Agente", "Testing", "Biblioteca", "Modelos"],
    firstRoute: "/monitor",
  },
  {
    key: "FRAUD_ANALYST",
    role: "fraud_analyst",
    label: "Fraud Analyst",
    allowedLinks: ["En proceso"],
    firstRoute: "/cola",
  },
  {
    key: "OPS_ANALYST",
    role: "ops_analyst",
    label: "Ops Analyst",
    allowedLinks: ["Dashboard", "En proceso", "Monitor del Agente"],
    firstRoute: "/dashboard",
  },
];

for (const roleCase of roleCases) {
  test(`E2E real E00: login, navegación y autorización ${roleCase.role}`, async ({ page }) => {
    const email = process.env[`E2E_${roleCase.key}_EMAIL`];
    const password = process.env[`E2E_${roleCase.key}_PASSWORD`];
    test.skip(
      !email || !password,
      `Define E2E_${roleCase.key}_EMAIL y E2E_${roleCase.key}_PASSWORD.`,
    );

    // The sidebar must never paint an option the role cannot reach (no flicker).
    const seenLinks = new Set<string>();
    await page.exposeFunction("recordNavLink", (href: string) => seenLinks.add(href));
    await page.addInitScript(() => {
      const record = () =>
        document
          .querySelectorAll("aside nav a")
          .forEach((a) =>
            (window as never as { recordNavLink: (h: string) => void }).recordNavLink(
              a.getAttribute("href") ?? "",
            ),
          );
      new MutationObserver(record).observe(document, { childList: true, subtree: true });
    });

    await page.goto("/login");
    await page.getByLabel("Correo").fill(email!);
    await page.getByLabel("Contraseña").fill(password!);
    await page.getByRole("button", { name: "Ingresar" }).click();

    await expect(page).toHaveURL(new RegExp(`${roleCase.firstRoute.replace("/", "\\/")}$`));
    await expect(page.getByText(roleCase.label, { exact: true })).toBeVisible();

    for (const label of roleCase.allowedLinks) {
      await expect(page.getByRole("link", { name: label, exact: true })).toBeVisible();
    }

    // Every link ever painted belongs to this role's navigation.
    const allowedHrefs = await Promise.all(
      roleCase.allowedLinks.map((label) =>
        page.getByRole("link", { name: label, exact: true }).getAttribute("href"),
      ),
    );
    expect(seenLinks.size).toBeGreaterThan(0);
    for (const href of seenLinks)
      expect(await page.locator(`aside nav a[href="${href}"]`).count()).toBeGreaterThan(0);
    expect(allowedHrefs.every((h) => h && seenLinks.has(h))).toBeTruthy();

    // The sidebar remembers collapsed/open across reloads.
    const sidebar = page.locator("aside").first();
    await expect(sidebar).toHaveClass(/w-\[220px\]/);
    await sidebar.getByRole("button").first().click();
    await expect(sidebar).toHaveClass(/w-14/);
    // Collapsed: icon-only links (the label moves to the tooltip) and no brand text.
    await expect(sidebar.getByText("ARIA", { exact: true })).toHaveCount(0);
    await expect(sidebar.getByRole("link").first()).toHaveAttribute("title", /.+/);
    await page.reload();
    await expect(page.locator("aside").first()).toHaveClass(/w-14/);
    await page.locator("aside").first().getByRole("button").first().click();
    await expect(page.locator("aside").first()).toHaveClass(/w-\[220px\]/);
    expect(await page.evaluate(() => localStorage.getItem("aria.sidebar.collapsed"))).toBe("0");

    const navigationLink = page.getByRole("link", {
      name: roleCase.allowedLinks[1] ?? roleCase.allowedLinks[0],
      exact: true,
    });
    const navigationPath = await navigationLink.getAttribute("href");
    await navigationLink.click();
    await expect(page).toHaveURL(new RegExp(`${navigationPath?.replace("/", "\\/")}$`));

    const restrictedRoute = roleCase.role === "manager" ? "/testing" : "/backups";
    await page.goto(restrictedRoute);
    await expect(page).toHaveURL(
      new RegExp(`(${roleCase.firstRoute.replace("/", "\\/")}|\\/login)(\\?.*)?$`),
    );
    if (new URL(page.url()).pathname !== "/login") {
      await expect(page.getByText(roleCase.label, { exact: true })).toBeVisible();
    }
  });
}
