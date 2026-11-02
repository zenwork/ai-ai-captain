// Print the role path and URL of each web area that the Claude desktop app exposes.
// Usage: osascript -l JavaScript scripts/claude-ax-urls.js "$(pgrep -x Claude | head -1)"
// The script does not read message text or composer values.
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
    return ObjC.unwrap(object);
  }
  function children(element, name) {
    var value = attribute(element, name || "AXChildren");
    if (!value) return [];
    var array = ObjC.castRefToObject(value);
    var result = [];
    for (var index = 0; index < array.count; index++) result.push(array.objectAtIndex(index));
    return result;
  }
  var root = $.AXUIElementCreateApplication(Number(argv[0]));
  var lines = [];
  var windows = children(root, "AXWindows");
  lines.push("windows: " + windows.length);
  var pending = windows.map(function (window) {
    return { element: window, depth: 0 };
  });
  var count = 0;
  var roles = {};
  while (pending.length && count++ < 20000) {
    var item = pending.pop();
    var role = scalar(item.element, "AXRole");
    roles[role] = (roles[role] || 0) + 1;
    if (role === "AXStaticText" || role === "AXTextArea" || role === "AXTextField") continue;
    if (role === "AXWebArea")
      lines.push("AXWebArea depth=" + item.depth + " hidden=" + scalar(item.element, "AXHidden") + " url=" + scalar(item.element, "AXURL"));
    if (role === "AXButton") {
      var label = scalar(item.element, "AXTitle") || scalar(item.element, "AXDescription");
      if (label) lines.push("  button: " + label + " enabled=" + scalar(item.element, "AXEnabled"));
    }
    children(item.element).forEach(function (child) {
      pending.push({ element: child, depth: item.depth + 1 });
    });
  }
  lines.push("elements visited: " + count + (pending.length ? " (limit reached)" : ""));
  lines.push("roles: " + JSON.stringify(roles));
  return lines.join("\n");
}
