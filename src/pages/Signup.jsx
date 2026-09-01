import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import DriftWall from "../components/DriftWall.jsx"; // Adjust the path if DriftWall is in a different folder
import { useNavigate, Link } from "react-router-dom";
import "../styles/Signup.css"; 

function Signup() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // State to hold drift items fetched from Supabase
  const [driftItems, setDriftItems] = useState([]);

  // Fetch items from Supabase table on component mount
  useEffect(() => {
    const fetchDriftItems = async () => {
      const { data, error } = await supabase
        .from("drift_items") // Matches your Supabase table name
        .select("image, title, href");

      if (error) {
        console.error("Error fetching drift items:", error.message);
      } else if (data && data.length > 0) {
        setDriftItems(data);
      }
    };

    fetchDriftItems();
  }, []);

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
    <div className="split-login-container">
      {/* Background decorative blobs placed globally for seamless background blending */}
      <div className="blob blob-1"></div>
      <div className="blob blob-2"></div>

      {/* Left Side: Signup Form */}
      <div className="login-form-side">
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

      {/* Right Side: Drift Wall Animation with items from Supabase */}
      <div className="drift-wall-side">
        <DriftWall
          items={driftItems.length > 0 ? driftItems : undefined}
          columns={4}
          tileWidth={180}
          tileHeight={120}
          gap={16}
          speed={36}
          direction="up"
          pauseOnHover={true}
          overlayColor="#0a0a0c"
        />
      </div>
    </div>
  );
}

export default Signup;
