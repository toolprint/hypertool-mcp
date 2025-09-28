import { render, screen } from "@/test/test-utils";
import DashboardPage from "./dashboard";

describe("DashboardPage", () => {
  it("renders summary information for the active toolset", () => {
    render(<DashboardPage />);

    expect(screen.getByText(/active toolset/i)).toBeInTheDocument();
    expect(screen.getByText(/local-dev/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /persona/i })).toBeInTheDocument();
    expect(screen.getByText(/12 available/i)).toBeInTheDocument();
    expect(screen.getByText(/2 unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/1 disabled/i)).toBeInTheDocument();
  });

  it("lists downstream server status cards", () => {
    render(<DashboardPage />);

    expect(screen.getByText(/server status/i)).toBeInTheDocument();
    ["git", "linear", "notion"].forEach((server) => {
      expect(screen.getByText(server)).toBeInTheDocument();
    });
    expect(screen.getAllByRole("button", { name: /view details/i }).length).toBeGreaterThan(0);
  });
});
