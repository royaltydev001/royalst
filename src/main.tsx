import { createRoot } from "react-dom/client";
import App from "./App";
import Storage from "./storage/storage";
import "../css/variables.css";
import "../css/style.css";
import "../css/cards.css";
import "../css/animations.css";
import "../css/responsive.css";

document.body.classList.toggle("dark-mode", Storage.get<boolean>("royalstream:darkMode", true) ?? true);

createRoot(document.getElementById("root")!).render(
  <App />,
);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" })
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => {
        const enabled = Storage.get<boolean>("royalstream:offlineCache", true) ?? true;
        registration.active?.postMessage({ type: "SET_OFFLINE_CACHE", enabled });
      })
      .catch((error) => console.warn("Service worker registration failed:", error));
  });
}
