import "./styles/globals.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/app";

async function start() {
  if (import.meta.env.MODE === "e2e") {
    const { installMockBackend } = await import("./testing/mock-backend");
    installMockBackend();
  }
  const container = document.getElementById("root");
  if (!container) throw new Error("index.html is missing #root");
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void start();
