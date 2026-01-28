import { useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth0 } from "@auth0/auth0-react";

import { useApi } from "../../api/useApi";
import type { Player } from "../../api/types";

import Header from "./header";

export default function Layout() {
  const { isAuthenticated, isLoading } = useAuth0();
  const { request } = useApi();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    if (location.pathname === "/profile") return;

    void (async () => {
      try {
        const me = await request<Player>("/api/v1/players/me");
        if (!me.email || !me.username)
          navigate("/profile?required=1", { replace: true });
      } catch {
        // ignore
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, isLoading, location.pathname]);

  return (
    <>
      <Header />
      <main className="app-main">
        <div className="container">
          <Outlet />
        </div>
      </main>
    </>
  );
}
