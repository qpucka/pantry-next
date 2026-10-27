import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

function App() {
  return (
    <main className="shell">
      <section className="card" aria-labelledby="title">
        <p className="eyebrow">Pantry Next</p>
        <h1 id="title">Waiting room</h1>
        <p className="message">
          The multi-organization waiting-room app is ready for its first screen.
        </p>
        <div className="status" role="status">
          <span className="dot" aria-hidden="true" />
          Worker connected
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
