import React from "react";
import { createRoot } from "react-dom/client";
import "./styles/theme.css";
import App from "./App.js";

const root = createRoot(document.getElementById("root")!);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
