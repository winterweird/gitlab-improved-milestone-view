const GITLAB_API = "https://gitlab.com/api/v4";
const GITLAB_GQL_API = "https://gitlab.com/api/graphql";
const ISSUE_URL = "https://gitlab.com/upstacked/upstacked/-/issues";
const TASK_URL = "https://gitlab.com/upstacked/upstacked/-/work_items";

// This query was found by checking the graphQL query the Gitlab web UI sent in
// order to list out the child items of an issue.
// We're probably fetching more than necessary...
const WORK_ITEM_TREE_QUERY = `
query workItemTreeQuery($id: WorkItemID!, $pageSize: Int = 100, $endCursor: String) {
  workItem(id: $id) {
    namespace {
      id
      fullName
      __typename
    }
    ...WorkItemHierarchy
    __typename
  }
}

fragment WorkItemHierarchy on WorkItem {
  id
  workItemType {
    id
    name
    iconName
    __typename
  }
  title
  confidential
  userPermissions {
    updateWorkItem
    adminParentLink
    setWorkItemMetadata
    __typename
  }
  widgets(onlyTypes: [HIERARCHY]) {
    ... on WorkItemWidgetHierarchy {
      type
      hasChildren
      hasParent
      depthLimitReachedByType {
        workItemType {
          id
          name
          __typename
        }
        depthLimitReached
        __typename
      }
      rolledUpCountsByType {
        countsByState {
          opened
          all
          closed
          __typename
        }
        workItemType {
          id
          name
          iconName
          __typename
        }
        __typename
      }
      parent {
        id
        __typename
      }
      children(first: $pageSize, after: $endCursor) {
        pageInfo {
          ...PageInfo
          __typename
        }
        count
        nodes {
          id
          iid
          confidential
          workItemType {
            id
            name
            iconName
            __typename
          }
          namespace {
            id
            fullPath
            name
            __typename
          }
          title
          state
          createdAt
          closedAt
          webUrl
          reference(full: true)
          widgets(
            onlyTypes: [HIERARCHY, ASSIGNEES, LABELS, LINKED_ITEMS, MILESTONE, HEALTH_STATUS, ITERATION, START_AND_DUE_DATE, STATUS, PROGRESS, WEIGHT]
          ) {
            ... on WorkItemWidgetHierarchy {
              type
              hasChildren
              rolledUpCountsByType {
                countsByState {
                  all
                  closed
                  __typename
                }
                workItemType {
                  id
                  name
                  iconName
                  __typename
                }
                __typename
              }
              __typename
            }
            ...WorkItemMetadataWidgets
            __typename
          }
          __typename
        }
        __typename
      }
      __typename
    }
    __typename
  }
  __typename
}

fragment PageInfo on PageInfo {
  hasNextPage
  hasPreviousPage
  startCursor
  endCursor
  __typename
}

fragment WorkItemMetadataWidgets on WorkItemWidget {
  type
  ... on WorkItemWidgetStartAndDueDate {
    dueDate
    startDate
    __typename
  }
  ... on WorkItemWidgetWeight {
    weight
    rolledUpWeight
    widgetDefinition {
      editable
      rollUp
      __typename
    }
    __typename
  }
  ... on WorkItemWidgetProgress {
    progress
    updatedAt
    __typename
  }
  ... on WorkItemWidgetHealthStatus {
    healthStatus
    rolledUpHealthStatus {
      count
      healthStatus
      __typename
    }
    __typename
  }
  ... on WorkItemWidgetMilestone {
    milestone {
      ...MilestoneFragment
      __typename
    }
    __typename
  }
  ... on WorkItemWidgetAssignees {
    allowsMultipleAssignees
    canInviteMembers
    assignees {
      nodes {
        ...User
        __typename
      }
      __typename
    }
    __typename
  }
  ... on WorkItemWidgetLabels {
    allowsScopedLabels
    labels {
      nodes {
        ...Label
        __typename
      }
      __typename
    }
    __typename
  }
  ... on WorkItemWidgetLinkedItems {
    blockedByCount
    blockingCount
    __typename
  }
  ... on WorkItemWidgetIteration {
    iteration {
      id
      title
      startDate
      dueDate
      webUrl
      iterationCadence {
        id
        title
        __typename
      }
      __typename
    }
    __typename
  }
  ... on WorkItemWidgetStatus {
    status {
      ...WorkItemStatusFragment
      __typename
    }
    __typename
  }
  __typename
}

fragment Label on Label {
  id
  title
  description
  color
  textColor
  __typename
}

fragment User on User {
  id
  avatarUrl
  name
  username
  webUrl
  webPath
  __typename
}

fragment MilestoneFragment on Milestone {
  expired
  id
  title
  state
  startDate
  dueDate
  webPath
  projectMilestone
  __typename
}

fragment WorkItemStatusFragment on WorkItemStatus {
  id
  category
  color
  description
  iconName
  name
  position
  __typename
}
`;

// Fetch child items of an issue as a list
const fetchChildIssues = async (issue) => {
  const childItemsResp = await fetch(GITLAB_GQL_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      operationName: "workItemTreeQuery",
      query: WORK_ITEM_TREE_QUERY,
      variables: {
        id: `gid://gitlab/WorkItem/${issue.id}`,
        endCursor: "",
        pageSize: 100,
      },
    }),
  });
  const childItemsJson = await childItemsResp.json();
  return childItemsJson.data.workItem.widgets[0].children.nodes;
};

// Fetch details of one issue, including child items
const fetchIssueDetails = async ({ project, issue }) => {
  const response = await fetch(
    `${GITLAB_API}/projects/${project}/issues/${issue}`,
  );
  const issueJson = await response.json();

  issueJson.child_items = await fetchChildIssues(issueJson);

  return issueJson;
};

// Main work

browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "fetchIssueDetails") {
    fetchIssueDetails({ project: request.project, issue: request.issue }).then(
      (issue) => {
        console.log("ISSUE:", issue);
        sendResponse(issue);
      },
    );
    return true;
  }
});
