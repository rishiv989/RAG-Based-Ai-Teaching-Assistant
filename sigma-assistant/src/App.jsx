import { useState } from "react";
import { jsPDF } from "jspdf";
import "./App.css";
import videoLinks from "./videoLinks";

// Very simple "ML-style" intent detector based on patterns
function detectIntent(question) {
  const q = question.toLowerCase();

  if (!q.trim()) return "auto";

  // Debug / error
  const debugWords = ["error", "not working", "bug", "traceback", "issue", "crash"];
  if (debugWords.some((w) => q.includes(w))) return "debug";

  // Code generation
  const codeWords = [
    "write code",
    "generate code",
    "code for",
    "implementation",
    "example code",
    "snippet",
    "program to",
  ];
  if (codeWords.some((w) => q.includes(w))) return "code";

  // Comparison
  const compareWords = ["difference between", " vs ", "vs.", "compare", "which is better"];
  if (compareWords.some((w) => q.includes(w))) return "compare";

  // Explanation / theory
  const explainWords = ["what is", "explain", "meaning of", "concept of"];
  if (explainWords.some((w) => q.includes(w))) return "explain";

  // Default
  return "explain";
}

function intentLabel(intent) {
  switch (intent) {
    case "debug":
      return "Debug / Fix errors";
    case "code":
      return "Code generation";
    case "compare":
      return "Compare concepts";
    case "explain":
      return "Explain / Theory";
    default:
      return "Auto";
  }
}

