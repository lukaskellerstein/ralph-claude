# Manifest Module API Contract

Internal API contract for `src/core/manifest.ts`.

## Functions

### loadManifest

```typescript
loadManifest(projectDir: string): FeatureManifest | null
```

Reads `.dex/feature-manifest.json`. Returns `null` if file does not exist. Throws on malformed JSON.

### saveManifest

```typescript
saveManifest(projectDir: string, manifest: FeatureManifest): void
```

Atomic write: writes to `.dex/feature-manifest.json.tmp`, then renames. Consistent with `state.ts` pattern.

### getNextFeature

```typescript
getNextFeature(manifest: FeatureManifest): FeatureManifestEntry | null
```

Returns first entry with `status === "pending"`. Returns `null` if all features are active/completed/skipped.

### getActiveFeature

```typescript
getActiveFeature(manifest: FeatureManifest): FeatureManifestEntry | null
```

Returns first entry with `status === "active"`. Returns `null` if no feature is active.

### updateFeatureStatus

```typescript
updateFeatureStatus(projectDir: string, featureId: number, status: ManifestFeatureStatus): void
```

Load → update → save. Throws if `featureId` not found.

### updateFeatureSpecDir

```typescript
updateFeatureSpecDir(projectDir: string, featureId: number, specDir: string): void
```

Load → set `specDir` → save. Called after specify completes and `discoverNewSpecDir` returns the new directory.

### checkSourceDrift

```typescript
checkSourceDrift(projectDir: string, manifest: FeatureManifest, goalPath: string): boolean
```

Returns `true` if current SHA-256 of `goalPath` differs from `manifest.sourceHash`.

### hashFile

```typescript
hashFile(filePath: string): string
```

Returns SHA-256 hex digest of file contents.

### appendLearnings

```typescript
appendLearnings(
  projectDir: string,
  insights: Array<{ category: string; insight: string; context: string }>,
  maxPerCategory?: number
): void
```

Reads existing learnings file, deduplicates using normalized matching (case-insensitive, trimmed, whitespace collapsed), appends new entries, enforces per-category cap (default 20, drops oldest).

## File Format

`.dex/feature-manifest.json`:

```json
{
  "version": 1,
  "sourceHash": "a1b2c3d4e5f6...",
  "features": [
    {
      "id": 1,
      "title": "Product Catalog",
      "description": "Rich description with user stories...",
      "status": "completed",
      "specDir": "specs/001-product-catalog"
    },
    {
      "id": 2,
      "title": "Shopping Cart",
      "description": "...",
      "status": "active",
      "specDir": "specs/002-shopping-cart"
    },
    {
      "id": 3,
      "title": "Checkout",
      "description": "...",
      "status": "pending",
      "specDir": null
    }
  ]
}
```
