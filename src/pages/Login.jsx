import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { useNavigate, Link } from "react-router-dom";
import AuthWall from "../components/Authwall.jsx";
import "../styles/Signup.css";

function Login() {
  const navigate = useNavigate();

  // Login states
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

  // Fetch drift wall items
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

  // Normal login
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
    } catch (err) {
      console.error("Login failed:", err);
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

  // Close password recovery
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

  // Existing email reset-link flow
  const handleResetLink = async () => {
    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      setError("Please enter your email address first.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        normalizedEmail,
        {
          redirectTo: "https://www.elinity.in/updatepassword",
        }
      );

      if (error) {
        setError(error.message);
      } else {
        setMessage(
          "If an account exists for this email, a reset email will be sent."
        );
        setRecoveryStep("sent");
      }
    } catch (err) {
      console.error("Reset-link request failed:", err);
      setError("Unable to send the reset email. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Extract a useful error from a Supabase Edge Function response
  const getFunctionErrorMessage = async (functionError) => {
    let details =
      functionError?.message || "Unknown Edge Function error.";

    try {
      const context = functionError?.context;

      if (context instanceof Response) {
        const responseText = await context.clone().text();

        if (responseText) {
          try {
            const responseBody = JSON.parse(responseText);

            details =
              responseBody.error ||
              responseBody.message ||
              responseText;
          } catch {
            details = responseText;
          }
        }
      }
    } catch (readError) {
      console.error(
        "Could not read Edge Function error response:",
        readError
      );
    }

    return details;
  };

  // Request OTP through the Supabase Edge Function
  const handleSendOtp = async () => {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setError("Please enter your email address.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const { data, error } = await supabase.functions.invoke(
        "request-password-otp",
        {
          body: {
            email: normalizedEmail,
          },
        }
      );

      if (error) {
        const details = await getFunctionErrorMessage(error);

        console.error("OTP Edge Function failed:", {
          message: error.message,
          details,
        });

        throw new Error(
          details ||
            "Unable to send the reset email. Please check the service logs."
        );
      }

      if (!data?.success) {
        throw new Error(
          data?.error || "Unable to send the reset email."
        );
      }

      // Update the existing message state
      setMessage(
        data.message ||
          "If an account exists for that email, a reset code will be sent."
      );

      // Display the OTP verification screen
      setRecoveryStep("otp");
    } catch (err) {
      console.error("OTP request failed:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Unable to send the reset code. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  // Verify the eight-digit recovery OTP
  const handleVerifyOtp = async (e) => {
    e.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();
    const cleanOtp = otp.trim();

    if (!/^\d{8}$/.test(cleanOtp)) {
      setError("Enter the complete 8-digit verification code.");
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: normalizedEmail,
        token: cleanOtp,
        type: "recovery",
      });

      if (verifyError) {
        throw new Error(verifyError.message);
      }

      // OTP verified. Proceed to the new-password screen.
      setMessage("Verification successful. Create your new password.");
      setRecoveryStep("password");
      setOtp("");
    } catch (err) {
      console.error("OTP verification failed:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Unable to verify the recovery code. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  // Update password after successful OTP verification
  const handleUpdatePassword = async (e) => {
    e.preventDefault();

    if (!newPassword || newPassword.length < 8) {
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
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        throw new Error(updateError.message);
      }

      setMessage(
        "Password updated successfully. You can now sign in."
      );

      setPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setOtp("");

      // Return to the sign-in screen after displaying success
      window.setTimeout(() => {
        closeRecovery();
      }, 1800);
    } catch (err) {
      console.error("Password update failed:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Unable to update your password. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  // Return to email entry to request another OTP
  const handleResendOtp = () => {
    setOtp("");
    setRecoveryStep("email");
    setError(null);
    setMessage(
      "Enter your email and select Send OTP to request a new recovery code."
    );
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
                  <form
                    onSubmit={handleLogin}
                    className="signup-form"
                  >
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
                          e.preventDefault();
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

                    {message && (
                      <p role="status" className="subtitle">
                        {message}
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

                  {/* Email reset-link flow */}
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

                  {/* OTP: Email entry */}
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
                          Enter the 8-digit recovery code sent to your
                          email.
                        </p>

                        <div className="input-group">
                          <input
                            type="text"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            maxLength={8}
                            required
                            value={otp}
                            onChange={(e) =>
                              setOtp(
                                e.target.value
                                  .replace(/\D/g, "")
                                  .slice(0, 8)
                              )
                            }
                            placeholder="Enter 8-digit code"
                            className="modern-input"
                          />
                        </div>

                        <button
                          type="submit"
                          className="submit-btn"
                          disabled={loading || otp.length !== 8}
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
                          Request Another Code
                        </button>
                      </form>
                    )}

                  {/* Set new password after OTP verification */}
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

                  {/* Email reset link sent */}
                  {recoveryMethod === "link" &&
                    recoveryStep === "sent" && (
                      <p className="subtitle">
                        Check your inbox for instructions to reset your
                        password.
                      </p>
                    )}

                  {/* Shared recovery error and status messages */}
                  {error && (
                    <p className="error-message" role="alert">
                      {error}
                    </p>
                  )}

                  {message && (
                    <p
                      role="status"
                      style={{
                        color: "#ffffff",
                        fontSize: "14px",
                      }}
                    >
                      {message}
                    </p>
                  )}

                  <p className="footer-text">
                    <button
                      type="button"
                      className="login-link"
                      disabled={loading}
                      onClick={() => {
                        setError(null);
                        setMessage(null);

                        if (recoveryStep === "password") {
                          setRecoveryStep("otp");
                          setNewPassword("");
                          setConfirmPassword("");
                        } else if (recoveryStep === "otp") {
                          setRecoveryStep("email");
                          setOtp("");
                        } else if (recoveryMethod) {
                          setRecoveryMethod(null);
                          setRecoveryStep("email");
                        } else {
                          closeRecovery();
                        }
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: loading ? "not-allowed" : "pointer",
                        font: "inherit",
                      }}
                    >
                      {recoveryMethod ? "Back" : "Back to Sign In"}
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