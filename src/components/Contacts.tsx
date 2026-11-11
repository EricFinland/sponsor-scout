"use client";

import { useState } from "react";
import { linkedInSearchUrl, suggestedRoles } from "@/lib/contacts";
import { splitPersonName } from "@/lib/names";
import type { Company, Filing } from "@/lib/types";
import { External } from "./ui";

type Lookup = { state: "loading" } | { state: "done"; email: string | null; score: number | null } | { state: "error"; message: string };

export default function Contacts({
  company,
  filing,
  hunterEnabled,
}: {
  company: Company;
  filing: Filing | null;
  hunterEnabled: boolean;
}) {
  const [lookups, setLookups] = useState<Record<string, Lookup>>({});
  const roles = suggestedRoles(company.industry);
  const officers = filing?.officers ?? [];
  const canFindEmail = hunterEnabled && Boolean(company.domain);

  async function findEmail(name: string) {
    const { first, last } = splitPersonName(name);
    setLookups((current) => ({ ...current, [name]: { state: "loading" } }));
    try {
      const params = new URLSearchParams({ domain: company.domain, first, last });
      const response = await fetch(`/api/hunter?${params}`);
      const body = (await response.json()) as { email?: string | null; score?: number | null; error?: string };
      setLookups((current) => ({
        ...current,
        [name]: response.ok
          ? { state: "done", email: body.email ?? null, score: body.score ?? null }
          : { state: "error", message: body.error ?? "Lookup failed." },
      }));
    } catch {
      setLookups((current) => ({ ...current, [name]: { state: "error", message: "Lookup failed." } }));
    }
  }

  return (
    <div className="contacts">
      <div>
        <h3>Roles to look for</h3>
        <ul className="rows">
          {roles.map((role) => (
            <li key={role.title}>
              <div>
                <span className="row-title">{role.title}</span>
                <span className="sub">{role.why}</span>
              </div>
              <External href={linkedInSearchUrl(company.name, role.title)}>Search LinkedIn</External>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3>Foundation officers and directors</h3>
        {officers.length > 0 ? (
          <>
            <ul className="rows">
              {officers.map((officer) => {
                const lookup = lookups[officer.name];
                return (
                  <li key={officer.name}>
                    <div>
                      <span className="row-title">{officer.name}</span>
                      <span className="sub">{officer.title || "Title not listed"}</span>
                      {lookup?.state === "done" && (
                        <span className="sub">
                          {lookup.email
                            ? `${lookup.email}${lookup.score !== null ? ` (Hunter confidence ${lookup.score})` : ""}`
                            : "Hunter has no work email for this person."}
                        </span>
                      )}
                      {lookup?.state === "error" && <span className="sub error">{lookup.message}</span>}
                    </div>
                    <span className="row-actions">
                      <External href={linkedInSearchUrl(company.name, officer.name)}>LinkedIn</External>
                      {canFindEmail && (
                        <button
                          type="button"
                          className="link-button"
                          onClick={() => findEmail(officer.name)}
                          disabled={lookup?.state === "loading" || lookup?.state === "done"}
                        >
                          {lookup?.state === "loading" ? "Looking" : "Find work email"}
                        </button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="footnote">
              Named in the {filing?.taxYear} filing. Officers of a corporate foundation are usually company executives.
              {canFindEmail
                ? " Each email lookup uses one Hunter credit."
                : hunterEnabled
                  ? " Add the company's web domain to look up work emails."
                  : " Work email lookup is off. It turns on when a Hunter key is added in settings."}
            </p>
          </>
        ) : (
          <p className="empty">
            {filing ? "The filing does not name any officers." : "No foundation filing, so no named officers. Start from the roles on the left."}
          </p>
        )}
      </div>
    </div>
  );
}
