import React, { useEffect, useMemo, useState } from 'react';
import { getAllVideos, listMyPurchases, buyVideo } from '../api';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';

export default function BrowsePage() {
  const [videos, setVideos] = useState([]);
  const [purchasedIds, setPurchasedIds] = useState(new Set());
  const [buyingId, setBuyingId] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [searchText, setSearchText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [toast, setToast] = useState(null); // { type: 'success' | 'error', message: string }
  const [confirm, setConfirm] = useState(null); // { message, confirmLabel, cancelLabel, resolve }

  useEffect(() => {
    // Initialize search from URL query (?q=...)
    try {
      const params = new URLSearchParams(location.search || '');
      const q = params.get('q') || '';
      if (q) {
        setSearchText(q);
        setSearchQuery(q);
      }
    } catch (_) {}
  }, [location.search]);

  useEffect(() => {
    (async () => {
      const data = await getAllVideos();
      const approved = Array.isArray(data) ? data.filter((v) => v?.accepted === true) : [];
      setVideos(approved);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const purchases = await listMyPurchases();
        const ids = new Set((purchases || []).map((p) => p?.video?.id ?? p.video_id));
        setPurchasedIds(ids);
      } catch (_) {
        // Not logged in or request failed; ignore
      }
    })();
  }, []);

  const visibleVideos = useMemo(() => {
    if (!user?.email) return videos;
    return videos.filter((v) => (v?.owner || '').toLowerCase() !== user.email.toLowerCase());
  }, [videos, user]);

  const filteredVideos = useMemo(() => {
    const q = (searchQuery || '').trim().toLowerCase();
    if (!q) return visibleVideos;
    return visibleVideos.filter((v) => (v?.title || '').toLowerCase().includes(q));
  }, [visibleVideos, searchQuery]);

  function showToast(message, type = 'success', timeout = 2500) {
    setToast({ message, type });
    if (timeout) {
      setTimeout(() => setToast(null), timeout);
    }
  }

  function confirmAsync({ message, confirmLabel = 'OK', cancelLabel = 'Cancel' }) {
    return new Promise((resolve) => {
      setConfirm({ message, confirmLabel, cancelLabel, resolve });
    });
  }

  async function onBuy(v) {
    if (!user) {
      const goLogin = await confirmAsync({
        message: 'You need to log in to purchase. Go to login now?',
        confirmLabel: 'Go to Login',
        cancelLabel: 'Cancel',
      });
      if (goLogin) navigate('/login');
      return;
    }
    const price = Number.isFinite(v?.points) ? v.points : 0;
    const ok = await confirmAsync({
      message: `This course costs ${price} points. Do you want to purchase it?`,
      confirmLabel: 'Buy',
      cancelLabel: 'Cancel',
    });
    if (!ok) return;
    try {
      setBuyingId(v.id);
      await buyVideo(v.id);
      setPurchasedIds((prev) => new Set([...prev, v.id]));
      showToast('Purchase successful!');
      // Navigate to the course after a short delay so the toast is noticeable
      setTimeout(() => navigate(`/learn/${v.id}`), 800);
    } catch (e) {
      showToast(e?.data?.detail || e?.message || 'Purchase failed', 'error', 3500);
    } finally {
      setBuyingId(null);
    }
  }

  function onSearch() {
    setSearchQuery(searchText);
  }

  function onSearchKeyDown(e) {
    if (e.key === 'Enter') onSearch();
  }

  return (
    <div className="dash">
      <header className="dash__topbar">
        <div className="dash__brand" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
          <span className="dash__logo">📘</span>
          <span className="dash__title">Browse Courses</span>
        </div>
        <div className="dash__right" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="text"
            placeholder="Search by course name"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onKeyDown={onSearchKeyDown}
            className="input"
            style={{ marginRight: 8 }}
          />
          <button className="btnSecondary" onClick={onSearch} style={{ marginRight: 8 }}>Search</button>
          <button className="btnSecondary" onClick={() => navigate('/browse')}>Browse Courses</button>
          <button className="btnPrimary" onClick={() => navigate('/teach')}>Start Teaching</button>
          <button className="btnSecondary" onClick={() => navigate('/')}>Back to Dashboard</button>
        </div>
      </header>

      {/* Toast notification */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            right: 16,
            top: 72,
            background: toast.type === 'error' ? '#FEE2E2' : '#ECFDF5',
            color: toast.type === 'error' ? '#991B1B' : '#065F46',
            border: `1px solid ${toast.type === 'error' ? '#FCA5A5' : '#A7F3D0'}`,
            boxShadow: '0 4px 14px rgba(0,0,0,0.1)',
            padding: '10px 14px',
            borderRadius: 8,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            maxWidth: 320,
          }}
        >
          <span>{toast.type === 'error' ? '⚠️' : '✅'}</span>
          <span style={{ fontSize: 14 }}>{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            style={{
              marginLeft: 'auto',
              background: 'transparent',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              fontSize: 16,
            }}
            aria-label="Close notification"
            title="Close"
          >
            ×
          </button>
        </div>
      )}

      {/* Inline confirmation window */}
      {confirm && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            top: 80,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#111827',
            color: 'white',
            border: '1px solid #374151',
            borderRadius: 10,
            padding: '14px 16px',
            boxShadow: '0 10px 24px rgba(0,0,0,0.25)',
            zIndex: 1100,
            width: 'min(92vw, 420px)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ fontSize: 20, lineHeight: '20px' }}>💬</div>
            <div style={{ fontSize: 14, lineHeight: '20px' }}>{confirm.message}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <button
              className="btnSecondary"
              onClick={() => { confirm.resolve(false); setConfirm(null); }}
              style={{ background: '#374151', color: 'white', border: 'none' }}
            >
              {confirm.cancelLabel || 'Cancel'}
            </button>
            <button
              className="btnPrimary"
              onClick={() => { confirm.resolve(true); setConfirm(null); }}
            >
              {confirm.confirmLabel || 'OK'}
            </button>
          </div>
        </div>
      )}

      <section className="dash__catalog">
        <h2>Public Course Catalog (Other Users)</h2>
        <div className="dash__grid">
          {filteredVideos.length === 0 && <p>No public videos yet.</p>}
          {filteredVideos.map((v) => {
            const purchased = purchasedIds.has(v.id);
            return (
              <div key={v.id} className="course">
                <div className="course__media" style={{ position: 'relative' }}>
                  {purchased && (
                    <div className="badge" style={{ position: 'absolute', top: 8, left: 8, background: '#10B981', color: 'white', padding: '4px 8px', borderRadius: 6, fontSize: 12 }}>
                      Purchased — you can't buy again
                    </div>
                  )}
                  <div style={{ position: 'relative' }}>
                    <video
                      width="100%"
                      muted
                      preload="metadata"
                      style={{ pointerEvents: 'none', filter: 'grayscale(20%)', borderRadius: 8 }}
                    >
                      <source src={v.url + '#t=0.1'} type="video/mp4" />
                      Your browser does not support video playback.
                    </video>
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ background: 'rgba(0,0,0,0.45)', color: 'white', padding: '6px 10px', borderRadius: 6, fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span role="img" aria-label="lock">🔒</span>
                        <span>Locked — purchase to watch</span>
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
                  {purchased ? (
                    <button className="btnSecondary" disabled>Purchased</button>
                  ) : (
                    <button className="btnPrimary" disabled={buyingId === v.id} onClick={() => onBuy(v)}>
                      {buyingId === v.id ? 'Processing…' : `Buy & Start`}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
