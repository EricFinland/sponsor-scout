"use client";
import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { mergeTemplates } from "@/lib/templates";
export function useTemplateLibrary() {
  const [personal, setPersonal] = useStore("templates");
  const templates = useMemo(() => mergeTemplates(personal), [personal]);
  return { templates, personal, setPersonal };
}
