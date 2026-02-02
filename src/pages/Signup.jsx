import { useState } from "react";
import { supabase } from "../supabaseClient";
import { useNavigate, Link } from "react-router-dom";
import "../styles/Signup.css"; 

function Signup() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSignup = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signUp({ email, password });

    if (error) {
      setError(error.message);
    } else {
      navigate("/preferences");
    }
    setLoading(false);
  };

  return (
    <div className="signup-page">
      {/* Background decorative blobs */}
      <div className="blob blob-1"></div>
      <div className="blob blob-2"></div>

      <div className="card-wrapper">
        <div className="glass-card">
          <div className="card-content">
            <h2 className="title">Create Account</h2>
            <p className="subtitle">Join our community today</p>

            <form onSubmit={handleSignup} className="signup-form">
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
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="modern-input"
                />
              </div>

              {error && <p className="error-message">{error}</p>}

              <button type="submit" disabled={loading} className="submit-btn">
                {loading ? <span className="loader"></span> : "Sign Up"}
              </button>
            </form>

            <p className="footer-text">
              Already have an account? <Link to="/login" className="login-link">Login</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Signup;