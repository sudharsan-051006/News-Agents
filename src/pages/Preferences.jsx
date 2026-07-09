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
  
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newSourceName, setNewSourceName] = useState("");
  const [newSourceUrl, setNewSourceUrl] = useState("");
  const [newSourceCategory, setNewSourceCategory] = useState("");
  const [addingSource, setAddingSource] = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (loading) return; 

    const delayDebounceFn = setTimeout(() => {
      handleSearch(searchQuery);
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

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

  const handleSearch = async (query) => {
    setSearching(true);
    try {
      let supabaseQuery = supabase.from("rss").select("*");
      if (query.trim() !== "") {
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

const handleAddSource = async (e) => {
  e.preventDefault();
  if (!newSourceName || !newSourceUrl) {
    setStatus("Please provide both a name and a URL.");
    return;
  }

  setAddingSource(true);
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const formattedCategory = newSourceCategory.trim() || "General";
    
    // Fixed: changed 'url' to 'rss_url' to match your database column precisely
    const newFeedPayload = { 
      name: newSourceName.trim(), 
      rss_url: newSourceUrl.trim(), 
      category: formattedCategory
    };

    // Perform the insert
    const { data: insertedData, error: rssError } = await supabase
      .from("rss")
      .insert([newFeedPayload])
      .select(); 

    if (rssError) throw rssError;

    const confirmedRss = (insertedData && insertedData[0]) ? insertedData[0] : null;

    if (confirmedRss) {
      setRssList((prev) => [confirmedRss, ...prev]);
      setSelected((prev) => [...prev, confirmedRss.id]);
    } else {
      // Fallback fallback if RLS policy hides the immediate select result
      await loadAll();
    }
    
    setNewSourceName("");
    setNewSourceUrl("");
    setNewSourceCategory("");
    setShowAddForm(false);
    setStatus("Source added and selected!");
    setTimeout(() => setStatus(""), 3000);

  } catch (err) {
    console.error("Error adding source details:", err);
    setStatus("Failed to add new source. Check database permissions.");
  } finally {
    setAddingSource(false);
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
          
          {/* Grouped for responsive layout control */}
          <div className="pref-header-actions">
            <div className="search-wrapper">
              <input
                type="text"
                placeholder="Search name or category..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pref-search-input"
              />
              {searching && <span className="search-spinner">⏳</span>}
            </div>

            <div className="add-source-wrapper">
              <button 
                type="button"
                className="toggle-add-btn" 
                onClick={() => setShowAddForm(!showAddForm)}
              >
                {showAddForm ? "✕ Close Form" : "+ Add Custom Source"}
              </button>
            </div>
          </div>

          {showAddForm && (
            <form onSubmit={handleAddSource} className="add-source-form">
              <div className="form-group">
                <input 
                  type="text" 
                  placeholder="Source Name (e.g., TechCrunch)" 
                  value={newSourceName}
                  onChange={(e) => setNewSourceName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <input 
                  type="url" 
                  placeholder="RSS Feed URL" 
                  value={newSourceUrl}
                  onChange={(e) => setNewSourceUrl(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <input 
                  type="text" 
                  placeholder="Category (Optional)" 
                  value={newSourceCategory}
                  onChange={(e) => setNewSourceCategory(e.target.value)}
                />
              </div>
              <button type="submit" className="submit-source-btn" disabled={addingSource}>
                {addingSource ? "Adding..." : "Add & Select Source"}
              </button>
            </form>
          )}
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
