import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getAdminProgress } from "@/lib/admin-progress";
import { assignmentCohortLabel } from "@/lib/study-assignments";
import { getRaterIdentity } from "@/lib/server-auth";
import { userAccessLabel } from "@/lib/user-roles";
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
  const expectedPrimaryRatings = progress.totalEpisodes * 2;
  const expectedJudgeReviews = progress.expectedRatings - expectedPrimaryRatings;
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
              <small>{admin.email} · {userAccessLabel(admin.role, admin.canRate)}</small>
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
            <small>
              {progress.completedRatings} of {progress.expectedRatings} required study reviews
              ({expectedPrimaryRatings} primary ratings + {expectedJudgeReviews} judge reviews)
            </small>
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
            <small>Allocated across paired primary and judge queues</small>
          </article>
        </section>

        <section className="admin-assignment-card" aria-labelledby="assignment-progress-title">
          <div className="admin-section-heading">
            <div>
              <p className="admin-eyebrow">Study allocation</p>
              <h2 id="assignment-progress-title">Progress by assigned team</h2>
              <p>
                Groups A–C each contain two primary raters sharing 100 episodes.
                Each judge receives a separate reproducible random sample of 50 episodes.
                Serious primary-rating mismatches outside those samples are added to one
                judge&apos;s queue.
              </p>
            </div>
            <span>8 evaluator places</span>
          </div>
          <div className="admin-assignment-grid">
            {progress.assignments.map((assignment) => (
              <article key={assignment.assignmentCohort}>
                <span>{assignment.label}</span>
                <strong>{assignment.completedCount}/{assignment.expectedCount}</strong>
                <div className="admin-progress-track" aria-hidden="true">
                  <span style={{ width: `${assignment.completionPercentage}%` }} />
                </div>
                <small>
                  {assignment.activeMembers}/{assignment.capacity} evaluator places filled ·{" "}
                  {assignment.assignedEpisodes} episodes
                </small>
              </article>
            ))}
          </div>
        </section>

        <section className="admin-coverage-card">
          <div>
            <p className="admin-eyebrow">Required review coverage</p>
            <h2>Coverage across the dataset</h2>
            <p>
              Completed ratings only. Primary-pair coverage and the separate judge
              sample plus serious-mismatch reviews are reported independently; drafts
              and admin demos are excluded.
            </p>
          </div>
          <div className="admin-coverage-stats">
            <div><strong>{progress.coverage.noPrimaryRating}</strong><span>No primary rating</span></div>
            <div>
              <strong>{progress.coverage.onePrimaryRating}</strong>
              <span>One of two primary ratings</span>
            </div>
            <div className="coverage-complete">
              <strong>{progress.coverage.primaryComplete}</strong>
              <span>Both primary ratings</span>
            </div>
            <div><strong>{progress.coverage.judgePending}</strong><span>Judge review pending</span></div>
            <div className="coverage-complete">
              <strong>{progress.coverage.judgeComplete}</strong>
              <span>Judge review complete</span>
            </div>
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
                    <th>Assignment</th>
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
                        <strong>{assignmentCohortLabel(evaluator.assignmentCohort)}</strong>
                        <small className="admin-assignment-detail">
                          {evaluator.assignedEpisodeCount} assigned episodes
                        </small>
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
          “Not started” is calculated against each evaluator’s assigned queue. Legacy
          ratings and administrator demo ratings remain exportable but are excluded from
          the {progress.expectedRatings} currently required study reviews. This total can
          increase when serious mismatch cases are added. Times are shown in UTC.
        </p>
      </main>
    </div>
  );
}
