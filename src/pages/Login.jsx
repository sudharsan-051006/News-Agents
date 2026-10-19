import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { useNavigate, Link } from "react-router-dom";
import AuthWall from "../components/Authwall.jsx";
import "../styles/Signup.css";

function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [resetSent, setResetSent] = useState(false);
  
  // 1. State to hold drift items fetched from Supabase
  const [driftItems, setDriftItems] = useState([]);

  // 2. Fetch items from Supabase table on component mount
  useEffect(() => {
    const fetchDriftItems = async () => {
      const { data, error } = await supabase
        .from("drift_items") // Replace with your actual Supabase table name
        .select("image, title, href"); // Select the columns matching DriftWall's expected shape

      if (error) {
        console.error("Error fetching drift items:", error.message);
      } else if (data && data.length > 0) {
        setDriftItems(data);
      }
    };

    fetchDriftItems();
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
    } else {
      navigate("/dashboard");
    }

    setLoading(false);
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError("Please enter your email first.");
      return;
    }

    if (loading || resetSent) return;

    setLoading(true);
    setError(null);
    setMessage(null);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: "https://www.elinity.in/updatepassword",
    });

    if (error) {
      setError(error.message);
    } else {
      setMessage("Password reset email sent! Check your inbox.");
      setResetSent(true);
    }

    setLoading(false);
  };

  return (
    <div className="split-login-container">
      <div className="blob blob-1"></div>
      <div className="blob blob-2"></div>

      {/* Left Side: Login Form */}
      <div className="login-form-side">
        <div className="card-wrapper">
          <div className="glass-card">
            <div className="card-content">
              <h2 className="title">Welcome Back</h2>
              <p className="subtitle">Enter your details to sign in</p>

              <form onSubmit={handleLogin} className="signup-form">
                <div className="input-group">
                  <input
                    type="email"
                    placeholder="Email address"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="modern-input"
                  />
                </div>

                <div className="input-group">
                  <input
                    type="password"
                    placeholder="Password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="modern-input"
                  />
                </div>

                <p
                  style={{
                    textAlign: "right",
                    cursor: loading || resetSent ? "not-allowed" : "pointer",
                    fontSize: "14px",
                    color: loading || resetSent ? "#9ca3af" : "#ffffff",
                    pointerEvents: loading || resetSent ? "none" : "auto",
                  }}
                  onClick={!loading && !resetSent ? handleForgotPassword : undefined}
                >
                  {resetSent ? "Email Sent ✔" : "Forgot Password?"}
                </p>

                {error && <p className="error-message">{error}</p>}
                {message && <p style={{ color: "#ffffff" }}>{message}</p>}

                <button type="submit" disabled={loading} className="submit-btn">
                  {loading ? <span className="loader"></span> : "Sign In"}
                </button>
              </form>

              <p className="footer-text">
                Don’t have an account?{" "}
                <Link to="/signup" className="login-link">
                  Sign Up
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side: Drift Wall Animation (Passes database items) */}
      <div className="drift-wall-side">
        <AuthWall items={driftItems} />
      </div>
    </div>
  );
}

export default Login;