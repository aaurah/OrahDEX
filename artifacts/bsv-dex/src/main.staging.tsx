import "./index.css";
import React from "react";
import { createRoot } from "react-dom/client";
import StagingCatalogApp from "./StagingCatalogApp";

const element = document.getElementById("root");

if (!element) {
  throw new Error("Staging root element missing");
}

createRoot(element).render(
  React.createElement(StagingCatalogApp)
);
