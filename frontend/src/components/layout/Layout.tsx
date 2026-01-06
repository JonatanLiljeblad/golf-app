import { Outlet } from "react-router-dom";
import Header from "./header";

export default function Layout() {
  return (
    <>
      <Header />
      <main style={{ padding: "1rem" }}>
        <Outlet />
      </main>
    </>
  );
}