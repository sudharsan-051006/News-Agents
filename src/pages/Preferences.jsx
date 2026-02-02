import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { useNavigate } from "react-router-dom";

const ALL_CATEGORIES = ["tech", "sports", "movies", "geopolitics"];

function Preferences() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        console.error("User fetch error", userError);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("preferences")
        .select("category")
        .eq("user_id", user.id);

      if (error) {
        console.error("Preferences error:", error);
        setLoading(false);
        return;
      }

      setSelected(data.map((d) => d.category));
    } catch (err) {
      console.error("Unexpected error:", err);
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

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    await supabase
      .from("preferences")
      .delete()
      .eq("user_id", user.id);

    const rows = selected.map((category) => ({
      user_id: user.id,
      category,
    }));

    if (rows.length > 0) {
      await supabase.from("preferences").insert(rows);
    }

    setSaving(false);
    alert("Preferences saved!");
  };

  const logout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  if (loading) {
    return <p style={{ textAlign: "center" }}>Loading preferences...</p>;
  }

  return (
    <div style={{ padding: "2rem", maxWidth: "500px", margin: "auto" }}>
      <h2>Select News Domains</h2>

      {ALL_CATEGORIES.map((category) => (
        <div key={category}>
          <label>
            <input
              type="checkbox"
              checked={selected.includes(category)}
              onChange={() => toggleCategory(category)}
            />
            {" "}
            {category.toUpperCase()}
          </label>
        </div>
      ))}

      <button
        onClick={savePreferences}
        disabled={saving}
        style={{ marginTop: "1rem", width: "100%" }}
      >
        {saving ? "Saving..." : "Save Preferences"}
      </button>

      <button
        onClick={logout}
        style={{
          marginTop: "1rem",
          width: "100%",
          background: "#eee",
        }}
      >
        Logout
      </button>
    </div>
  );
}

export default Preferences;
