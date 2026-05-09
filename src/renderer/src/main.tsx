import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { App } from "./App";
import "./index.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element #root was not found");
}

createRoot(root).render(
  <StrictMode>
    <App />
    <Toaster
      richColors
      theme="dark"
      position="top-right"
      offset={{ top: 75 }}
      closeButton
      toastOptions={{ duration: 4500 }}
    />
  </StrictMode>,
);
