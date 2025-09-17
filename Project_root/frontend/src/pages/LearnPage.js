import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { listMyPurchases } from '../api';


export default function LearnPage() {
  const { id } = useParams();
  const videoId = Number(id);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [purchases, setPurchases] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const data = await listMyPurchases();
        setPurchases(Array.isArray(data) ? data : []);
      } catch (e) {
        setError('Failed to load your purchases.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const record = useMemo(() => {
    return purchases.find((p) => (p?.video?.id ?? p?.video_id) === videoId);
  }, [purchases, videoId]);

  const v = record?.video || null;

  if (loading) return <div className="pageWrap"><div className="card">Loading…</div></div>;

  if (!record || !v) {
    return (
      <div className="pageWrap">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Access denied</h2>
          <p>You have not purchased this course or it no longer exists.</p>
          <div className="buttonGroup">
            <button className="btnPrimary" onClick={() => navigate('/browse')}>Browse Courses</button>
            <button className="btnSecondary" onClick={() => navigate('/')}>Back to Dashboard</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pageWrap">
      <div className="headerWrap">
        <div className="iconBadge">🎓</div>
        <h1 style={{ margin: 8 }}>{v.title}</h1>
        <p style={{ margin: 0, color: '#667085' }}>{v.desc}</p>
      </div>

      <div className="card" style={{ maxWidth: 960, width: '100%' }}>
        <div className="course__media">
          <video controls width="100%">
            <source src={v.url} type="video/mp4" />
            Your browser does not support video playback.
          </video>
          <span className="course__duration">{v.duration}</span>
        </div>
        <div className="course__body" style={{ marginTop: 12 }}>
          <div className="course__title" style={{ fontSize: 18, fontWeight: 600 }}>{v.title}</div>
          <div className="course__meta" style={{ marginTop: 6, color: '#6B7280' }}>
            <span>by {v.author || 'Anonymous'}</span>
            <span style={{ marginLeft: 8 }}>{v.owner ? `(${v.owner})` : ''}</span>
            <span style={{ marginLeft: 12 }}>• {v.points} pts</span>
            {typeof v.duration_seconds === 'number' && (
              <span style={{ marginLeft: 12 }}>• {v.duration_seconds}s</span>
            )}
          </div>
        </div>
        <div className="buttonGroup" style={{ marginTop: 12 }}>
          <button className="btnSecondary" onClick={() => navigate('/browse')}>Back to Browse</button>
          <button className="btnPrimary" onClick={() => navigate('/')}>Back to Dashboard</button>
        </div>
      </div>
    </div>
  );
}
