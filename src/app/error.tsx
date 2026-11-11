"use client";
export default function WorkspaceError({ reset }: { error: Error; reset: () => void }) {
  return <div className="narrow"><h1>Workspace data is unavailable</h1><p>The shared Sheet could not be loaded. No shared changes have been discarded, and an older local dataset has not been substituted.</p><p>Check the Sheet connection and its required columns, then try again.</p><button className="button button-primary" onClick={reset}>Try again</button></div>;
}
