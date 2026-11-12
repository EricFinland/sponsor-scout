import type { Metadata } from "next";
import MethodContent from "@/components/MethodContent";
import { DEFAULT_CONFIG } from "@/lib/data";
import { sheetConfigured } from "@/lib/sheets";
export const metadata: Metadata = { title: "Method" };
export default function MethodPage() {
  if (sheetConfigured()) return null;
  return <MethodContent config={DEFAULT_CONFIG} shared={false} />;
}
