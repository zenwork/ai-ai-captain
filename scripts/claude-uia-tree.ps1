# Print the UI Automation tree of the Claude desktop app on Windows, including the task sidebar.
# Usage (PowerShell): .\scripts\claude-uia-tree.ps1 > logs\claude-uia-tree.txt
# The script prints control types, names, automation IDs, and page URLs.
# It does not print the values of text boxes. Task titles can appear in names.
# Remove titles, message text, and personal names before you share the output.
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$process = Get-Process -Name "Claude" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $process) { Write-Output "CLAUDE_NOT_RUNNING: open the Claude desktop app, then run the script again."; exit 1 }

$root = [System.Windows.Automation.AutomationElement]::FromHandle($process.MainWindowHandle)
$walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
$skipped = @("ControlType.Text", "ControlType.Edit")
$script:count = 0

function Show-Element($element, [int]$depth) {
  if ($script:count++ -gt 8000) { return }
  $current = $element.Current
  $type = $current.ControlType.ProgrammaticName
  $parts = @($type)
  if ($skipped -notcontains $type) {
    if ($current.Name) {
      $name = [string]$current.Name
      $name = $name.Substring(0, [Math]::Min(120, $name.Length))
      $parts += "Name=" + (ConvertTo-Json -InputObject $name -Compress)
    }
    if ($current.HelpText) { $parts += "Help=" + (ConvertTo-Json -InputObject ([string]$current.HelpText) -Compress) }
  }
  if ($current.AutomationId) { $parts += "AutomationId=" + (ConvertTo-Json -InputObject ([string]$current.AutomationId) -Compress) }
  if ($current.ClassName) {
    $class = [string]$current.ClassName
    $class = $class.Substring(0, [Math]::Min(80, $class.Length))
    $parts += "Class=" + (ConvertTo-Json -InputObject $class -Compress)
  }
  if ($current.LocalizedControlType) { $parts += "Localized=" + (ConvertTo-Json -InputObject ([string]$current.LocalizedControlType) -Compress) }
  if (-not $current.IsEnabled) { $parts += "disabled" }
  if ($current.IsOffscreen) { $parts += "offscreen" }
  # Chromium web areas are Document elements. Their Value pattern holds the page URL.
  if ($type -eq "ControlType.Document") {
    $pattern = $null
    if ($element.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$pattern)) {
      $parts += "URL=" + (ConvertTo-Json -InputObject ([string]$pattern.Current.Value) -Compress)
    }
  }
  $patterns = ($element.GetSupportedPatterns() | ForEach-Object { $_.ProgrammaticName -replace "PatternIdentifiers.Pattern", "" }) -join ","
  if ($patterns) { $parts += "Patterns=" + $patterns }
  Write-Output ((" " * ($depth * 2)) + ($parts -join " "))
  if ($skipped -contains $type) { return }
  $child = $walker.GetFirstChild($element)
  while ($child -ne $null) {
    Show-Element $child ($depth + 1)
    $child = $walker.GetNextSibling($child)
  }
}

Show-Element $root 0
