# Auth Files First-Load Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the first 12 authentication files without constructing, transferring, or aggregating data for all 1,037 credentials.

**Architecture:** The existing management list endpoint gains an explicit paginated mode while retaining full lightweight-list mode for non-page consumers. The backend filters and sorts lightweight auth projections, builds full entries only for the selected page, and supports filtered deletion with the same predicate. The frontend replaces local full-array pagination with typed server queries and requests key statistics only for auth indexes on the visible page.

**Tech Stack:** Go 1.26, Gin, SQLite/PostgreSQL, React 19, TypeScript 5.9, Axios, Bun tests, Vite.

## Global Constraints

- Work spans the frontend repository at `/Users/caidaoli/Share/Source/js/Cli-Proxy-API-Management-Center` and backend repository at `/Users/caidaoli/Share/Source/go/CLIProxyAPI`.
- Keep the default page size at 12 and accept page sizes from 3 through 40 only.
- List responses omit `recent_requests` and retain `success` and `failed`.
- Preserve type/problem/disabled/enabled filters, wildcard search, priority/name sorting, cross-page selection, and filtered-delete behavior.
- Free-text search does not affect filtered deletion because it is not part of the current deletion contract.
- Do not add a new single-auth history endpoint.
- Do not perform per-auth filesystem I/O in manager-backed paginated listing.
- Go comments are English.
- Target local paginated-handler P95 at or below 50 ms for 1,037 credentials and report exact before/after measurements.

---

### Task 1: Remove Recent Buckets from the General Auth List

**Files:**
- Modify: backend `internal/api/handlers/management/auth_files.go`
- Modify: backend `internal/api/handlers/management/auth_files_recent_requests_test.go`

**Interfaces:**
- Consumes: existing `Handler.ListAuthFiles` and `Handler.buildAuthFileEntry`.
- Produces: list entries with `success` and `failed` but no `recent_requests`.

- [ ] **Step 1: Change the contract test to require omission**

Replace the current recent-request list test with:

~~~go
func TestListAuthFiles_OmitsRecentRequestsAndKeepsTotals(t *testing.T) {
	manager := coreauth.NewManager(nil, nil, nil)
	record := &coreauth.Auth{
		ID: "runtime-only-auth-1", Provider: "codex",
		Attributes: map[string]string{"runtime_only": "true"},
		Metadata: map[string]any{"type": "codex"},
		Success: 7, Failed: 3,
	}
	if _, errRegister := manager.Register(context.Background(), record); errRegister != nil {
		t.Fatal(errRegister)
	}

	entry := firstAuthFileEntry(t, NewHandlerWithoutConfigFilePath(
		&config.Config{AuthDir: t.TempDir()}, manager,
	))
	if _, exists := entry["recent_requests"]; exists {
		t.Fatalf("recent_requests must be omitted: %#v", entry)
	}
	if entry["success"] != float64(7) || entry["failed"] != float64(3) {
		t.Fatalf("unexpected totals: %#v", entry)
	}
}
~~~

- [ ] **Step 2: Run the focused test and verify RED**

~~~bash
go test ./internal/api/handlers/management -run TestListAuthFiles_OmitsRecentRequestsAndKeepsTotals -count=1
~~~

Expected: FAIL because `recent_requests` is still present.

- [ ] **Step 3: Remove bucket generation**

Delete only this line from `buildAuthFileEntry`:

~~~go
entry["recent_requests"] = auth.RecentRequestsSnapshot(time.Now())
~~~

Keep the existing `success` and `failed` assignments.

- [ ] **Step 4: Verify and commit**

~~~bash
go test ./internal/api/handlers/management -run 'TestListAuthFiles_' -count=1
go test ./internal/api/handlers/management -count=1
git add internal/api/handlers/management/auth_files.go internal/api/handlers/management/auth_files_recent_requests_test.go
git commit -m "perf(auth-files): omit recent buckets from list"
~~~

Expected: PASS and one backend commit.

### Task 2: Add Backend Pagination, Filtering, Counts, and Benchmark

