# UTokyo Attendance Extension Contract

## Core automatic-entry behavior

- The extension owns the complete current-month workflow. Do not ask the user to enter attendance records manually.
- When a new calendar month begins, and whenever the scheduled background check retries, inspect the current month's `勤務表`.
- Determine the complete set of confirmed workdays for the whole month from the live `勤務表` day classifications. This is a full-month operation, including future workdays; do not stop at today's date.
- Exclude Saturdays, Sundays, public holidays, and any date with a full-day paid-leave record such as `年休（日） 年次有給休暇 全日`.
- Log the exact confirmed workday dates before entering records.
- If any confirmed workday lacks either time, loop over every missing date through `就労申請`:
  - `◆自己申告記録（出勤）` (`srw_app_gi02`)
  - `◆自己申告記録（退勤）` (`srw_app_gi03`)
- Randomize each time inside the user's saved arrival/departure ranges. Never overwrite a complete existing date.
- Continue until every confirmed workday has both 出勤 and 退勤 records, then return to August/current-month `勤務表` and verify the saved values before reporting success.

## CWS safety and scheduling

- CWS is single-session and rejects simultaneous navigation. Never run the status walker, monthly-submission flow, or a second hidden CWS tab while current-month entry is active.
- Do not use browser Back or Reload on a CWS workflow page; use the site's own navigation links.
- During live verification, never click `月次申請` or its final `確定` action unless the user explicitly requests that submission.
- Do not call a repair complete based only on unit tests. Verify the actual current-month rows in live Chrome.

## Tool discovery

- Before writing scripts or installing packages for common tasks, search for an existing CLI using the `need` MCP server. Report tool usage as required.
