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
    test.skip(!email || !password, `Define E2E_${roleCase.key}_EMAIL y E2E_${roleCase.key}_PASSWORD.`);

    await page.goto("/login");
    await page.getByLabel("Correo").fill(email!);
    await page.getByLabel("Contraseña").fill(password!);
    await page.getByRole("button", { name: "Ingresar" }).click();

    await expect(page).toHaveURL(new RegExp(`${roleCase.firstRoute.replace("/", "\\/")}$`));
    await expect(page.getByText(roleCase.label, { exact: true })).toBeVisible();

    for (const label of roleCase.allowedLinks) {
      await expect(page.getByRole("link", { name: label, exact: true })).toBeVisible();
    }

    const navigationLink = page.getByRole("link", {
      name: roleCase.allowedLinks[1] ?? roleCase.allowedLinks[0],
      exact: true,
    });
    const navigationPath = await navigationLink.getAttribute("href");
    await navigationLink.click();
    await expect(page).toHaveURL(new RegExp(`${navigationPath?.replace("/", "\\/")}$`));

    const restrictedRoute = roleCase.role === "manager" ? "/biblioteca" : "/backups";
    await page.goto(restrictedRoute);
    await expect(page).toHaveURL(new RegExp(`${roleCase.firstRoute.replace("/", "\\/")}$`));
    await expect(page.getByText(roleCase.label, { exact: true })).toBeVisible();
  });
}
