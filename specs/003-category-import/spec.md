# Feature Specification: Category Import

**Feature Branch**: `003-category-import`

**Created**: 2026-07-02

**Status**: Draft

**Input**: User description: "Category import from Venus /v1/init endpoint. Import product categories per city (keyed by city slug), store category slug/name/parentId/orderIndex/isDefault in a new categories table (unique per rn+br+target+categoryId), and wire the imported category slugs into the product import request as the `category=` query param (replacing the hardcoded DEFAULT_CATEGORY_IDS and fixing the current wrong `cat=` param name). Import runs across all active cities. Store all categories including virtual ones (main/new) but flag isDefault so product import can skip them. Also add slug column to cities table and capture it during city import."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Import categories for all cities (Priority: P1)

As a catalog operator, I trigger a category import so the system fetches the current
category list for every active city from the external catalog source and stores each
category's identifying slug, display name, ordering, hierarchy, and default/virtual flag.

**Why this priority**: Category slugs are the authoritative keys the external catalog
uses to return products. Without them, downstream product import cannot request the
correct product sets. This is the foundational slice.

**Independent Test**: Trigger the category import for a retail network with active
cities; verify categories are persisted for each city with correct slug, name, ordering,
and default flag, and that re-running does not duplicate rows.

**Acceptance Scenarios**:

1. **Given** a retail network with active cities that each have a known city slug, **When** a category import is triggered without a specific city, **Then** categories are fetched and stored for every active city.
2. **Given** categories already imported for a city, **When** the import runs again, **Then** existing category records are updated in place (no duplicates) keyed by network + city + channel + category identity.
3. **Given** a single city slug is supplied to the import, **When** the import runs, **Then** only that city's categories are fetched and stored.
4. **Given** the import completes, **When** an operator inspects the job record, **Then** it shows a success status with counts of imported categories, errors, and cities processed.

---

### User Story 2 - Product import uses real category slugs (Priority: P1)

As a catalog operator, when I run product import, the system iterates the real,
imported category slugs for each city (skipping virtual/default categories) and requests
products using the correct category parameter, so products are actually returned.

**Why this priority**: This delivers the end value — real product data. Today product
import uses hardcoded category identifiers and the wrong request parameter, so it returns
nothing against the real source.

**Independent Test**: With categories imported for a city, run product import for that
city and confirm products are retrieved for each real category slug; confirm virtual/
default categories are not used as product filters.

**Acceptance Scenarios**:

1. **Given** categories are imported for a city, **When** product import runs for that city, **Then** the system requests products once per real (non-default) category slug and stores the returned products.
2. **Given** a category is flagged as default/virtual, **When** product import selects category slugs, **Then** that category is skipped.
3. **Given** no categories are stored for a city, **When** product import runs, **Then** the system falls back to a built-in default category list and records a warning.
4. **Given** an explicit list of category slugs is supplied to product import, **When** it runs, **Then** it honors that list instead of the stored slugs.

---

### User Story 3 - City slug captured during city import (Priority: P2)

As a catalog operator, when I import cities, each city's slug is captured and stored, so
category import can address each city by its slug.

**Why this priority**: City slug is the lookup key the category source requires. It is a
prerequisite for the all-cities category import, but city import already exists and only
needs the slug added.

**Independent Test**: Run city import for a retail network and verify each stored city
has its slug populated.

**Acceptance Scenarios**:

1. **Given** the external city source returns a slug per city, **When** city import runs, **Then** each stored city record includes its slug.
2. **Given** a city was imported before slug support existed, **When** city import runs again, **Then** the slug is backfilled on the existing record.

---

### Edge Cases

- A city has no slug available → that city is skipped for category import and counted as an error, without failing the whole job.
- The category source returns zero categories for a city → no existing categories are marked inactive for that city (safety against wiping data on a transient empty response).
- A category disappears from the source on a later import → it is marked inactive rather than deleted.
- The category source is temporarily unavailable → the fetch is retried with backoff before the city is counted as an error.
- An in-progress import is cancelled → remaining cities are not processed and the job reflects cancellation.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST fetch the category list for a city from the external catalog source using the retail network, city slug, and channel/target.
- **FR-002**: System MUST persist each category with: category identity, slug, display name, parent reference, ordering index, default/virtual flag, and the network/city/channel it belongs to.
- **FR-003**: System MUST treat a category as uniquely identified by the combination of retail network, city, channel, and category identity, updating in place on repeat imports (no duplicates).
- **FR-004**: System MUST support importing categories for all active cities of a retail network, and optionally for a single specified city.
- **FR-005**: System MUST record an import job with status (running/success/failed) and summary counts (categories imported, errors, cities processed).
- **FR-006**: System MUST retry transient failures when fetching categories before counting a city as failed, and MUST allow an in-progress import to be cancelled.
- **FR-007**: System MUST mark categories no longer returned by the source as inactive, but MUST NOT do so when the source returns an empty set for that city.
- **FR-008**: City import MUST capture and store each city's slug, including backfilling slugs on previously imported cities.
- **FR-009**: Product import MUST select category slugs from the stored categories for each city, excluding categories flagged as default/virtual.
- **FR-010**: Product import MUST request products using the category parameter name expected by the external source, passing the category slug as its value.
- **FR-011**: Product import MUST fall back to a built-in default category list (and log a warning) when no stored categories exist for a city, and MUST honor an explicitly supplied category list when provided.
- **FR-012**: Category import MUST NOT throw errors to the caller for individual city failures; per-city failures are recorded in the job summary and the endpoint always returns a result.

### Key Entities *(include if feature involves data)*

- **Category**: A product grouping offered in a specific city/channel. Attributes: category identity, slug (the source's addressing key), display name, parent reference (for hierarchy), ordering index, default/virtual flag, active flag, and its owning retail network / city / channel. Related to Products via the slug used when requesting products.
- **City** (existing, extended): Gains a slug attribute used to address the city when fetching its categories.
- **Import Job** (existing, reused): Tracks a category import run's status and summary counts.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After a category import for a retail network, every active city with a slug has its current categories stored, with 100% of returned categories persisted.
- **SC-002**: Re-running category import produces no duplicate category records for any city.
- **SC-003**: After categories are imported, product import for a city returns products for at least one real category (non-empty result), whereas before this feature the same run returned no products.
- **SC-004**: Virtual/default categories are never used as product-request filters.
- **SC-005**: A category import over all active cities completes and reports per-run counts of imported categories, errors, and cities processed; individual city failures never abort the whole run.

## Assumptions

- The external catalog source exposes a per-city initialization response that includes the city's business region identity and its category list; category slugs from this response are the same values the product endpoint expects.
- The category-request parameter expected by the product endpoint is the category slug (confirmed: slug values return products; internal category identifiers return none).
- The existing import-job tracking mechanism is reused for category imports.
- Channel/target defaults to the web channel when not specified.
- "Active cities" are those already marked active by the existing city import.
- Category hierarchy is stored (parent reference + ordering) for completeness, but only leaf/non-default categories are used to request products in this feature.
