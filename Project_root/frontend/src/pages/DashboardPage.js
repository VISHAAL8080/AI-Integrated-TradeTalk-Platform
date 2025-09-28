import React, { useEffect, useState } from "react";
import { getMyVideos, deleteMyVideo } from "../api";
import { listMyPurchases } from "../api";
import { useAuth } from "../auth";
import { useNavigate } from "react-router-dom";
import "../CSS/DashboardPage.css";

export default function DashboardPage() {
  const [videos, setVideos] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [headerSearch, setHeaderSearch] = useState("");

  useEffect(() => {
    async function fetchVideos() {
      const data = await getMyVideos();
      // Only show videos that were accepted by the backend similarity check
      const approved = Array.isArray(data) ? data.filter((v) => v?.accepted === true) : [];
      setVideos(approved);
    }
    fetchVideos();
  }, []);

  useEffect(() => {
    async function fetchPurchases() {
      try {
        const data = await listMyPurchases();
        setPurchases(Array.isArray(data) ? data : []);
      } catch (_) {
        setPurchases([]);
      }
    }
    fetchPurchases();
  }, []);

  const earnedPoints = videos.reduce((sum, v) => sum + (Number.isFinite(v?.points) ? v.points : 0), 0);
  const spentPoints = purchases.reduce((sum, p) => sum + (Number.isFinite(p?.video?.points) ? p.video.points : 0), 0);
  const totalPoints = 100 + earnedPoints - spentPoints;

  async function handleDelete(id) {
    if (!window.confirm("Delete this course? This action cannot be undone.")) return;
    try {
      setDeletingId(id);
      await deleteMyVideo(id);
      // Remove from local state so UI & header points update instantly
      setVideos((prev) => prev.filter((v) => v.id !== id));
    } catch (e) {
      alert(e?.data?.detail || e?.message || "Failed to delete video");
    } finally {
      setDeletingId(null);
    }
  }

  function submitHeaderSearch() {
    const q = (headerSearch || "").trim();
    if (q) navigate(`/browse?q=${encodeURIComponent(q)}`);
    else navigate('/browse');
  }

  function onHeaderSearchKeyDown(e) {
    if (e.key === 'Enter') submitHeaderSearch();
  }

  return (
    <div className="dash" onClick={() => setMenuOpen(false)}>
      {/* Top bar */}
      <header className="dash__topbar" onClick={(e) => e.stopPropagation()}>
        <div className="dash__brand" onClick={() => navigate('/')} 
             style={{ cursor: 'pointer' }}>
          <span className="dash__logo">📘</span>
          <span className="dash__title">Trade Talk Platform</span>
        </div>
        <div className="dash__right" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Quick actions in header */}
          <input
            type="text"
            placeholder="Search courses"
            value={headerSearch}
            onChange={(e) => setHeaderSearch(e.target.value)}
            onKeyDown={onHeaderSearchKeyDown}
            className="input"
            style={{ marginRight: 4 }}
          />
          <button className="btnSecondary" onClick={submitHeaderSearch}>Search</button>
          <button className="btnSecondary" onClick={() => navigate('/browse')}>Browse Courses</button>
          <button className="btnPrimary" onClick={() => navigate('/teach')}>Start Teaching</button>

          {user ? (
            <>
              <span className="dash__welcome">
                Welcome back, <b>{user.name}</b>
              </span>
              <span className="dash__points">{totalPoints} Points</span>
              <button
                className="profileBtn"
                onClick={() => setMenuOpen((s) => !s)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="Account menu"
              >
                <span className="avatarCircle">{user.name?.[0]?.toUpperCase() || 'U'}</span>
              </button>
              {menuOpen && (
                <div className="profileMenu" role="menu">
                  <div className="profileMenu__item" role="menuitem" onClick={() => navigate('/profile')}>My Profile</div>
                  <div className="profileMenu__item" role="menuitem" onClick={() => { logout(); navigate('/'); }}>Logout</div>
                </div>
              )}
            </>
          ) : (
            <div className="headerActions">
              <button className="btnSecondary" onClick={() => navigate('/login')}>Log in</button>
              <button className="btnPrimary" onClick={() => navigate('/signup')}>Sign up</button>
            </div>
          )}
        </div>
      </header>

      {/* Expanded header/hero description */}
      <section className="dash__header">
        <div className="dash__headerContent">
          <h1 className="dash__headerTitle">Trade Talk Platform</h1>
          <p className="dash__headerSubtitle">
            Welcome to Trade Talk, an AI-powered knowledge exchange platform designed for learners and educators alike.
            <br /><br />
            <strong>Who We Are</strong>
            <br />
            We are a team of innovators passionate about making knowledge accessible, fair, and rewarding. Trade Talk is built to encourage students, professionals, and educators to share what they know, earn points, and use them to explore new learning opportunities.
            <br /><br />
            <strong>What We Offer</strong>
            <br />
            📚 <strong>Teach &amp; Earn</strong> – Upload your courses with plagiarism &amp; topic validation. Earn points whenever others learn from you.
            <br />
            🎓 <strong>Learn &amp; Grow</strong> – Spend points to access quality courses, backed by AI-powered course &amp; project recommendations.
            <br />
            🤖 <strong>AI Assistant</strong> – Get personalized project ideas, course suggestions, auto-generated assessments, and answers to general queries.
            <br />
            🏆 <strong>Fair Ecosystem</strong> – Everyone contributes, everyone learns. No money, only knowledge and points!
            <br /><br />
            <strong>Our Vision</strong>
            <br />
            To create a self-sustaining learning community where knowledge is shared freely, AI personalizes the journey, and learners feel motivated to keep growing.
          </p>
        </div>
      </section>

      {/* Hero cards */}
      <section className="dash__hero">
        <div className="dash__card">
          <div className="dash__cardHead">
            <div className="dash__icon">🧑‍🏫</div>
            <div>
              <h3>Teach & Earn</h3>
              <p>Share your knowledge and earn points by teaching courses to the community.</p>
            </div>
          </div>
          <button className="btnPrimary dash__wideBtn" onClick={() => navigate('/teach')}>
            Start Teaching
          </button>
        </div>

        <div className="dash__card">
          <div className="dash__cardHead">
            <div className="dash__icon">📚</div>
            <div>
              <h3>Learn & Grow</h3>
              <p>Use your earned points to access premium courses and expand your skills.</p>
            </div>
          </div>
          <button className="btnSecondary dash__wideBtn" onClick={() => navigate('/browse')}>Browse Courses</button>
        </div>
      </section>

      {/* Tabs */}
      <section className="dash__tabs">
        <div className="dash__tab dash__tab--active">Public Catalog</div>
        <div
          className="dash__tab"
          role="button"
          tabIndex={0}
          onClick={() => navigate('/assistant')}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate('/assistant'); }}
          style={{ cursor: 'pointer' }}
        >
          AI Assistant
        </div>
        <div style={{ flex: 1 }} />
        <div className="dash__filter">
          <span>All Categories</span>
          <span className="dash__caret">▾</span>
        </div>
      </section>

      {/* Catalog - My Teached */}
      <section className="dash__catalog">
        <h2>My Teached courses</h2>
        <div className="dash__grid">
          {videos.length === 0 && <p>No videos yet. Upload a course to see it here!</p>}
          {videos.map((v) => (
            <div key={v.id} className="course">
              <div className="course__media">
                <video controls width="100%">
                  <source src={v.url} type="video/mp4" />
                  Your browser does not support video playback.
                </video>
                <span className="course__duration">{v.duration}</span>
              </div>
              <div className="course__body">
                <div className="course__title">{v.title}</div>
                <div className="course__desc">{v.desc}</div>
                <div className="course__meta">
                  <span className="course__author">by {v.author}</span>
                </div>
              </div>
              <div className="course__footer">
                <div className="course__points">{v.points} pts</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btnSecondary"
                    disabled={deletingId === v.id}
                    onClick={() => handleDelete(v.id)}
                    title="Delete this course"
                  >
                    {deletingId === v.id ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Catalog - Purchased */}
      <section className="dash__catalog">
        <h2>My Purchased Courses</h2>
        <div className="dash__grid">
          {purchases.length === 0 && <p>You have not purchased any courses yet.</p>}
          {purchases.map((p) => {
            const v = p.video || {};
            return (
              <div key={p.id} className="course">
                <div className="course__media" style={{ position: 'relative' }}>
                  <div className="badge" style={{ position: 'absolute', top: 8, left: 8, background: '#10B981', color: 'white', padding: '4px 8px', borderRadius: 6, fontSize: 12 }}>
                    Purchased
                  </div>
                  <div style={{ position: 'relative' }}>
                    <video
                      width="100%"
                      muted
                      preload="metadata"
                      style={{ pointerEvents: 'none', filter: 'grayscale(15%)', borderRadius: 8 }}
                    >
                      <source src={v.url + '#t=0.1'} type="video/mp4" />
                      Your browser does not support video playback.
                    </video>
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ background: 'rgba(0,0,0,0.45)', color: 'white', padding: '6px 10px', borderRadius: 6, fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span role="img" aria-label="lock">🔒</span>
                        <span>Playable after you click Start Learning</span>
                      </div>
                    </div>
                  </div>
                  <span className="course__duration">{v.duration}</span>
                </div>
                <div className="course__body">
                  <div className="course__title">{v.title}</div>
                  <div className="course__desc">{v.desc}</div>
                  <div className="course__meta">
                    <span className="course__author">by {v.author || 'Anonymous'}</span>
                    <span style={{ color:'#9CA3AF', marginLeft: 8 }}>
                      {v.owner ? `(${v.owner})` : ''}
                    </span>
                  </div>
                </div>
                <div className="course__footer">
                  <div className="course__points">{v.points} pts</div>
                  <button
                    className="btnPrimary"
                    onClick={() => navigate(`/learn/${v.id}`)}
                    title="Start learning this course"
                  >
                    Start Learning
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}