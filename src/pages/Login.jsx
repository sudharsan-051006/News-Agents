import { useState } from "react";
import { supabase } from "../supabaseClient";
import { useNavigate, Link } from "react-router-dom";
import "../styles/Signup.css";

function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null); // ✅ NEW

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
      navigate("/preferences");
    }

    setLoading(false);
  };

  // ✅ NEW: Forgot password handler
  const handleForgotPassword = async () => {
    if (!email) {
      setError("Please enter your email first.");
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: "https://news-agents-ca13pk3c1-sudharsan-051006s-projects.vercel.app/updatepassword",
    });

    if (error) {
      setError(error.message);
    } else {
      setMessage("Password reset email sent! Check your inbox.");
    }

    setLoading(false);
  };

  return (
    <div className="signup-page">
      <div className="blob blob-1"></div>
      <div className="blob blob-2"></div>

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

              {/* Forgot Password Link */}
              <p
                style={{
                  textAlign: "right",
                  cursor: "pointer",
                  fontSize: "14px",
                  color: "#4f46e5",
                }}
                onClick={handleForgotPassword}
              >
                Forgot Password?
              </p>

              {error && <p className="error-message">{error}</p>}
              {message && <p style={{ color: "green" }}>{message}</p>}

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
  );
}

export default Login;
