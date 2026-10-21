<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Financial/attendance rules live as pure functions in src/lib/financeiro/regras.ts (tested with bun test); only sessions with estado 'realizada' count for payments and attendance — keeps screens, engine and exports consistent.
- The all-trainee hours workbook uses a dedicated browser export module with paginated reads and shared pure attendance rules, to avoid truncated histories and keep actual attendance separate from payable hours.
- Historical workbook UFCD totals use horasRelatorioUfcd; explicit online attendance may precede administrative enrollment, without changing payment eligibility or withdrawal/completion cutoffs.
- Workbook day totals use shared pure rules and union attended dates at each aggregation level, never sum session counts or per-UFCD calendar-day counts.
- Session exports use the shared schema-compatibility reader: retry without the status column only when it is missing in a legacy database; preserve status filtering in updated databases and propagate other errors.
- Enrollment-date edits belong to the trainee's per-course enrollment and invalidate cached reads; never automatically backdate enrollments to course start, because actual attendance starts can differ.