**Files:**
- Create: backend `internal/api/handlers/management/auth_files_list.go`
- Create: backend `internal/api/handlers/management/auth_files_list_test.go`
- Modify: backend `internal/api/handlers/management/auth_files.go`

**Interfaces:**
- Consumes: `[]*coreauth.Auth` and `Handler.buildAuthFileEntry`.
- Produces:
  - `parseAuthFileListQuery(c *gin.Context) (authFileListQuery, bool, error)`
  - `buildAuthFileListPage(auths []*coreauth.Auth, query authFileListQuery) authFileListPage`
  - `writeFullAuthFileList(c *gin.Context, auths []*coreauth.Auth)` for the existing non-paginated response.
  - JSON fields `files`, `total`, `page`, `page_size`, `types`, `type_counts`, `enabled_type_counts`.

- [ ] **Step 1: Write failing parser and pagination tests**

Use this fixture:

~~~go
auths := []*coreauth.Auth{
	{ID: "codex-b.json", FileName: "codex-b.json", Provider: "codex", Attributes: map[string]string{"priority": "1"}},
	{ID: "codex-a.json", FileName: "codex-a.json", Provider: "codex", Disabled: true, StatusMessage: "expired", Attributes: map[string]string{"priority": "20"}},
	{ID: "claude-a.json", FileName: "claude-a.json", Provider: "claude", Attributes: map[string]string{"priority": "5"}},
}
~~~

Assert defaults, invalid page/page size, invalid sort, boolean parsing, wildcard search, status/type filters, counts, and ordering:

~~~go
query := authFileListQuery{Page: 1, PageSize: 2, Sort: authFileSortPriority}
page := buildAuthFileListPage(auths, query)
assertAuthNames(t, page.Auths, "codex-a.json", "claude-a.json")
if page.Total != 3 || page.TypeCounts["all"] != 3 || page.EnabledTypeCounts["codex"] != 1 {
	t.Fatalf("unexpected page metadata: %#v", page)
}
~~~

Also issue an HTTP request with `?page=1&page_size=2` and assert exactly two full entries are returned.

- [ ] **Step 2: Run tests and verify RED**

~~~bash
go test ./internal/api/handlers/management -run 'Test(ParseAuthFileListQuery|BuildAuthFileListPage|ListAuthFiles_Paginated)' -count=1
~~~

Expected: build failure because the query/page types do not exist.

- [ ] **Step 3: Implement focused query and projection types**

Create:

~~~go
type authFileSort string

const (
	authFileSortDefault  authFileSort = "default"
	authFileSortAZ       authFileSort = "az"
	authFileSortPriority authFileSort = "priority"
)

type authFileListQuery struct {
	Page         int
	PageSize     int
	Type         string
	ProblemOnly  bool
	DisabledOnly bool
	EnabledOnly  bool
	Search       string
	Sort         authFileSort
}

type authFileListPage struct {
	Auths             []*coreauth.Auth
	Total             int
	Page              int
	PageSize          int
	Types             []string
	TypeCounts        map[string]int
	EnabledTypeCounts map[string]int
}
~~~

`parseAuthFileListQuery` enters paginated mode only when `page` or `page_size` is present. Missing values default to page 1 and size 12. Reject page below 1, page sizes outside 3-40, unknown sort values, and malformed booleans.

Wildcard matching splits on `*`, lowercases candidate and pattern segments, and checks segments in order. Never compile user input as a raw regular expression.

`buildAuthFileListPage` calculates global `types` and `enabled_type_counts`, applies status filters before `type_counts`, then applies type and search before `total`, sorts, and slices. Priority comes from attributes with metadata fallback matching `buildAuthFileEntry`.

`writeFullAuthFileList` contains the existing full-list build, name sort, and
JSON response so paginated and non-paginated branches do not duplicate it.

- [ ] **Step 4: Integrate paginated mode**

Use this handler flow:

