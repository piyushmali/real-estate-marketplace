import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/global.css";
import { WalletContextProvider } from "./context/WalletContext";

createRoot(document.getElementById("root")!).render(
  <WalletContextProvider>
    <App />
  </WalletContextProvider>
);
