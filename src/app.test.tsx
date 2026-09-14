import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { App } from "@/app";

describe("App routes", () => {
  it("renders the Agent dashboard", () => {
    render(
      <MemoryRouter initialEntries={["/agent/dashboard"]}>
        <App />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: "Good morning, Maria!" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add New Application" }),
    ).toBeInTheDocument();
  });
});
