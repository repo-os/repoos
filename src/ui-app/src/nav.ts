/** Navigation model shared by the sidebar and mobile tab bar. */

export interface NavItem {
  id: string;
  path: string;
  label: string;
  icon: string;
}

export const RELEASE_NAV: NavItem = {
  id: "releases",
  path: "/releases",
  label: "Releases",
  icon: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3v12m0 0l-4-4m4 4l4-4M5 18h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="18" cy="6" r="2" stroke="currentColor" stroke-width="1.8"/></svg>',
};

export const NAV: NavItem[] = [
  {
    id: "dashboard",
    path: "/",
    label: "Control",
    icon: '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="9" rx="1.5" stroke="currentColor" stroke-width="1.8"/><rect x="14" y="3" width="7" height="5" rx="1.5" stroke="currentColor" stroke-width="1.8"/><rect x="14" y="12" width="7" height="9" rx="1.5" stroke="currentColor" stroke-width="1.8"/><rect x="3" y="16" width="7" height="5" rx="1.5" stroke="currentColor" stroke-width="1.8"/></svg>',
  },
  {
    id: "inputs",
    path: "/inputs",
    label: "Inputs",
    icon: '<svg viewBox="0 0 24 24" fill="none"><path d="M5 5h14v14H5z" stroke="currentColor" stroke-width="1.8"/><path d="M8 9h8M8 13h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  },
  {
    id: "work",
    path: "/work",
    label: "Work",
    icon: '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="4" height="16" rx="1" stroke="currentColor" stroke-width="1.8"/><rect x="10" y="4" width="4" height="11" rx="1" stroke="currentColor" stroke-width="1.8"/><rect x="17" y="4" width="4" height="7" rx="1" stroke="currentColor" stroke-width="1.8"/></svg>',
  },
  {
    id: "agents",
    path: "/agents",
    label: "Agents",
    icon: '<svg viewBox="0 0 24 24" fill="none"><rect x="4" y="8" width="16" height="12" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M12 8V4M9.5 4h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="9" cy="13" r="1" fill="currentColor"/><circle cx="15" cy="13" r="1" fill="currentColor"/><path d="M9 17h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  },
  {
    id: "repo",
    path: "/repo",
    label: "Context",
    icon: '<svg viewBox="0 0 24 24" fill="none"><path d="M6 3v12a3 3 0 003 3h6M6 3a2 2 0 100 4 2 2 0 000-4zM18 18a2 2 0 100-4 2 2 0 000 4z" stroke="currentColor" stroke-width="1.8"/></svg>',
  },
  {
    id: "settings",
    path: "/settings",
    label: "Settings",
    icon: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="currentColor" stroke-width="1.8"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 008.4 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.12 15a1.65 1.65 0 00-1.51-1H2.5a2 2 0 010-4h.09A1.65 1.65 0 004.6 8.4a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 008.6 4.12a1.65 1.65 0 001-1.51V2.5a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21.5a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" stroke-width="1.8"/></svg>',
  },
];

export function navFor(releasesEnabled: boolean): NavItem[] {
  return releasesEnabled ? [...NAV.slice(0, 3), RELEASE_NAV, ...NAV.slice(3)] : NAV;
}