~~~go
query, paginated, errQuery := parseAuthFileListQuery(c)
if errQuery != nil {
	c.JSON(http.StatusBadRequest, gin.H{"error": errQuery.Error()})
	return
}
auths := h.authManager.List()
if !paginated {
	// Keep the existing full lightweight-list response.
	returnFullAuthFileList(c, auths)
	return
}
page := buildAuthFileListPage(auths, query)
files := make([]gin.H, 0, len(page.Auths))
for _, auth := range page.Auths {
	if entry := h.buildAuthFileEntry(auth); entry != nil {
		files = append(files, entry)
	}
}
c.JSON(http.StatusOK, gin.H{
	"files": files, "total": page.Total, "page": page.Page,
	"page_size": page.PageSize, "types": page.Types,
	"type_counts": page.TypeCounts,
	"enabled_type_counts": page.EnabledTypeCounts,
})
~~~

The disk fallback parses the same query and paginates its existing lightweight records after the directory scan. Add an HTTP test for this fallback path.

- [ ] **Step 5: Add the representative benchmark**

Add `BenchmarkListAuthFilesPaginated1037`. Register 1,037 manager-backed auth records, request `?page=1&page_size=12`, call `b.ReportAllocs()`, and report `response_B` from `recorder.Body.Len()`.

Add `BenchmarkListAuthFilesPaginated1037Gzip` using a Gin engine with
`middleware.V0ResponseCompressionMiddleware()`, an `Accept-Encoding: gzip`
header, and a `compressed_response_B` metric from the recorder body.

- [ ] **Step 6: Verify and commit**

~~~bash
go test ./internal/api/handlers/management -run 'Test(ParseAuthFileListQuery|BuildAuthFileListPage|ListAuthFiles_Paginated)' -count=1
go test ./internal/api/handlers/management -run '^$' -bench 'BenchmarkListAuthFilesPaginated1037' -benchmem -count=3
git add internal/api/handlers/management/auth_files.go internal/api/handlers/management/auth_files_list.go internal/api/handlers/management/auth_files_list_test.go
git commit -m "feat(auth-files): add server pagination"
~~~

Expected: tests PASS, response below 50,000 bytes, handler below 50 ms on the representative machine.

### Task 3: Preserve Filtered Deletion

**Files:**
- Modify: backend `internal/api/handlers/management/auth_files.go`
- Modify: backend `internal/api/handlers/management/auth_files_list.go`
- Create: backend `internal/api/handlers/management/auth_files_filtered_delete_test.go`

**Interfaces:**
- Consumes: Task 2 status/type predicate and `Handler.deleteAuthFileByName`.
- Produces: filtered `DELETE /auth-files?all=true&type=...` responses containing `deleted`, `files`, and `failed`.

- [ ] **Step 1: Write failing tests**

Create physical Codex and Claude JSON files, register matching auths, then request:

~~~go
req := httptest.NewRequest(http.MethodDelete,
	"/v0/management/auth-files?all=true&type=codex&disabled_only=true", nil)
~~~

Assert only the disabled Codex file is removed. Add a test proving `search` with `all=true` returns HTTP 400.

- [ ] **Step 2: Verify RED**

~~~bash
go test ./internal/api/handlers/management -run TestDeleteAuthFilesFiltered -count=1
~~~

Expected: FAIL because `all=true` still deletes every JSON file.

- [ ] **Step 3: Share the predicate**

Add:

~~~go
func authMatchesListStatusFilters(auth *coreauth.Auth, query authFileListQuery) bool
~~~

Type matching is exact after lowercase/trim normalization. Problem means non-empty `StatusMessage`. Disabled and enabled filters may both be true, producing no matches.

- [ ] **Step 4: Implement filtered delete-all**

When supported filters are present, enumerate manager auths, skip runtime-only entries, collect matching physical names, and call `deleteAuthFileByName`. Return HTTP 207 with `status: "partial"` on any failure; otherwise HTTP 200. Keep the current unfiltered delete-all branch.

- [ ] **Step 5: Verify and commit**

