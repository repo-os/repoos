/** Keep the lock screen visible after a rejected device authentication. */
export function lockOverlayShouldRemainOpen(verified: boolean): boolean {
  return !verified;
}
