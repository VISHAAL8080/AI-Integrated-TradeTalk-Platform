import { useState } from "react";
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './auth';
import { generateAssessment, checkAssessment, checkSimilarity } from "./api";
import DashboardPage from "./pages/DashboardPage";
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import BrowsePage from './pages/BrowsePage';
import LearnPage from './pages/LearnPage';
import AssistantPage from './pages/AssistantPage';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null; 
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/browse" element={<BrowsePage />} />
      <Route
        path="/teach"
        element={
          <ProtectedRoute>
            <TeachFlow />
          </ProtectedRoute>
        }
      />
      <Route
        path="/learn/:id"
        element={
          <ProtectedRoute>
            <LearnPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/assistant"
        element={
          <ProtectedRoute>
            <AssistantPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

// -----------------------------
// Teach & Earn (Teach a Course)
// -----------------------------
function TeachFlow() {
  const [step, setStep] = useState(1); // 1: Course Info, 2: Knowledge Test, 3: Upload Video, 4: Complete
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [courseName, setCourseName] = useState("");
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState([]);
  const [similarityScore, setSimilarityScore] = useState(null);
  const [earnedPoints, setEarnedPoints] = useState(0);
  const [file, setFile] = useState(null);

  const threshold = 0.3; // similarity threshold for publishing

  const goDashboard = () => (window.location.href = '/');

  const handleGenerateAssessment = async () => {
    setError("");
    if (!courseName.trim()) {
      setError("Please enter a course name.");
      return;
    }
    try {
      setLoading(true);
      const res = await generateAssessment(courseName.trim());
      if (res?.questions && Array.isArray(res.questions) && res.questions.length) {
        setQuestions(res.questions);
        setAnswers(new Array(res.questions.length).fill(""));
        setStep(2);
      } else if (res?.error) {
        setError("Assessment generation failed: " + res.error);
      } else {
        setError("Could not generate questions. Please try again.");
      }
    } catch (e) {
      setError("Server error while generating assessment.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitAssessment = async () => {
    setError("");
    if (!questions.length) return;
    if (answers.some((a) => !a)) {
      setError("Please answer all questions.");
      return;
    }
    try {
      setLoading(true);
      const res = await checkAssessment(courseName, answers, questions);
      if (res?.result === "pass") {
        setStep(3);
      } else {
        setError(res?.message || "You must pass the assessment to proceed.");
        // On failure, return to dashboard immediately
        goDashboard();
      }
    } catch (e) {
      setError("Server error while checking assessment.");
    } finally {
      setLoading(false);
    }
  };

  const handleUploadVideo = async () => {
    setError("");
    if (!file) {
      setError("Please select a video file.");
      return;
    }
    try {
      setLoading(true);
      const res = await checkSimilarity(courseName, file);
      const score = typeof res?.similarity_score === "number" ? res.similarity_score : null;
      setSimilarityScore(score);
      const pts = Number.isFinite(res?.video?.points) ? Number(res.video.points) : 0;
      setEarnedPoints(pts);
      if (res?.accepted) {
        setStep(4);
        } else {
        setError("Similarity below threshold. Please review your video and try again.");
      }
    } catch (e) {
      setError("Server error while uploading video or computing similarity.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pageWrap">
      <div className="headerWrap">
        <div className="iconBadge">📘</div>
        <h1 style={{ margin: 8 }}>Teach a Course</h1>
        <p style={{ margin: 0, color: "#667085" }}>
          Share your knowledge and earn points by teaching courses to the community.
        </p>
      </div>

      <Stepper current={step} />

      {step === 1 && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>What course would you like to teach?</h2>
          <label className="label">Course Name</label>
          <input
            className="input"
            placeholder="e.g., Introduction to Database Management Systems"
            value={courseName}
            onChange={(e) => setCourseName(e.target.value)}
          />

          <div className="tipBox">
            <b>What happens next?</b>
            <ul style={{ marginTop: 8 }}>
              <li>AI will generate an assessment to verify your knowledge</li>
              <li>You’ll need to pass this test to proceed</li>
              <li>Upload your teaching video</li>
              <li>Earn points based on course value and engagement</li>
            </ul>
          </div>

          {error && <div className="errorBox">{error}</div>}

          <div className="buttonGroup">
            <button className="btnPrimary" onClick={handleGenerateAssessment} disabled={loading}>
              {loading ? "Generating..." : "Continue to Assessment"}
            </button>
            <button className="btnSecondary" onClick={goDashboard}>Back to Dashboard</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Knowledge Test</h2>
          <p style={{ color: "#667085" }}>Answer all questions correctly to proceed.</p>

          <div className="questionList">
            {questions.map((q, idx) => (
              <div key={idx} className="qBox">
                <div style={{ marginBottom: 8 }}>
                  <b>Q{idx + 1}.</b> {q.question}
                </div>
                <div className="radioList">
                  {q.options?.map((opt, oidx) => (
                    <label key={oidx} className="radioRow">
                      <input
                        type="radio"
                        name={`q-${idx}`}
                        value={opt}
                        checked={answers[idx] === opt}
                        disabled={Boolean(answers[idx])}
                        onChange={(e) => {
                          if (answers[idx]) return; // lock choice after first selection
                          const v = e.target.value;
                          setAnswers((prev) => prev.map((p, i) => (i === idx ? v : p)));
                        }}
                      />
                      <span>{opt}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {error && <div className="errorBox">{error}</div>}

          <div className="buttonGroup">
            <button className="btnPrimary" onClick={handleSubmitAssessment} disabled={loading}>
              {loading ? "Checking..." : "Submit Answers"}
            </button>
            <button className="btnSecondary" onClick={() => setStep(1)}>Back</button>
            <button className="btnSecondary" onClick={goDashboard}>Back to Dashboard</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Upload Video</h2>
          <p style={{ color: "#667085" }}>
            Upload your course video. We'll compute how well it matches the course topic. A score ≥ {threshold}
            will be accepted and published to the public catalog.
          </p>

          <input
            type="file"
            accept="video/*"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="fileInput"
          />

          {typeof similarityScore === "number" && (
            <div className="infoBox">Similarity Score: {similarityScore.toFixed(2)}</div>
          )}

          {error && <div className="errorBox">{error}</div>}

          <div className="buttonGroup">
            <button className="btnPrimary" onClick={handleUploadVideo} disabled={loading}>
              {loading ? "Checking..." : "Upload & Check"}
            </button>
            <button className="btnSecondary" onClick={() => setStep(2)}>Back</button>
            <button className="btnSecondary" onClick={goDashboard}>Back to Dashboard</button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Complete</h2>
          <div className="successBox">
            ✅ Video successfully uploaded to the public catalog!
          </div>
          <div className="infoBox">You earned {earnedPoints} points for this course. Great job!</div>

          <div className="buttonGroup">
            <button className="btnPrimary" onClick={goDashboard}>Back to Dashboard</button>
          </div>
        </div>
      )}
    </div>
  );
}

// Styles for Stepper in index.css via classes.
function Stepper({ current }) {
  const steps = ["Course Info", "Knowledge Test", "Upload Video", "Complete"];
  return (
    <div className="stepper">
      {steps.map((label, idx) => {
        const n = idx + 1;
        const active = n === current;
        const done = n < current;
        const circleClass = `step__circle ${done ? "done" : active ? "active" : ""}`;
        const textClass = `step__label ${active ? "active" : ""}`;
        return (
          <div key={n} className="step">
            <div className={circleClass}>{n}</div>
            <div className={textClass}>{label}</div>
            {n !== steps.length && <div className="step__divider" />}
          </div>
        );
      })}
    </div>
  );
}

export default App;