import { useEffect, useState, useMemo } from "react";
import { supabase } from "../supabaseClient";
import { useNavigate } from "react-router-dom";
import "../styles/Perferences.css";

function Preferences() {
  const navigate = useNavigate();
  const [rssList, setRssList] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate("/login"); return; }

      const { data: rssData } = await supabase.from("rss").select("*");
      const { data: userData } = await supabase.from("user_sources").select("rss_id").eq("user_id", user.id);

      setRssList(rssData || []);
      setSelected(userData?.map((d) => d.rss_id) || []);
    } catch (err) {
      console.error("Load error:", err);
    } finally {
      setLoading(false);
    }
  };

  const toggleRSS = (rssId) => {
    setSelected((prev) =>
      prev.includes(rssId) ? prev.filter((id) => id !== rssId) : [...prev, rssId]
    );
  };

  const savePreferences = async () => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    try {
      await supabase.from("user_sources").delete().eq("user_id", user.id);
      if (selected.length > 0) {
        const inserts = selected.map((rss_id) => ({ user_id: user.id, rss_id }));
        await supabase.from("user_sources").insert(inserts);
      }
      setStatus("Preferences synced successfully!");
      setTimeout(() => setStatus(""), 3000);
    } catch (err) {
      setStatus("Failed to save changes.");
    } finally {
      setSaving(false);
    }
  };

  // Grouping categories with useMemo for performance
  const grouped = useMemo(() => {
    return rssList.reduce((acc, rss) => {
      const cat = rss.category || "General";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(rss);
      return acc;
    }, {});
  }, [rssList]);

  if (loading) return <div className="pref-container"><div className="loader-main"></div></div>;

  return (
    <div className="pref-container">
  <div className="mesh-gradient"></div>
  
  <div className="pref-content">
    {/* Top Navigation Row */}
    <nav className="pref-nav">
      <div className="logo-area">
        <span className="logo-icon">✨</span>
        <span className="logo-text">Digestify</span>
      </div>
      <button className="logout-pill" onClick={() => supabase.auth.signOut().then(() => navigate("/login"))}>
        Logout
      </button>
    </nav>

    <header className="pref-header">
      <h1 className="pref-title">News Preferences</h1>
      <p className="pref-subtitle">Select the sources that fuel your daily briefing.</p>
    </header>

    <div className="categories-stack">
      {Object.entries(grouped).map(([category, feeds]) => (
        <section key={category} className="pref-section">
          <div className="section-header">
            <h3 className="category-title">{category}</h3>
            <div className="divider-line"></div>
          </div>
          <div className="sources-grid">
            {feeds.map((rss) => (
              <button
                key={rss.id}
                className={`source-card ${selected.includes(rss.id) ? "is-selected" : ""}`}
                onClick={() => toggleRSS(rss.id)}
              >
                <span className="source-name">{rss.name}</span>
                {selected.includes(rss.id) && <span className="check-icon">✓</span>}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>

    {/* Integrated Save Action */}
    <div className="action-footer">
      <div className="status-container">
        {status && <span className="status-toast">{status}</span>}
      </div>
      <button className="save-btn-large" onClick={savePreferences} disabled={saving}>
        {saving ? <div className="spinner"></div> : "Update My Feed"}
      </button>
      <p className="footer-note">Changes take effect on your next digest generation.</p>
    </div>
  </div>
</div>
  );
}

export default Preferences;
