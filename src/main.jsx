import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import RegistroCandidatos from "./RegistroCandidatos.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <RegistroCandidatos />
  </StrictMode>
);
