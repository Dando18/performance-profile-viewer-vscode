# todo

- [x] Create unified "Profile" pane on left
- [x] Properly handle different times column names
- [x] Open file from profile treeviewer -- add button to right of line
- [x] Add "Select Profile Type" dropdown menu
- [x] Add "Open New Profile" button to top of tree view
- [x] Put tree view in editor view
- [x] Add filter search bar above tree view
- [x] Add flamegraph view
- [x] Add "Open All" button to tree view
- [ ] ~~Change to vscode webview ui toolkit for webview styling~~ (tricky to get dependency working and native css wasn't that difficult)
- [x] Review and improve error handling
- [x] Load cprofile profile: add and test
- [x] Load gprof profile: add and test
- [x] Load scorep profile: add and test
- [x] Load tau profile: add and test
- [x] Load timemory profile: add and test
- [x] Create tests
- [x] Create testing CI
- [x] Publish
- [x] Create publishing CI
- [ ] Add command/task to profile executable with GProf and open in profile viewers
- [ ] Add command/task to profile executable with CProfile and open in profile viewers
- [ ] Add command/task to profile executable with PyInstrument and open in profile viewers
- [ ] Add command/task to profile executable with Caliper and open in profile viewers
- [ ] Add command/task to profile executable with Tau and open in profile viewers
- [ ] Add command/task to profile executable with HPCToolkit and open in profile viewers
- [ ] Add command/task to profile executable with Score-P and open in profile viewers
- [ ] Add command/task to profile executable with Timemory and open in profile viewers
- [ ] Add visualization for CPU/Mem usage
- [ ] Add visualization for flat profiles
- [ ] Add visualization for traces (with pipit?)
- [ ] Replace hatchet for some readers that are already natively JSON (i.e. PyInstrument)
- [ ] Create separate command for opening tree view


# Roadmap

- 0.1.0: Clean up existing features/views
  - consolidate commands for opening views
  - add settings for things
  - see if data can be persisted between editors
  - better solution for finding/caching path to python with hatchet installed
- 0.2.0: Add commands/tasks for launching different profilers
- 0.3.0: Add TS readers for things that can be trivially read without hatchet
- 0.4.0: Add flat profile viewers (and CPU/mem usage)
- 0.5.0: add trace viewer