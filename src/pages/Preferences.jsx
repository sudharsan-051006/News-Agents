import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { useNavigate } from "react-router-dom";
import "../styles/Perferences.css";

const ALL_CATEGORIES = ["tech", "sports", "movies", "geopolitics"];

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
      const {
        data: { user },
      } = await supabase.auth.getUser();

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

  const toggleCategory = (category) => {
    setSelected((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
    );
  };

  const savePreferences = async () => {
    setSaving(true);
    setStatus("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

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
    setStatus("Preferences saved successfully!");
  };

  const logout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  if (loading) {
    return <p style={{ textAlign: "center" }}>Loading preferences...</p>;
  }

  return (
    <div className="preferences-container">
      <div className="preferences-card">
        <h2>Select Your Interests</h2>
        <p className="preferences-subtitle">
          You’ll receive a personalized news email every hour.
        </p>

        <div className="category-list">
          {ALL_CATEGORIES.map((category) => (
            <label key={category} className="category-item">
              <input
                type="checkbox"
                checked={selected.includes(category)}
                onChange={() => toggleCategory(category)}
              />
              {category.toUpperCase()}
            </label>
          ))}
        </div>

        <button
          className="preferences-button"
          onClick={savePreferences}
          disabled={saving}
        >
          {saving ? "Saving..." : "Save Preferences"}
        </button>

        {status && <p className="status-text">{status}</p>}

        <button className="logout-button" onClick={logout}>
          Logout
        </button>
      </div>
    </div>
  );
}

export default Preferences;
