# Changelog

## [0.3.4] - 2025-12-06

### Feat

- Add the function of partially deleting blocks, recursively deleting all contents within the selected range;
- Add a color system to tags, support custom colors and ICONS, create special tags, and improve readability;
- Optimize the display logic of tag view, select different display logics according to different modes, and increase the information density

## [0.3.3] - 2025-12-03

### Feat

- Add more optional ICONS to the tags
- Add the "ping" function to limit the number of tags displayed in the view
- Add a tooltip to the block of the tag view to display the title path

### style

- Optimize the item style of the panel;

## [0.3.2] - 2025-11-29

### Feat

- Added tag name support for Chinese and more characters
- Add a convenient deletion function for blocks in tag view, and support the deletion of single tags and combined tags.

### Refactor

- Reconstructed webview related files to improve scalability and maintainability

## [0.3.1] - 2025-11-27

### Chore

- Modify some default configuration

- Optimize the style

### Fixed

- Issues related to Tag deletion, modification, etc

## 🎉[0.3.0] - 2025-11-27

### Feat

<div align="center">
  <img src="./resources/imgs/tag_view.png" alt="cover" width="80%">
</div>
**Use Tags to organize your files and jump between different chapters or even files with a simple click!**

- Launched Tag View and Tag mechanism: allowing users to add 1 or more tags to block/subtree, and view the tag/tag combination of local/global files in the tag;
- Provide default tags and allow users to create their own tags

## [0.2.2] - 2025-11-26

### Fixed

- Fixed the problem that sometimes TOC could not be switched correctly when switching files.
- Keep the codicons module to ensure the correct display of icon

## [0.2.0] - 2025-11-26

### Feat

- Add the "range filter display" function: allow users to select specific titles, filter the subtitles they contain, and display the subtrees of the area concisely and clearly;

- Allow users to enter level through the command panel and display the range from the current cursor;

- Build a new toolbar setting panel and adjust the hover display logic. Allow users to customize the toolbar displayed by hover by dragging and dropping.

<div align="center">
  <img src="./resources/imgs/hover-setting.png" alt="cover" width="50%">
</div>

### style

- Optimize the selection of some icons

## [0.1.1] - 2025-10-29

### Feat

- Added an option to the settings page: choose whether to display four operation buttons when hovering. Avoid misoperation when the sidebar is narrow;

### Fix

- The expansion issue of the top expansion function

### Chore

- Removed the "Collapse All" button at the top

## [0.1.0] - 2025-10-8

### Feat

- Add extra imports file setting for subtree export.(Require Tinymist)
- Allow user to export subtree as PDF or PNG.
- Add a button on navBar to open the Settings UI.

## [0.0.4] - 2025-10-01

- Replace mp4 with img for the time being.

## [0.0.3] - 2025-10-01

### Fixed

- The issue of always automatically displaying plug-ins when editing
- The display issue of top hierarchy filtering

### Added

- Demo.mp4 for illustration of using cases.

## [0.0.2] - 2025-10-01

- Initial release version
- Added Markdown/Typst heading navigator with drag & drop reordering and batch level adjustments.
