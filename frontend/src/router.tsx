import { createBrowserRouter } from "react-router-dom";
import Layout from "./components/layout/Layout";
import Home from "./pages/Home";
import StartRound from "./pages/StartRound";
import Courses from "./pages/Courses";
import MyRounds from "./pages/MyRounds";
import RoundScorecard from "./pages/RoundScorecard";
import Profile from "./pages/Profile";
import Friends from "./pages/Friends";
import ViewPlayer from "./pages/ViewPlayer";
import Tournaments from "./pages/Tournaments";
import Tournament from "./pages/Tournament";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <Home /> },
      { path: "round/start", element: <StartRound /> },
      { path: "courses", element: <Courses /> },
      { path: "rounds", element: <MyRounds /> },
      { path: "rounds/:roundId", element: <RoundScorecard /> },
      { path: "tournaments", element: <Tournaments /> },
      { path: "tournaments/:tournamentId", element: <Tournament /> },
      { path: "friends", element: <Friends /> },
      { path: "players/:externalId", element: <ViewPlayer /> },
      { path: "profile", element: <Profile /> },
    ],
  },
]);
