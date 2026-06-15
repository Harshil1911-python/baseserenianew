import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import PublicSheet from "./PublicSheet.jsx";
import "./style.css";

const path = window.location.pathname;
const shareMatch = path.match(/^\/share\/([a-zA-Z0-9]+)/);

const root = createRoot(document.getElementById("root"));
root.render(shareMatch ? <PublicSheet shareToken={shareMatch[1]} /> : <App />);
