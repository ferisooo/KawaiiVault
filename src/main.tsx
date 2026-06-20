import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Set initial theme attribute so CSS variables apply on first render
document.documentElement.setAttribute("data-theme", "neon");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
