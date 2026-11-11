import type { Metadata } from "next";
import WeightsEditor from "@/components/WeightsEditor";
import { DEFAULT_CONFIG } from "@/lib/data";
import { peerNonprofitNames } from "@/lib/keywords";

export const metadata: Metadata = { title: "Method" };

export default function MethodPage() {
  return (
    <div className="prose-page">
      <div className="page-head">
        <h1>How companies are scored</h1>
        <p className="lede">
          Every score is the result of fixed rules applied to public filings, the Peers table and the team&apos;s own
          research notes. Nothing is estimated by a model, and the same inputs always produce the same score.
        </p>
      </div>

      <section>
        <h2>Weights and tiers</h2>
        <p>
          Five factors are each scored from 0 to 100. The overall score is their weighted average. Change a weight below
          to see how the ranking moves. Changes stay in this browser until you reset them.
        </p>
        <WeightsEditor defaults={DEFAULT_CONFIG} />
      </section>

      <section>
        <h2>The five factors</h2>

        <h3>Mission alignment</h3>
        <p>Does the company already care about what Thirst Project does?</p>
        <table className="data rules">
          <tbody>
            <tr><td>Company names water as a giving or sustainability priority (research note)</td><td className="num">+40</td></tr>
            <tr><td>Stated priorities not yet reviewed, when a filing is on hand</td><td className="num">+15</td></tr>
            <tr><td>Three or more water-related grants in the latest filing</td><td className="num">+30</td></tr>
            <tr><td>One or two water-related grants</td><td className="num">+20</td></tr>
            <tr><td>Water-related grants are 5% or more of grant dollars</td><td className="num">+5</td></tr>
            <tr><td>Foundation has funded Thirst Project before</td><td className="num">+20</td></tr>
            <tr><td>10% or more of grants fund neighboring causes</td><td className="num">+10</td></tr>
            <tr><td>Each stated focus area next to Thirst Project&apos;s work, up to two</td><td className="num">+8</td></tr>
            <tr><td>Industry has a direct tie to water (beverage, water technology, outdoor)</td><td className="num">+8 to +10</td></tr>
          </tbody>
        </table>
        <p className="footnote">
          A grant counts as water-related when its recipient or purpose mentions water, sanitation, hygiene or WASH as
          whole words, or when the recipient is a known water nonprofit. River and watershed conservation counts as a
          neighboring cause instead.
        </p>

        <h3>Peer signal</h3>
        <p>Has the company funded organizations like Thirst Project?</p>
        <table className="data rules">
          <tbody>
            <tr><td>Supports one other water nonprofit</td><td className="num">55</td></tr>
            <tr><td>Supports two</td><td className="num">75</td></tr>
            <tr><td>Supports three or more</td><td className="num">90</td></tr>
            <tr><td>Those gifts total $250,000 or more</td><td className="num">+10</td></tr>
            <tr><td>Two or more other companies in the same industry sponsor water nonprofits</td><td className="num">+15</td></tr>
          </tbody>
        </table>
        <p className="footnote">
          Water nonprofits recognized automatically in filings: {peerNonprofitNames().join(", ")}. Sponsorships found
          in annual reports go in the Peers table by hand.
        </p>

        <h3>Capacity fit</h3>
        <p>Can the company give at the level Thirst Project would ask for?</p>
        <table className="data rules">
          <tbody>
            <tr><td>Annual giving of $10M or more</td><td className="num">90</td></tr>
            <tr><td>$1M to $10M</td><td className="num">70</td></tr>
            <tr><td>$100K to $1M</td><td className="num">45</td></tr>
            <tr><td>Under $100K</td><td className="num">20</td></tr>
          </tbody>
        </table>
        <p className="footnote">
          When individual grants are listed, the giving band counts for 60% and grant size for 40%. Grant size scores
          100 when half or more of the foundation&apos;s grants fall between $10,000 and $250,000, a realistic first
          ask, and scales down from there. A foundation that only writes seven-figure checks scores lower here than its
          total suggests. Without a filing, reported giving or company size is used.
        </p>

        <h3>Accessibility</h3>
        <p>How reachable is the decision maker?</p>
        <table className="data rules">
          <tbody>
            <tr><td>Open application confirmed by research</td><td className="num">+40</td></tr>
            <tr><td>The 990-PF lists how to submit a request</td><td className="num">+35</td></tr>
            <tr><td>Application process not confirmed</td><td className="num">+15</td></tr>
            <tr><td>Invitation only, or the 990-PF says preselected organizations only</td><td className="num">+5</td></tr>
            <tr><td>A warm introduction is available</td><td className="num">+30</td></tr>
            <tr><td>Officers and directors are named in the filing</td><td className="num">+20</td></tr>
            <tr><td>Based in Thirst Project&apos;s home state</td><td className="num">+10</td></tr>
            <tr><td>Company email domain is known</td><td className="num">+5</td></tr>
          </tbody>
        </table>

        <h3>Confidence</h3>
        <p>
          How much of the above rests on evidence. A company with little on file is marked provisional, so a thin
          profile never looks as settled as a researched one.
        </p>
        <table className="data rules">
          <tbody>
            <tr><td>Corporate foundation identified and its filing found</td><td className="num">+25</td></tr>
            <tr><td>Or: confirmed that no foundation exists</td><td className="num">+15</td></tr>
            <tr><td>Grant-by-grant detail available</td><td className="num">+20</td></tr>
            <tr><td>Filing is from the last three years</td><td className="num">+10</td></tr>
            <tr><td>Giving priorities reviewed by a researcher</td><td className="num">+10</td></tr>
            <tr><td>Research has a source link</td><td className="num">+10</td></tr>
            <tr><td>Checked for support of other water nonprofits</td><td className="num">+10</td></tr>
            <tr><td>Focus areas recorded</td><td className="num">+5</td></tr>
            <tr><td>Application process confirmed</td><td className="num">+5</td></tr>
            <tr><td>Annual giving total known</td><td className="num">+5</td></tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>When nothing is on file</h2>
        <p>
          A factor with no evidence is held at a neutral baseline (mission {DEFAULT_CONFIG.baseline.mission_alignment},
          peers {DEFAULT_CONFIG.baseline.peer_signal}, capacity {DEFAULT_CONFIG.baseline.capacity_fit}, accessibility{" "}
          {DEFAULT_CONFIG.baseline.accessibility}) instead of zero. An unresearched company lands in Tier C with a
          provisional mark, which reads as &ldquo;look into this&rdquo; and not as &ldquo;poor fit&rdquo;.
        </p>
      </section>

      <section>
        <h2>Sources and limits</h2>
        <ul>
          <li>
            Foundation matches and yearly totals come from ProPublica Nonprofit Explorer. Grant lists and officers come
            from the IRS e-file record of the foundation&apos;s latest return. Both are free public data.
          </li>
          <li>
            Companies that give directly, without a foundation, file no 990-PF. Their profiles depend on what a
            researcher records from the company&apos;s own reporting.
          </li>
          <li>
            Some foundations attach their grant list as a PDF. Totals are still read, but individual grants are not, and
            the profile says so.
          </li>
          <li>Filings run one to two years behind. The filing year is shown on every profile.</li>
          <li>
            Contact suggestions are roles and public officer names. LinkedIn links open a search for you. Nothing is
            scraped, and no personal emails or phone numbers are collected.
          </li>
        </ul>
      </section>
    </div>
  );
}
