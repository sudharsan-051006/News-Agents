import { useState } from "react";
import { supabase } from "../supabaseClient";
import { useNavigate } from "react-router-dom";
import "../styles/Signup.css";

function UpdatePassword() {
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  const handleUpdatePassword = async (e) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    const { error } = await supabase.auth.updateUser({
      password: password,
    });

    if (error) {
      setError(error.message);
    } else {
      setMessage("Password updated successfully!");
      
      // Redirect after 2 sec
      setTimeout(() => {
        navigate("/");
      }, 2000);
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
            <h2 className="title">Reset Password</h2>
            <p className="subtitle">Enter your new password</p>

            <form onSubmit={handleUpdatePassword} className="signup-form">
              <div className="input-group">
                <input
                  type="password"
                  placeholder="New Password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="modern-input"
                />
              </div>

              <div className="input-group">
                <input
                  type="password"
                  placeholder="Confirm Password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="modern-input"
                />
              </div>

              {error && <p className="error-message">{error}</p>}
              {message && <p style={{ color: "green" }}>{message}</p>}

              <button type="submit" disabled={loading} className="submit-btn">
                {loading ? <span className="loader"></span> : "Update Password"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export default UpdatePassword;
