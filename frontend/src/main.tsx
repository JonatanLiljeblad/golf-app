import React from "react";
import ReactDOM from "react-dom/client";
import { Auth0Provider } from "@auth0/auth0-react";
import { RouterProvider } from "react-router-dom";
import { router } from "./router";
import "./index.css";

const domainRaw = import.meta.env.VITE_AUTH0_DOMAIN;
const domain = domainRaw?.replace(/^https?:\/\//, "").replace(/\/$/, "");
const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;
const audience = import.meta.env.VITE_AUTH0_AUDIENCE;

const looksPlaceholder =
  domain === "your-tenant.us.auth0.com" || clientId === "your-client-id";

if (!domain || !clientId || looksPlaceholder) {
  console.error(
    "Auth0 config missing: set real VITE_AUTH0_DOMAIN and VITE_AUTH0_CLIENT_ID in frontend/.env (see frontend/.env.example).",
  );
  throw new Error("Missing Auth0 configuration");
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Auth0Provider
      domain={domain}
      clientId={clientId}
      authorizationParams={{
        redirect_uri: window.location.origin,
        ...(audience ? { audience } : {}),
      }}
    >
      <RouterProvider router={router} />
    </Auth0Provider>
  </React.StrictMode>,
);
