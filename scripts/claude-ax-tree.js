// Print the Accessibility tree of the Claude desktop app, including the task sidebar.
// Usage: osascript -l JavaScript scripts/claude-ax-tree.js "$(pgrep -x Claude | head -1)" > /tmp/claude-ax-tree.txt
// The script prints roles, labels, URLs, and flags. It does not print static text values or composer values.
// Task titles can appear in labels. Remove them before you share the output if necessary.
// With --usage as the second argument, the script also prints short static texts that hold a number or a percent sign
// (for example "23% used" or "Resets in 2 hr"), and the values of progress bars. Other static texts show only their length.
ObjC.import("AppKit");
ObjC.import("ApplicationServices");
function run(argv) {
  if (!$.AXIsProcessTrusted()) return "ACCESSIBILITY_DENIED: give Accessibility access to this terminal app.";
  function attribute(element, name) {
    var output = Ref();
    if ($.AXUIElementCopyAttributeValue(element, $(name), output) !== 0) return null;
    return output[0];
  }
  function scalar(element, name) {
    var value = attribute(element, name);
    if (!value) return null;
    var object = ObjC.castRefToObject(value);
    if (object.isKindOfClass($.NSURL)) return ObjC.unwrap(object.absoluteString);
    var unwrapped = ObjC.unwrap(object);
    return typeof unwrapped === "object" ? null : unwrapped;
  }
  function children(element) {
    var value = attribute(element, "AXChildren");
    if (!value) return [];
    var array = ObjC.castRefToObject(value);
    var result = [];
    for (var index = 0; index < array.count; index++) result.push(array.objectAtIndex(index));
    return result;
  }
  var usage = argv[1] === "--usage";
  // Print a static text in usage mode only when it is short and holds a number. Show other texts as their length.
  function usageText(element) {
    var value = scalar(element, "AXValue");
    if (typeof value !== "string" || !value.trim()) return null;
    var text = value.trim();
    return text.length <= 40 && /[0-9%]/.test(text) ? JSON.stringify(text) : "<text " + text.length + ">";
  }
  var lines = [];
  var count = 0;
  function visit(element, depth) {
    if (count++ > 12000) return;
    var role = scalar(element, "AXRole");
    var parts = [role];
    ["AXSubrole", "AXTitle", "AXDescription", "AXHelp", "AXRoleDescription", "AXURL", "AXDOMIdentifier"].forEach(function(name) {
      if (role === "AXStaticText" || role === "AXTextArea" || role === "AXTextField") return;
      var value = scalar(element, name);
      if (value !== null && value !== "" && !(name === "AXRoleDescription")) parts.push(name.slice(2) + "=" + JSON.stringify(String(value).slice(0, 120)));
    });
    var classes = attribute(element, "AXDOMClassList");
    if (classes) {
      var list = ObjC.castRefToObject(classes);
      var names = [];
      for (var index = 0; index < list.count && index < 8; index++) names.push(ObjC.unwrap(list.objectAtIndex(index)));
      if (names.length) parts.push("class=" + JSON.stringify(names.join(" ").slice(0, 160)));
    }
    if (scalar(element, "AXSelected") === true) parts.push("selected");
    if (scalar(element, "AXEnabled") === false) parts.push("disabled");
    if (scalar(element, "AXBusy") === true) parts.push("busy");
    if (usage && role === "AXStaticText") { var shown = usageText(element); if (shown) parts.push("text=" + shown); }
    if (usage && (role === "AXProgressIndicator" || role === "AXLevelIndicator" || scalar(element, "AXSubrole") === "AXMeter")) {
      ["AXValue", "AXMinValue", "AXMaxValue", "AXValueDescription"].forEach(function(name) {
        var number = scalar(element, name);
        if (number !== null && number !== "") parts.push(name.slice(2) + "=" + JSON.stringify(String(number).slice(0, 40)));
      });
    }
    lines.push(new Array(depth + 1).join("  ") + parts.join(" "));
    // Do not enter text containers. They hold prompts and responses.
    if (role === "AXStaticText" || role === "AXTextArea" || role === "AXTextField") return;
    children(element).forEach(function(child) { visit(child, depth + 1); });
  }
  var root = $.AXUIElementCreateApplication(Number(argv[0]));
  var value = attribute(root, "AXWindows");
  var windows = value ? ObjC.castRefToObject(value) : { count: 0 };
  for (var index = 0; index < windows.count; index++) visit(windows.objectAtIndex(index), 0);
  return lines.join("\n");
}
