import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getAdminProgress } from "@/lib/admin-progress";
import { getRaterIdentity } from "@/lib/server-auth";
import { AdminParticipantManager } from "./AdminParticipantManager";
import { AdminRatingExports } from "./AdminRatingExports";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Participant administration · Najah Review Studio",
  description: "Administrator dashboard for managing access and monitoring evaluator progress.",
};

/** Formats activity timestamps consistently while keeping an explicit empty state. */
function formatTimestamp(value: string | null): string {
  if (!value) return "No activity yet";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

/** Admin-only overview of individual evaluator progress and dataset coverage. */
export default async function AdminDashboardPage() {
  const admin = await getRaterIdentity();
  if (!admin || admin.role !== "admin") redirect("/");

  const progress = await getAdminProgress();
  const overallPercentage = progress.expectedRatings
    ? Math.min(
        Math.round((progress.completedRatings / progress.expectedRatings) * 100),
        100,
      )
    : 0;

  return (
    <div className="admin-shell">
      <header className="topbar admin-topbar">
        <Link href="/" className="brand-lockup brand-link" aria-label="Najah Review Studio home">
          <div>
            <strong>Najah Review Studio</strong>
            <span>Administration workspace</span>
          </div>
        </Link>
        <div className="rater-actions">
          <div className="rater-chip">
            <span className="avatar">{admin.displayName.slice(0, 1).toUpperCase()}</span>
            <span>
              <strong>{admin.displayName}</strong>
              <small>{admin.email} · Admin</small>
            </span>
          </div>
          <Link href="/" className="admin-back-link">Back to ratings</Link>
        </div>
      </header>

      <main className="admin-main">
        <section className="admin-page-heading">
          <div>
            <p className="admin-eyebrow">Administration dashboard</p>
            <h1>Participants and evaluator progress</h1>
            <p>
              Manage who can rate or view the dataset, and monitor saved work across
              evaluator accounts. Counts update whenever this page is refreshed.
            </p>
          </div>
          <div className="admin-overall-progress">
            <span>Overall completion</span>
            <strong>{overallPercentage}%</strong>
            <div
              className="admin-progress-track"
              role="progressbar"
              aria-label="Overall evaluator completion"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={overallPercentage}
            >
              <span style={{ width: `${overallPercentage}%` }} />
            </div>
            <small>{progress.completedRatings} of {progress.expectedRatings} required independent ratings</small>
          </div>
        </section>

        <AdminParticipantManager adminEmail={admin.email} />
        <AdminRatingExports evaluators={progress.evaluators} />

        <section className="admin-summary-grid" aria-label="Evaluation summary">
          <article>
            <span>Registered evaluators</span>
            <strong>{progress.totalEvaluators}</strong>
            <small>{progress.activeEvaluators} have started</small>
          </article>
          <article>
            <span>Completed ratings</span>
            <strong>{progress.completedRatings}</strong>
            <small>Submitted across all evaluators</small>
          </article>
          <article>
            <span>Draft ratings</span>
            <strong>{progress.draftRatings}</strong>
            <small>Saved but not submitted</small>
          </article>
          <article>
            <span>Episodes in dataset</span>
            <strong>{progress.totalEpisodes}</strong>
            <small>Available to each evaluator</small>
          </article>
        </section>

        <section className="admin-coverage-card">
          <div>
            <p className="admin-eyebrow">Independent-rating coverage</p>
            <h2>Coverage across the dataset</h2>
            <p>Completed ratings only; drafts are excluded from these coverage counts.</p>
          </div>
          <div className="admin-coverage-stats">
            <div><strong>{progress.coverage.noCompletedRating}</strong><span>No completed rating</span></div>
            <div><strong>{progress.coverage.oneCompletedRating}</strong><span>One completed rating</span></div>
            <div className="coverage-complete"><strong>{progress.coverage.twoOrMoreCompletedRatings}</strong><span>Two or more ratings</span></div>
          </div>
        </section>

        <section className="admin-evaluator-card">
          <div className="admin-section-heading">
            <div>
              <p className="admin-eyebrow">Evaluator detail</p>
              <h2>Progress by evaluator</h2>
            </div>
            <span>{progress.totalEvaluators} evaluator{progress.totalEvaluators === 1 ? "" : "s"}</span>
          </div>

          {progress.evaluators.length ? (
            <div className="admin-table-scroll">
              <table className="admin-progress-table">
                <thead>
                  <tr>
                    <th>Evaluator</th>
                    <th>Completion</th>
                    <th>Completed</th>
                    <th>Drafts</th>
                    <th>Not started</th>
                    <th>Latest activity</th>
                  </tr>
                </thead>
                <tbody>
                  {progress.evaluators.map((evaluator) => (
                    <tr key={evaluator.raterId}>
                      <td>
                        <span className="admin-evaluator-identity">
                          <span className="avatar">{evaluator.displayName.slice(0, 1).toUpperCase()}</span>
                          <span>
                            <strong>{evaluator.displayName}</strong>
                            <small>{evaluator.email}</small>
                          </span>
                        </span>
                      </td>
                      <td>
                        <span className="admin-person-progress">
                          <span>
                            <span style={{ width: `${evaluator.completionPercentage}%` }} />
                          </span>
                          <strong>{evaluator.completionPercentage}%</strong>
                        </span>
                      </td>
                      <td><strong className="admin-count-complete">{evaluator.completedCount}</strong></td>
                      <td>{evaluator.draftCount}</td>
                      <td>{evaluator.notStartedCount}</td>
                      <td><time dateTime={evaluator.lastActivity ?? undefined}>{formatTimestamp(evaluator.lastActivity)}</time></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="admin-empty-state">
              <span aria-hidden="true">◎</span>
              <h3>No evaluator accounts yet</h3>
              <p>New rater accounts will appear here as soon as they register.</p>
            </div>
          )}
        </section>

        <p className="admin-data-note">
          “Not started” means the evaluator has no saved draft or completed rating for
          that episode. Times are shown in UTC.
        </p>
      </main>
    </div>
  );
}
