import type { EvaluatorProgress } from "@/lib/admin-progress";
import { assignmentCohortLabel } from "@/lib/study-assignments";

/**
 * Admin-only download centre for independent and combined rating datasets.
 *
 * Keeping one link per rater makes it easy to audit individual work, while the
 * combined file supports agreement and downstream analysis without manual CSV
 * merging. The API behind every link re-checks administrator authorization.
 */
export function AdminRatingExports({ evaluators }: { evaluators: EvaluatorProgress[] }) {
  const orderedEvaluators = [...evaluators].sort((left, right) => {
    const leftJoined = left.joinedAt ?? "9999";
    const rightJoined = right.joinedAt ?? "9999";
    return leftJoined.localeCompare(rightJoined) || left.email.localeCompare(right.email);
  });

  return (
    <section className="admin-export-card" id="rating-exports" aria-labelledby="rating-exports-title">
      <div className="admin-section-heading">
        <div>
          <p className="admin-eyebrow">Rating exports</p>
          <h2 id="rating-exports-title">{orderedEvaluators.length + 3} analysis files</h2>
          <p>
            Download each evaluator separately, plus one combined file with the primary,
            judge, legacy, and admin-demo review layers identified on every row.
          </p>
        </div>
        <span>{orderedEvaluators.length + 3} files</span>
      </div>

      <div className="admin-export-grid">
        {orderedEvaluators.map((evaluator, index) => (
          <article key={evaluator.raterId}>
            <span>
              {evaluator.role === "admin"
                ? "Admin demo"
                : assignmentCohortLabel(evaluator.assignmentCohort)}
            </span>
            <strong>{evaluator.displayName}</strong>
            <small>
              {evaluator.completedCount} completed · {evaluator.draftCount} drafts · {evaluator.canRate ? "rater status active" : "historical ratings"}
            </small>
            <a href={`/api/admin/exports?raterId=${encodeURIComponent(evaluator.raterId)}`}>
              Download evaluator {index + 1} CSV
            </a>
          </article>
        ))}

        <article className="combined-export">
          <span>Primary layer</span>
          <strong>Six primary raters</strong>
          <small>Only Group A, B, and C ratings; judge and admin-demo rows are excluded.</small>
          <a href="/api/admin/exports?scope=primary">Download primary CSV</a>
        </article>

        <article className="combined-export">
          <span>Judge layer</span>
          <strong>Two judge queues</strong>
          <small>
            Only Judge 1 and Judge 2 review rows: 50 random episodes each, plus
            assigned serious-mismatch cases.
          </small>
          <a href="/api/admin/exports?scope=judge">Download judge CSV</a>
        </article>

        <article className="combined-export">
          <span>All layers</span>
          <strong>All evaluation layers</strong>
          <small>
            Includes evaluator identity, current assignment, saved review layer, and
            episode assignment on every row.
          </small>
          <a href="/api/admin/exports?scope=combined">Download all-layers CSV</a>
        </article>
      </div>

      <p className="admin-export-note">
        Exports include both drafts and completed ratings. Empty rater files contain column headers only.
      </p>
    </section>
  );
}
