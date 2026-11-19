/**
 * Plain-English next step for a refused or failed deploy (#1238). The server
 * returns raw git output; this names what happened and what to do next. The
 * raw output stays visible beside it, so nothing is hidden. Returns null when
 * there is no output to explain.
 */
export function deployFailureHint(output: string): string | null {
  const text = output.trim();
  if (!text) return null;
  if (/diverged|non-fast-forward|could not fast-forward/i.test(text)) {
    return "The branch and origin have different commits, so the push was refused. RepoOS never force-pushes: bring origin's newer commits into this checkout (fetch, then merge or rebase), check the result, then deploy again.";
  }
  if (/uncommitted changes/i.test(text)) {
    return "Commit or stash this checkout's changes, then deploy again.";
  }
  if (/no local branch/i.test(text)) {
    return "Fetch or create the branch in this checkout, then deploy again.";
  }
  if (
    /push to origin failed|could not read from remote|authentication failed|permission denied|could not resolve host/i.test(
      text,
    )
  ) {
    return "The push to origin did not go through. Check your network and git access to origin, then deploy again. Nothing was force-pushed.";
  }
  return "Find the cause in the git output below, fix it, then deploy again.";
}
