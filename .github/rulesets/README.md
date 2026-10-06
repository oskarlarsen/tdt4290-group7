# Branch rulesets

`protect-main.json` is the definition of the ruleset that protects `main`. GitHub does not read
this file automatically; it has to be applied once (and re-applied after edits) by a repo admin:

```sh
# first time
gh api repos/oskarlarsen/tdt4290-group7/rulesets --method POST --input .github/rulesets/protect-main.json

# update an existing ruleset (find the id with: gh api repos/oskarlarsen/tdt4290-group7/rulesets)
gh api repos/oskarlarsen/tdt4290-group7/rulesets/<id> --method PUT --input .github/rulesets/protect-main.json
```

What it enforces on `main`:

- Changes only via pull request; no direct pushes, force pushes or branch deletion.
- At least 1 approving review. GitHub never counts the PR author's own approval, so another
  team member must review.
- Approval must come after the last push (`require_last_push_approval`), and new commits dismiss
  earlier approvals.
- All review conversations resolved before merge.
- The `validate` check (Gradle wrapper validation) must pass on an up-to-date branch.
- No bypass actors, so admins follow the same rules.

When adding a new required CI job, add its job name to `required_status_checks` in the JSON.
