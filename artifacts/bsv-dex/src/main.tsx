import "./index.css";

const STAGING =
  import.meta.env.VITE_ORAHDEX_STAGING_CATALOG === "true";

async function start() {
  if (STAGING) {
    const [{ createElement }, { createRoot }, { default: App }] =
      await Promise.all([
        import("react"),
        import("react-dom/client"),
        import("./StagingCatalogApp"),
      ]);

    createRoot(document.getElementById("root")!)
      .render(createElement(App));

    return;
  }

  await import("./production-main");
}

start().catch(console.error);
