vigil/
│
├── src/
│   ├── core/
│   │   ├── agent.ts
│   │   ├── decisionEngine.ts
│   │   ├── actionEngine.ts
│   │   └── scheduler.ts
│   │
│   ├── memory/
│   │   ├── logs/
│   │   │   └── 2026-04-25.log
│   │   │
│   │   ├── index/
│   │   │   ├── vectorStore.ts
│   │   │   └── metadataStore.ts
│   │   │
│   │   ├── summaries/
│   │   │   └── daily/
│   │   │       └── 2026-04-25.md
│   │   │
│   │   └── memoryManager.ts
│   │
│   ├── observation/
│   │   ├── eventBus.ts
│   │   ├── fileWatcher.ts
│   │   └── observers/
│   │       ├── codeObserver.ts
│   │       ├── terminalObserver.ts
│   │       └── apiObserver.ts
│   │
│   ├── recall/
│   │   ├── retriever.ts
│   │   ├── ranking.ts
│   │   └── contextBuilder.ts
│   │
│   ├── sleep/
│   │   ├── consolidator.ts
│   │   ├── summarizer.ts
│   │   └── pruning.ts
│   │
│   ├── actions/
│   │   ├── baseAction.ts
│   │   ├── codeActions.ts
│   │   ├── notificationActions.ts
│   │   └── systemActions.ts
│   │
│   ├── policies/
│   │   ├── permissions.ts
│   │   ├── guardrails.ts
│   │   └── approvalFlow.ts
│   │
│   ├── config/
│   │   ├── settings.ts
│   │   └── featureFlags.ts
│   │
│   ├── interfaces/
│   │   ├── cli.ts
│   │   ├── api.ts
│   │   └── dashboard/
│   │
│   ├── utils/
│   │   ├── logger.ts
│   │   ├── time.ts
│   │   └── embeddings.ts
│   │
│   └── main.ts
│
├── data/                  # Persistência real (fora do src)
│   ├── logs/
│   ├── index/
│   └── summaries/
│
├── tests/
├── package.json
├── tsconfig.json
└── README.md
