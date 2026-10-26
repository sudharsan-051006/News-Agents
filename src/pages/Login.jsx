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

  // Password recovery states
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryMethod, setRecoveryMethod] = useState(null);
  const [recoveryStep, setRecoveryStep] = useState("email");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Drift wall items
  const [driftItems, setDriftItems] = useState([]);

  useEffect(() => {
    const fetchDriftItems = async () => {
      const { data, error } = await supabase
        .from("drift_items")
        .select("image, title, href");

      if (error) {
        console.error("Error fetching drift items:", error.message);
      } else if (data) {
        setDriftItems(data);
      }
    };

    fetchDriftItems();
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setError(error.message);
      } else {
        navigate("/dashboard");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Open password recovery
  const openRecovery = () => {
    setShowRecovery(true);
    setRecoveryMethod(null);
    setRecoveryStep("email");
    setOtp("");
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
    setMessage(null);
  };

  const closeRecovery = () => {
    setShowRecovery(false);
    setRecoveryMethod(null);
    setRecoveryStep("email");
    setOtp("");
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
    setMessage(null);
  };

  // Existing email reset link
  const handleResetLink = async () => {
    if (!email.trim()) {
      setError("Please enter your email address first.");
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        {
          redirectTo: "https://www.elinity.in/updatepassword",
        }
      );

      if (error) {
        setError(error.message);
      } else {
        setMessage("If an account exists for this email, a reset email will be sent.");
        setRecoveryStep("sent");
      }
    } catch {
      setError("Unable to send the reset email. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Send password recovery OTP
  const handleSendOtp = async () => {
    if (!email.trim()) {
      setError("Please enter your email address first.");
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      // Supabase sends a recovery email.
      // Configure the recovery email template to display {{ .Token }}.
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim()
      );

      if (error) {
        setError(error.message);
      } else {
        setRecoveryStep("otp");
        setMessage("If an account exists for this email, a recovery code will be sent.");
      }
    } catch {
      setError("Unable to send the OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Verify recovery OTP
  const handleVerifyOtp = async (e) => {
    e.preventDefault();

    if (!/^\d{6}$/.test(otp.trim())) {
      setError("Please enter the 6-digit OTP.");
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otp.trim(),
        type: "recovery",
      });

      if (error) {
        setError("Invalid or expired OTP. Please try again or request a new code.");
      } else {
        setRecoveryStep("password");
        setMessage("Email verified. You can now set your new password.");
      }
    } catch {
      setError("Unable to verify the OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Update password after successful OTP verification
  const handleUpdatePassword = async (e) => {
    e.preventDefault();

    if (newPassword.length < 8) {
      setError("Your new password must contain at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        setError(error.message);
      } else {
        setMessage("Password updated successfully. You can now sign in.");

        setPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setOtp("");

        // Return to the normal login form after a short delay.
        setTimeout(() => {
          closeRecovery();
        }, 1800);
      }
    } catch {
      setError("Unable to update your password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setOtp("");
    setRecoveryStep("email");
    setError(null);
    setMessage(null);

    // The user can select the OTP method and request another code.
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
              <p className="subtitle">
                Enter your details to sign in
              </p>

              {!showRecovery ? (
                <>
                  <form onSubmit={handleLogin} className="signup-form">
                    <div className="input-group">
                      <input
                        type="email"
                        placeholder="Email address"
                        autoComplete="email"
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
                        autoComplete="current-password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="modern-input"
                      />
                    </div>

                    <p
                      role="button"
                      tabIndex={0}
                      style={{
                        textAlign: "right",
                        cursor: "pointer",
                        fontSize: "14px",
                        color: "#ffffff",
                      }}
                      onClick={openRecovery}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          openRecovery();
                        }
                      }}
                    >
                      Forgot Password?
                    </p>

                    {error && (
                      <p className="error-message" role="alert">
                        {error}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={loading}
                      className="submit-btn"
                    >
                      {loading ? (
                        <span className="loader"></span>
                      ) : (
                        "Sign In"
                      )}
                    </button>
                  </form>

                  <p className="footer-text">
                    Don’t have an account?{" "}
                    <Link to="/signup" className="login-link">
                      Sign Up
                    </Link>
                  </p>
                </>
              ) : (
                <div className="signup-form">
                  <h3 className="subtitle">Reset Your Password</h3>

                  {/* Choose recovery method */}
                  {!recoveryMethod && (
                    <>
                      <p className="subtitle">
                        Choose how you want to recover your account.
                      </p>

                      <button
                        type="button"
                        className="submit-btn"
                        onClick={() => {
                          setRecoveryMethod("link");
                          setRecoveryStep("email");
                          setError(null);
                          setMessage(null);
                        }}
                      >
                        Reset via Email Link
                      </button>

                      <button
                        type="button"
                        className="submit-btn"
                        style={{ marginTop: "12px" }}
                        onClick={() => {
                          setRecoveryMethod("otp");
                          setRecoveryStep("email");
                          setError(null);
                          setMessage(null);
                        }}
                      >
                        Reset via Email OTP
                      </button>
                    </>
                  )}

                  {/* Email reset link */}
                  {recoveryMethod === "link" &&
                    recoveryStep === "email" && (
                      <>
                        <p className="subtitle">
                          We’ll send a password reset link to your email.
                        </p>

                        <div className="input-group">
                          <input
                            type="email"
                            placeholder="Email address"
                            autoComplete="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="modern-input"
                          />
                        </div>

                        <button
                          type="button"
                          className="submit-btn"
                          disabled={loading}
                          onClick={handleResetLink}
                        >
                          {loading ? "Sending..." : "Send Reset Link"}
                        </button>
                      </>
                    )}

                  {/* OTP: Email entry and send code */}
                  {recoveryMethod === "otp" &&
                    recoveryStep === "email" && (
                      <>
                        <p className="subtitle">
                          Enter your email to receive a recovery code.
                        </p>

                        <div className="input-group">
                          <input
                            type="email"
                            placeholder="Email address"
                            autoComplete="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="modern-input"
                          />
                        </div>

                        <button
                          type="button"
                          className="submit-btn"
                          disabled={loading}
                          onClick={handleSendOtp}
                        >
                          {loading ? "Sending..." : "Send OTP"}
                        </button>
                      </>
                    )}

                  {/* OTP verification */}
                  {recoveryMethod === "otp" &&
                    recoveryStep === "otp" && (
                      <form onSubmit={handleVerifyOtp}>
                        <p className="subtitle">
                          Enter the 6-digit recovery code sent to your email.
                        </p>

                        <div className="input-group">
                          <input
                            type="text"
                            placeholder="Enter 6-digit OTP"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            maxLength={6}
                            required
                            value={otp}
                            onChange={(e) =>
                              setOtp(
                                e.target.value
                                  .replace(/\D/g, "")
                                  .slice(0, 6)
                              )
                            }
                            className="modern-input"
                          />
                        </div>

                        <button
                          type="submit"
                          className="submit-btn"
                          disabled={loading}
                        >
                          {loading ? "Verifying..." : "Verify OTP"}
                        </button>

                        <button
                          type="button"
                          className="submit-btn"
                          style={{ marginTop: "12px" }}
                          disabled={loading}
                          onClick={handleResendOtp}
                        >
                          Use Another Code
                        </button>
                      </form>
                    )}

                  {/* Set new password */}
                  {recoveryMethod === "otp" &&
                    recoveryStep === "password" && (
                      <form onSubmit={handleUpdatePassword}>
                        <p className="subtitle">
                          Create a new password for your account.
                        </p>

                        <div className="input-group">
                          <input
                            type="password"
                            placeholder="New password"
                            autoComplete="new-password"
                            minLength={8}
                            required
                            value={newPassword}
                            onChange={(e) =>
                              setNewPassword(e.target.value)
                            }
                            className="modern-input"
                          />
                        </div>

                        <div className="input-group">
                          <input
                            type="password"
                            placeholder="Confirm new password"
                            autoComplete="new-password"
                            minLength={8}
                            required
                            value={confirmPassword}
                            onChange={(e) =>
                              setConfirmPassword(e.target.value)
                            }
                            className="modern-input"
                          />
                        </div>

                        <button
                          type="submit"
                          className="submit-btn"
                          disabled={loading}
                        >
                          {loading ? "Updating..." : "Update Password"}
                        </button>
                      </form>
                    )}

                  {/* Link email sent */}
                  {recoveryMethod === "link" &&
                    recoveryStep === "sent" && (
                      <p className="subtitle">
                        Check your inbox for instructions to reset your password.
                      </p>
                    )}

                  {error && (
                    <p className="error-message" role="alert">
                      {error}
                    </p>
                  )}

                  {message && (
                    <p
                      role="status"
                      style={{ color: "#ffffff", fontSize: "14px" }}
                    >
                      {message}
                    </p>
                  )}

                  <p className="footer-text">
                    <button
                      type="button"
                      className="login-link"
                      onClick={() => {
                        setError(null);
                        setMessage(null);

                        if (recoveryStep === "otp") {
                          setRecoveryStep("email");
                          setOtp("");
                        } else {
                          closeRecovery();
                        }
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        font: "inherit",
                      }}
                    >
                      {recoveryStep === "otp"
                        ? "Back"
                        : "Back to Sign In"}
                    </button>
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Right Side: Drift Wall Animation */}
      <div className="drift-wall-side">
        <AuthWall items={driftItems} />
      </div>
    </div>
  );
}

export default Login;