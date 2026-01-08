import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import Home from "./Home";

let auth0State: unknown;
vi.mock("@auth0/auth0-react", () => ({
  useAuth0: () => auth0State,
}));

describe("Home", () => {
  it("renders logged-out content", () => {
    auth0State = { isAuthenticated: false, loginWithRedirect: vi.fn(), user: null };

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { name: /golf app/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /log in/i })).toBeDefined();
  });

  it("renders logged-in content", () => {
    auth0State = {
      isAuthenticated: true,
      loginWithRedirect: vi.fn(),
      user: { name: "Jonatan" },
    };

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>
    );

    expect(screen.getByText(/logged in as jonatan\./i)).toBeDefined();
    expect(screen.getByRole("link", { name: /start a round/i })).toBeDefined();
  });
});
