import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

// Шрифты self-hosted через Fontsource: без внешних запросов к Google Fonts.
// Unbounded и Golos Text покрывают cyrillic и cyrillic-ext,
// то есть казахские глифы (ә, ғ, қ, ң, ө, ұ, ү, һ, і) тоже.
import "@fontsource-variable/unbounded";
import "@fontsource-variable/golos-text";

import "./index.css";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
