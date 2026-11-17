-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "directory" TEXT NOT NULL,
    "remoteUrl" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "orchestratorSessionId" TEXT,
    "createdAt" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL
);
INSERT INTO "new_project" ("createdAt", "directory", "id", "name", "orchestratorSessionId", "updatedAt", "workspaceId") SELECT "createdAt", "directory", "id", "name", "orchestratorSessionId", "updatedAt", "workspaceId" FROM "project";
DROP TABLE "project";
ALTER TABLE "new_project" RENAME TO "project";
CREATE UNIQUE INDEX "project_workspaceId_key" ON "project"("workspaceId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
