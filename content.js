(() => {
  // Polyfill for browser API
  if (typeof browser === "undefined" && typeof chrome !== "undefined") {
    window.browser = chrome;
  }

  if (typeof browser === "undefined") {
    console.warn("[gitlab-milestone] No browser API available, aborting content script.");
    return;
  }

  console.log("[gitlab-milestone] Content script starting.");

  const issueBoard = document.querySelector("#tab-issues");
  if (!issueBoard) {
    console.error("[gitlab-milestone] Issue board element not found.");
    return;
  }

  const project = document
    .querySelector("[data-project-id]")
    ?.getAttribute("data-project-id");

  console.log("[gitlab-milestone] Project id:", project);

  const DEFAULT_FLAGS = {
    groupChildren: true,
    highlightInProgress: true,
    highlightInReview: true,
    muteDone: true,
  };

  let currentFlags = { ...DEFAULT_FLAGS };
  let previousFlags = null;

  /**
   * Utility to create node selectors
   */
  const createWorkItemSelector = (type, iid) => {
    const base =
      type === "issue"
        ? `a[href="https://gitlab.com/upstacked/upstacked/-/issues/${iid}"]`
        : `a[href="https://gitlab.com/upstacked/upstacked/-/work_items/${iid}"]`;
    // Target the LI element containing our anchor
    return `ul.milestone-work_items-list > li ${base}`;
  };

  const getWorkItemNode = (type, iid) => {
    // Locate LI > A, return back to the LI
    const anchor = issueBoard.querySelector(createWorkItemSelector(type, iid));
    return anchor?.closest("li");
  };

  const getIssueNode = (iid) => getWorkItemNode("issue", iid);
  const getTaskNode = (iid) => getWorkItemNode("task", iid);

  /**
   * Locate the <span> containers that display issue/weight counts for a column.
   */
  const getColumnHeaderStatNodes = (listElement) => {
    const card = listElement.closest(".gl-card");
    if (!card) {
      return { issueSpan: null, weightSpan: null };
    }
    const header = card.querySelector(".gl-card-header");
    if (!header) {
      return { issueSpan: null, weightSpan: null };
    }
    const issueIcon = header.querySelector('[data-testid="work-item-issue-icon"]');
    const weightIcon = header.querySelector('[data-testid="weight-icon"]');
    const issueSpan = issueIcon ? issueIcon.closest("span") || issueIcon.parentElement : null;
    const weightSpan = weightIcon ? weightIcon.closest("span") || weightIcon.parentElement : null;
    return { issueSpan, weightSpan };
  };

  /**
   * Ensure we have a text node next to the icon so we can update the numeric value.
   */
  const ensureStatTextNode = (container) => {
    if (!container) return null;
    const existing = Array.from(container.childNodes).find(
      (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim().length,
    );
    if (existing) return existing;
    const textNode = document.createTextNode("");
    container.appendChild(textNode);
    return textNode;
  };

  const setStatValue = (container, value) => {
    if (!container) return;
    const textNode = ensureStatTextNode(container);
    if (textNode) {
      textNode.textContent = ` ${value}`;
    }
  };

  /**
   * Ensure the column header has a weight <span> (with icon) and return it.
   * We create it lazily by cloning an existing weight header span elsewhere
   * on the page so we match GitLab's native markup.
   */
  const ensureWeightHeaderSpanForList = (listElement) => {
    const { issueSpan, weightSpan } = getColumnHeaderStatNodes(listElement);
    if (weightSpan) return weightSpan;

    const card = listElement.closest(".gl-card");
    if (!card) return null;

    // Find the container that already holds the issue-count span.
    const statsContainer = issueSpan ? issueSpan.parentElement : card.querySelector(
      ".gl-ml-3.gl-shrink-0.gl-font-bold.gl-whitespace-nowrap.gl-text-subtle",
    );
    if (!statsContainer) return null;

    // Use any existing weight header span on the page as a template.
    const templateWeightIcon = document.querySelector('[data-testid="weight-icon"]');
    const templateWeightSpan = templateWeightIcon
      ? templateWeightIcon.closest("span") || templateWeightIcon.parentElement
      : null;
    if (!templateWeightSpan) return null;

    const newSpan = templateWeightSpan.cloneNode(true);
    console.log("NEW SPAN:", newSpan.innerText);
    setStatValue(newSpan, 0);
    console.log("NEW SPAN AFTER SETTING VALUE:", newSpan.innerText);
    statsContainer.appendChild(newSpan);
    return newSpan;
  };

  /**
   * Find the weight container that belongs to THIS work item node, not any
   * nested child task. We do this by ensuring the closest <li> for the
   * candidate element is exactly the node we were given.
   */
  const findOwnWeightContainer = (node) => {
    if (!node) return null;

    const candidates = node.querySelectorAll(
      ".weight, .issuable-weight, [data-testid=\"weight-icon\"]",
    );

    for (const el of candidates) {
      const ownerLi = el.closest("li");
      if (ownerLi !== node) {
        continue;
      }

      // If the match is the weight icon itself, return its enclosing span;
      // otherwise the element itself is already the container.
      if (el.getAttribute("data-testid") === "weight-icon") {
        return el.closest("span") || el.parentElement;
      }
      return el;
    }

    return null;
  };

  /**
   * Extract the weight number rendered for a work item node. This only counts
   * weight actually applied to the node itself (issue or task), not any of
   * its nested child tasks.
   */
  const getWorkItemWeight = (node) => {
    if (!node) return 0;
    const weightContainer = findOwnWeightContainer(node);
    if (!weightContainer) return 0;
    const weightText = weightContainer.textContent || "";
    const match = weightText.replace(/\u00a0/g, " ").match(/-?\d+/);
    return match ? parseInt(match[0], 10) : 0;
  };

  /**
   * Count top-level work items within each column and update header stats accordingly.
   */
  const updateColumnStatistics = () => {
    const columnLists = issueBoard.querySelectorAll("ul.milestone-work_items-list");
    columnLists.forEach((list) => {
      // Count all work items that belong to this column, including tasks that
      // are visually grouped under a parent issue inside nested <ul> elements.
      const workItems = Array.from(list.querySelectorAll("li")).filter((child) =>
        child.querySelector(".issuable-number"),
      );
      const issueCount = workItems.length;
      const weightTotal = workItems.reduce((sum, item) => sum + getWorkItemWeight(item), 0);
      const { issueSpan } = getColumnHeaderStatNodes(list);
      let { weightSpan } = getColumnHeaderStatNodes(list);

      // Lazily create the weight header span (with icon) if we need to show
      // a non-zero total but the column has never displayed weight before.
      if (weightTotal > 0 && !weightSpan) {
        weightSpan = ensureWeightHeaderSpanForList(list);
      }

      setStatValue(issueSpan, issueCount);
      if (weightSpan) {
        setStatValue(weightSpan, weightTotal);
      }
    });
  };

  /**
   * Get the type of work item node.
   * Returns 'issue' or 'task'.
   */
  const issueType = (node) => {
    const icon = node.querySelector("[data-testid]")?.getAttribute("data-testid");
    return icon === "issue-type-task-icon" ? "task" : "issue";
  };

  /**
   * Get the status of the issue from DOM node.
   */
  const issueStatus = (node) => {
    const status = node.querySelector(".work-item-status");
    return status ? status.textContent.trim() : "";
  };

  /**
   * Determine whether an issue/work item is in "In-review" stage based on its labels.
   *
   * We look for the scoped label link that GitLab renders for the
   * "stage::In-review" label. The sample markup looks like:
   *
   * <a class="gl-link gl-label-link has-tooltip"
   *    href="/.../issues?label_name=stage%3A%3AIn-review&amp;...">
   */
  const issueIsInReview = (node) => {
    return !!node.querySelector(
      'a.gl-label-link[href*="label_name=stage%3A%3AIn-review"]',
    );
  };

  /**
   * Extract numeric issue/task ID from the node.
   */
  const issueId = (node) => {
    const num = node.querySelector(".issuable-number");
    return num ? num.textContent.slice(1) : "";
  };

  /**
   * Get all issue/task nodes in the board.
   *
   * Note: We intentionally do NOT restrict to direct children of
   * `ul.milestone-work_items-list` here. When tasks are grouped under their
   * parent issues, they are moved into nested <ul> elements. Using a direct
   * child selector (`> li`) would exclude those grouped tasks, which then
   * prevents `resetStylesAndGrouping` from ever seeing them to restore them
   * to their original columns.
   */
  const getAllWorkItemNodes = () => {
    return Array.from(
      issueBoard.querySelectorAll(`ul.milestone-work_items-list li`),
    );
  };

  /**
   * Get all "issue" nodes in the board.
   */
  const getIssueNodes = () => {
    const issues = getAllWorkItemNodes().filter((node) => issueType(node) === "issue");
    return issues;
  };

  /**
   * Reset styling and restore any grouped tasks back to their original columns.
   *
   * We rely on a custom property (`__originalParent`) that is set on child task
   * nodes the first time they are grouped under a parent issue. This lets us
   * move them back to the correct column instead of assuming they belong in
   * the same column as the parent.
   */
  const resetStylesAndGrouping = () => {
    console.log("[gitlab-milestone] resetStylesAndGrouping: start");
    const nodes = getAllWorkItemNodes();
    nodes.forEach((node) => {
      // Clear styles applied by this script
      node.style.opacity = "";
      node.style.backgroundColor = "";

      // If this node was previously moved under a parent issue, restore it
      // to its original column/list. These are always *task* nodes.
      if (node.__originalParent && node.parentElement !== node.__originalParent) {
        console.log(
          "[gitlab-milestone] Restoring task to original parent",
          issueId(node),
        );
        node.__originalParent.appendChild(node);
        // Once restored, we can drop the original parent reference.
        delete node.__originalParent;
      }

      // Clear grouping state on parent issues so they can be regrouped
      // cleanly the next time grouping is enabled.
      if (issueType(node) === "issue") {
        if (node.__childrenGrouped || node.__groupingInProgress) {
          console.log(
            "[gitlab-milestone] Clearing grouping state on issue",
            issueId(node),
          );
        }
        delete node.__childrenGrouped;
        delete node.__groupingInProgress;
      }
    });

    // Clean up any empty <ul> elements we created for grouping.
    issueBoard
      .querySelectorAll("ul")
      .forEach((ul) => {
        if (
          !ul.classList.contains("milestone-work_items-list") &&
          ul.children.length === 0
        ) {
          console.log("[gitlab-milestone] Removing empty grouping <ul>");
          ul.remove();
        }
      });

    console.log("[gitlab-milestone] resetStylesAndGrouping: end");
    updateColumnStatistics();
  };

  /**
   * Group subtasks (tasks) visually under its parent issue.
   */
  const groupSubtasksUnderIssue = (node) => {
    if (!currentFlags.groupChildren) {
      console.log(
        "[gitlab-milestone] Skipping grouping for issue (flag off)",
        issueId(node),
      );
      return;
    }

    // Avoid repeatedly fetching child items for the same issue while the
    // observer is firing (e.g. due to our own DOM changes).
    if (node.__childrenGrouped || node.__groupingInProgress) {
      console.log(
        "[gitlab-milestone] Skipping grouping for issue (already grouped/in progress)",
        issueId(node),
        { grouped: !!node.__childrenGrouped, inProgress: !!node.__groupingInProgress },
      );
      return;
    }

    console.log("[gitlab-milestone] Grouping children for issue", issueId(node));
    node.__groupingInProgress = true;

    browser.runtime.sendMessage(
      {
        action: "fetchIssueDetails",
        issue: issueId(node),
        project,
      },
      (issue) => {
        let groupingSucceeded = false;
        try {
          if (!issue || !Array.isArray(issue.child_items)) {
            console.warn(
              "[gitlab-milestone] No child_items for issue response",
              issue && issue.iid,
            );
            return;
          }
          console.log(
            "[gitlab-milestone] Received child_items for issue",
            issue.iid,
            "count:",
            issue.child_items.length,
          );
          let subtasksNode = document.createElement("ul");

          issue.child_items.forEach((childIssue) => {
            const childNode = getTaskNode(childIssue.iid);

            // Only group tasks that are visible in this milestone
            if (childNode) {
              // Remember this task's original column/list so that we can
              // restore it later when flags change.
              if (!childNode.__originalParent) {
                console.log(
                  "[gitlab-milestone] Storing original parent for task",
                  childIssue.iid,
                );
                childNode.__originalParent = childNode.parentElement;
              }

              subtasksNode.appendChild(childNode);
              if (subtasksNode.parentElement !== node) {
                node.appendChild(subtasksNode);
              }
              // Remove any previous highlight from the parent node
              node.style.backgroundColor = "";
              groupingSucceeded = true;
            }
            else {
              console.log(
                "[gitlab-milestone] Child task not present in this milestone, skipping",
                childIssue.iid,
              );
            }
          });
        } finally {
          // Only mark this issue as grouped if we actually succeeded in moving
          // at least one child task. This prevents a transient API error or
          // invalid response from permanently disabling regrouping attempts.
          if (groupingSucceeded) {
            node.__childrenGrouped = true;
          }
          node.__groupingInProgress = false;
          console.log(
            "[gitlab-milestone] Finished grouping children for issue",
            issueId(node),
            { grouped: !!node.__childrenGrouped },
          );
        }
      },
    );
  };

  /**
   * Apply visual styles and optional grouping to all issues.
   */
  const processAllIssues = () => {
    console.log("[gitlab-milestone] processAllIssues: start, flags:", currentFlags);
    const nodes = getIssueNodes();

    nodes.forEach((node) => {
      const status = issueStatus(node);
      const id = issueId(node);
      const isIssueNode = issueType(node) === "issue";
      console.log("[gitlab-milestone] Processing issue", id, "status:", status);

      // Style: mute done
      if (currentFlags.muteDone && status === "Done") {
        node.style.opacity = 0.5;
      } else {
        node.style.opacity = "";
      }

      // Determine whether this item is a parent with grouped children.
      // For such parent issues, we avoid applying any background highlight
      // so that children do not visually appear to share the same state.
      const hasGroupedChildren = isIssueNode && !!node.querySelector("ul li");

      // Style: highlight "In review" or "In progress"
      const shouldHighlightInReview =
        currentFlags.highlightInReview && issueIsInReview(node);
      const shouldHighlightInProgress =
        currentFlags.highlightInProgress && status === "In progress";

      if (!hasGroupedChildren) {
        // If both conditions apply, "In review" takes precedence.
        if (shouldHighlightInReview) {
          node.style.backgroundColor = "rgba(88, 67, 173, 0.16)";
        } else if (shouldHighlightInProgress) {
          node.style.backgroundColor = "lightgreen";
        } else {
          node.style.backgroundColor = "";
        }
      } else {
        node.style.backgroundColor = "";
      }

      // Group subtasks under issues
      if (currentFlags.groupChildren && isIssueNode) {
        groupSubtasksUnderIssue(node);
      }
    });
    console.log("[gitlab-milestone] processAllIssues: end");
    updateColumnStatistics();
  };

  /**
   * MutationObserver callback to process current issues/tasks list.
   */
  const handleMutations = (mutationList) => {
    console.log(
      "[gitlab-milestone] handleMutations: received mutations",
      mutationList.length,
    );
    for (const mutation of mutationList) {
      if (mutation.type !== "childList") continue;
      console.log(
        "[gitlab-milestone] childList mutation: added:",
        mutation.addedNodes.length,
        "removed:",
        mutation.removedNodes.length,
      );
      processAllIssues();
    }
  };

  /**
   * Load current flags from storage and then process all issues.
   */
  const loadFlagsAndProcess = () => {
    console.log("[gitlab-milestone] Loading flags from storage…");
    browser.storage.local.get(DEFAULT_FLAGS, (result) => {
      const loadedFlags = Object.assign({}, DEFAULT_FLAGS, result);
      currentFlags = loadedFlags;
      previousFlags = loadedFlags;
      console.log("[gitlab-milestone] Flags loaded:", currentFlags);
      resetStylesAndGrouping();
      processAllIssues();
    });
  };

  // Observe children of the issueBoard for DOM changes
  const observerConfig = { childList: true, subtree: true };
  const observer = new MutationObserver(handleMutations);
  observer.observe(issueBoard, observerConfig);
  console.log("[gitlab-milestone] MutationObserver attached with config:", observerConfig);

  // Listen for messages from popup to immediately re-apply flags
  browser.runtime.onMessage.addListener((message) => {
    if (message && message.type === "flagsUpdated" && message.flags) {
      console.log("[gitlab-milestone] Received flagsUpdated message:", message.flags);
      const oldFlags = currentFlags;
      const newFlags = Object.assign({}, DEFAULT_FLAGS, message.flags);
      currentFlags = newFlags;

      const groupChildrenChanged =
        !oldFlags || oldFlags.groupChildren !== newFlags.groupChildren;

      if (groupChildrenChanged) {
        if (oldFlags && oldFlags.groupChildren && !newFlags.groupChildren) {
          // Grouping turned OFF: fully ungroup tasks and clear grouping state,
          // then restyle the now-flat list.
          console.log(
            "[gitlab-milestone] flags change: groupChildren ON → OFF, resetting styles & grouping",
          );
          resetStylesAndGrouping();
          processAllIssues();
        } else if (oldFlags && !oldFlags.groupChildren && newFlags.groupChildren) {
          // Grouping turned ON: we don't need to ungroup (nothing should be
          // grouped), just process issues so grouping is applied once according
          // to the new flags.
          console.log(
            "[gitlab-milestone] flags change: groupChildren OFF → ON, processing issues",
          );
          processAllIssues();
        } else {
          // No previous flags (first message): be safe and do full reset.
          console.log(
            "[gitlab-milestone] flags change (initial), resetting styles & grouping",
          );
          resetStylesAndGrouping();
          processAllIssues();
        }
      } else {
        // Only style-related flags changed (highlight/mute). To avoid flashing,
        // do NOT ungroup/regroup; just recompute styles (and let existing
        // grouping remain intact).
        console.log(
          "[gitlab-milestone] flags change (styles only), reprocessing issues without reset",
        );
        processAllIssues();
      }

      previousFlags = newFlags;
    }
    else {
      console.log("[gitlab-milestone] Ignoring runtime message", message);
    }
  });

  // Initial run
  loadFlagsAndProcess();

  console.log("[gitlab-milestone] Content script initialized.");
})();
