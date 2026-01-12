import { createBrowserRouter } from "react-router-dom";
import Layout from "./components/layout/Layout";
import Home from "./pages/Home";
import StartRound from "./pages/StartRound";
import Courses from "./pages/Courses";
import MyRounds from "./pages/MyRounds";
import RoundScorecard from "./pages/RoundScorecard";
import Profile from "./pages/Profile";
import Friends from "./pages/Friends";

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
      { path: "friends", element: <Friends /> },
      { path: "profile", element: <Profile /> },
    ],
  },
]);