import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { App } from "@/app";

describe("App routes", () => {
  it("renders the Agent portal placeholder", () => {
    render(
      <MemoryRouter initialEntries={["/agent"]}>
        <App />
      </MemoryRouter>,
    );

    expect(
      screen.getByText("Agent portal", { selector: "p" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "The foundation is ready for your workflow.",
      }),
    ).toBeInTheDocument();
  });
});
