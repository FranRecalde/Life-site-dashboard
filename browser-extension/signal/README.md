# Signal browser extension

Load this folder as an unpacked Manifest V3 extension in Chrome or Edge.

It has only local development host permissions (`localhost:3000`). Before using a deployed Life Site origin, replace those two exact host patterns in `manifest.json` with the deployed HTTPS origin and reload the extension. Enter the API origin and the existing Reading Capture bearer token in the popup; the token is stored only in Chrome/Edge local extension storage. No OpenAI, Todoist, Google Calendar, or Obsidian credential is present in this extension.
