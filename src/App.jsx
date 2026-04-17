import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Preferences from "./pages/Preferences";
import ProtectedRoute from "./components/ProtectedRoute";
import UpdatePassword from "./pages/UpdatePassword";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/updatepassword" element={<UpdatePassword />} />

        <Route
          path="/preferences"
          element={
            <ProtectedRoute>
              <Preferences />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
