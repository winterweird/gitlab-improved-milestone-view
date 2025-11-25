# Gitlab milestone support for subtasks

This extension modifies the Gitlab milestone view to group subtasks with their
respective parent tasks, if found. This makes a milestone which includes both
subtasks and parent tasks more structured and easier to understand.

In addition it highlights in-progress tasks.

**Disclaimer:** This is a [bodge](https://en.wiktionary.org/wiki/bodge#Verb)
which may not hold up against the ever-changing markup of the Gitlab UI. Expect
this to stop working at any moment. I'm not committing to bodging it again when
it breaks.

## Screenshots

**Before:**

![View without extension](resources/screenshots/before.png "View without extension")

**After:**

![View with extension](resources/screenshots/after.png "View with extension")

## Installation

### Firefox

1. Navigate to `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Select any file within the extension folder

### Chrome

1. Navigate to `chrome://extensions/`
2. Click "Load unpacked"
3. Select the extension folder
