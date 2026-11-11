import type { Metadata } from "next";
import TrackerClient from "@/components/TrackerClient";

export const metadata: Metadata = { title: "Tracker" };

export default function TrackerPage() {
  return (
    <>
      <div className="page-head">
        <h1>Tracker</h1>
        <p className="lede">
          Outreach, company lookups and research notes. When the team Sheet is connected, changes are shared across the workspace.
        </p>
      </div>
      <TrackerClient sheetConnected={Boolean(process.env.SHEET_WEBHOOK_URL)} />
    </>
  );
}
