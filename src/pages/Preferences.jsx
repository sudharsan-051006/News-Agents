import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import { useNavigate } from "react-router-dom";
import SpecularButton from "../components/SpecularButton";
import FloatingLines from "../components/FloatingLines";
import "../styles/Preferences.css";

function Preferences() {
  const navigate = useNavigate();

  const [rssList, setRssList] = useState([]);
  const [selected, setSelected] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [status, setStatus] = useState("");
  const [statusType, setStatusType] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");

  useEffect(() => {
    loadAll();
  }, []);

  // --------------------------------------------------
  // LOAD DATA
  // --------------------------------------------------

  const loadAll = async () => {
    try {
      setLoading(true);

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) {
        throw authError;
      }

      if (!user) {
        navigate("/login");
        return;
      }

      const [
        { data: rssData, error: rssError },
        { data: userData, error: userSourceError },
      ] = await Promise.all([
        supabase
          .from("rss")
          .select("*")
          .order("category", { ascending: true })
          .order("name", { ascending: true }),

        supabase
          .from("user_sources")
          .select("rss_id")
          .eq("user_id", user.id),
      ]);

      if (rssError) {
        throw rssError;
      }

      if (userSourceError) {
        throw userSourceError;
      }

      setRssList(rssData || []);
      setSelected((userData || []).map((item) => item.rss_id));
    } catch (error) {
      console.error("Failed to load preferences:", error);

      setStatus("Failed to load your preferences.");
      setStatusType("error");
    } finally {
      setLoading(false);
    }
  };

  // --------------------------------------------------
  // TOGGLE SINGLE RSS
  // --------------------------------------------------

  const toggleRSS = (rssId) => {
    setSelected((previous) => {
      if (previous.includes(rssId)) {
        return previous.filter((id) => id !== rssId);
      }

      return [...previous, rssId];
    });
  };

  // --------------------------------------------------
  // SELECT / DESELECT CATEGORY
  // --------------------------------------------------

  const toggleCategoryAll = (feeds) => {
    const feedIds = feeds.map((feed) => feed.id);

    const allSelected = feedIds.every((id) =>
      selected.includes(id)
    );

    if (allSelected) {
      setSelected((previous) =>
        previous.filter((id) => !feedIds.includes(id))
      );
    } else {
      setSelected((previous) => [
        ...new Set([...previous, ...feedIds]),
      ]);
    }
  };

  // --------------------------------------------------
  // SAVE
  // --------------------------------------------------

  const savePreferences = async () => {
    try {
      setSaving(true);
      setStatus("");

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) {
        throw authError;
      }

      if (!user) {
        navigate("/login");
        return;
      }

      // Remove old selections
      const { error: deleteError } = await supabase
        .from("user_sources")
        .delete()
        .eq("user_id", user.id);

      if (deleteError) {
        throw deleteError;
      }

      // Insert new selections
      if (selected.length > 0) {
        const inserts = selected.map((rss_id) => ({
          user_id: user.id,
          rss_id,
        }));

        const { error: insertError } = await supabase
          .from("user_sources")
          .insert(inserts);

        if (insertError) {
          throw insertError;
        }
      }

      setStatus("Preferences synced successfully ✨");
      setStatusType("success");

      setTimeout(() => {
        setStatus("");
      }, 3500);
    } catch (error) {
      console.error("Failed to save preferences:", error);

      setStatus("Failed to save changes.");
      setStatusType("error");
    } finally {
      setSaving(false);
    }
  };

  // --------------------------------------------------
  // LOGOUT
  // --------------------------------------------------

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      navigate("/login");
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  // --------------------------------------------------
  // CATEGORIES
  // --------------------------------------------------

  const categories = useMemo(() => {
    const uniqueCategories = [
      ...new Set(
        rssList.map((rss) => rss.category || "General")
      ),
    ];

    return ["All", ...uniqueCategories];
  }, [rssList]);

  // --------------------------------------------------
  // FILTER
  // --------------------------------------------------

  const grouped = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    const filtered = rssList.filter((rss) => {
      const name = (rss.name || "").toLowerCase();
      const category = (rss.category || "General").toLowerCase();

      const matchesSearch =
        !query ||
        name.includes(query) ||
        category.includes(query);

      const rssCategory = rss.category || "General";

      const matchesCategory =
        activeCategory === "All" ||
        rssCategory === activeCategory;

      return matchesSearch && matchesCategory;
    });

    return filtered.reduce((groups, rss) => {
      const category = rss.category || "General";

      if (!groups[category]) {
        groups[category] = [];
      }

      groups[category].push(rss);

      return groups;
    }, {});
  }, [rssList, searchQuery, activeCategory]);

  // --------------------------------------------------
  // SEARCH CATEGORY RESET
  // --------------------------------------------------

  const handleCategoryChange = (category) => {
    setActiveCategory(category);
  };

  // --------------------------------------------------
  // LOADING SCREEN
  // --------------------------------------------------

  if (loading) {
    return (
      <div className="pref-container loading-screen">
        <div className="floating-bg-wrapper">
          <FloatingLines
            enabledWaves={["top", "middle", "bottom"]}
            lineCount={[8, 12, 16]}
            lineDistance={[6, 5, 4]}
            bendRadius={4}
            bendStrength={-0.3}
            interactive={true}
            parallax={true}
            linesGradient={[
              "#ce3cae",
              "#61518b",
              "#2563eb",
            ]}
          />
        </div>

        <div className="mesh-gradient" />

        <div className="loader-main">
          <div className="loading-spinner" />
          <span>Loading preferences...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="pref-container">

      {/* ==================================================
          BACKGROUND
      ================================================== */}

      <div className="background-layer">
        <div className="floating-bg-wrapper">
          <FloatingLines
            enabledWaves={["top", "middle", "bottom"]}
            lineCount={[8, 12, 16]}
            lineDistance={[6, 5, 4]}
            bendRadius={4}
            bendStrength={-0.3}
            interactive={true}
            parallax={true}
            linesGradient={[
              "#ce3cae",
              "#61518b",
              "#2563eb",
            ]}
          />
        </div>

        <div className="mesh-gradient" />
        <div className="dark-overlay" />
      </div>

      {/* ==================================================
          MAIN CONTENT
      ================================================== */}

      <main className="pref-content">

        {/* ==================================================
            NAVIGATION
        ================================================== */}

        <nav className="pref-nav">

          <div className="logo-area">
            <div className="logo-icon">
              ✨
            </div>

            <div className="logo-text">
              elinity.in
            </div>
          </div>

          <div className="nav-right">

            <div className="selection-counter">
              <span className="counter-number">
                {selected.length}
              </span>

              <span className="counter-text">
                sources selected
              </span>
            </div>

            <SpecularButton
              size="sm"
              radius={20}
              tint="#ffffff"
              tintOpacity={0.06}
              blur={5}
              textColor="#fca5a5"
              lineColor="#ef4444"
              baseColor="#7f1d1d"
              intensity={0.9}
              onClick={handleLogout}
            >
              Logout
            </SpecularButton>

          </div>
        </nav>

        {/* ==================================================
            HEADER
        ================================================== */}

        <header className="pref-header">

          <div className="header-badge">
            PERSONALIZATION
          </div>

          <h1 className="pref-title">
            Curate Your Briefing
          </h1>

          <p className="pref-subtitle">
            Select the intel streams that feed your
            daily AI digest.
          </p>

        </header>

        {/* ==================================================
            FILTER TOOLBAR
        ================================================== */}

        <div className="filter-toolbar">

          {/* SEARCH */}

          <div className="search-box">

            <span className="search-icon">
              🔍
            </span>

            <input
              type="text"
              placeholder="Search sources..."
              value={searchQuery}
              onChange={(event) =>
                setSearchQuery(event.target.value)
              }
              className="search-input"
            />

            {searchQuery && (
              <button
                type="button"
                className="clear-search"
                onClick={() => setSearchQuery("")}
                aria-label="Clear search"
              >
                ×
              </button>
            )}

          </div>

          {/* CATEGORY FILTER */}

          <div className="category-pills">

            {categories.map((category) => (
              <button
                type="button"
                key={category}
                className={`category-pill ${
                  activeCategory === category
                    ? "active"
                    : ""
                }`}
                onClick={() =>
                  handleCategoryChange(category)
                }
              >
                {category}
              </button>
            ))}

          </div>

        </div>

        {/* ==================================================
            SOURCE LIST
        ================================================== */}

        <div className="categories-stack">

          {Object.entries(grouped).map(
            ([category, feeds]) => {

              const allCategorySelected =
                feeds.length > 0 &&
                feeds.every((feed) =>
                  selected.includes(feed.id)
                );

              return (
                <section
                  key={category}
                  className="pref-section"
                >

                  {/* SECTION HEADER */}

                  <div className="section-header">

                    <div className="category-heading">

                      <h2 className="category-title">
                        {category}
                      </h2>

                      <span className="category-count">
                        {feeds.length}
                      </span>

                    </div>

                    <div className="divider-line" />

                    <button
                      type="button"
                      className="cat-toggle-btn"
                      onClick={() =>
                        toggleCategoryAll(feeds)
                      }
                    >
                      {allCategorySelected
                        ? "Deselect All"
                        : "Select All"}
                    </button>

                  </div>

                  {/* SOURCE GRID */}

                  <div className="sources-grid">

                    {feeds.map((rss) => {

                      const isSelected =
                        selected.includes(rss.id);

                      return (
                        <button
                          type="button"
                          key={rss.id}
                          className={`source-card ${
                            isSelected
                              ? "is-selected"
                              : ""
                          }`}
                          onClick={() =>
                            toggleRSS(rss.id)
                          }
                          aria-pressed={isSelected}
                        >

                          <div className="source-info">

                            <span className="source-name">
                              {rss.name}
                            </span>

                            <span className="source-meta">
                              {rss.category || "Feed"}
                            </span>

                          </div>

                          <div
                            className={`checkbox-indicator ${
                              isSelected
                                ? "checked"
                                : ""
                            }`}
                          >
                            {isSelected && (
                              <span className="check-icon">
                                ✓
                              </span>
                            )}
                          </div>

                        </button>
                      );
                    })}

                  </div>

                </section>
              );
            }
          )}

          {/* EMPTY STATE */}

          {Object.keys(grouped).length === 0 && (
            <div className="empty-state">

              <div className="empty-icon">
                🔎
              </div>

              <h3>
                No sources found
              </h3>

              <p>
                Nothing matches{" "}
                <strong>
                  "{searchQuery}"
                </strong>
              </p>

              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setActiveCategory("All");
                }}
              >
                Clear filters
              </button>

            </div>
          )}

        </div>

        {/* ==================================================
            FOOTER
        ================================================== */}

        <footer className="pref-footer">

          <div className="footer-glass">

            <div className="status-container-inline">

              {status ? (
                <span
                  className={`status-toast ${
                    statusType === "error"
                      ? "status-error"
                      : "status-success"
                  }`}
                >
                  {status}
                </span>
              ) : (
                <span className="footer-hint">
                  {selected.length === 0
                    ? "Select at least one source"
                    : `${selected.length} sources ready`}
                </span>
              )}

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
              {saving ? (
                <span className="button-loading">
                  <span className="button-spinner" />
                  Saving...
                </span>
              ) : (
                "Save Preferences"
              )}
            </SpecularButton>

          </div>

        </footer>

      </main>
    </div>
  );
}

export default Preferences;
