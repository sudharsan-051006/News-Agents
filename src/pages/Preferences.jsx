import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { useNavigate } from "react-router-dom";
import "../styles/Perferences.css"; // Using the same base styles for consistency

const ALL_CATEGORIES = [
  { id: "tech", label: "Technology", icon: "💻" },
  { id: "sports", label: "Sports", icon: "🏀" },
  { id: "movies", label: "Movies", icon: "🎬" },
  { id: "geopolitics", label: "Geopolitics", icon: "🌍" },
  { id: "local", label:"India", icon:"🇮🇳"},
];

function Preferences() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from("preferences")
        .select("category")
        .eq("user_id", user.id);

      if (!error && data) {
        setSelected(data.map((d) => d.category));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const toggleCategory = (categoryId) => {
    setSelected((prev) =>
      prev.includes(categoryId)
        ? prev.filter((c) => c !== categoryId)
        : [...prev, categoryId]
    );
  };

  const savePreferences = async () => {
    setSaving(true);
    setStatus("");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from("preferences").delete().eq("user_id", user.id);

    if (selected.length > 0) {
      await supabase.from("preferences").insert(
        selected.map((category) => ({
          user_id: user.id,
          category,
        }))
      );
    }
    setSaving(false);
    setStatus("Preferences saved!");
    setTimeout(() => setStatus(""), 3000);
  };

  if (loading) return (
    <div className="signup-page">
      <div className="loader"></div>
    </div>
  );

  return (
    <div className="signup-page">
      <div className="blob blob-1"></div>
      <div className="blob blob-2"></div>

      <div className="card-wrapper">
        <div className="glass-card">
          <h2 className="title">Your Interests</h2>
          <p className="subtitle">Pick what you want in your hourly digest.</p>

          <div className="category-grid">
            {ALL_CATEGORIES.map((cat) => (
              <div
                key={cat.id}
                className={`category-chip ${selected.includes(cat.id) ? "active" : ""}`}
                onClick={() => toggleCategory(cat.id)}
              >
                <span className="chip-icon">{cat.icon}</span>
                <span className="chip-label">{cat.label}</span>
              </div>
            ))}
          </div>

          {status && <p className="success-message">{status}</p>}

          <button className="submit-btn" onClick={savePreferences} disabled={saving}>
            {saving ? <span className="loader"></span> : "Update Preferences"}
          </button>

          <button className="secondary-btn" onClick={() => supabase.auth.signOut().then(() => navigate("/login"))}>
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}

export default Preferences;
