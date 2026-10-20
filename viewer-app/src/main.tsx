import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { App, alignmentStats, type LoadPayload } from "./App";
import { parseFasta } from "./reseqt/fasta";
import "./reseqt/reseqt.css";
import "./styles.css";

type Phase =
  | { phase: "waiting" }
  | { phase: "loaded"; payload: LoadPayload }
  | { phase: "error"; message: string };

type LoadMessage = {
  type: string;
  payload?: { fasta?: unknown; label?: unknown; isAminoAcid?: unknown; theme?: unknown };
  theme?: unknown;
};

function post(type: string, detail: Record<string, unknown> = {}): void {
  try {
    window.parent.postMessage({ type, ...detail }, "*");
  } catch {
    // A detached parent cannot receive updates; the tab will be torn down.
  }
}

function applyTheme(theme: unknown): void {
  if (theme === "dark") document.documentElement.setAttribute("data-theme", "dark");
  else if (theme === "light") document.documentElement.removeAttribute("data-theme");
}

function accepted(payload: LoadMessage["payload"]): Phase {
  if (payload === undefined || typeof payload.fasta !== "string") {
    return { phase: "error", message: "没有收到可显示的序列文本。" };
  }
  if (payload.fasta.trim() === "") {
    return { phase: "error", message: "序列文件为空。" };
  }
  let count = 0;
  try {
    count = parseFasta(payload.fasta).length;
  } catch {
    return { phase: "error", message: "无法解析这个序列文件。" };
  }
  if (count === 0) {
    return { phase: "error", message: "文件中没有找到序列记录。" };
  }
  return {
    phase: "loaded",
    payload: {
      fasta: payload.fasta,
      label: typeof payload.label === "string" ? payload.label : undefined,
      isAminoAcid: payload.isAminoAcid === true,
    },
  };
}

function Loaded({ payload }: { payload: LoadPayload }) {
  useEffect(() => {
    // rAF is throttled while the DSH window is occluded, which would leave the
    // sidebar status dot stuck on "reading"; post the status immediately.
    post("dsh-seq-viewer:loaded", alignmentStats(payload.fasta));
  }, [payload]);
  return <App payload={payload} />;
}

function Root() {
  const [phase, setPhase] = useState<Phase>({ phase: "waiting" });

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent) return;
      const data = event.data as LoadMessage | undefined;
      if (data === null || typeof data !== "object") return;
      if (data.type === "dsh-seq-viewer:theme") {
        applyTheme(data.theme);
        return;
      }
      if (data.type !== "dsh-seq-viewer:load") return;
      applyTheme(data.payload?.theme);
      const next = accepted(data.payload);
      setPhase(next);
      if (next.phase === "error") post("dsh-seq-viewer:error", { message: next.message });
    };
    window.addEventListener("message", onMessage);
    post("dsh-seq-viewer:ready");
    return () => window.removeEventListener("message", onMessage);
  }, []);

  if (phase.phase === "loaded") return <Loaded payload={phase.payload} />;
  return (
    <div className="dsh-seq-waiting" role="status">
      {phase.phase === "error" ? phase.message : "正在准备序列查看器…"}
    </div>
  );
}

const container = document.getElementById("root");
if (container !== null) createRoot(container).render(<Root />);
