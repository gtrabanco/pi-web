---
"@jmfederico/pi-web": patch
---

Let agents stop, resume, and archive their tracked children through a single `manage_subsession` tool, and send messages to other sessions in the same project without creating a parent/child relationship. Stop interrupts the current run without preventing later messages from starting another turn. Restart the session daemon after updating to enable the new tools.
