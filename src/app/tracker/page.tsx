import type { Metadata } from "next";
import TrackerClient from "@/components/TrackerClient";

export const metadata: Metadata = { title: "Tracker" };

export default function TrackerPage() {
  return (
    <>
      <div className="page-head">
        <h1>Tracker</h1>
        <p className="lede">
          Outreach you have logged, companies you have looked up, and research notes you have saved. This lives in your
          browser. Export it to share with the team or paste into the Google Sheet.
        </p>
      </div>
      <TrackerClient sheetConnected={Boolean(process.env.SHEET_WEBHOOK_URL)} />
    </>
  );
}
