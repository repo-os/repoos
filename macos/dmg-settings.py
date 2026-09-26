"""Deterministic Finder layout for the RepoOS Hub distribution image.

The release workflow supplies ``defines['app']`` to point at the built app.
``dmgbuild`` writes the Finder metadata directly, so packaging never needs to
drive Finder or invoke AppleScript.
"""

application = defines["app"]

format = "UDZO"
size = "64M"
files = [(application, "RepoOS Hub.app")]
symlinks = {"Applications": "/Applications"}
background = "macos/assets/RepoOSHub-install-background.png"

window_rect = ((100, 100), (720, 440))
default_view = "icon-view"
show_toolbar = False
show_status_bar = False
show_pathbar = False
show_sidebar = False
arrange_by = None
icon_size = 96
# Finder does not persist a per-volume icon-label color. The dark installer
# artwork supplies its own white labels, so hide Finder's black labels rather
# than leaving inaccessible duplicate text over the background.
text_size = 0
label_pos = "bottom"
icon_locations = {
    "RepoOS Hub.app": (172, 245),
    "Applications": (548, 245),
}