~~~bash
go test ./internal/api/handlers/management -run 'TestDeleteAuthFilesFiltered|TestDeleteAuthFile' -count=1
git add internal/api/handlers/management/auth_files.go internal/api/handlers/management/auth_files_list.go internal/api/handlers/management/auth_files_filtered_delete_test.go
git commit -m "feat(auth-files): delete filtered server results"
~~~

### Task 4: Add Page-Scoped Key Statistics

**Files:**
- Modify: backend `internal/api/handlers/management/monitor.go`
- Modify: backend `internal/usage/monitor_queries.go`
- Modify: backend `internal/usage/store.go`
- Modify: backend `internal/usage/monitor_queries_test.go`
- Modify: backend `internal/api/handlers/management/monitor_test.go`

**Interfaces:**
- Consumes: repeated `auth_index` query parameters.
- Produces: `QueryMonitorKeyStatsBlocks(..., authIndexes []string)` and responses restricted to those indexes.

- [ ] **Step 1: Write failing multi-index tests**

Create records for `auth-a`, `auth-b`, and `auth-c`, then call:

~~~go
rows, err := store.QueryMonitorKeyStatsBlocks(ctx, start, end, 600, []string{"auth-a", "auth-b"})
~~~

Assert no row contains `auth-c`. Add a handler request with `?auth_index=auth-a&auth_index=auth-b` and assert `filter.auth_indexes` contains both indexes.

- [ ] **Step 2: Verify RED**

~~~bash
go test ./internal/usage -run TestSQLiteUsageStoreQueryMonitorKeyStatsBlocksAuthIndexFilter -count=1
go test ./internal/api/handlers/management -run TestGetMonitorKeyStats -count=1
~~~

Expected: build failure because the interface accepts one string.

- [ ] **Step 3: Change query interfaces and SQL**

Change every `QueryMonitorKeyStatsBlocks` signature to accept `[]string`. Normalize and deduplicate. A non-empty list appends a normalized auth-index `IN` predicate with the repository's PostgreSQL or SQLite placeholder convention. Empty slices preserve unfiltered behavior.

- [ ] **Step 4: Add covering indexes**

Add the equivalent of:

~~~sql
CREATE INDEX IF NOT EXISTS idx_usage_auth_index_norm_requested
ON usage_records((COALESCE(NULLIF(auth_index, ''), 'unknown')), requested_at DESC)
~~~

Use quoted table/schema helpers for PostgreSQL and the literal table for SQLite.

- [ ] **Step 5: Parse repeated parameters**

Use `c.QueryArray("auth_index")`, trim/deduplicate, pass the slice to persistence, filter the in-memory fallback with a set, and return:

~~~go
response["filter"] = gin.H{"auth_indexes": authIndexes}
~~~

- [ ] **Step 6: Verify and commit**

~~~bash
go test ./internal/usage -run 'KeyStats|EnsureSchema' -count=1
go test ./internal/api/handlers/management -run 'KeyStats|Monitor' -count=1
git add internal/api/handlers/management/monitor.go internal/api/handlers/management/monitor_test.go internal/usage/monitor_queries.go internal/usage/monitor_queries_test.go internal/usage/store.go
git commit -m "perf(monitor): scope key stats to visible auths"
~~~

### Task 5: Add Typed Frontend Contracts

**Files:**
- Modify: frontend `src/types/authFile.ts`
- Modify: frontend `src/services/api/authFiles.ts`
- Modify: frontend `src/services/api/monitor.ts`
- Create: frontend `src/features/authFiles/listQuery.ts`
- Create: frontend `tests/authFilesListQuery.test.ts`

**Interfaces:**
- Consumes: Tasks 2-4 backend contracts.
- Produces `AuthFilesListQuery`, `AuthFilesPageResponse`, `buildAuthFilesListParams`, `authFilesApi.listPage`, `authFilesApi.deleteFiltered`, and batch `monitorApi.getKeyStats`.

- [ ] **Step 1: Write failing serialization tests**

Assert:

