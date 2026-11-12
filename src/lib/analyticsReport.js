import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server.browser";
import styles from "../analytics.css?inline";

export function createAnalyticsReport({ company, content }) {
  const document = createElement("html", { lang: "en" },
    createElement("head", null,
      createElement("meta", { charSet: "utf-8" }),
      createElement("meta", { name: "viewport", content: "width=device-width, initial-scale=1" }),
      createElement("title", null, `${company} — Legal Portfolio Review`),
      createElement("style", null, styles),
    ),
    createElement("body", { className: "analytics-document" },
      createElement("main", { className: "analytics-dashboard" }, content),
    ),
  );
  return `<!doctype html>\n${renderToStaticMarkup(document)}`;
}
