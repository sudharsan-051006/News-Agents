import { useEffect, useState, useMemo } from "react";
import { supabase } from "../supabaseClient";
import { useNavigate } from "react-router-dom";
import SpecularButton from "../components/SpecularButton"; // Adjust path if needed
import "../styles/Perferences.css";
import FloatingLines from "../components/FloatingLines";

function Preferences() {
  const navigate = useNavigate();
  const [rssList, setRssList] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");

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

  // Bulk select/deselect for a specific category
  const toggleCategoryAll = (categoryFeeds) => {
    const feedIds = categoryFeeds.map(f => f.id);
    const allSelected = feedIds.every(id => selected.includes(id));
    
    if (allSelected) {
      setSelected(prev => prev.filter(id => !feedIds.includes(id)));
    } else {
      setSelected(prev => [...new Set([...prev, ...feedIds])]);
    }
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
      setStatus("Preferences synced successfully ✨");
      setTimeout(() => setStatus(""), 3500);
    } catch (err) {
      setStatus("Failed to save changes.");
    } finally {
      setSaving(false);
    }
  };

  // Filtered and Grouped RSS feeds
  const grouped = useMemo(() => {
    const filtered = rssList.filter(rss => 
      rss.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (rss.category && rss.category.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    return filtered.reduce((acc, rss) => {
      const cat = rss.category || "General";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(rss);
      return acc;
    }, {});
  }, [rssList, searchQuery]);

  const categories = useMemo(() => {
    return ["All", ...new Set(rssList.map(r => r.category || "General"))];
  }, [rssList]);

  if (loading) return (
    <div className="pref-container">
      <div className="mesh-gradient"></div>
      <div className="loader-main"><div className="spinner"></div></div>
    </div>
  );

  return (
    <div className="pref-container">
      <div className="floating-bg-wrapper">
        <FloatingLines
          enabledWaves={['top', 'middle', 'bottom']}
          lineCount={[8, 12, 16]}
          lineDistance={[6, 5, 4]}
          bendRadius={4.0}
          bendStrength={-0.3}
          interactive={true}
          parallax={true}
          linesGradient={['#ce3cae', '#61518b', '#2563eb']}
        />
      </div>
      <div className="mesh-gradient"></div>
      
      <div className="pref-content">
        {/* Navigation */}
        <nav className="pref-nav">
          <div className="logo-area">
            <span className="logo-icon">✨</span>
            <span className="logo-text">elinity.in</span>
          </div>
          <div className="nav-right">
            <span className="selection-counter">{selected.length} sources selected</span>
            <SpecularButton
              size="sm"
              radius={20}
              tint="#ffffff"
              tintOpacity={0.05}
              blur={4}
              textColor="#f87171"
              lineColor="#f87171"
              baseColor="#7f1d1d"
              intensity={0.8}
              onClick={() => supabase.auth.signOut().then(() => navigate("/login"))}
            >
              Logout
            </SpecularButton>
          </div>
        </nav>

        {/* Header */}
        <header className="pref-header">
          <h1 className="pref-title">Curate Your Briefing</h1>
          <p className="pref-subtitle">Select the intel streams that feed your daily AI digest.</p>
        </header>

        {/* Search & Category Filter Bar */}
        <div className="filter-toolbar">
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input 
              type="text" 
              placeholder="Search sources (e.g. Tech, BBC...)" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
            {searchQuery && (
              <button className="clear-search" onClick={() => setSearchQuery("")}>×</button>
            )}
          </div>

          <div className="category-pills">
            {categories.map(cat => (
              <button
                key={cat}
                className={`category-pill ${activeCategory === cat ? "active" : ""}`}
                onClick={() => setActiveCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Categories Stack */}
        <div className="categories-stack">
          {Object.entries(grouped)
            .filter(([category]) => activeCategory === "All" || category === activeCategory)
            .map(([category, feeds]) => {
              const allCatSelected = feeds.every(f => selected.includes(f.id));
              return (
                <section key={category} className="pref-section">
                  <div className="section-header">
                    <h3 className="category-title">{category}</h3>
                    <button 
                      className="cat-toggle-btn"
                      onClick={() => toggleCategoryAll(feeds)}
                    >
                      {allCatSelected ? "Deselect All" : "Select All"}
                    </button>
                    <div className="divider-line"></div>
                  </div>
                  <div className="sources-grid">
                    {feeds.map((rss) => {
                      const isSelected = selected.includes(rss.id);
                      return (
                        <button
                          key={rss.id}
                          className={`source-card ${isSelected ? "is-selected" : ""}`}
                          onClick={() => toggleRSS(rss.id)}
                        >
                          <div className="source-info">
                            <span className="source-name">{rss.name}</span>
                            <span className="source-meta">{rss.category || "Feed"}</span>
                          </div>
                          <div className={`checkbox-indicator ${isSelected ? "checked" : ""}`}>
                            {isSelected && <span className="check-icon">✓</span>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
          })}

          {Object.keys(grouped).length === 0 && (
            <div className="empty-state">
              <p>No sources found matching "{searchQuery}"</p>
            </div>
          )}
        </div>

        {/* Sticky Floating Glass Footer */}
        <div className="pref-footer">
          <div className="footer-glass">
            <div className="status-container-inline">
              {status ? <span className="status-toast">{status}</span> : <span className="footer-hint">Changes apply instantly</span>}
            </div>
            <SpecularButton
              size="md"
              radius={14}
              tint="#6366f1"
              tintOpacity={0.2}
              blur={8}
              textColor="#ffffff"
              lineColor="#818cf8"
              baseColor="#4f46e5"
              intensity={1.2}
              disabled={saving}
              onClick={savePreferences}
            >
              {saving ? <div className="spinner"></div> : "Save Preferences"}
            </SpecularButton>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Preferences;
