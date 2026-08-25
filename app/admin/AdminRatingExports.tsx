import type { EvaluatorProgress } from "@/lib/admin-progress";

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
          <h2 id="rating-exports-title">
            {orderedEvaluators.length === 3 ? "Four analysis files" : "Rater and combined files"}
          </h2>
          <p>Download each rater separately, plus one combined file for agreement and analysis.</p>
        </div>
        <span>{orderedEvaluators.length + 1} file{orderedEvaluators.length === 0 ? "" : "s"}</span>
      </div>

      <div className="admin-export-grid">
        {orderedEvaluators.map((evaluator, index) => (
          <article key={evaluator.raterId}>
            <span>Rater {index + 1}</span>
            <strong>{evaluator.displayName}</strong>
            <small>{evaluator.completedCount} completed · {evaluator.draftCount} drafts</small>
            <a href={`/api/admin/exports?raterId=${encodeURIComponent(evaluator.raterId)}`}>
              Download rater {index + 1} CSV
            </a>
          </article>
        ))}

        <article className="combined-export">
          <span>Combined</span>
          <strong>All raters</strong>
          <small>Includes a rater ID, name, and email on every saved rating row.</small>
          <a href="/api/admin/exports?scope=combined">Download combined CSV</a>
        </article>
      </div>

      <p className="admin-export-note">
        Exports include both drafts and completed ratings. Empty rater files contain column headers only.
      </p>
    </section>
  );
}