~~~ts
expect(buildAuthFilesListParams({
  page: 2, pageSize: 12, type: 'codex',
  problemOnly: true, disabledOnly: false, enabledOnly: true,
  search: 'team-*', sort: 'priority',
})).toEqual({
  page: 2, page_size: 12, type: 'codex',
  problem_only: true, enabled_only: true,
  search: 'team-*', sort: 'priority',
});
~~~

Spy on `apiClient.get` to verify `listPage` sends `/auth-files`, params, and AbortSignal. Spy on `apiClient.delete` to verify filtered deletion excludes search.

- [ ] **Step 2: Verify RED**

~~~bash
bun test tests/authFilesListQuery.test.ts
~~~

Expected: FAIL because the module and API methods do not exist.

- [ ] **Step 3: Add types and serializer**

~~~ts
export interface AuthFilesPageResponse extends AuthFilesResponse {
  total: number;
  page: number;
  page_size: number;
  types: string[];
  type_counts: Record<string, number>;
  enabled_type_counts: Record<string, number>;
}

export type AuthFilesListQuery = {
  page: number;
  pageSize: number;
  type: string;
  problemOnly: boolean;
  disabledOnly: boolean;
  enabledOnly: boolean;
  search: string;
  sort: AuthFilesSortMode;
};
~~~

The serializer always includes page, page size, and sort; it omits empty/default filters.

- [ ] **Step 4: Add API methods**

~~~ts
listPage: (query: AuthFilesListQuery, signal?: AbortSignal) =>
  apiClient.get<AuthFilesPageResponse>('/auth-files', {
    params: buildAuthFilesListParams(query),
    signal,
  }),
~~~

`deleteFiltered` calls `apiClient.delete('/auth-files', { params })` with
`all: true` plus only type/problem/disabled/enabled filters. Configure the
monitor request so Axios emits repeated `auth_index` keys without brackets.

- [ ] **Step 5: Verify and commit**

~~~bash
bun test tests/authFilesListQuery.test.ts tests/xaiUsingApiAuthFile.test.ts
npm run type-check
git add src/types/authFile.ts src/services/api/authFiles.ts src/services/api/monitor.ts src/features/authFiles/listQuery.ts tests/authFilesListQuery.test.ts
git commit -m "feat(auth-files): add paginated API contracts"
~~~

### Task 6: Move the Page to Server Pagination

**Files:**
- Modify: frontend `src/features/authFiles/hooks/useAuthFilesData.ts`
- Modify: frontend `src/features/authFiles/hooks/useAuthFilesStats.ts`
- Modify: frontend `src/features/authFiles/components/AuthFileCard.tsx`
- Modify: frontend `src/pages/AuthFilesPage.tsx`
- Create: frontend `src/features/authFiles/selection.ts`
- Create: frontend `tests/authFilesSelection.test.ts`

**Interfaces:**
- Consumes: Task 5 contracts.
- Produces server-owned counts, stale-request cancellation, cross-page selection snapshots, and current-page statistics.

- [ ] **Step 1: Write failing selection tests**

Define and test:

~~~ts
export type AuthFileSelection = Map<string, { disabled: boolean }>;
export function toggleAuthFileSelection(selection: AuthFileSelection, file: AuthFileItem): AuthFileSelection;
export function selectAuthFiles(selection: AuthFileSelection, files: AuthFileItem[]): AuthFileSelection;
export function removeSelectedAuthFiles(selection: AuthFileSelection, names: Iterable<string>): AuthFileSelection;
~~~

Prove page-one selections remain after selecting page-two files and disabled snapshots remain available for rollback.

- [ ] **Step 2: Verify RED**

~~~bash
bun test tests/authFilesSelection.test.ts
~~~

- [ ] **Step 3: Migrate the data hook**

Add `query: AuthFilesListQuery` to options and add `total`, `types`, `typeCounts`, and `enabledTypeCounts` to the result. `loadFiles` aborts the previous controller, calls `listPage`, ignores cancellations, and commits only the latest response.

