# Lil Guys Experiment Atlas

This folder is a source copy of the public AppDeploy exhibit for the Suno experiment archive.

Live app:
https://lil-guys-experiment-atlas-b0ilds.v2.appdeploy.ai/

The exhibit reads the repository's `main` branch live through its backend, classifies the corpus, and lets visitors browse structured Little Guy runs, engine stacks, musical fingerprints, and STYLE / LYRICS / CAPTION sections.

This copy lives on the `lil-guys-exhibit` branch so the raw experiment data on `main` can stay clean.

## AppDeploy note

The frontend uses `@appdeploy/client` and the backend uses `@appdeploy/sdk`; those modules are platform-injected by AppDeploy. This folder is the AppDeploy source snapshot / backup rather than a generic standalone Vite deployment.

AppDeploy app id: `lil-guys-experiment-atlas-b0ilds`.
