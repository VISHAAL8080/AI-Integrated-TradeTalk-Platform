import { useState } from "react";
import { generateAssessment } from "../api";


export default function CoursePage({ setCourse, setQuestions, setStage }) {
  const [courseInput, setCourseInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setLoading(true);
    try {
      const data = await generateAssessment(courseInput);
      // Validate response shape
      if (data && Array.isArray(data.questions) && data.questions.length > 0) {
        setCourse(courseInput);
        setQuestions(data.questions);
        setStage("assessment");
      } else {
        console.error("Unexpected assessment response:", data);
        setQuestions("Failed to generate questions. Please try again.");
      }
    } catch (e) {
      // If generation fails, stay on assessment but show fallback
      setQuestions("Failed to generate questions. Please try again.");
      console.error(e);
    }
    setLoading(false);
  }

  return (
    <div>
      <h2>Enter Course</h2>
      <input value={courseInput} onChange={(e) => setCourseInput(e.target.value)} />
      <button onClick={handleSubmit} disabled={loading || !courseInput.trim()}>
        {loading ? "Generating..." : "Generate Assessment"}
      </button>
    </div>
  );
}