Keep selection snapshots across page loads. Remove current-page pruning. Change card toggling to pass the whole `AuthFileItem` and use stored snapshots for batch rollback.

- [ ] **Step 4: Replace local pagination**

Use `useDebounce(search, 200)` and build:

~~~ts
const listQuery = useMemo<AuthFilesListQuery>(() => ({
  page,
  pageSize,
  type: filter === 'all' ? '' : String(filter),
  problemOnly,
  disabledOnly,
  enabledOnly,
  search: debouncedSearch.trim(),
  sort: sortMode,
}), [page, pageSize, filter, problemOnly, disabledOnly, enabledOnly, debouncedSearch, sortMode]);
~~~

Treat hook `files` as page items. Calculate total pages from server `total`. Use `types`, `typeCounts`, and `enabledTypeCounts` for tags, badges, pagination, disabled actions, and Codex cleanup. Remove local full-array filtering, sorting, and slicing.

- [ ] **Step 5: Load stats for visible files**

Replace no-argument stats loading with:

~~~ts
loadKeyStatsForFiles(files: AuthFileItem[]): Promise<void>
refreshKeyStatsForFiles(files: AuthFileItem[]): Promise<void>
~~~

Normalize/deduplicate auth indexes and request one batch. Render cards immediately with empty stats, then update. The four-minute interval refreshes current page files only. Keep single-card `refreshKeyStatsForAuthIndex`.

- [ ] **Step 6: Use server filtered deletion and reload mutations**

Replace client-side filtered deletion enumeration with `authFilesApi.deleteFiltered`. Upload, delete, status change, editor save, cleanup, and header refresh reload the active page. If a mutation empties a page above page 1, decrement the page so the query effect loads the last valid page.

- [ ] **Step 7: Verify and commit**

~~~bash
bun test tests/authFilesSelection.test.ts tests/authFilesListQuery.test.ts tests/authFilesSorting.test.ts tests/browserPageSizePersistence.test.ts
npm run type-check
npm run lint
npm run build
git add src/features/authFiles/hooks/useAuthFilesData.ts src/features/authFiles/hooks/useAuthFilesStats.ts src/features/authFiles/components/AuthFileCard.tsx src/pages/AuthFilesPage.tsx src/features/authFiles/selection.ts tests/authFilesSelection.test.ts
git commit -m "perf(auth-files): load only the visible page"
~~~

### Task 7: Cross-Repository Verification

**Files:**
- Modify only if verification exposes a defect in files already listed above.

**Interfaces:**
- Consumes: completed backend and frontend work.
- Produces exact benchmark/test evidence and clean worktrees.

- [ ] **Step 1: Backend verification**

~~~bash
gofmt -w internal/api/handlers/management/auth_files.go internal/api/handlers/management/auth_files_list.go internal/api/handlers/management/auth_files_list_test.go internal/api/handlers/management/auth_files_filtered_delete_test.go internal/api/handlers/management/monitor.go internal/usage/monitor_queries.go internal/usage/store.go
go test ./internal/api/handlers/management ./internal/usage -count=1
go test ./...
go build -o test-output ./cmd/server && rm test-output
~~~

- [ ] **Step 2: Record the benchmark**

~~~bash
go test ./internal/api/handlers/management -run '^$' -bench 'BenchmarkListAuthFilesPaginated1037' -benchmem -count=5
~~~

Record ns/op, bytes/op, allocations/op, and response bytes. Compare with the supplied 1,796,528-byte full-list and 821,747-byte no-buckets measurements.

- [ ] **Step 3: Frontend verification**

~~~bash
bun test tests/*.test.ts
npm run type-check
npm run lint
npm run build
~~~

- [ ] **Step 4: Inspect both repositories**

~~~bash
git status --short
git diff --check
git -C /Users/caidaoli/Share/Source/go/CLIProxyAPI status --short
git -C /Users/caidaoli/Share/Source/go/CLIProxyAPI diff --check
~~~

Expected: no uncommitted files and no whitespace errors.
