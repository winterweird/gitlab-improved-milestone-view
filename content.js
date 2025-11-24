(() => {
  // polyfill
  if (chrome !== undefined) {
    window.browser = chrome;
  }
  const issueBoard = document.querySelector("#tab-issues");

  if (!issueBoard) {
    console.error("Issue board element not found.");
    return;
  }

  const project = document
    .querySelector("[data-project-id]")
    .getAttribute("data-project-id");

  const getIssueNode = (iid) => {
    return issueBoard.querySelector(
      `ul.milestone-work_items-list > li
      a[href="https://gitlab.com/upstacked/upstacked/-/issues/${iid}"]`,
    )?.parentElement?.parentElement;
  };

  const getTaskNode = (iid) => {
    return issueBoard.querySelector(
      `ul.milestone-work_items-list > li
      a[href="https://gitlab.com/upstacked/upstacked/-/work_items/${iid}"]`,
    )?.parentElement?.parentElement;
  };

  const issueType = (node) => {
    const icon = node
      .querySelector("[data-testid]")
      .getAttribute("data-testid");

    if (icon === "issue-type-task-icon") {
      return "task";
    }

    // We only deal with tasks and issues for now
    return "issue";
  };

  const issueStatus = (node) => {
    return node.querySelector(".work-item-status").textContent.trim();
  };

  const issueId = (node) => {
    // remove leading '#' from issuable-number
    return node.querySelector(".issuable-number").textContent.slice(1);
  };

  const getNodes = () => {
    return Array.from(
      issueBoard.querySelectorAll(`ul.milestone-work_items-list > li`),
    ).filter((node) => issueType(node) === "issue");
  };

  const groupSubtasksUnderIssue = (node) => {
    browser.runtime.sendMessage(
      {
        action: "fetchIssueDetails",
        issue: issueId(node),
        project,
      },
      (issue) => {
        let subtasksNode = document.createElement("ul");

        issue.child_items.forEach((childIssue) => {
          const childNode = getTaskNode(childIssue.iid);

          // Some child tasks are not part of the current milestone
          if (childNode) {
            //childNode.parentElement.removeChild(childNode);
            subtasksNode.appendChild(childNode);

            if (subtasksNode.parentElement !== node) {
              node.appendChild(subtasksNode);
            }

            // In case we set the background color of the node previously, we want
            // to undo it when it's a parent task, otherwise it looks like all the
            // subtasks are in progress
            node.style.backgroundColor = null;
          }
        });
      },
    );
  };

  // Main work

  const config = { childList: true };

  // Callback function to execute when mutations are observed
  const callback = (mutationList, observer) => {
    for (const mutation of mutationList) {
      if (mutation.type === "childList") {
        const nodes = getNodes();

        nodes.forEach((node) => {
          if (issueStatus(node) === "Done") {
            node.style.opacity = 0.5;
          } else if (issueStatus(node) === "In progress") {
            node.style.backgroundColor = "lightgreen";
          }

          if (issueType(node) === "issue") {
            groupSubtasksUnderIssue(node);
          }
        });
      }
    }
  };

  // Create an observer instance linked to the callback function
  const observer = new MutationObserver(callback);

  // Start observing the target node for configured mutations
  observer.observe(issueBoard, config);
})();
