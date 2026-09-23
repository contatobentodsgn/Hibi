import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MacCalendarConnection } from "../MacCalendarConnection";

describe("MacCalendarConnection", () => {
  it("explains that Calendar access is explicit and never silently requested", () => {
    const markup = renderToStaticMarkup(
      <MacCalendarConnection onEvent={() => undefined} />,
    );

    expect(markup).toContain("Calendário do Mac");
    expect(markup).toContain("Permitir Calendário");
    expect(markup).toContain("nunca é solicitado silenciosamente");
    expect(markup).not.toMatch(/Hibi|Taby/);
  });

  it("offers an explicit publish flow for local schedule blocks", () => {
    const markup = renderToStaticMarkup(
      <MacCalendarConnection
        onEvent={() => undefined}
        blocks={[
          {
            id: "block-1",
            title: "Planejamento",
            start: "2026-09-14T09:00:00.000Z",
            end: "2026-09-14T10:00:00.000Z",
            category: "work",
          },
        ]}
      />,
    );

    expect(markup).toContain("Publicar bloco");
    expect(markup).toContain("Planejamento");
    expect(markup).toContain("Preparar confirmação");
  });
});
