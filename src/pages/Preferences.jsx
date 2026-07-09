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
  
  // New state for handling searches
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  // Trigger search when searchQuery changes (with a simple debounce)
  useEffect(() => {
    // Skip the very first render since loadAll handles it
    if (loading) return; 

    const delayDebounceFn = setTimeout(() => {
      handleSearch(searchQuery);
    }, 400); // 400ms delay to avoid over-querying Supabase

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  const loadAll = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate("/login"); return; }

      // Fetch all sources initially
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

  // Dedicated function to query Supabase for names or categories matching the input
  const handleSearch = async (query) => {
    setSearching(true);
    try {
      let supabaseQuery = supabase.from("rss").select("*");
      
      if (query.trim() !== "") {
        // Searches if 'name' contains the query OR 'category' contains the query (case-insensitive)
        supabaseQuery = supabaseQuery.or(`name.ilike.%${query}%,category.ilike.%${query}%`);
      }
      
      const { data, error } = await supabaseQuery;
      if (error) throw error;
      
      setRssList(data || []);
    } catch (err) {
      console.error("Search error:", err);
    } finally {
      setSearching(false);
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
        <nav className="pref-nav">
          <div className="logo-area">
            <span className="logo-icon">✨</span>
            <span className="logo-text">elinity.in</span>
          </div>
          <button className="logout-pill" onClick={() => supabase.auth.signOut().then(() => navigate("/login"))}>
            Logout
          </button>
        </nav>

        <header className="pref-header">
          <h1 className="pref-title">News Preferences</h1>
          <p className="pref-subtitle">Select the sources that fuel your daily briefing.</p>
          
          {/* --- SEARCH BAR IMPLEMENTATION --- */}
          <div className="search-wrapper">
            <input
              type="text"
              placeholder="Search by name or category..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pref-search-input"
            />
            {searching && <span className="search-spinner">⏳</span>}
          </div>
          {/* ---------------------------------- */}
        </header>

        <div className="categories-stack">
          {Object.keys(grouped).length === 0 ? (
            <div className="no-results">No sources found matching "{searchQuery}"</div>
          ) : (
            Object.entries(grouped).map(([category, feeds]) => (
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
            ))
          )}
        </div>

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