function App() {
  const initialSession = {
    id: "session-" + Date.now(),
    title: "New chat",
    question: "",
    answer: "",
    matches: [],
  };

  const [sessions, setSessions] = useState([initialSession]);
  const [currentSessionId, setCurrentSessionId] = useState(initialSession.id);

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [activeTimestamp, setActiveTimestamp] = useState(null);

  // Upload state
  const [userVideos, setUserVideos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  // Language selection
  const [language, setLanguage] = useState("en"); // "en", "hi", "mr"

  // Weakness detector
  const [topicStats, setTopicStats] = useState({}); // { "HTML Forms": 3, ... }

  // Last detected intent
  const [lastIntent, setLastIntent] = useState(null);

  // Quiz state
  const [quizItems, setQuizItems] = useState([]);
  const [quizRaw, setQuizRaw] = useState("");
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizError, setQuizError] = useState("");
  const [selectedOptions, setSelectedOptions] = useState({});
  const [showQuizResult, setShowQuizResult] = useState(false);
  const [quizScore, setQuizScore] = useState(null);

  // ---- Session helpers ----
  const saveCurrentSessionSnapshot = () => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === currentSessionId ? { ...s, question, answer, matches } : s
      )
    );
  };

  const handleNewSession = () => {
    saveCurrentSessionSnapshot();

    const newSession = {
      id:
        "session-" +
        Date.now() +
        "-" +
        Math.random().toString(36).slice(2, 6),
      title: "New chat",
      question: "",
      answer: "",
      matches: [],
    };

    setSessions((prev) => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);

    setQuestion("");
    setAnswer("");
    setMatches([]);
    setActiveTimestamp(null);
    setErrorMsg("");
    setLastIntent(null);

    // reset quiz
    setQuizItems([]);
    setQuizRaw("");
    setQuizError("");
    setSelectedOptions({});
    setShowQuizResult(false);
    setQuizScore(null);
  };

  const handleSwitchSession = (sessionId) => {
    if (sessionId === currentSessionId) return;

    saveCurrentSessionSnapshot();

    const target = sessions.find((s) => s.id === sessionId);
    if (!target) return;

    setCurrentSessionId(sessionId);
    setQuestion(target.question || "");
    setAnswer(target.answer || "");
    setMatches(target.matches || []);
    setActiveTimestamp(null);
    setErrorMsg("");
    setLastIntent(null);

    // when switching, clear quiz (simple version)
    setQuizItems([]);
    setQuizRaw("");
    setQuizError("");
    setSelectedOptions({});
    setShowQuizResult(false);
    setQuizScore(null);
  };

  // ---- ASK HANDLER ----
  const handleAsk = async () => {
    setErrorMsg("");
    setAnswer("");
    setMatches([]);
    setActiveTimestamp(null);

    // clear old quiz
    setQuizItems([]);
    setQuizRaw("");
    setQuizError("");
    setSelectedOptions({});
    setShowQuizResult(false);
    setQuizScore(null);

    const q = question.trim();
    if (!q) {
      setErrorMsg("Please type a question.");
      return;
    }

    const intent = detectIntent(q);
    setLastIntent(intent);

    setLoading(true);

    try {
      const res = await fetch("http://localhost:8000/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ question: q, language, intent }),
      });

      if (!res.ok) throw new Error("Server error");

      const data = await res.json();
      const finalAnswer = data.answer || "No answer from server.";
      const finalMatches = data.matches || [];

      setAnswer(finalAnswer);
      setMatches(finalMatches);

      // update current session with Q/A and matches
      setSessions((prev) =>
        prev.map((s) =>
          s.id === currentSessionId
            ? {
                ...s,
                question: q,
                answer: finalAnswer,
                matches: finalMatches,
                title:
                  s.title === "New chat" || !s.title
                    ? q.length > 30
                      ? q.slice(0, 27) + "..."
                      : q
                    : s.title,
              }
            : s
        )
      );

      // update weakness stats based on matches
      setTopicStats((prev) => {
        const updated = { ...prev };
        finalMatches.forEach((m) => {
          const key = m.title || `Video ${m.number}`;
          updated[key] = (updated[key] || 0) + 1;
        });
        return updated;
      });
    } catch (err) {
      console.error(err);
      setErrorMsg("Could not connect to backend. Is Python server running?");
    } finally {
      setLoading(false);
    }
  };

  // ---- QUIZ HANDLERS ----
  const handleGenerateQuiz = async () => {
    setQuizError("");
    setQuizItems([]);
    setQuizRaw("");
    setSelectedOptions({});
    setShowQuizResult(false);
    setQuizScore(null);

    if (!answer && !question.trim()) {
      setQuizError("Ask a question first, then generate a quiz.");
      return;
    }

    setQuizLoading(true);
    try {
      const res = await fetch("http://localhost:8000/quiz", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ question: question || answer, language }),
      });

      if (!res.ok) throw new Error("Quiz server error");

      const data = await res.json();
      if (data.quiz && data.quiz.length > 0) {
        setQuizItems(data.quiz);
      } else if (data.raw) {
        setQuizRaw(data.raw);
      } else {
        setQuizError("Quiz could not be generated.");
      }
    } catch (err) {
      console.error(err);
      setQuizError("Could not connect to quiz backend.");
    } finally {
      setQuizLoading(false);
    }
  };

  const handleSelectOption = (qIndex, optIndex) => {
    setSelectedOptions((prev) => ({
      ...prev,
      [qIndex]: optIndex,
    }));
    setShowQuizResult(false);
  };

  const handleCheckQuiz = () => {
    if (!quizItems.length) return;

    let correct = 0;
    quizItems.forEach((item, idx) => {
      const selectedIndex = selectedOptions[idx];
      if (selectedIndex === undefined) return;
      const selected = item.options?.[selectedIndex];
      if (!selected) return;

      const correctAns = (item.answer || "").trim().toLowerCase();
      if (selected.trim().toLowerCase() === correctAns) {
        correct++;
      }
    });

    setQuizScore({ correct, total: quizItems.length });
    setShowQuizResult(true);
  };

  // 🎤 Voice input
  const handleVoiceInput = () => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setErrorMsg("Voice input not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;

    recognition.onstart = () => setIsListening(true);

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setQuestion((prev) =>
        prev ? `${prev.trim()} ${transcript}` : transcript
      );
    };

    recognition.onerror = () =>
      setErrorMsg("Problem with microphone or speech recognition.");

    recognition.onend = () => setIsListening(false);

    recognition.start();
  };

  // PDF Export
  const handleExportPDF = () => {
    if (!question && !answer) {
      setErrorMsg("Ask a question first, then export PDF.");
      return;
    }

    const doc = new jsPDF();
    let y = 12;

    doc.setFontSize(16);
    doc.text("Sigma Web Dev – AI Teaching Assistant", 10, y);
    y += 10;

    doc.setFontSize(12);
    doc.text("Question:", 10, y);
    y += 6;
    const qLines = doc.splitTextToSize(question || "-", 190);
    doc.text(qLines, 10, y);
    y += qLines.length * 6 + 4;

    doc.text("Answer:", 10, y);
    y += 6;
    const aLines = doc.splitTextToSize(answer || "-", 190);
    doc.text(aLines, 10, y);
    y += aLines.length * 6 + 4;

    if (matches.length > 0) {
      doc.text("Relevant video chunks:", 10, y);
      y += 6;

      matches.forEach((m, idx) => {
        const block = `#${idx + 1} – Video ${m.number}: ${m.title}
Time: ${Math.round(m.start)}s – ${Math.round(m.end)}s
Text: ${m.text}`;

        const lines = doc.splitTextToSize(block, 190);
        if (y + lines.length * 6 > 280) {
          doc.addPage();
          y = 12;
        }
        doc.text(lines, 10, y);
        y += lines.length * 6 + 4;
      });
    }

    doc.save("sigma-web-dev-answer.pdf");
  };

  // Open on YouTube
  const handleOpenVideo = (m) => {
    const startSeconds = Math.round(m.start);
    const baseUrl = videoLinks[m.number];

    let url;
    if (baseUrl) {
      url = `${baseUrl}&t=${startSeconds}s`;
    } else {
      const query = encodeURIComponent(`${m.title} Video ${m.number}`);
      url = `https://www.youtube.com/results?search_query=${query}`;
    }

    window.open(url, "_blank");
  };

  // Inline YT preview
  const getVideoIdFromUrl = (url) => {
    try {
      const u = new URL(url);
      return u.searchParams.get("v");
    } catch {
      return null;
    }
  };

  const handlePreviewVideo = (m) => {
    const baseUrl = videoLinks[m.number];
    if (!baseUrl) {
      setErrorMsg("No direct YouTube link found for inline preview.");
      return;
    }

    const videoId = getVideoIdFromUrl(baseUrl);
    if (!videoId) {
      setErrorMsg("Could not extract video ID.");
      return;
    }

    setActiveTimestamp({
      label: `Video ${m.number} – ${m.title}`,
      videoId,
      seconds: Math.round(m.start),
    });
  };

  // Upload video
  const handleUploadVideo = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setUploading(true);
    setUploadError("");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", file.name);

    try {
      const res = await fetch("http://localhost:8000/upload_video", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!data.success) {
        setUploadError(data.message || "Upload failed.");
      } else {
        setUserVideos((prev) => [
          ...prev,
          {
            id: data.video_id,
            title: data.title,
            chunks: data.chunks,
          },
        ]);
      }
    } catch (error) {
      setUploadError("Could not connect to backend.");
    }

    setUploading(false);
    event.target.value = "";
  };

  const topTopics = Object.entries(topicStats)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <div className="app-root">
      <div className="app-gradient" />
      <div className="app-shell">
        {/* HEADER */}
        <header className="app-header">
          <div>
            <h1>Sigma Web Dev – AI Teaching Assistant</h1>
            <p>
              Ask anything about the <span>Sigma Web Development Course</span>.
            </p>
          </div>

          <div className="header-actions">
            {/* Language selector */}
            <div className="lang-selector">
              <label>Language:</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                <option value="en">English</option>
                <option value="hi">Hindi</option>
                <option value="mr">Marathi</option>
              </select>
            </div>

            <button
              className="secondary-btn"
              onClick={handleExportPDF}
              disabled={!answer && matches.length === 0}
            >
              ⬇ Export as PDF
            </button>

            <div className="badge">
              <span className="badge-dot" />
              Online
            </div>
          </div>
        </header>

        {/* SESSION BAR */}
        <nav className="session-bar">
          <button
            className="session-pill new-session"
            type="button"
            onClick={handleNewSession}
          >
            + New chat
          </button>

          {sessions.map((s) => (
            <button
              key={s.id}
              type="button"
              className={
                "session-pill" +
                (s.id === currentSessionId ? " session-pill-active" : "")
              }
              onClick={() => handleSwitchSession(s.id)}
            >
              {s.title && s.title !== "New chat"
                ? s.title.length > 26
                  ? s.title.slice(0, 23) + "..."
                  : s.title
                : "New chat"}
            </button>
          ))}
        </nav>

        <main className="app-main">
          {/* LEFT PANEL */}
          <section className="chat-panel glass-card">
            <h2>Ask a question</h2>

            <div className="input-wrapper">
              <textarea
                rows={3}
                placeholder="Type or speak your question…"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              />
              <div className="input-actions">
                <button onClick={handleAsk} disabled={loading}>
                  {loading ? "Thinking…" : "Ask the AI"}
                </button>
                <button
                  type="button"
                  className={`mic-btn ${isListening ? "mic-active" : ""}`}
                  onClick={handleVoiceInput}
                >
                  🎤
                </button>
              </div>
            </div>

            {/* Intent indicator */}
            {lastIntent && (
              <div className="intent-indicator">
                Detected intent:
                <span className="intent-tag">{intentLabel(lastIntent)}</span>
              </div>
            )}

            {errorMsg && <p className="error-text">{errorMsg}</p>}

            {/* Chat bubbles */}
            <div className="chat-messages">
              {question && (
                <div className="bubble-row user-row">
                  <div className="bubble user-bubble">
                    <div className="bubble-label">You</div>
                    <div className="bubble-text">{question}</div>
                  </div>
                </div>
              )}

              {answer && (
                <div className="bubble-row ai-row">
                  <div className="bubble ai-bubble">
                    <div className="bubble-label">Sigma AI</div>
                    <div className="bubble-text">{answer}</div>
                  </div>
                </div>
              )}

              {loading && (
                <div className="bubble-row ai-row">
                  <div className="bubble ai-bubble">
                    <div className="bubble-label">Sigma AI</div>
                    <div className="typing">
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* QUIZ CONTROLS + PANEL */}
            <div className="quiz-actions">
              <button
                type="button"
                onClick={handleGenerateQuiz}
                disabled={quizLoading || (!answer && !question)}
              >
                {quizLoading ? "Generating quiz..." : "🧪 Generate quiz from this topic"}
              </button>
              {quizError && <p className="error-text">{quizError}</p>}
            </div>

            {quizItems.length > 0 && (
              <div className="quiz-panel">
                <h3>Quiz from this topic</h3>
                <p className="quiz-subtitle">
                  Select your answers and then click &quot;Check answers&quot;.
                </p>

                {quizItems.map((item, idx) => (
                  <div key={idx} className="quiz-item">
                    <div className="quiz-question">
                      {idx + 1}. {item.question}
                    </div>
                    <div className="quiz-options">
                      {item.options &&
                        item.options.map((opt, optIdx) => {
                          const selected = selectedOptions[idx] === optIdx;
                          return (
                            <button
                              key={optIdx}
                              type="button"
                              className={
                                "quiz-option" +
                                (selected ? " quiz-option-selected" : "")
                              }
                              onClick={() => handleSelectOption(idx, optIdx)}
                            >
                              {String.fromCharCode(65 + optIdx)}. {opt}
                            </button>
                          );
                        })}
                    </div>

                    {showQuizResult && (
                      <div className="quiz-explanation">
                        <div className="quiz-correct">
                          Correct answer:{" "}
                          <span>{item.answer || "Not provided"}</span>
                        </div>
                        {item.explanation && (
                          <div className="quiz-expl-text">
                            {item.explanation}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                <button
                  type="button"
                  className="quiz-check-btn"
                  onClick={handleCheckQuiz}
                >
                  ✅ Check answers
                </button>

                {showQuizResult && quizScore && (
                  <div className="quiz-score">
                    You scored{" "}
                    <strong>
                      {quizScore.correct} / {quizScore.total}
                    </strong>
                  </div>
                )}
              </div>
            )}

            {quizItems.length === 0 && quizRaw && (
              <div className="quiz-panel">
                <h3>Quiz (raw text)</h3>
                <pre className="quiz-raw">{quizRaw}</pre>
              </div>
            )}
          </section>

          {/* RIGHT PANEL */}
          <section className="context-panel glass-card">
            <div className="context-header">
              <h2>Relevant videos</h2>
            </div>

            {/* Inline preview */}
            {activeTimestamp && (
              <div className="inline-player">
                <div className="inline-player-header">
                  <div className="inline-player-title">
                    {activeTimestamp.label}
                  </div>
                  <button
                    className="inline-player-close"
                    onClick={() => setActiveTimestamp(null)}
                  >
                    ✕
                  </button>
                </div>

                <iframe
                  className="inline-player-iframe"
                  src={`https://www.youtube.com/embed/${activeTimestamp.videoId}?start=${activeTimestamp.seconds}&autoplay=1&rel=0`}
                  allow="autoplay; encrypted-media"
                  allowFullScreen
                ></iframe>
              </div>
            )}

            {/* Matches */}
            {matches.length > 0 && (
              <div className="video-grid">
                {matches.map((m, idx) => (
                  <article key={idx} className="video-card">
                    <header className="video-card-header">
                      <div className="video-pill">Video {m.number}</div>
                      <div className="video-time">
                        ⏱ {Math.round(m.start)}s – {Math.round(m.end)}s
                      </div>
                    </header>
                    <h3>{m.title}</h3>
                    <p>{m.text}</p>
                    <div className="video-footer">
                      <button
                        className="video-open-btn"
                        onClick={() => handlePreviewVideo(m)}
                      >
                        ▶ Preview
                      </button>
                      <button
                        className="video-open-btn ghost"
                        onClick={() => handleOpenVideo(m)}
                      >
                        🔗 YouTube
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}

            {/* Upload Panel */}
            <hr />

            <div className="user-videos-panel">
              <h3>Your uploaded videos</h3>

              <label className="video-upload-btn">
                {uploading ? "Uploading…" : "Upload video"}
                <input
                  type="file"
                  accept="video/*"
                  hidden
                  onChange={handleUploadVideo}
                />
              </label>

              {uploadError && <p className="error-text">{uploadError}</p>}

              {userVideos.length > 0 &&
                userVideos.map((v) => (
                  <p key={v.id}>
                    {v.title} — {v.chunks} chunks indexed
                  </p>
                ))}

              {userVideos.length === 0 && <p>No personal videos yet.</p>}
            </div>

            {/* Weakness detector */}
            <div className="weakness-panel">
              <h3>Your weak topics</h3>
              <p className="weakness-subtitle">
                Based on which videos you keep hitting in answers (only in this
                browser).
              </p>

              {topTopics.length === 0 ? (
                <p className="weakness-empty">
                  Ask some questions and I&apos;ll start tracking where you
                  struggle most.
                </p>
              ) : (
                <ul className="weakness-list">
                  {topTopics.map(([title, count]) => (
                    <li key={title} className="weakness-item">
                      <div className="weakness-title-row">
                        <span className="weakness-title">{title}</span>
                        <span className="weakness-count">{count}×</span>
                      </div>
                      <div className="weakness-bar-outer">
                        <div
                          className="weakness-bar-inner"
                          style={{
                            width: Math.min(100, 20 + count * 15) + "%",
                          }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

export default App;
