import { useState } from "react";
import { checkSimilarity } from "../api";

export default function VideoPage({ course }) {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);

  async function handleUpload() {
    const data = await checkSimilarity(course, file);
    setResult(data);
  }

  return (
    <div>
      <h2>Upload Teaching Video for {course}</h2>
      <input type="file" onChange={(e) => setFile(e.target.files[0])} />
      <button onClick={handleUpload}>Check Similarity</button>

      {result && (
        <div>
          <h3>Similarity Score: {result.similarity_score}</h3>
          <p>Transcript: {result.transcript}</p>
        </div>
      )}
    </div>
  );
}