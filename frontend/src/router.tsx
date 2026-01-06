import { createBrowserRouter } from "react-router-dom";
import Layout from "./components/layout/Layout";
import Home from "./pages/Home";
import StartRound from "./pages/StartRound";
import Profile from "./pages/Profile";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <Home /> },
      { path: "round/start", element: <StartRound /> },
      { path: "profile", element: <Profile /> },
    ],
  },
]);