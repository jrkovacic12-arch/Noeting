// No cookies, localStorage, HTML interpolation, external assets or persisted secret.
const $ = (id) => document.getElementById(id);
let secret = "",
  state = null,
  mode = "note",
  removed = false,
  selected = null,
  dirty = false,
  sourceReadonly = false;
const message = (text) => {
  $("message").textContent = text;
};
async function rpc(action, input = {}) {
  const r = await fetch(`/api/sync/v2/${action}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ protocol: 2, ...input }),
    credentials: "omit",
    redirect: "error",
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.error || "Request failed.");
  if (data.outcomeId) {
    let raw = "";
    for (let part = 0; part < data.parts; part++)
      raw += (await rpc("outcome", { id: data.outcomeId, part })).text;
    return JSON.parse(raw);
  }
  return data;
}
function node(tag, text) {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  return e;
}
function button(label, action) {
  const b = node("button", label);
  b.type = "button";
  b.onclick = () => run(action);
  return b;
}
async function run(action) {
  try {
    await action();
  } catch (e) {
    message(e.message);
  }
}
function records(table) {
  return state.snapshot
    .filter((r) => r.table === table && r.value)
    .map((r) => r.value);
}
function entry(id) {
  return records("entries").find((e) => e.id === id);
}
function text(e) {
  return e.edited_text ?? e.original_text;
}
async function reload(force = false) {
  if (
    dirty &&
    !force &&
    !confirm("Reload and discard the unsaved editor text?")
  )
    return;
  state = await rpc("pc");
  dirty = false;
  $("pair").hidden = true;
  $("library").hidden = false;
  render();
}
async function edit(command, args) {
  if (dirty && command !== "text")
    throw Error("Save the open editor text before making another change.");
  await rpc("edit", { command, args, expected: state.versions });
  dirty = false;
  await reload(true);
  message("Saved on PC. Android will receive this on its next Sync now.");
}
function organization(id) {
  return records("note_organization").find((o) => o.entry_id === id);
}
function render() {
  $("status").textContent =
    `${state.status.library_id ? "Paired library" : "Not initialized — initialize from Android before relying on sync"}. ${state.conflicts.length} conflicts. PC changes are stored locally.`;
  const chosen = $("folder").value;
  $("folder").replaceChildren(
    new Option("All", "all"),
    new Option("Uncategorized", "unfiled"),
    ...records("note_folders")
      .sort(
        (a, b) =>
          String(b.pinned_at ?? "").localeCompare(String(a.pinned_at ?? "")) ||
          a.name.localeCompare(b.name),
      )
      .map((f) => new Option(`${f.pinned_at ? "★ " : ""}${f.name}`, f.id)),
  );
  $("folder").value = [...$("folder").options].some((o) => o.value === chosen)
    ? chosen
    : "all";
  $("create").textContent = mode === "note" ? "New note" : "New task";
  renderList();
  renderDetail();
  renderConflicts();
}
function renderList() {
  const q = $("search").value.toLocaleLowerCase(),
    folder = $("folder").value;
  $("list").replaceChildren();
  const matching = records("entries").filter(
    (e) =>
      e.kind === mode &&
      Boolean(e.removed_at) === removed &&
      text(e).toLocaleLowerCase().includes(q) &&
      (mode !== "note" ||
        folder === "all" ||
        (folder === "unfiled"
          ? !organization(e.id)?.folder_id
          : organization(e.id)?.folder_id === folder)),
  );
  for (const e of matching) {
    const t = records("tasks").find((t) => t.entry_id === e.id);
    const prefix = t
      ? (t.parent_task_id ? "↳ " : "") +
        (t.status === "completed" ? "☑ " : "☐ ")
      : organization(e.id)?.pinned_at
        ? "★ "
        : "";
    $("list").append(
      button(prefix + text(e).slice(0, 180), () => {
        if (dirty && !confirm("Leave unsaved text?")) return;
        selected = e.id;
        dirty = false;
        sourceReadonly = false;
        renderDetail();
      }),
    );
  }
  if (!matching.length) $("list").append(node("p", "No matching entries."));
}
function renderDetail() {
  const root = $("detail");
  root.replaceChildren();
  const e = entry(selected);
  if (!e) return root.append(node("p", "Choose an entry, or create one."));
  root.append(node("h2", e.kind === "note" ? "Note" : "Task"));
  const area = node("textarea");
  area.value = text(e);
  area.setAttribute("aria-label", "Entry text");
  area.oninput = () => {
    dirty = true;
  };
  root.append(
    area,
    button("Save text", () => edit("text", { id: e.id, text: area.value })),
  );
  if (e.removed_at) {
    area.disabled = true;
    root.append(
      button("Restore", () =>
        edit("restore", {
          entryId: e.id,
          version: e.removal_version,
          pinned: Boolean(e.removed_pinned),
          selected: Boolean(e.removed_selected),
        }),
      ),
    );
  } else {
    root.append(
      button("Remove", async () => {
        if (confirm("Move this entry to Recently deleted?"))
          await edit("remove", { id: e.id });
      }),
    );
    if (e.kind === "note") {
      const org = organization(e.id);
      const select = node("select");
      select.setAttribute("aria-label", "Note folder");
      select.append(
        new Option("Uncategorized", ""),
        ...records("note_folders").map((f) => new Option(f.name, f.id)),
      );
      select.value = org?.folder_id ?? "";
      root.append(
        select,
        button("Move note", () =>
          edit("organize", {
            ids: [e.id],
            change: { folderId: select.value || null },
          }),
        ),
        button(org?.pinned_at ? "Unpin note" : "Pin note", () =>
          edit("organize", {
            ids: [e.id],
            change: { pinned: !org?.pinned_at },
          }),
        ),
        button("New linked note", () => create("note", e.id)),
        button("New linked task", () => create("task", e.id)),
      );
    } else {
      const t = records("tasks").find((t) => t.entry_id === e.id);
      if (t) {
        root.append(
          button(t.status === "completed" ? "Reopen" : "Complete", () =>
            edit(t.status === "completed" ? "reopen" : "complete", {
              id: t.id,
            }),
          ),
        );
        if (!t.parent_task_id)
          root.append(button("New subtask", () => create("task", null, t.id)));
        if (t.parent_task_id) {
          const p = records("tasks").find((p) => p.id === t.parent_task_id);
          root.append(
            node(
              "p",
              `Parent: ${p ? text(entry(p.entry_id)) : "unavailable"}${p && entry(p.entry_id)?.removed_at ? " (removed)" : ""}`,
            ),
          );
        }
      }
    }
  }
  const original = node("details");
  original.append(
    node("summary", "Original capture"),
    node("pre", e.original_text),
  );
  root.append(original);
  for (const table of ["entry_sources", "task_sources", "thinking_links"])
    for (const source of records(table).filter((s) => s.entry_id === e.id)) {
      const d = node("details");
      d.append(
        node("summary", "Source relationship"),
        node(
          "pre",
          source.source_text ??
            entry(source.source_entry_id)?.original_text ??
            "Source unavailable",
        ),
        button("View source", () => {
          if (dirty && !confirm("Leave unsaved text?")) return;
          selected = source.source_entry_id;
          dirty = false;
          sourceReadonly = e.kind === "task";
          renderDetail();
        }),
      );
      root.append(d);
    }
  const children = records("tasks").filter(
    (t) =>
      t.parent_task_id ===
      records("tasks").find((t) => t.entry_id === e.id)?.id,
  );
  for (const c of children)
    root.append(
      button(
        `Subtask: ${text(entry(c.entry_id))}${entry(c.entry_id)?.removed_at ? " (removed)" : ""}`,
        () => {
          if (dirty && !confirm("Leave unsaved text?")) return;
          selected = c.entry_id;
          dirty = false;
          renderDetail();
        },
      ),
    );
  if (sourceReadonly) {
    area.disabled = true;
    root.querySelectorAll("button").forEach((b) => {
      b.disabled = true;
    });
    root.append(
      node(
        "p",
        "Read-only source from a Task. Choose the Note from the Notes list to edit it.",
      ),
    );
  }
}
async function create(kind, sourceEntryId = null, parentTaskId = null) {
  if (dirty && !confirm("Leave unsaved text?")) return;
  const value = prompt(kind === "note" ? "New note" : "New task");
  if (!value?.trim()) return;
  const args = { requestId: crypto.randomUUID(), kind, text: value };
  if (sourceEntryId) args.sourceEntryId = sourceEntryId;
  if (parentTaskId) args.parentTaskId = parentTaskId;
  await edit(
    parentTaskId ? "child" : sourceEntryId ? "linked" : "capture",
    args,
  );
}
function renderConflicts() {
  const root = $("conflicts");
  root.replaceChildren();
  for (const c of state.conflicts) {
    const article = node("article");
    article.append(
      node("h3", c.reason),
      node("h4", "Android submitted transaction"),
      node("pre", JSON.stringify(c.operation.changes, null, 2)),
      node("h4", "PC version at conflict"),
      node("pre", JSON.stringify(c.current, null, 2)),
    );
    for (const choice of ["android", "pc"]) {
      const choiceButton = button(
        `Keep ${choice === "android" ? "Android" : "PC"} version`,
        async () => {
          if (dirty)
            throw Error("Save or reload the open editor before resolving.");
          const result = await rpc("pc-resolve", {
            id: c.operation.id,
            choice,
          });
          if (result.conflict)
            throw Error("Records changed again. Reload conflicts and compare.");
          await reload(true);
        },
      );
      choiceButton.disabled =
        choice === "pc" &&
        c.current.some((r) => r.value === null && r.table !== "note_folders");
      article.append(choiceButton);
    }
    root.append(article);
  }
  if (!state.conflicts.length)
    root.append(node("p", "No unresolved conflicts."));
}
$("pair").onsubmit = (e) => {
  e.preventDefault();
  secret = $("secret").value;
  $("secret").value = "";
  run(() => reload(true));
};
$("disconnect").onclick = () => {
  if (dirty && !confirm("Disconnect and discard unsaved editor text?")) return;
  secret = "";
  state = null;
  dirty = false;
  $("library").hidden = true;
  $("pair").hidden = false;
  message("Disconnected. Local data remains on this PC.");
};
$("notes").onclick = () => {
  mode = "note";
  removed = false;
  renderList();
  $("create").textContent = "New note";
};
$("tasks").onclick = () => {
  mode = "task";
  removed = false;
  renderList();
  $("create").textContent = "New task";
};
$("removed").onclick = () => {
  removed = !removed;
  renderList();
};
$("search").oninput = renderList;
$("folder").onchange = renderList;
$("reload").onclick = () => run(() => reload());
$("create").onclick = () => run(() => create(mode));
$("new-folder").onclick = () =>
  run(async () => {
    const name = prompt("Folder name");
    if (name) await edit("folder", { id: crypto.randomUUID(), name });
  });
$("rename-folder").onclick = () =>
  run(async () => {
    const id = $("folder").value;
    if (["all", "unfiled"].includes(id)) throw Error("Choose a custom folder.");
    const name = prompt("New folder name");
    if (name) await edit("rename", { id, name });
  });
$("delete-folder").onclick = () =>
  run(async () => {
    const id = $("folder").value;
    if (["all", "unfiled"].includes(id)) throw Error("Choose a custom folder.");
    if (confirm("Delete this folder and move its Notes to Uncategorized?"))
      await edit("deleteFolder", { id });
  });
$("pin-folder").onclick = () =>
  run(async () => {
    const f = records("note_folders").find((f) => f.id === $("folder").value);
    if (!f) throw Error("Choose a custom folder.");
    await edit("pinFolders", { ids: [f.id], pinned: !f.pinned_at });
  });
$("revoke").onclick = () =>
  run(async () => {
    await rpc("revoke");
    message("Phone access revoked. Changes remain on both devices.");
  });
$("allow").onclick = () =>
  run(async () => {
    await rpc("allow");
    message("The previously paired phone may authenticate again.");
  });
window.addEventListener("beforeunload", (event) => {
  if (dirty) {
    event.preventDefault();
    event.returnValue = "";
  }
});
