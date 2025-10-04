import { render, screen } from "@/test/test-utils";
import { AppShell } from "./app-shell";

describe("AppShell", () => {
  it("renders the primary navigation items", () => {
    render(
      <AppShell>
        <div>content</div>
      </AppShell>
    );

    expect(screen.getAllByRole("link", { name: /dashboard/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /servers/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /tool catalog/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /toolsets/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /personas/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /config/i }).length).toBeGreaterThan(0);
  });

  it("marks the current route as active", () => {
    render(
      <AppShell>
        <div>content</div>
      </AppShell>,
      { router: { initialEntries: ["/tools"] } }
    );

    const toolLinks = screen.getAllByRole("link", { name: /tool catalog/i });
    expect(toolLinks.some((link) => link.getAttribute("aria-current") === "page")).toBe(true);
  });
});
