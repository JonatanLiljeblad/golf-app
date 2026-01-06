import { createBrowserRouter } from "react-router-dom";
import Layout from "./components/layout/Layout";
import Home from "./pages/Home";
import StartRound from "./pages/StartRound";
import MyRounds from "./pages/MyRounds";
import RoundScorecard from "./pages/RoundScorecard";
import Profile from "./pages/Profile";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <Home /> },
      { path: "round/start", element: <StartRound /> },
      { path: "rounds", element: <MyRounds /> },
      { path: "rounds/:roundId", element: <RoundScorecard /> },
      { path: "profile", element: <Profile /> },
    ],
  },
]);