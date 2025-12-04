(() => {
  // Polyfill for browser API (Chrome/Firefox)
  const browserApi =
    typeof browser !== "undefined"
      ? browser
      : typeof chrome !== "undefined"
        ? chrome
        : null;

  if (!browserApi) {
    return;
  }

  const DEFAULT_FLAGS = {
    groupChildren: true,
    highlightInProgress: true,
    highlightInReview: true,
    muteDone: true,
    separateTaskCounts: false,
  };

  const groupChildrenCheckbox = document.getElementById("flag-group-children");
  const highlightCheckbox = document.getElementById(
    "flag-highlight-in-progress",
  );
  const highlightInReviewCheckbox = document.getElementById(
    "flag-highlight-in-review",
  );
  const muteDoneCheckbox = document.getElementById("flag-mute-done");
  const separateTaskCountsCheckbox = document.getElementById(
    "flag-separate-task-counts",
  );

  const loadFlags = () => {
    // Use storage.local so flags persist reliably for unpacked/temporary installs.
    browserApi.storage.local.get(DEFAULT_FLAGS, (result) => {
      const flags = Object.assign({}, DEFAULT_FLAGS, result);
      console.log("[gitlab-milestone][popup] Loaded flags:", flags);
      groupChildrenCheckbox.checked = !!flags.groupChildren;
      highlightCheckbox.checked = !!flags.highlightInProgress;
      highlightInReviewCheckbox.checked = !!flags.highlightInReview;
      muteDoneCheckbox.checked = !!flags.muteDone;
      separateTaskCountsCheckbox.checked = !!flags.separateTaskCounts;
    });
  };

  const persistFlags = () => {
    const flags = {
      groupChildren: groupChildrenCheckbox.checked,
      highlightInProgress: highlightCheckbox.checked,
      highlightInReview: highlightInReviewCheckbox.checked,
      muteDone: muteDoneCheckbox.checked,
      separateTaskCounts: separateTaskCountsCheckbox.checked,
    };

    console.log("[gitlab-milestone][popup] Persisting flags:", flags);

    // Persist to storage.local so the popup restores the last-used values
    // even across browser restarts and temporary extension reloads.
    browserApi.storage.local.set(flags, () => {
      // Notify content scripts that flags have changed so they can re‑apply.
      if (browserApi.tabs && browserApi.tabs.query && browserApi.tabs.sendMessage) {
        browserApi.tabs.query({ url: "*://gitlab.com/*" }, (tabs) => {
          tabs.forEach((tab) => {
            if (tab.id !== undefined) {
              browserApi.tabs.sendMessage(tab.id, {
                type: "flagsUpdated",
                flags,
              });
            }
          });
        });
      }
    });
  };

  groupChildrenCheckbox.addEventListener("change", persistFlags);
  highlightCheckbox.addEventListener("change", persistFlags);
  muteDoneCheckbox.addEventListener("change", persistFlags);
  highlightInReviewCheckbox.addEventListener("change", persistFlags);
  separateTaskCountsCheckbox.addEventListener("change", persistFlags);

  loadFlags();
})();
