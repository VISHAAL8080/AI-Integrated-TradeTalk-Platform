import { useState } from "react";
import { checkAssessment } from "../api";

export default function AssessmentPage({ course, questions, setResult, setStage }) {
  const [answers, setAnswers] = useState([]);
  const [warning, setWarning] = useState("");

  const handleOptionChange = (qIndex, option) => {
    // If this question is already answered, ignore further changes (lock it)
    if (answers[qIndex] !== undefined) return;
    const newAnswers = [...answers];
    newAnswers[qIndex] = option;
    setAnswers(newAnswers);
    // Clear any previous warning once the user starts correcting answers
  };

  async function handleSubmit() {
    try {
      const data = await checkAssessment(course, answers, questions);

      if (data.result === "pass") {
        setResult("pass");
        setStage("video");
      } else {
        const message = data.message || "Some answers are incorrect. Please try again.";
        window.alert(message);
        setResult("fail");
        setStage("course");
      }
    } catch (e) {
      console.error(e);
      setWarning("Error checking assessment.");
    }
  }

  return (
    <div>
      <h2>Assessment for {course}</h2>

      {Array.isArray(questions) && questions.length > 0 ? (
        questions.map((q, idx) => (
          <div key={idx} style={{ marginBottom: "1rem" }}>
            <p><b>{q.question}</b></p>
            {(Array.isArray(q.options) ? q.options : []).map((opt, oIdx) => (
              <label key={oIdx} style={{ display: "block" }}>
                <input
                  type="radio"
                  name={`q-${idx}`}
                  value={opt}
                  checked={answers[idx] === opt}
                  onChange={() => handleOptionChange(idx, opt)}
                  disabled={answers[idx] !== undefined}
                />
                {opt}
              </label>
            ))}
          </div>
        ))
      ) : typeof questions === "string" && questions ? (
        <p style={{ color: "red" }}>{questions}</p>
      ) : (
        <p>No questions loaded.</p>
      )}

      <button
        onClick={handleSubmit}
        disabled={!Array.isArray(questions) || answers.filter(Boolean).length !== (questions?.length || 0)}
      >
        Submit Assessment
      </button>
      {warning && <p style={{ color: "red", fontWeight: 600 }}>{warning}</p>}
    </div>
  );
}