# Branch protection

[`protect-main.json`](protect-main.json) defines protection for the default branch. A repository administrator must apply it through GitHub; storing this file does not activate the rules.

The rules require a pull request, another reviewer's approval after the latest push, resolved conversations and passing `validate`, `Frontend build and test` and `Backend test` checks. Direct pushes, force pushes and branch deletion are blocked, with no administrator bypass. The configuration does not require branches to be up to date before merging.

## Apply or update

Run from the repository root with an authenticated GitHub CLI.

Create the ruleset:

```sh
gh api repos/oskarlarsen/tdt4290-group7/rulesets --method POST --input .github/rulesets/protect-main.json
```

To update it, list existing rulesets, then replace `RULESET_ID` in the update command with the matching ID:

```sh
gh api repos/oskarlarsen/tdt4290-group7/rulesets
gh api repos/oskarlarsen/tdt4290-group7/rulesets/RULESET_ID --method PUT --input .github/rulesets/protect-main.json
```

When CI job names change, update `required_status_checks` in the JSON and reapply the ruleset.
